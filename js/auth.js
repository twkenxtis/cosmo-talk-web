const CosmoAuth = (() => {
  const API_BASE = 'https://api.cosmo.fans';
  const REFRESH_ENDPOINT = `${API_BASE}/bff/v3/users/refresh-access-token`;
  const COSMO_KEY_BASE64 = 'aUkaF3wWVltAI1QYVmxsZXfTV6L7mPTxA5+MMkLV9DE=';
  const REFRESH_BUFFER_SEC = 12 * 60 * 60; // 到期前 12 小時自動刷新

  let inflightRefreshPromise = null;

  function decodeJwtExp(token) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const payload = JSON.parse(atob(pad));
      const exp = Number(payload?.exp);
      return Number.isFinite(exp) ? exp : null;
    } catch (_) {
      return null;
    }
  }

  function isTokenExpiringSoon(token, bufferSec = REFRESH_BUFFER_SEC) {
    if (!token) return true;
    const exp = decodeJwtExp(token);
    if (!exp) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return exp - nowSec <= bufferSec;
  }

  function base64ToBytes(b64) {
    const bin = atob(String(b64 || '').trim());
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToBase64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  async function encryptCosmoPayload(plaintext, keyBase64 = COSMO_KEY_BASE64) {
    if (!window.crypto?.subtle) {
      throw new Error('Web Crypto unavailable');
    }
    const keyBytes = base64ToBytes(keyBase64);
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const plainBytes = new TextEncoder().encode(plaintext);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-CBC' },
      false,
      ['encrypt']
    );
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv },
      cryptoKey,
      plainBytes
    );
    const cipherBytes = new Uint8Array(cipherBuf);
    const combined = new Uint8Array(iv.length + cipherBytes.length);
    combined.set(iv, 0);
    combined.set(cipherBytes, iv.length);
    return bytesToBase64(combined);
  }

  function extractCredsFromResponse(obj) {
    function find(node, camel, snake) {
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = find(item, camel, snake);
          if (found) return found;
        }
        return null;
      }
      if (node && typeof node === 'object') {
        if (node[camel]) return String(node[camel]).trim();
        if (node[snake]) return String(node[snake]).trim();
        for (const val of Object.values(node)) {
          const found = find(val, camel, snake);
          if (found) return found;
        }
      }
      return null;
    }

    return {
      accessToken: find(obj, 'accessToken', 'access_token') || '',
      refreshToken: find(obj, 'refreshToken', 'refresh_token') || '',
    };
  }

  function parseLoginInput(rawInput) {
    const trimmed = String(rawInput || '').trim();
    if (!trimmed) return { accessToken: '', refreshToken: '' };

    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const extracted = extractCredsFromResponse(parsed);
        return {
          accessToken: extracted.accessToken.replace(/^Bearer\s+/i, '').trim(),
          refreshToken: extracted.refreshToken.trim(),
        };
      } catch (_) {}
    }

    const cleaned = trimmed.replace(/^Bearer\s+/i, '').trim();
    const isJwtLike = cleaned.split('.').length === 3 && !/\s/.test(cleaned);
    return isJwtLike
      ? { accessToken: cleaned, refreshToken: '' }
      : { accessToken: '', refreshToken: cleaned };
  }

  async function performSilentRefresh(currentRefreshToken) {
    const tokenToUse = String(currentRefreshToken || '').trim();
    if (!tokenToUse) {
      throw new Error('Missing refreshToken');
    }

    const encryptedBody = await encryptCosmoPayload(
      JSON.stringify({ refreshToken: tokenToUse }),
      COSMO_KEY_BASE64
    );

    const resp = await fetch(REFRESH_ENDPOINT, {
      method: 'POST',
      referrerPolicy: 'no-referrer',
      headers: {
        'Content-Type': 'text/plain',
        'x-cosmo-encrypted': '1',
        Accept: 'application/json',
      },
      body: encryptedBody,
    });

    if (resp.status !== 200 && resp.status !== 201) {
      throw new Error(`Refresh failed with HTTP ${resp.status}`);
    }

    const json = await resp.json();
    const extracted = extractCredsFromResponse(json);
    const nextAccess = extracted.accessToken;
    const nextRefresh = extracted.refreshToken || tokenToUse;

    if (!nextAccess) {
      throw new Error('Refresh response missing accessToken');
    }

    return CosmoStorage.saveTokens({
      accessToken: nextAccess,
      refreshToken: nextRefresh,
    });
  }

  async function ensureFreshTokens({ force = false } = {}) {
    if ((typeof window !== 'undefined' && window.IS_DEMO_MODE)) {
      return window.DEMO_TOKENS || { accessToken: 'demo', refreshToken: 'demo' };
    }
    const tokens = await CosmoStorage.getTokens();
    const shouldRefresh = force || isTokenExpiringSoon(tokens.accessToken, REFRESH_BUFFER_SEC);

    if (!shouldRefresh && tokens.accessToken) {
      return tokens;
    }

    if (!tokens.refreshToken) {
      if (tokens.accessToken && !force) {
        return tokens;
      }
      throw new Error('No refreshToken available');
    }

    if (!inflightRefreshPromise) {
      inflightRefreshPromise = performSilentRefresh(tokens.refreshToken).finally(() => {
        inflightRefreshPromise = null;
      });
    }

    return inflightRefreshPromise;
  }

  async function authorizedFetch(url, init = {}, allowRetryOn401 = true) {
    if ((typeof window !== 'undefined' && window.IS_DEMO_MODE)) {
      return fetch(url, { ...init, referrerPolicy: 'no-referrer' });
    }
    let tokens = await ensureFreshTokens({ force: false });
    const buildInit = (accessToken) => ({
      ...init,
      referrerPolicy: 'no-referrer',
      headers: {
        ...(init.headers || {}),

        Authorization: `Bearer ${accessToken}`,
      },
    });

    let resp = await fetch(url, buildInit(tokens.accessToken));
    if (resp.status === 401 && allowRetryOn401) {
      tokens = await ensureFreshTokens({ force: true });
      resp = await fetch(url, buildInit(tokens.accessToken));
    }
    return resp;
  }

  return {
    API_BASE,
    decodeJwtExp,
    isTokenExpiringSoon,
    parseLoginInput,
    ensureFreshTokens,
    authorizedFetch,
  };
})();