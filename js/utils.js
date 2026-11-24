// --- DEMO MODE INTERCEPTOR (RUNS BEFORE auth.js / sync.js / app.js) ---
(() => {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const isDemo =
    window.FORCE_DEMO_MODE === true ||
    params.get('demo') === '1' ||
    params.get('demo') === 'true';

  window.IS_DEMO_MODE = isDemo;
  if (!isDemo) return;

  window.__DEMO_NO_POST__ = true;
  window.DEMO_TOKENS = {
    accessToken: 'demo.eyJzdWIiOiJkZW1vIiwiZXhwIjo5OTk5OTk5OTk5fQ.demo',
    refreshToken: 'demo-refresh-token',
  };

  if (typeof window.fetch === 'function' && !window.__DEMO_FETCH_PATCHED__) {
    window.__DEMO_FETCH_PATCHED__ = true;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async function (input, init = {}) {
      const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
      const method = (
        (init && init.method) ||
        (typeof input !== 'string' && input && input.method) ||
        'GET'
      ).toUpperCase();

      const isCosmoApi =
        urlStr.includes('api.cosmo.fans') || urlStr.startsWith('/bff/');

      if (!isCosmoApi) {
        return nativeFetch(input, init);
      }

      if (method !== 'GET' && method !== 'HEAD') {
        return new Response(
          JSON.stringify({ ok: false, demo: true, message: 'DEMO mode blocks POST/write requests.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr.includes('/bff/v4/channels/messages')) {
        return nativeFetch('demo/artistId.json', { cache: 'no-store' });
      }

      if (urlStr.includes('/sync-events/')) {
        return nativeFetch('demo/last.json', { cache: 'no-store' });
      }

      if (urlStr.toLowerCase().includes('sticker')) {
        return nativeFetch('demo/sticker.json', { cache: 'no-store' });
      }

      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }
})();

const CosmoUtils = (() => {
  const MEDIA_EXT_RE = /\.(mp4|m4a|m4v|m4s|aac|ogg)(?:[?#]|$)/i;
  const CODEPOINT_RE = /^(?:\\u|u\+|0x)?\{?([0-9a-fA-F]{4,6})\}?$/i;

  function nfc(v) {
    if (typeof v === 'string') return v.normalize('NFC');
    if (Array.isArray(v)) return v.map(nfc);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k.normalize('NFC')] = nfc(val);
      return out;
    }
    return v;
  }

  function decodeHtmlEntities(str) {
    const raw = String(str ?? '');
    if (!raw.includes('&')) return raw;
    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = raw;
      return textarea.value;
    }
    return raw
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function resolveCodepointOrHtml(rawInput) {
    const decoded = decodeHtmlEntities(String(rawInput ?? ''));
    const s = nfc(decoded);
    const trimmed = s.trim();
    if (trimmed && trimmed.length <= 10) {
      const match = trimmed.match(CODEPOINT_RE);
      if (match) {
        const cp = parseInt(match[1], 16);
        if (!Number.isNaN(cp) && cp >= 0 && cp <= 0x10ffff) {
          return nfc(String.fromCodePoint(cp));
        }
      }
    }
    return s;
  }

  function isEmpty(v) {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string' && v.trim() === '') return true;
    if (Array.isArray(v) && v.length === 0) return true;
    if (typeof v === 'object' && Object.keys(v).length === 0) return true;
    return false;
  }

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function fmtDay(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, '0')}월 ${String(d.getDate()).padStart(2, '0')}일`;
  }

  function fmtTimeline(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function fmtExportTs(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }

  function getMinuteGroupKey(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function memberLabel(m) {
    const orig = nfc(m.originalName || '');
    const disp = nfc(m.artistMemberName || '');
    if (orig && disp) return nfc(`${orig} (${disp})`);
    return nfc(orig || disp || String(m.artistMemberId));
  }

  function pickMediaUrl(item) {
    if (typeof item === 'string') {
      return item.trim();
    }
    if (!item || typeof item !== 'object') {
      return '';
    }

    const candidates = [
      item.thumbnailUrl,
      item.originalUrl,
      item.url,
    ]
      .map((u) => (typeof u === 'string' ? u.trim() : ''))
      .filter(Boolean);

    const preferred = candidates.find((u) => MEDIA_EXT_RE.test(u));
    return preferred || candidates[0] || '';
  }

  return {
    MEDIA_EXT_RE,
    nfc,
    decodeHtmlEntities,
    resolveCodepointOrHtml,
    isEmpty,
    isMobile,
    fmtTime,
    fmtDay,
    fmtTimeline,
    fmtExportTs,
    getMinuteGroupKey,
    memberLabel,
    pickMediaUrl,
  };
})();