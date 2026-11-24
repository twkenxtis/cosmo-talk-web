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
      // 正式登入 / 明確退出 DEMO 時，一律走原生 fetch 打真實端點
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

  // 切換為正式連線模式（用於「儲存並進入聊天」）
  window.enableProdSessionMode = function () {
    window.FORCE_DEMO_MODE = false;
    window.__FORCE_PROD_SESSION__ = true;
    window.IS_DEMO_MODE = false;
    window.__DEMO_NO_POST__ = false;
  };
})();
