(() => {
  'use strict';

  function computeIsDemo() {
    if (window.__FORCE_PROD_SESSION__ === true) return false;
    if (window.FORCE_DEMO_MODE === true) return true;
    const params = new URLSearchParams(window.location.search);
    const v = params.get('demo');
    return v === '1' || v === 'true';
  }

  window.IS_DEMO_MODE = computeIsDemo();
  window.__DEMO_NO_POST__ = window.IS_DEMO_MODE;

  if (!window.DEMO_TOKENS) {
    window.DEMO_TOKENS = {
      accessToken: 'demo.eyJzdWIiOiJkZW1vIiwiZXhwIjo5OTk5OTk5OTk5fQ.demo',
      refreshToken: 'demo-refresh-token',
    };
  }

  if (typeof window.fetch === 'function' && !window.__DEMO_FETCH_INTERCEPTOR__) {
    window.__DEMO_FETCH_INTERCEPTOR__ = true;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async function (input, init = {}) {
      if (!window.IS_DEMO_MODE || window.__FORCE_PROD_SESSION__ === true) {
        return nativeFetch(input, init);
      }

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

  window.enableProdSessionMode = function () {
    window.FORCE_DEMO_MODE = false;
    window.__FORCE_PROD_SESSION__ = true;
    window.IS_DEMO_MODE = false;
    window.__DEMO_NO_POST__ = false;
  };
})();

/* --- CANONICAL DEMO JSON ROUTING & JWT V4 ISOLATION --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_CANONICAL_DEMO_JWT_ROUTING__) return;
  window.__COSMO_CANONICAL_DEMO_JWT_ROUTING__ = true;

  function isDemoSession() {
    try {
      const q = new URLSearchParams(window.location.search || '');
      if (window.FORCE_DEMO_MODE === true) return true;
      if (window.__FORCE_PROD_SESSION__ === true) return false;
      const v = q.get('demo');
      if (v === '1' || v === 'true') return true;
      if (v === '0' || v === 'false') return false;
    } catch (_) {}
    return Boolean(window.IS_DEMO_MODE === true);
  }

  window.IS_DEMO_MODE = isDemoSession();

  const baseFetch =
    typeof window.__COSMO_NATIVE_FETCH__ === 'function'
      ? window.__COSMO_NATIVE_FETCH__
      : window.fetch.bind(window);
  window.__COSMO_NATIVE_FETCH__ = baseFetch;

  window.fetch = async function (input, init) {
    const rawUrl = typeof input === 'string' ? input : (input?.url || '');
    const urlStr = String(rawUrl);

    if (isDemoSession()) {
      if (urlStr.includes('/bff/v4/channels/messages')) {
        return baseFetch('demo/artistId.json', { cache: 'no-store' });
      }
      if (urlStr.includes('demo_translate') || urlStr.includes('/translated-contents')) {
        return baseFetch('demo/demo_translate.json', { cache: 'no-store' });
      }
      if (urlStr.includes('sticker')) {
        return baseFetch('demo/sticker.json', { cache: 'no-store' });
      }
      if (/^https?:\/\/api\.cosmo\.fans\//i.test(urlStr)) {
        return baseFetch('demo/last.json', { cache: 'no-store' });
      }
    }

    return baseFetch(input, init);
  };
})();
