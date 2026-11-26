/* CosmoSecurity: 統一 XSS / URL / JWT 安全邊界 */
const CosmoSecurity = (() => {
  'use strict';
  const ALLOWED_PROTOCOLS = ['https:', 'blob:', 'data:', ''];
  function safeUrl(raw, opts) {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    try {
      const u = new URL(s, window.location.origin);
      const p = u.protocol.toLowerCase();
      if (p === 'blob:' && !(opts && opts.allowBlob)) return '';
      if (p === 'data:' && !(opts && opts.allowDataImage)) return '';
      if (ALLOWED_PROTOCOLS.indexOf(p) === -1) return '';
      if (p === 'blob:' && u.href.indexOf(window.location.origin) !== 0) return '';
      if (p === 'data:' && !/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(s)) return '';
      return u.href;
    } catch (_) {
      return '';
    }
  }
  function safeImgUrl(raw) {
    const u = safeUrl(raw, { allowBlob: false, allowDataImage: true });
    return (u.indexOf('https://') === 0 || u.indexOf('data:image/') === 0) ? u : '';
  }
  function safeLinkUrl(raw) {
    const u = safeUrl(raw, { allowBlob: true, allowDataImage: false });
    return u.indexOf('https://') === 0 ? u : '';
  }
  function setText(el, text) { if (el) el.textContent = String(text ?? ''); return el; }
  const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  function isJwtLike(s) { const t = String(s ?? '').trim(); return t.length > 0 && t.length <= 8192 && JWT_RE.test(t); }
  function cleanJwt(s) { const t = String(s ?? '').trim().replace(/^Bearer\s+/i, ''); return isJwtLike(t) ? t : ''; }
  function cleanToken(s) { const t = String(s ?? '').trim(); return /^[A-Za-z0-9._\-~+/=]{10,8192}$/.test(t) && !/[<>"'`;\\]/.test(t) ? t : ''; }
  function setIcon(el, cls) {
    if (!el) return el;
    const c = String(cls || '').trim();
    el.replaceChildren();
    const i = document.createElement('i');
    i.className = c.indexOf('ti-') === 0 ? 'ti ' + c : c;
    i.setAttribute('aria-hidden', 'true');
    el.appendChild(i);
    return el;
  }
  function createClipboardSvg() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const paths = [
      'M0 0h24v24H0z',
      'M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2',
      'M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z'
    ];
    paths.forEach(function (d, idx) {
      const pa = document.createElementNS(NS, 'path');
      pa.setAttribute('d', d);
      if (idx === 0) {
        pa.setAttribute('fill', 'none');
        pa.setAttribute('stroke', 'none');
      }
      svg.appendChild(pa);
    });
    return svg;
  }
  const ICON_CONST_MAP = {
    COPY_ICON_HTML: 'ti-copy',
    CHECK_ICON_HTML: 'ti-check',
    LOGOUT_ICON_HTML: 'ti-logout',
    EXPORT_ICON_HTML: 'ti-file-export',
    SETTINGS_ICON_HTML: 'ti-tool',
    CHEVRON_DOWN_ICON_HTML: 'ti-chevron-down',
    CHEVRON_UP_ICON_HTML: 'ti-chevron-up',
    CLIPBOARD_SVG: 'clipboard'
  };
  function setIconFromConst(el, nameOrCls) {
    if (!el) return el;
    const raw = String(nameOrCls || '').trim();
    if (raw === 'clipboard' || raw === 'CLIPBOARD_SVG') {
      el.replaceChildren(createClipboardSvg());
      return el;
    }
    const m = raw.match(/ti-[a-z0-9-]+/);
    if (m) return setIcon(el, m[0]);
    const mapped = ICON_CONST_MAP[raw];
    if (mapped === 'clipboard') {
      el.replaceChildren(createClipboardSvg());
      return el;
    }
    if (mapped) return setIcon(el, mapped);
    return setIcon(el, raw);
  }
  function assertTopWindow() { return window.top === window.self; }
  return { safeUrl, safeImgUrl, safeLinkUrl, setText, setIcon, createClipboardSvg, setIconFromConst, ICON_CONST_MAP, isJwtLike, cleanJwt, cleanToken, assertTopWindow };
})();
if (typeof window !== 'undefined') window.CosmoSecurity = CosmoSecurity;
