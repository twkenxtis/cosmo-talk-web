(() => {
  'use strict';

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
})();
