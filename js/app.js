(() => {
  'use strict';

  const { nfc } = CosmoUtils;

  const tr = (key, vars) =>
    typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function'
      ? CosmoI18n.t(key, vars)
      : nfc(String(key));

  const dom = {
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingProgressText: document.getElementById('loading-progress-text'),

    loginPage: document.getElementById('login-page'),
    jwtLoginInput: document.getElementById('jwt-login-input'),
    jwtLoginBtn: document.getElementById('jwt-login-btn'),
    jwtGuideBtn: document.getElementById('jwt-guide-btn'),
    loginStatus: document.getElementById('login-status'),
    loginLangBtn: document.getElementById('login-lang-btn'),
    loginLangSelect: document.getElementById('login-lang-select'),

    chatShell: document.getElementById('chat-shell'),
    sidebarBackdrop: document.getElementById('sidebar-backdrop'),
    sidebarToggleInner: document.getElementById('sidebar-toggle-inner'),
  };

  const state = {
    membersData: [],
    activeMemberId: null,
    activeSyncGeneration: 0,
    lastProgressPercent: 0,
  };

  const defaultLoginPlaceholder = dom.jwtLoginInput
    ? (dom.jwtLoginInput.getAttribute('placeholder') || '')
    : '';

  function ensureProgressElement() {
    if (dom.loadingProgressText) return dom.loadingProgressText;
    if (!dom.loadingOverlay) return null;

    const el = document.createElement('div');
    el.id = 'loading-progress-text';
    el.className = 'loading-progress-text';
    el.textContent = '0%';
    dom.loadingOverlay.appendChild(el);
    dom.loadingProgressText = el;
    return el;
  }

  function setLoadingOverlay(visible) {
    if (!dom.loadingOverlay) return;
    if (visible) {
      document.body.classList.add('is-login-view');
      if (dom.loginPage) dom.loginPage.style.display = 'none';
      dom.loadingOverlay.classList.add('active');
      updateComposerVisibility();
    } else {
      dom.loadingOverlay.classList.remove('active');
    }
  }

  function setLoadingProgress(percent, label = '', { allowBackward = false } = {}) {
    const el = ensureProgressElement();
    if (!el) return;

    const raw = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const next = allowBackward ? raw : Math.max(state.lastProgressPercent, raw);
    state.lastProgressPercent = next;

    el.textContent = nfc(label ? `${next}% · ${label}` : `${next}%`);
  }

  function resizeJwtLoginTextarea(el = dom.jwtLoginInput) {
    if (!el || el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    const nextHeight = Math.min(Math.max(el.scrollHeight, 44), 160);
    el.style.height = `${nextHeight}px`;
  }

  function syncCleanAppUrl() {
    try {
      const targetUrl =
        window.location.hostname === 'twkenxtis.github.io'
          ? 'https://twkenxtis.github.io/cosmo-talk-web/'
          : `${window.location.origin}${window.location.pathname}`;
      if (window.location.href !== targetUrl) {
        window.history.replaceState(null, '', targetUrl);
      }
    } catch (_) {}
  }

  function prepareRealLoginSession() {
    if (typeof window !== 'undefined') {
      if (typeof window.enableProdSessionMode === 'function') {
        window.enableProdSessionMode();
      } else {
        window.FORCE_DEMO_MODE = false;
        window.__FORCE_PROD_SESSION__ = true;
        window.IS_DEMO_MODE = false;
        window.__DEMO_NO_POST__ = false;
      }
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('demo')) {
          url.searchParams.delete('demo');
          window.history.replaceState(null, '', url.toString());
        }
      } catch (_) {}
    }
  }

  function forceProdModeNow() {
    if (typeof window === 'undefined') return;
    window.FORCE_DEMO_MODE = false;
    window.__FORCE_PROD_SESSION__ = true;
    window.IS_DEMO_MODE = false;
    window.__DEMO_NO_POST__ = false;
    if (typeof window.enableProdSessionMode === 'function') {
      try { window.enableProdSessionMode(); } catch (_) {}
    }
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('demo')) {
        url.searchParams.delete('demo');
        window.history.replaceState(null, '', url.toString());
      }
    } catch (_) {}
  }

  function setLoginStatus(msg) {
    if (dom.loginStatus) {
      dom.loginStatus.textContent = nfc(msg || '');
    }
  }

  function setAuthControlsVisible(visible) {
    const display = visible ? '' : 'none';
    if (dom.jwtLoginInput) {
      dom.jwtLoginInput.style.display = display;
      if (!visible) {
        dom.jwtLoginInput.value = '';
        resizeJwtLoginTextarea(dom.jwtLoginInput);
      }
    }
    if (dom.jwtLoginBtn) {
      dom.jwtLoginBtn.style.display = display;
    }
    if (dom.jwtGuideBtn) {
      dom.jwtGuideBtn.style.display = visible ? 'inline-flex' : 'none';
    }
  }

  function syncLoginLangControls() {
    if (typeof CosmoI18n === 'undefined') return;
    const curLang = CosmoI18n.getLang();
    if (dom.loginLangSelect) {
      dom.loginLangSelect.value = curLang;
    }
  }

  function updateComposerVisibility() {
    const isChatActive = Boolean(dom.chatShell && dom.chatShell.classList.contains('active'));
    const hasMembers = Array.isArray(state.membersData) && state.membersData.length > 0;
    const isLoginVisible = Boolean(
      dom.loginPage && getComputedStyle(dom.loginPage).display !== 'none'
    );
    const isLoadingVisible = Boolean(
      dom.loadingOverlay && dom.loadingOverlay.classList.contains('active')
    );

    const shouldShow = isChatActive && hasMembers && !isLoginVisible && !isLoadingVisible;
    CosmoComposer.setVisible(shouldShow);
  }

  function showLoginPage(statusMsg = '') {
    setLoadingOverlay(false);
    setAuthControlsVisible(true);
    document.body.classList.add('is-login-view');

    if (dom.loginPage) {
      dom.loginPage.style.display = 'flex';
    }
    if (dom.chatShell) {
      dom.chatShell.classList.remove('active');
    }

    if (dom.jwtLoginInput) {
      dom.jwtLoginInput.placeholder = defaultLoginPlaceholder;
      resizeJwtLoginTextarea(dom.jwtLoginInput);
    }

    updateComposerVisibility();
    window.scrollTo(0, 0);
    setLoginStatus(statusMsg);
  }

  function showChatPage() {
    setLoadingOverlay(false);
    setAuthControlsVisible(false);
    document.body.classList.remove('is-login-view');

    if (dom.loginPage) {
      dom.loginPage.style.display = 'none';
    }
    if (dom.chatShell) {
      dom.chatShell.classList.add('active');
    }

    updateComposerVisibility();
  }

  function getActiveMember() {
    return (
      state.membersData.find(
        (m) => String(m.artistMemberId) === String(state.activeMemberId)
      ) || null
    );
  }

  function applyMembersAndRender(nextMembers) {
    state.membersData = Array.isArray(nextMembers) ? nextMembers : [];
    if (state.membersData.length === 0) {
      state.activeMemberId = null;
      CosmoChatView.renderSidebar(state.membersData, null);
      CosmoChatView.renderChat(null);
      return false;
    }

    if (
      !state.activeMemberId ||
      !state.membersData.some((m) => m.artistMemberId === state.activeMemberId)
    ) {
      state.activeMemberId = state.membersData[0].artistMemberId;
    }

    const currentMember = getActiveMember();
    CosmoChatView.renderSidebar(state.membersData, state.activeMemberId);
    CosmoChatView.renderChat(currentMember);
    CosmoComposer.ensureRemainingCountIfNeeded(state.activeMemberId);
    showChatPage();
    return true;
  }

  async function refreshMemberFromNdjson(memberId) {
    const targetId = String(memberId ?? '').trim();
    if (!targetId) return;

    const syncGen = state.activeSyncGeneration;
    const updatedMember = await CosmoSync.syncMemberNow(targetId, {
      isCancelled: () => syncGen !== state.activeSyncGeneration,
    });
    if (!updatedMember || syncGen !== state.activeSyncGeneration) return;

    const idx = state.membersData.findIndex(
      (m) => String(m.artistMemberId) === targetId
    );
    if (idx >= 0) {
      state.membersData[idx] = updatedMember;
    } else {
      state.membersData.push(updatedMember);
    }

    if (String(state.activeMemberId) === targetId) {
      CosmoChatView.renderSidebar(state.membersData, state.activeMemberId);
      CosmoChatView.renderChat(updatedMember);
    }
  }

  function switchToProdSession() {
    if (typeof window === 'undefined') return;
    window.FORCE_DEMO_MODE = false;
    window.__FORCE_PROD_SESSION__ = true;
    window.IS_DEMO_MODE = false;
    window.__DEMO_NO_POST__ = false;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('demo')) {
        url.searchParams.delete('demo');
        window.history.replaceState(null, '', url.toString());
      }
    } catch (_) {}
  }

  async function enterChatSession({ showOverlay = true } = {}) {
    const syncGen = ++state.activeSyncGeneration;
    if (showOverlay) {
      setLoadingOverlay(true);
      setLoadingProgress(0, tr('sync_prepare'), { allowBackward: true });
    }

    try {
      const results = await CosmoSync.syncAllChannels({
        isCancelled: () => syncGen !== state.activeSyncGeneration,
        onCachedReady: (cachedMembers) => {
          if (
            syncGen === state.activeSyncGeneration &&
            Array.isArray(cachedMembers) &&
            cachedMembers.length > 0
          ) {
            applyMembersAndRender(cachedMembers);
          }
        },
        onProgress: (pct, label) => {
          if (syncGen === state.activeSyncGeneration && showOverlay) {
            setLoadingProgress(pct, label);
          }
        },
      });

      if (syncGen !== state.activeSyncGeneration || !results) return;

      if (results.length === 0) {
        await logoutToLoginPage(tr('no_channels_logout'));
        return;
      }

      setLoadingProgress(96, tr('sync_rendering'));
      applyMembersAndRender(results);
      setLoadingProgress(100, tr('sync_done'));
    } catch (err) {
      if (syncGen === state.activeSyncGeneration) {
        setLoadingOverlay(false);
      }
      throw err;
    }
  }

  async function handleLoginSubmit() {
    const rawVal = dom.jwtLoginInput ? dom.jwtLoginInput.value : '';
    const parsed = CosmoAuth.parseLoginInput(rawVal);
    if (!parsed.accessToken && !parsed.refreshToken) {
      showLoginPage(tr('login_prompt'));
      return;
    }

    if ((typeof window !== 'undefined' && window.IS_DEMO_MODE)) {
      if (dom.jwtLoginInput) {
        dom.jwtLoginInput.value = '';
        resizeJwtLoginTextarea(dom.jwtLoginInput);
      }
      await enterChatSession();
      syncCleanAppUrl();
      return;
    }

    prepareRealLoginSession();
    await CosmoStorage.clearNdjsonCache().catch(() => {});

    try {
      forceProdModeNow();
      await CosmoStorage.clearNdjsonCache().catch(() => {});
      switchToProdSession();
      await CosmoStorage.clearNdjsonCache().catch(() => {});
      await CosmoStorage.saveTokens(parsed);
      if (!parsed.accessToken && parsed.refreshToken) {
        await CosmoAuth.ensureFreshTokens({ force: true });
      }
      if (dom.jwtLoginInput) {
        dom.jwtLoginInput.value = '';
        resizeJwtLoginTextarea(dom.jwtLoginInput);
      }
      await enterChatSession();
    } catch (err) {
      showLoginPage(err?.message || tr('expired_jwt'));
    }
  }

  async function logoutToLoginPage(statusMsg = tr('logged_out_cleared')) {
    if (window.__COSMO_LOGGING_OUT__) return;
    window.__COSMO_LOGGING_OUT__ = true;
    const wasDemo = Boolean(
      window.IS_DEMO_MODE ||
      window.FORCE_DEMO_MODE ||
      new URLSearchParams(window.location.search).get('demo')
    );
    forceProdModeNow();
    await CosmoStorage.clearNdjsonCache().catch(() => {});
    syncCleanAppUrl();
    state.activeSyncGeneration++;
    state.lastProgressPercent = 0;

    CosmoComposer.reset();

    if (!(typeof window !== 'undefined' && window.IS_DEMO_MODE)) {
      await CosmoStorage.clearTokens().catch(() => {});
      await CosmoStorage.clearNdjsonCache().catch(() => {});
    }

    state.membersData = [];
    state.activeMemberId = null;
    CosmoChatView.renderSidebar(state.membersData, null);
    CosmoChatView.renderChat(null);
    showLoginPage(statusMsg);
    if (typeof window.__cosmoCleanLogoutRedirect === 'function') {
      window.__cosmoCleanLogoutRedirect(wasDemo);
    } else {
      window.__COSMO_LOGGING_OUT__ = false;
    }
  }

  function bindEvents() {
    if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.onChange === 'function') {
      CosmoI18n.onChange(() => {
        CosmoI18n.applyDomI18n(document);
        syncLoginLangControls();
        CosmoComposer.onLanguageChanged();
        if (state.membersData.length > 0) {
          CosmoChatView.renderSidebar(state.membersData, state.activeMemberId);
          const cur = getActiveMember();
          if (cur) CosmoChatView.renderChat(cur);
        }
      });
    }

    if (dom.loginLangSelect) {
      dom.loginLangSelect.onchange = () => {
        if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.setLang === 'function') {
          CosmoI18n.setLang(dom.loginLangSelect.value);
        }
      };
    }

    if (dom.loginLangBtn) {
      dom.loginLangBtn.onclick = () => {
        if (!dom.loginLangSelect) return;
        if (typeof dom.loginLangSelect.showPicker === 'function') {
          try {
            dom.loginLangSelect.showPicker();
            return;
          } catch (_) {}
        }
        dom.loginLangSelect.focus();
        dom.loginLangSelect.click();
      };
    }

    if (dom.sidebarToggleInner) {
      dom.sidebarToggleInner.onclick = () => CosmoChatView.toggleSidebar(true);
    }
    if (dom.sidebarBackdrop) {
      dom.sidebarBackdrop.onclick = () => CosmoChatView.toggleSidebar(true);
    }

    if (dom.jwtLoginInput) {
      dom.jwtLoginInput.placeholder = defaultLoginPlaceholder;
      resizeJwtLoginTextarea(dom.jwtLoginInput);
      dom.jwtLoginInput.addEventListener('input', () => resizeJwtLoginTextarea(dom.jwtLoginInput));
      dom.jwtLoginInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          handleLoginSubmit();
        }
      });
    }

    if (dom.jwtLoginBtn) {
      dom.jwtLoginBtn.onclick = handleLoginSubmit;
    }

    window.addEventListener('resize', () => {
      CosmoComposer.onWindowResize();
      if (dom.loginPage && getComputedStyle(dom.loginPage).display !== 'none') {
        resizeJwtLoginTextarea(dom.jwtLoginInput);
      }
    });
  }

  async function bootstrap() {
    if (typeof CosmoI18n !== 'undefined') {
      if (typeof CosmoI18n.applyDomI18n === 'function') {
        CosmoI18n.applyDomI18n(document);
      }
      syncLoginLangControls();
    }

    CosmoChatView.init({
      onSelectMember: (member) => {
        state.activeMemberId = member.artistMemberId;
        CosmoChatView.renderSidebar(state.membersData, state.activeMemberId);
        CosmoChatView.renderChat(member);
        CosmoComposer.ensureRemainingCountIfNeeded(state.activeMemberId);
      },
      onLogout: () => logoutToLoginPage(),
    });

    CosmoComposer.init({
      getActiveMember,
      onMessageSent: (sentMemberId) => refreshMemberFromNdjson(sentMemberId),
    });

    bindEvents();
    updateComposerVisibility();

    if (typeof CosmoStorage === 'undefined' || typeof CosmoStorage.getTokens !== 'function') {
      showLoginPage(tr('storage_missing'));
      return;
    }

    if ((typeof window !== 'undefined' && window.IS_DEMO_MODE)) {
      try {
        await enterChatSession();
      } catch (err) {
        showLoginPage(err?.message || tr('login_retry'));
      }
      return;
    }

    const tokens = await CosmoStorage.getTokens();
    if (!tokens.accessToken && !tokens.refreshToken) {
      showLoginPage(tr('login_prompt'));
      return;
    }

    try {
      await enterChatSession();
    } catch (err) {
      showLoginPage(
        tr('login_loading_failed', { reason: err?.message || tr('login_retry') })
      );
    }
  }

  bootstrap();
})();

/* --- TOPBAR TABLER TRANSLATE TOGGLE BUTTON (STABLE) --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_TRANSLATE_TOPBAR_STABLE__) return;
  window.__COSMO_TRANSLATE_TOPBAR_STABLE__ = true;

  const TI_ICON_HTML = '<i class="ti ti-language" aria-hidden="true"></i>';

  const SVG_ICON_HTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'class="icon icon-tabler icons-tabler-outline icon-tabler-language" aria-hidden="true" ' +
    'style="width:20px;height:20px;min-width:20px;min-height:20px;display:block;flex-shrink:0;">' +
    '<path stroke="none" d="M0 0h24v24H0z" fill="none"/>' +
    '<path d="M4 5h7" /><path d="M9 3v2c0 4.418 -2.239 8 -5 8" />' +
    '<path d="M5 9c0 2.144 2.952 3.908 6.7 4" /><path d="M12 20l4 -9l4 9" />' +
    '<path d="M19.1 18h-6.2" /></svg>';

  let useSvgFallback = false;

  async function detectIconFontIfNeeded() {
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
        const loaded = Array.from(document.fonts).some(
          (f) => f.status === 'loaded' && /tabler/i.test(f.family || '')
        );
        if (!loaded) {
          // 檢查 .ti-copy 是否能實際撐開寬度；若不能代表 tabler icon 字型未載入
          const probe = document.createElement('i');
          probe.className = 'ti ti-copy';
          probe.style.position = 'fixed';
          probe.style.left = '-9999px';
          probe.style.visibility = 'hidden';
          document.body.appendChild(probe);
          const w = probe.getBoundingClientRect().width;
          probe.remove();
          if (w < 8) {
            useSvgFallback = true;
          }
        }
      }
    } catch (_) {
      useSvgFallback = true;
    }
    const btn = document.getElementById('btn-toggle-translate');
    if (btn) applyIcon(btn);
  }

  function applyIcon(btn) {
    if (!btn) return;
    btn.style.minWidth = '32px';
    btn.style.minHeight = '32px';
    btn.style.flexShrink = '0';
    const desired = useSvgFallback ? SVG_ICON_HTML : TI_ICON_HTML;
    if (btn.innerHTML !== desired) {
      btn.innerHTML = desired;
    }
  }

  function getClassString(el) {
    if (!el || !el.className) return '';
    if (typeof el.className === 'string') return el.className;
    if (typeof el.className.baseVal === 'string') return el.className.baseVal;
    return String(el.className);
  }

  function findExportBtn() {
    const btns = Array.from(document.querySelectorAll('button, [role="button"], a.icon-btn'));
    return btns.find((el) => {
      if (!el || el.id === 'btn-toggle-translate') return false;
      const cls = getClassString(el);
      const meta = `${el.id || ''} ${cls} ${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
      return meta.includes('export') || meta.includes('download') || meta.includes('匯出') || meta.includes('下載');
    }) || null;
  }

  function syncVisual(btn, isOn) {
    btn.dataset.translateOn = isOn ? '1' : '0';
    btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    btn.classList.toggle('is-active', isOn);
    btn.classList.toggle('active', isOn);
  }

  function ensureBtn() {
    const exportBtn = findExportBtn();
    if (!exportBtn || !exportBtn.parentElement) return;

    let btn = document.getElementById('btn-toggle-translate');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btn-toggle-translate';
      btn.className = getClassString(exportBtn) || 'icon-btn';
      btn.title = 'Translate (ON/OFF)';
      btn.setAttribute('aria-label', 'Translate (ON/OFF)');
      exportBtn.parentElement.insertBefore(btn, exportBtn);
    }

    applyIcon(btn);

    if (!btn.dataset.boundStable) {
      btn.dataset.boundStable = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const nextOn = typeof CosmoTranslate !== 'undefined'
          ? CosmoTranslate.toggle()
          : btn.dataset.translateOn !== '1';
        syncVisual(btn, nextOn);
      });
    }

    if (typeof CosmoTranslate !== 'undefined' && !btn.dataset.stateBoundStable) {
      btn.dataset.stateBoundStable = '1';
      CosmoTranslate.onStateChange((isOn) => syncVisual(btn, isOn));
    }

    const curOn = typeof CosmoTranslate !== 'undefined' ? CosmoTranslate.isEnabled() : btn.dataset.translateOn === '1';
    syncVisual(btn, curOn);
  }

  const mo = new MutationObserver(() => ensureBtn());
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureBtn();
      detectIconFontIfNeeded();
    }, { once: true });
  } else {
    ensureBtn();
    detectIconFontIfNeeded();
  }
})();

/* --- JWT INPUT RIGHT-ALIGNED CLIPBOARD PASTE BUTTON --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_JWT_PASTE_BTN_HOOKED__) return;
  window.__COSMO_JWT_PASTE_BTN_HOOKED__ = true;

  const CLIPBOARD_ICON_HTML =
    '<i class="ti ti-clipboard" aria-hidden="true" style="font-size:16px;line-height:1;display:inline-flex;align-items:center;justify-content:center;pointer-events:none;"></i>';

  async function readClipboardTextSafe() {
    if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        const txt = await navigator.clipboard.readText();
        if (typeof txt === 'string') return txt;
      } catch (_) {}
    }
    return '';
  }

  function triggerInputEvents(inputEl) {
    if (!inputEl) return;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function ensureJwtPasteButton() {
    const inputEl = document.getElementById('jwt-login-input');
    if (!inputEl || !inputEl.parentElement) return;

    let wrap = inputEl.closest('.jwt-input-wrap');
    if (!wrap) {
      const parent = inputEl.parentElement;
      wrap = document.createElement('div');
      wrap.className = 'jwt-input-wrap';
      wrap.style.position = 'relative';
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      wrap.style.width = '100%';
      parent.insertBefore(wrap, inputEl);
      wrap.appendChild(inputEl);
    }

    inputEl.style.width = '100%';
    inputEl.style.paddingRight = '40px';
    inputEl.style.position = 'relative';
    inputEl.style.zIndex = '1';

    let btn = document.getElementById('btn-paste-jwt');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btn-paste-jwt';
      btn.className = 'icon-btn jwt-paste-btn';
      btn.title = 'Paste';
      btn.setAttribute('aria-label', 'Paste');
      btn.innerHTML = CLIPBOARD_ICON_HTML;

      // 小於輸入框、靠右對齊、塞在框內最上層
      btn.style.position = 'absolute';
      btn.style.right = '6px';
      btn.style.top = '50%';
      btn.style.transform = 'translateY(-50%)';
      btn.style.width = '28px';
      btn.style.height = '28px';
      btn.style.minWidth = '28px';
      btn.style.minHeight = '28px';
      btn.style.padding = '0';
      btn.style.margin = '0';
      btn.style.zIndex = '2';
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.borderRadius = '6px';
      btn.style.cursor = 'pointer';

      wrap.appendChild(btn);
    }

    if (!btn.dataset.boundPaste) {
      btn.dataset.boundPaste = '1';
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        inputEl.focus();
        const text = await readClipboardTextSafe();
        if (text) {
          inputEl.value = text.trim();
          triggerInputEvents(inputEl);
          return;
        }

        // 若瀏覽器限制直接 readText，嘗試 execCommand('paste') 作為備援
        try {
          if (typeof document.execCommand === 'function') {
            document.execCommand('paste');
            triggerInputEvents(inputEl);
          }
        } catch (_) {}
      });
    }
  }

  const mo = new MutationObserver(() => ensureJwtPasteButton());
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureJwtPasteButton, { once: true });
  } else {
    ensureJwtPasteButton();
  }
})();

/* --- HARDCODED ORIGINAL_NAME -> MEMBER COLOR MAP & SIDEBAR 3PX AVATAR RING --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_SIDEBAR_ORIGINAL_NAME_COLOR_INIT__) return;
  window.__COSMO_SIDEBAR_ORIGINAL_NAME_COLOR_INIT__ = true;

  // 依你提供的 MEMBERS 硬編碼建立 originalName -> HEX 色碼映射（含大小寫標準化查找）
  const ORIGINAL_NAME_COLORS = {
    "SeoYeon": "#22AEFF",
    "HyeRin": "#9200FF",
    "JiWoo": "#FFF800",
    "ChaeYeon": "#98F21D",
    "YooYeon": "#DB0C74",
    "SooMin": "#FC83A4",
    "NaKyoung": "#6799A0",
    "YuBin": "#FFE3E2",
    "Kaede": "#FFC935",
    "DaHyun": "#FF9AD6",
    "Kotone": "#FFDE00",
    "YeonJi": "#5974FF",
    "Nien": "#FF953F",
    "SoHyun": "#1222B5",
    "Xinyu": "#D51313",
    "Mayu": "#FE8E76",
    "Lynn": "#AC62B7",
    "JooBin": "#B7F54C",
    "HaYeon": "#52D9BB",
    "ShiOn": "#FF428A",
    "ChaeWon": "#C7A3E0",
    "Sullin": "#7BBA8D",
    "SeoAh": "#CFF3FF",
    "JiYeon": "#FFAB62",
    "tripleS": "#333333",
  };

  const LOWER_NAME_COLORS = Object.fromEntries(
    Object.entries(ORIGINAL_NAME_COLORS).map(([k, v]) => [k.toLowerCase(), v])
  );

  function resolveColorByOriginalName(originalName) {
    if (!originalName || typeof originalName !== 'string') return null;
    const trimmed = originalName.trim();
    if (!trimmed) return null;
    if (ORIGINAL_NAME_COLORS[trimmed]) return ORIGINAL_NAME_COLORS[trimmed];
    const lower = trimmed.toLowerCase();
    if (LOWER_NAME_COLORS[lower]) return LOWER_NAME_COLORS[lower];
    // 支援例如 "SeoYeon (S1)" 或包含成員英文名的字串比對
    for (const [key, hex] of Object.entries(LOWER_NAME_COLORS)) {
      if (lower.includes(key)) return hex;
    }
    return null;
  }

  function extractChannelsFromPayload(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.Channels)) return payload.Channels;
    if (Array.isArray(payload.channels)) return payload.channels;
    if (payload.data) {
      if (Array.isArray(payload.data.Channels)) return payload.data.Channels;
      if (Array.isArray(payload.data.channels)) return payload.data.channels;
    }
    return [];
  }

  function ingestChannels(payload) {
    const list = extractChannelsFromPayload(payload);
    if (!list.length) return;
    const byId = window.__COSMO_CHANNEL_COLOR_BY_ID__ || (window.__COSMO_CHANNEL_COLOR_BY_ID__ = {});
    const byName = window.__COSMO_CHANNEL_COLOR_BY_NAME__ || (window.__COSMO_CHANNEL_COLOR_BY_NAME__ = {});

    for (const ch of list) {
      if (!ch || typeof ch !== 'object') continue;
      const origName = ch.originalName ?? ch.original_name ?? ch.name ?? '';
      const color = resolveColorByOriginalName(origName);
      if (!color) continue;

      for (const idCandidate of [ch.id, ch.channelId, ch.artistMemberId, ch.memberId, ch.artistId]) {
        if (idCandidate !== undefined && idCandidate !== null && String(idCandidate).trim() !== '') {
          byId[String(idCandidate).trim()] = color;
        }
      }
      if (origName) {
        byName[String(origName).trim().toLowerCase()] = color;
      }
    }
    applySidebarThumbBorders();
  }

  function hookFetchForChannels() {
    if (typeof window.fetch !== 'function' || window.__COSMO_FETCH_CHANNEL_HOOKED__) return;
    window.__COSMO_FETCH_CHANNEL_HOOKED__ = true;
    const origFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const res = await origFetch(...args);
      try {
        const clone = res.clone();
        const ct = clone.headers.get('content-type') || '';
        if (ct.includes('application/json') || ct.includes('+json')) {
          clone.json().then((data) => ingestChannels(data)).catch(() => {});
        }
      } catch (_) {}
      return res;
    };
  }

  function applyThumbRing(imgEl, color) {
    if (!imgEl || !color) return;
    imgEl.style.borderRadius = '50%';
    imgEl.style.border = `2.5px solid ${color}`;
    imgEl.style.boxSizing = 'border-box';
  }

  function applySidebarThumbBorders() {
    const byId = window.__COSMO_CHANNEL_COLOR_BY_ID__ || {};
    const byName = window.__COSMO_CHANNEL_COLOR_BY_NAME__ || {};

    const items = document.querySelectorAll(
      '#sidebar .member-item, .sidebar .member-item, #member-list .member-item, #member-list button, #member-list [data-member-id], #member-list [data-channel-id]'
    );

    items.forEach((item) => {
      const thumb =
        item.querySelector('.member-thumb') ||
        item.querySelector('img');
      if (!thumb) return;

      const idAttr =
        item.dataset.memberId ||
        item.dataset.channelId ||
        item.dataset.artistId ||
        item.getAttribute('data-id') ||
        '';
      const labelText =
        (item.querySelector('.member-label')?.textContent || item.textContent || '').trim();

      let color = (idAttr && byId[String(idAttr).trim()]) || null;
      if (!color && labelText) {
        color =
          byName[labelText.toLowerCase()] ||
          resolveColorByOriginalName(labelText);
      }
      if (color) {
        applyThumbRing(thumb, color);
      }
    });
  }

  window.CosmoOriginalNameColors = {
    map: ORIGINAL_NAME_COLORS,
    resolve: resolveColorByOriginalName,
    ingestChannels,
    applySidebarThumbBorders,
  };

  function init() {
    hookFetchForChannels();
    applySidebarThumbBorders();

    const mo = new MutationObserver(() => applySidebarThumbBorders());
    mo.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

/* --- SAFE DEMO LOGOUT & MUTATION OBSERVER LOOP GUARD --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_LOGOUT_GUARD_INIT__) return;
  window.__COSMO_LOGOUT_GUARD_INIT__ = true;

  window.__COSMO_LOGGING_OUT__ = false;

  function getCleanTargetUrl() {
    if (window.location.hostname === 'twkenxtis.github.io') {
      return 'https://twkenxtis.github.io/cosmo-talk-web/';
    }
    return `${window.location.origin}${window.location.pathname}`;
  }

  // 在頁面卸載前清掉可能殘留的 demo 查詢參數
  window.addEventListener('pagehide', () => {
    window.__COSMO_LOGGING_OUT__ = false;
  });

  // 包裝原生 MutationObserver，避免同步遞迴與登出期間狂刷 DOM
  const NativeMO = window.MutationObserver;
  if (typeof NativeMO === 'function') {
    window.MutationObserver = function WrappedMutationObserver(callback) {
      let scheduled = false;
      let pendingMutations = [];
      let pendingTarget = null;

      const wrappedCb = (mutations, observer) => {
        if (window.__COSMO_LOGGING_OUT__) return;
        pendingMutations.push(...mutations);
        pendingTarget = observer;
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          if (window.__COSMO_LOGGING_OUT__) {
            pendingMutations = [];
            return;
          }
          const batch = pendingMutations;
          const obs = pendingTarget;
          pendingMutations = [];
          if (batch.length > 0) {
            callback(batch, obs);
          }
        });
      };

      return new NativeMO(wrappedCb);
    };
    window.MutationObserver.prototype = NativeMO.prototype;
  }

  window.__cosmoCleanLogoutRedirect = function __cosmoCleanLogoutRedirect(wasDemo) {
    const cleanUrl = getCleanTargetUrl();
    try {
      window.sessionStorage.removeItem('cosmo_demo_mode');
      window.localStorage.removeItem('cosmo_demo_mode');
    } catch (_) {}

    if (wasDemo || window.location.search.includes('demo')) {
      window.__COSMO_LOGGING_OUT__ = true;
      if (window.location.href !== cleanUrl) {
        window.location.replace(cleanUrl);
        return true;
      }
    }
    window.__COSMO_LOGGING_OUT__ = false;
    return false;
  };
})();

/* --- REPLY BUBBLE ENHANCER, 4-THEME SWITCHER & MEMBER FULL-TEXT SEARCH --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_REPLY_THEME_SEARCH_INIT__) return;
  window.__COSMO_REPLY_THEME_SEARCH_INIT__ = true;

  const THEME_KEY = 'cosmo_ui_theme_mode';
  const VALID_THEMES = ['dark', 'light', 'black', 'white'];

  const MEMBER_COLOR_BY_ID = {
    1: '#22AEFF', 2: '#9200FF', 3: '#FFF800', 4: '#98F21D', 5: '#DB0C74',
    6: '#FC83A4', 7: '#6799A0', 8: '#FFE3E2', 9: '#FFC935', 10: '#FF9AD6',
    11: '#FFDE00', 12: '#5974FF', 13: '#FF953F', 14: '#1222B5', 19: '#D51313',
    21: '#FE8E76', 22: '#AC62B7', 23: '#B7F54C', 24: '#52D9BB', 25: '#FF428A',
    26: '#C7A3E0', 27: '#7BBA8D', 28: '#CFF3FF', 29: '#FFAB62', 0: '#333333',
  };

  function applyTheme(themeName) {
    const mode = VALID_THEMES.includes(themeName) ? themeName : 'dark';
    document.documentElement.setAttribute('data-theme', mode);
    try {
      window.localStorage.setItem(THEME_KEY, mode);
    } catch (_) {}
    const sel = document.getElementById('cosmo-theme-select');
    if (sel && sel.value !== mode) {
      sel.value = mode;
    }
  }

  function initTheme() {
    let saved = 'dark';
    try {
      saved = window.localStorage.getItem(THEME_KEY) || 'dark';
    } catch (_) {}
    applyTheme(saved);
  }

  function resolveArtistName(msg, wrapperEl) {
    const fromDom = wrapperEl?.querySelector('.sender-name')?.textContent?.trim();
    if (fromDom) return fromDom;
    const headerTitle = document.querySelector('#chat-header .header-title')?.textContent?.trim();
    if (headerTitle) return headerTitle;
    const mid = Number(msg?.artistMemberId ?? msg?.senderId);
    if (window.CosmoOriginalNameColors?.map) {
      for (const [k, v] of Object.entries(window.CosmoOriginalNameColors.map)) {
        if (MEMBER_COLOR_BY_ID[mid] && MEMBER_COLOR_BY_ID[mid].toLowerCase() === String(v).toLowerCase()) {
          return k;
        }
      }
    }
    return Number.isFinite(mid) && mid > 0 ? `Artist #${mid}` : 'Artist';
  }

  function resolveArtistColor(msg) {
    const mid = Number(msg?.artistMemberId ?? msg?.senderId);
    if (Number.isFinite(mid) && MEMBER_COLOR_BY_ID[mid]) {
      return MEMBER_COLOR_BY_ID[mid];
    }
    return '#b28aff';
  }

  function enhanceReplyBubbles() {
    const chatEl = document.getElementById('chat');
    if (!chatEl) return;

    const wrappers = chatEl.querySelectorAll('.msg-wrapper');
    wrappers.forEach((wrapper) => {
      if (wrapper.dataset.cosmoReplyEnhanced === '1') return;

      const rawMsg = wrapper.__cosmoMessage || wrapper._message || null;
      const replyContent =
        typeof rawMsg?.replyContent === 'string' && rawMsg.replyContent.trim() !== ''
          ? rawMsg.replyContent
          : null;
      const replyMeta = rawMsg?.replyMetadata || null;

      if (!replyContent && !replyMeta) return;

      const mainBubble = wrapper.querySelector('.bubble');
      if (!mainBubble) return;

      const artistLabel = resolveArtistName(rawMsg, wrapper);
      const accentColor = resolveArtistColor(rawMsg);
      const isMe = Boolean(replyMeta && replyMeta.isMe === true);
      const headText = isMe
        ? `${artistLabel} 回覆我了！`
        : `${artistLabel} 回覆了`;

      const chain = document.createElement('div');
      chain.className = 'cosmo-reply-chain';

      const banner = document.createElement('div');
      banner.className = 'cosmo-reply-banner';
      banner.style.setProperty('--reply-accent', accentColor);
      banner.style.borderLeftColor = accentColor;

      const metaDiv = document.createElement('div');
      metaDiv.className = 'cosmo-reply-banner__meta';
      metaDiv.textContent = headText;

      banner.appendChild(metaDiv);
      if (replyContent) {
        const quoteDiv = document.createElement('div');
        quoteDiv.className = 'cosmo-reply-banner__quote';
        quoteDiv.textContent = replyContent;
        banner.appendChild(quoteDiv);
      }

      const followBubble = mainBubble.cloneNode(true);
      followBubble.classList.remove('reply-bubble', 'user-reply');
      followBubble.classList.add('cosmo-reply-follow-bubble');
      if (typeof rawMsg?.content === 'string') {
        const origTextNode = followBubble.querySelector('.cosmo-orig-text');
        if (origTextNode) {
          origTextNode.textContent = rawMsg.content;
        } else if (!followBubble.querySelector('img, video')) {
          followBubble.textContent = rawMsg.content;
        }
      }

      chain.appendChild(banner);
      chain.appendChild(followBubble);
      mainBubble.replaceWith(chain);
      wrapper.dataset.cosmoReplyEnhanced = '1';
    });
  }

  function injectThemeControlIntoAdvSetting() {
    const modalBody =
      document.querySelector('#settings-modal .settings-modal-body') ||
      document.querySelector('.settings-modal-panel .settings-modal-body') ||
      document.querySelector('.settings-modal-body');
    if (!modalBody || document.getElementById('cosmo-theme-row')) return;

    const row = document.createElement('div');
    row.id = 'cosmo-theme-row';
    row.className = 'settings-option-row';

    const label = document.createElement('span');
    label.className = 'settings-option-label';
    label.textContent = '主題 / Theme';

    const select = document.createElement('select');
    select.id = 'cosmo-theme-select';
    select.className = 'cosmo-theme-select';
    select.setAttribute('aria-label', '主題切換');

    [
      { value: 'dark', text: 'Dark (深色)' },
      { value: 'light', text: 'Light (淺色)' },
      { value: 'black', text: 'Black (純黑)' },
      { value: 'white', text: 'White (純白)' },
    ].forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.text;
      select.appendChild(o);
    });

    try {
      select.value = window.localStorage.getItem(THEME_KEY) || 'dark';
    } catch (_) {}

    select.addEventListener('change', () => applyTheme(select.value));

    row.appendChild(label);
    row.appendChild(select);
    modalBody.appendChild(row);
  }

  async function extractBlobTextIfNeeded(candidate) {
    if (!candidate) return '';
    if (typeof candidate === 'string') return candidate;
    if (typeof Blob !== 'undefined' && candidate instanceof Blob) {
      try {
        return await candidate.text();
      } catch (_) {
        return '';
      }
    }
    return '';
  }

  function collectTranslatedCandidates(wrapperEl) {
    const parts = [];
    if (!wrapperEl) return parts;

    wrapperEl.querySelectorAll('.cosmo-translated-text').forEach((el) => {
      if (el.textContent) parts.push(el.textContent);
    });

    const msg = wrapperEl.__cosmoMessage || wrapperEl._message || null;
    if (msg && typeof msg === 'object') {
      for (const k of ['translatedContent', 'translated', 'translation', 'translatedBlobText']) {
        if (typeof msg[k] === 'string' && msg[k].trim()) {
          parts.push(msg[k]);
        }
      }
    }

    const trMod = window.CosmoTranslate;
    if (trMod && msg) {
      const key = msg.syncId || msg.id || msg.sourceId || '';
      if (key && trMod.cache && typeof trMod.cache.get === 'function') {
        const cached = trMod.cache.get(key);
        if (typeof cached === 'string') parts.push(cached);
        else if (cached && typeof cached.translated === 'string') parts.push(cached.translated);
      }
    }

    return parts;
  }

  let searchMatches = [];
  let searchIndex = -1;

  function clearSearchHighlights() {
    document.querySelectorAll('.cosmo-search-hit').forEach((el) => {
      el.classList.remove('cosmo-search-hit');
    });
  }

  function focusSearchMatch(idx) {
    clearSearchHighlights();
    const countEl = document.getElementById('cosmo-search-count');
    if (!searchMatches.length) {
      if (countEl) countEl.textContent = '0 / 0';
      return;
    }
    searchIndex = ((idx % searchMatches.length) + searchMatches.length) % searchMatches.length;
    const target = searchMatches[searchIndex];
    target.classList.add('cosmo-search-hit');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (countEl) countEl.textContent = `${searchIndex + 1} / ${searchMatches.length}`;
  }

  async function runCurrentMemberSearch(queryStr) {
    const q = (queryStr || '').trim().toLowerCase();
    searchMatches = [];
    searchIndex = -1;
    clearSearchHighlights();

    const countEl = document.getElementById('cosmo-search-count');
    if (!q) {
      if (countEl) countEl.textContent = '0 / 0';
      return;
    }

    const chatEl = document.getElementById('chat');
    if (!chatEl) return;

    const wrappers = Array.from(chatEl.querySelectorAll('.msg-wrapper'));
    for (const w of wrappers) {
      if (w.offsetParent === null) continue;
      const origText = (w.textContent || '').toLowerCase();
      const extraParts = collectTranslatedCandidates(w);
      for (const item of extraParts) {
        if (typeof Blob !== 'undefined' && item instanceof Blob) {
          extraParts.push(await extractBlobTextIfNeeded(item));
        }
      }
      const combined = `${origText}\n${extraParts.join('\n').toLowerCase()}`;
      if (combined.includes(q)) {
        searchMatches.push(w);
      }
    }

    focusSearchMatch(0);
  }

  function injectSearchBarAndButton() {
    const header = document.getElementById('chat-header') || document.querySelector('.chat-header');
    const mainPane = document.querySelector('.main-pane') || document.body;
    if (!header || !mainPane) return;

    if (!document.getElementById('cosmo-member-search-btn')) {
      const actions = header.querySelector('.header-actions') || header;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'cosmo-member-search-btn';
      btn.className = 'icon-btn';
      btn.title = '搜尋目前成員訊息';
      btn.setAttribute('aria-label', '搜尋目前成員訊息');
      btn.innerHTML = '<i class="ti ti-search" aria-hidden="true"></i>';
      btn.addEventListener('click', () => {
        const bar = document.getElementById('cosmo-search-bar');
        if (!bar) return;
        bar.classList.toggle('open');
        if (bar.classList.contains('open')) {
          document.getElementById('cosmo-search-input')?.focus();
        } else {
          clearSearchHighlights();
        }
      });
      actions.prepend(btn);
    }

    if (!document.getElementById('cosmo-search-bar')) {
      const bar = document.createElement('div');
      bar.id = 'cosmo-search-bar';
      bar.className = 'cosmo-search-bar';

      const input = document.createElement('input');
      input.type = 'search';
      input.id = 'cosmo-search-input';
      input.className = 'cosmo-search-input';
      const getSearchPlaceholder = () =>
        typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function'
          ? CosmoI18n.t('search_member_placeholder')
          : '搜尋目前成員（包含翻譯內容）...';
      input.placeholder = getSearchPlaceholder();
      if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.onChange === 'function') {
        CosmoI18n.onChange(() => {
          input.placeholder = getSearchPlaceholder();
        });
      }

      const countSpan = document.createElement('span');
      countSpan.id = 'cosmo-search-count';
      countSpan.className = 'cosmo-search-count';
      countSpan.textContent = '0 / 0';

      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'icon-btn';
      prevBtn.title = '上一筆';
      prevBtn.textContent = '↑';
      prevBtn.addEventListener('click', () => focusSearchMatch(searchIndex - 1));

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'icon-btn';
      nextBtn.title = '下一筆';
      nextBtn.textContent = '↓';
      nextBtn.addEventListener('click', () => focusSearchMatch(searchIndex + 1));

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'icon-btn';
      closeBtn.title = '關閉搜尋';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', () => {
        bar.classList.remove('open');
        clearSearchHighlights();
      });

      input.addEventListener('input', () => runCurrentMemberSearch(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          focusSearchMatch(e.shiftKey ? searchIndex - 1 : searchIndex + 1);
        } else if (e.key === 'Escape') {
          bar.classList.remove('open');
          clearSearchHighlights();
        }
      });

      bar.appendChild(input);
      bar.appendChild(countSpan);
      bar.appendChild(prevBtn);
      bar.appendChild(nextBtn);
      bar.appendChild(closeBtn);

      header.insertAdjacentElement('afterend', bar);
    }
  }

  function tick() {
    injectThemeControlIntoAdvSetting();
    injectSearchBarAndButton();
    enhanceReplyBubbles();
  }

  initTheme();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick, { once: true });
  } else {
    tick();
  }

  const mo = new MutationObserver(() => tick());
  mo.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });

  window.CosmoReplyThemeSearch = {
    applyTheme,
    enhanceReplyBubbles,
    runCurrentMemberSearch,
  };
})();

/* --- LIVE SYNC SEARCH I18N ON LANGUAGE CHANGE --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_LIVE_SEARCH_I18N_INIT__) return;
  window.__COSMO_LIVE_SEARCH_I18N_INIT__ = true;

  function getSearchPlaceholderText() {
    if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function') {
      const val = CosmoI18n.t('search_member_placeholder');
      if (val && val !== 'search_member_placeholder') return val;
    }
    return '搜尋目前成員（包含翻譯內容）...';
  }

  function syncSearchLabelsNow() {
    const text = getSearchPlaceholderText();
    const input = document.getElementById('cosmo-search-input');
    if (input && input.getAttribute('placeholder') !== text) {
      input.setAttribute('placeholder', text);
      input.placeholder = text;
    }
    const btn = document.getElementById('cosmo-member-search-btn');
    if (btn) {
      const cleanLabel = text.replace(/\.{3,}$/, '').trim();
      btn.title = cleanLabel;
      btn.setAttribute('aria-label', cleanLabel);
    }
  }

  function bindLanguageSyncHooks() {
    if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.onChange === 'function') {
      CosmoI18n.onChange(() => {
        syncSearchLabelsNow();
        requestAnimationFrame(syncSearchLabelsNow);
      });
    }

    document.addEventListener('change', (ev) => {
      const target = ev.target;
      if (!target) return;
      if (
        target.id === 'login-lang-select' ||
        target.classList?.contains('settings-lang-select') ||
        target.classList?.contains('login-lang-select')
      ) {
        setTimeout(syncSearchLabelsNow, 0);
        setTimeout(syncSearchLabelsNow, 50);
      }
    });

    document.addEventListener('click', (ev) => {
      const target = ev.target?.closest?.('button, [role="option"], .settings-choice-btn');
      if (!target) return;
      if (target.id === 'login-lang-btn' || target.closest?.('.login-lang-switcher, .settings-modal-panel')) {
        setTimeout(syncSearchLabelsNow, 20);
      }
    });
  }

  syncSearchLabelsNow();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindLanguageSyncHooks();
      syncSearchLabelsNow();
    }, { once: true });
  } else {
    bindLanguageSyncHooks();
    syncSearchLabelsNow();
  }

  const mo = new MutationObserver(() => syncSearchLabelsNow());
  mo.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });

  window.CosmoSyncSearchI18n = syncSearchLabelsNow;
})();

/* --- CHECK CURRENT LANGUAGE ON LANG SWITCH & MAGNIFIER CLICK --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_SEARCH_LANG_CHECK_INIT__) return;
  window.__COSMO_SEARCH_LANG_CHECK_INIT__ = true;

  const DEFAULT_BY_LANG = {
    en: 'Search current member (incl. translated)...',
    ja: '現在のメンバーを検索（翻訳を含む）...',
    ko: '현재 멤버 검색 (번역 내용 포함)...',
    zht: '搜尋目前成員（包含翻譯內容）...',
    zhc: '搜索当前成员（包含翻译内容）...',
  };

  function detectActiveLang() {
    if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.getLang === 'function') {
      const l = CosmoI18n.getLang();
      if (l) return String(l).toLowerCase();
    }
    const sel =
      document.querySelector('.settings-lang-select') ||
      document.getElementById('login-lang-select');
    if (sel && sel.value) return String(sel.value).toLowerCase();
    const htmlLang = document.documentElement.getAttribute('lang');
    if (htmlLang) return String(htmlLang).toLowerCase();
    try {
      const saved = window.localStorage.getItem('cosmo_talk_lang');
      if (saved) return String(saved).toLowerCase();
    } catch (_) {}
    return 'zht';
  }

  function resolveSearchPlaceholderByCurrentLang() {
    const lang = detectActiveLang();
    if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function') {
      const translated = CosmoI18n.t('search_member_placeholder');
      if (translated && translated !== 'search_member_placeholder') {
        return translated;
      }
    }
    if (DEFAULT_BY_LANG[lang]) return DEFAULT_BY_LANG[lang];
    if (lang.startsWith('en')) return DEFAULT_BY_LANG.en;
    if (lang.startsWith('ja')) return DEFAULT_BY_LANG.ja;
    if (lang.startsWith('ko')) return DEFAULT_BY_LANG.ko;
    if (lang.includes('cn') || lang.includes('hans') || lang === 'zhc') return DEFAULT_BY_LANG.zhc;
    return DEFAULT_BY_LANG.zht;
  }

  function applyCurrentLangToSearchUI() {
    const lang = detectActiveLang();
    const placeholderText = resolveSearchPlaceholderByCurrentLang();
    const cleanLabel = placeholderText.replace(/\.{3,}$/, '').trim();

    const input = document.getElementById('cosmo-search-input');
    if (input) {
      input.dataset.lang = lang;
      input.setAttribute('placeholder', placeholderText);
      input.setAttribute('aria-label', cleanLabel);
      input.placeholder = placeholderText;
    }

    const btn = document.getElementById('cosmo-member-search-btn');
    if (btn) {
      btn.dataset.lang = lang;
      btn.title = cleanLabel;
      btn.setAttribute('aria-label', cleanLabel);
    }
  }

  // 1. 每次點擊放大鏡按鈕載入/切換搜尋列時，先檢查並套用當前語言
  document.addEventListener(
    'click',
    (ev) => {
      const searchBtn = ev.target?.closest?.('#cosmo-member-search-btn, [data-action="search"], .search-btn');
      if (!searchBtn) return;
      applyCurrentLangToSearchUI();
      requestAnimationFrame(applyCurrentLangToSearchUI);
      setTimeout(applyCurrentLangToSearchUI, 20);
    },
    true
  );

  // 2. 切換語言選單時即時檢查目前語言並同步更新
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (!el) return;
    if (
      el.id === 'login-lang-select' ||
      el.classList?.contains('settings-lang-select') ||
      el.classList?.contains('login-lang-select')
    ) {
      applyCurrentLangToSearchUI();
      requestAnimationFrame(applyCurrentLangToSearchUI);
      setTimeout(applyCurrentLangToSearchUI, 30);
    }
  });

  if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.onChange === 'function') {
    CosmoI18n.onChange(() => {
      applyCurrentLangToSearchUI();
      requestAnimationFrame(applyCurrentLangToSearchUI);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyCurrentLangToSearchUI, { once: true });
  } else {
    applyCurrentLangToSearchUI();
  }

  window.CosmoApplySearchLang = applyCurrentLangToSearchUI;
})();

/* --- SILENT SINGLE-PASS BLOB TRANSLATOR (CURRENT MEMBER NDJSON ONLY, STREAM BACKPRESSURE) --- */
(() => {
  if (typeof window === 'undefined' || typeof CosmoTranslate === 'undefined') return;
  if (window.__COSMO_SILENT_BLOB_TRANSLATE_INIT__) return;
  window.__COSMO_SILENT_BLOB_TRANSLATE_INIT__ = true;

  const MAX_BLOB_ENTRIES = 600;
  const SILENT_CONCURRENCY = 3;
  const SILENT_BATCH_STEP = 25;
  const STREAM_READ_TIMEOUT_MS = 12000;

  let silentPageToken = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const silentCompletedForPage = new Set(); // key: `${silentPageToken}:${memberId}`
  let silentRunningMemberId = null;
  let silentAbortController = null;

  function resetSilentLifecycleForNewPage() {
    if (silentAbortController) {
      try { silentAbortController.abort(); } catch (_) {}
      silentAbortController = null;
    }
    silentRunningMemberId = null;
    silentCompletedForPage.clear();
    silentPageToken = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  window.addEventListener('pagehide', () => {
    if (silentAbortController) {
      try { silentAbortController.abort(); } catch (_) {}
      silentAbortController = null;
    }
  });

  async function readResponseTextStreamed(resp, signal) {
    if (!resp.body || typeof resp.body.getReader !== 'function') {
      return await resp.text();
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let out = '';
    const timer = setTimeout(() => {
      try { reader.cancel('timeout'); } catch (_) {}
    }, STREAM_READ_TIMEOUT_MS);

    try {
      while (true) {
        if (signal?.aborted) {
          try { reader.cancel('aborted'); } catch (_) {}
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          out += decoder.decode(value, { stream: true });
        }
      }
      out += decoder.decode();
      return out;
    } finally {
      clearTimeout(timer);
      try { reader.releaseLock(); } catch (_) {}
    }
  }

  function extractMemberRecords(member) {
    if (!member || typeof member !== 'object') return [];
    const mid = String(member.artistMemberId ?? member.id ?? '').trim();
    if (!mid) return [];
    const records = Array.isArray(member.records) ? member.records : [];
    const items = [];

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (!rec || rec.op === 'delete') continue;
      const msg = rec.message && typeof rec.message === 'object' ? rec.message : rec;
      if (!msg || msg.messageType !== 'text' || msg.senderType !== 'artistMember') continue;

      let sid = '';
      if (msg.sourceId !== undefined && msg.sourceId !== null && String(msg.sourceId).trim() !== '') {
        sid = String(msg.sourceId).trim();
      } else if (rec.sourceId !== undefined && rec.sourceId !== null && String(rec.sourceId).trim() !== '') {
        sid = String(rec.sourceId).trim();
      } else if (typeof msg.syncId === 'string' && msg.syncId.includes(':')) {
        sid = msg.syncId.split(':').pop().trim();
      }
      if (!sid) continue;

      const rawCursor = rec.cursor ?? msg.cursor ?? sid ?? String(i);
      const numCursor = Number(rawCursor);
      const cursorVal = Number.isFinite(numCursor)
        ? numCursor
        : (Number(String(rawCursor).replace(/\D+/g, '')) || i);

      items.push({ memberId: mid, sourceId: sid, cursorVal, orderIdx: i });
    }

    items.sort((a, b) => (b.cursorVal !== a.cursorVal ? b.cursorVal - a.cursorVal : b.orderIdx - a.orderIdx));
    return { mid, items };
  }

  function evictOldBlobEntriesIfNeeded() {
    // 透過 window.CosmoTranslate 內部快取若可存取則維持上限；此處保底清理多餘 ObjectURL
    if (!window.__COSMO_BLOB_URL_POOL__) {
      window.__COSMO_BLOB_URL_POOL__ = [];
    }
    const pool = window.__COSMO_BLOB_URL_POOL__;
    while (pool.length > MAX_BLOB_ENTRIES) {
      const oldUrl = pool.shift();
      if (oldUrl) {
        try { URL.revokeObjectURL(oldUrl); } catch (_) {}
      }
    }
  }

  function writeSilentBlob(mid, sid, translatedContent) {
    const text = String(translatedContent ?? '');
    if (!text) return null;
    const blob = new Blob(
      [JSON.stringify({ messageId: String(sid), translatedContent: text, silent: true })],
      { type: 'application/json;charset=utf-8' }
    );
    const blobUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(blob)
      : null;
    if (blobUrl) {
      window.__COSMO_BLOB_URL_POOL__ = window.__COSMO_BLOB_URL_POOL__ || [];
      window.__COSMO_BLOB_URL_POOL__.push(blobUrl);
      evictOldBlobEntriesIfNeeded();
    }
    if (!window.__COSMO_SILENT_BLOB_STORE__) {
      window.__COSMO_SILENT_BLOB_STORE__ = new Map();
    }
    const key = `${mid}:${sid}`;
    const prev = window.__COSMO_SILENT_BLOB_STORE__.get(key);
    if (prev?.blobUrl && prev.blobUrl !== blobUrl) {
      try { URL.revokeObjectURL(prev.blobUrl); } catch (_) {}
    }
    const entry = { messageId: String(sid), translatedContent: text, blob, blobUrl };
    window.__COSMO_SILENT_BLOB_STORE__.set(key, entry);
    return entry;
  }

  async function fetchSilentSingleItem(mid, sid, signal) {
    const key = `${mid}:${sid}`;
    if (window.__COSMO_SILENT_BLOB_STORE__?.has(key)) {
      return window.__COSMO_SILENT_BLOB_STORE__.get(key);
    }
    if (typeof CosmoTranslate.getCached === 'function') {
      const existing = CosmoTranslate.getCached(mid, sid);
      if (existing?.translatedContent) {
        return writeSilentBlob(mid, existing.messageId || sid, existing.translatedContent);
      }
    }

    const isDemo =
      typeof window !== 'undefined' &&
      window.__FORCE_PROD_SESSION__ !== true &&
      window.IS_DEMO_MODE === true;

    if (isDemo) {
      try {
        const res = await fetch('demo/demo_translate.json', { cache: 'no-store', signal });
        if (!res.ok) return null;
        const json = await res.json();
        const dict = json && typeof json.translations === 'object' ? json.translations : {};
        const hit = dict[sid] || dict[String(Number(sid))] || null;
        if (hit && hit.translatedContent) {
          return writeSilentBlob(mid, hit.messageId ?? sid, hit.translatedContent);
        }
      } catch (_) {}
      return null;
    }

    const url = `https://api.cosmo.fans/bff/v3/channels/messages/${encodeURIComponent(mid)}/${encodeURIComponent(sid)}/translated-contents`;
    try {
      const resp =
        typeof CosmoAuth !== 'undefined' && typeof CosmoAuth.authorizedFetch === 'function'
          ? await CosmoAuth.authorizedFetch(url, {
              method: 'GET',
              headers: { Accept: 'application/json' },
              signal,
            })
          : await fetch(url, {
              method: 'GET',
              headers: { Accept: 'application/json' },
              referrerPolicy: 'no-referrer',
              signal,
            });

      if (!resp || resp.status === 404 || resp.status !== 200) {
        return null;
      }

      const rawText = await readResponseTextStreamed(resp, signal);
      if (!rawText) return null;
      const parsed = JSON.parse(rawText);
      const transText = String(parsed?.translatedContent ?? '');
      if (!transText) return null;
      return writeSilentBlob(mid, parsed?.messageId ?? sid, transText);
    } catch (_) {
      return null;
    }
  }

  async function runSilentOnceForCurrentMember(member) {
    const built = extractMemberRecords(member);
    if (!built || !built.mid || !Array.isArray(built.items) || built.items.length === 0) {
      return;
    }

    const { mid, items } = built;
    const pageMemberKey = `${silentPageToken}:${mid}`;
    if (silentCompletedForPage.has(pageMemberKey)) {
      return;
    }
    if (silentRunningMemberId === mid) {
      return;
    }

    silentCompletedForPage.add(pageMemberKey);
    silentRunningMemberId = mid;
    silentAbortController = new AbortController();
    const { signal } = silentAbortController;

    try {
      for (let start = 0; start < items.length; start += SILENT_BATCH_STEP) {
        if (signal.aborted) break;
        const slice = items.slice(start, start + SILENT_BATCH_STEP);
        let idx = 0;

        async function worker() {
          while (idx < slice.length && !signal.aborted) {
            const current = slice[idx++];
            await fetchSilentSingleItem(current.memberId, current.sourceId, signal);
          }
        }

        await Promise.all(
          Array.from({ length: Math.min(SILENT_CONCURRENCY, slice.length) }, worker)
        );

        // 釋放主執行緒與事件迴圈，避免長時間佔用記憶體或阻塞 UI
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    } finally {
      if (silentRunningMemberId === mid) {
        silentRunningMemberId = null;
      }
    }
  }

  // 包裝 setMemberContext：僅對當前成員在本次頁面載入生命週期觸發一次靜默翻譯，且絕不自動開啟 DOM 顯示
  if (typeof CosmoTranslate.setMemberContext === 'function') {
    const origSetMemberContext = CosmoTranslate.setMemberContext.bind(CosmoTranslate);
    CosmoTranslate.setMemberContext = function wrappedSetMemberContext(member, ...rest) {
      const res = origSetMemberContext(member, ...rest);
      if (member && !CosmoTranslate.isEnabled()) {
        runSilentOnceForCurrentMember(member);
      }
      return res;
    };
  }

  // 當使用者點擊翻譯按鈕開啟時，若靜默 Blob 快取已有資料，直接顯示在畫面上
  if (typeof CosmoTranslate.setEnabled === 'function') {
    const origSetEnabled = CosmoTranslate.setEnabled.bind(CosmoTranslate);
    CosmoTranslate.setEnabled = function wrappedSetEnabled(nextVal, ...rest) {
      const res = origSetEnabled(nextVal, ...rest);
      if (Boolean(nextVal) && window.__COSMO_SILENT_BLOB_STORE__) {
        document.querySelectorAll('[data-source-id]').forEach((wrapEl) => {
          const sid = wrapEl.getAttribute('data-source-id') || '';
          const mid = wrapEl.getAttribute('data-artist-member-id') || '';
          if (!sid || !mid) return;
          const hit = window.__COSMO_SILENT_BLOB_STORE__.get(`${mid}:${sid}`);
          if (hit?.translatedContent && typeof CosmoTranslate.renderCachedForCurrentView === 'function') {
            CosmoTranslate.renderCachedForCurrentView();
          }
        });
      }
      return res;
    };
  }

  window.CosmoSilentTranslate = {
    runOnceForCurrentMember: runSilentOnceForCurrentMember,
    resetForPageLoad: resetSilentLifecycleForNewPage,
    getSilentBlobEntry: (mid, sid) =>
      window.__COSMO_SILENT_BLOB_STORE__?.get(`${String(mid)}:${String(sid)}`) || null,
  };
})();

/* --- SEARCH UNRENDERED BLOB TRANSLATIONS & JUMP TO MATCHED LINE --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_BLOB_UNRENDERED_SEARCH_INIT__) return;
  window.__COSMO_BLOB_UNRENDERED_SEARCH_INIT__ = true;

  const blobTextParseCache = new Map(); // key -> string
  let matches = [];
  let currentIdx = -1;
  let searchSeq = 0;

  async function readTextFromBlobOrUrl(entry) {
    if (!entry || typeof entry !== 'object') return '';
    if (typeof entry.translatedContent === 'string' && entry.translatedContent.trim() !== '') {
      return entry.translatedContent;
    }

    const cacheKey = `${entry.messageId || ''}:${entry.blobUrl || ''}`;
    if (cacheKey !== ':' && blobTextParseCache.has(cacheKey)) {
      return blobTextParseCache.get(cacheKey);
    }

    let rawText = '';
    try {
      if (typeof Blob !== 'undefined' && entry.blob instanceof Blob && typeof entry.blob.text === 'function') {
        rawText = await entry.blob.text();
      } else if (typeof entry.blobUrl === 'string' && entry.blobUrl) {
        const resp = await fetch(entry.blobUrl);
        if (resp.ok) rawText = await resp.text();
      }
    } catch (_) {
      rawText = '';
    }

    let resolved = rawText;
    if (rawText) {
      try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed.translatedContent === 'string') {
          resolved = parsed.translatedContent;
        }
      } catch (_) {
        // 非 JSON 則直接當作純文字
      }
    }

    if (cacheKey !== ':' && resolved) {
      blobTextParseCache.set(cacheKey, resolved);
    }
    return resolved;
  }

  function findBlobEntryForElement(wrapperEl) {
    if (!wrapperEl) return null;
    const sid = (
      wrapperEl.getAttribute('data-source-id') ||
      wrapperEl.__cosmoMessage?.sourceId ||
      ''
    ).trim();
    const mid = (
      wrapperEl.getAttribute('data-artist-member-id') ||
      wrapperEl.__cosmoMessage?.artistMemberId ||
      window.CosmoTranslate?.getProgress?.()?.currentMemberId ||
      ''
    ).trim();

    if (!sid) return null;

    if (mid && window.__COSMO_SILENT_BLOB_STORE__ instanceof Map) {
      const hit = window.__COSMO_SILENT_BLOB_STORE__.get(`${mid}:${sid}`);
      if (hit) return hit;
    }

    if (typeof CosmoTranslate !== 'undefined' && typeof CosmoTranslate.getCached === 'function') {
      const hit = CosmoTranslate.getCached(mid, sid);
      if (hit) return hit;
    }

    // 若未帶 memberId，掃描同 sourceId 的快取條目
    if (window.__COSMO_SILENT_BLOB_STORE__ instanceof Map) {
      for (const [k, v] of window.__COSMO_SILENT_BLOB_STORE__.entries()) {
        if (k.endsWith(`:${sid}`) || String(v?.messageId || '') === sid) {
          return v;
        }
      }
    }
    return null;
  }

  function clearHits() {
    document.querySelectorAll('.cosmo-search-hit').forEach((el) => {
      el.classList.remove('cosmo-search-hit');
    });
  }

  function jumpToMatch(idx) {
    clearHits();
    const countEl = document.getElementById('cosmo-search-count');
    if (!matches.length) {
      if (countEl) countEl.textContent = '0 / 0';
      return;
    }

    currentIdx = ((idx % matches.length) + matches.length) % matches.length;
    const item = matches[currentIdx];
    const targetEl = item.el;

    // 確保元素在可見容器內並捲動到該行
    if (targetEl && typeof targetEl.scrollIntoView === 'function') {
      targetEl.classList.add('cosmo-search-hit');
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (countEl) {
      countEl.textContent = `${currentIdx + 1} / ${matches.length} · #${item.lineNumber}`;
    }
  }

  async function runBlobAwareSearch(rawQuery) {
    const seq = ++searchSeq;
    const q = String(rawQuery || '').trim().toLowerCase();
    matches = [];
    currentIdx = -1;
    clearHits();

    const countEl = document.getElementById('cosmo-search-count');
    if (!q) {
      if (countEl) countEl.textContent = '0 / 0';
      return;
    }

    const chatEl = document.getElementById('chat');
    if (!chatEl) return;

    const wrappers = Array.from(chatEl.querySelectorAll('.msg-wrapper'));
    for (let i = 0; i < wrappers.length; i++) {
      if (seq !== searchSeq) return;
      const w = wrappers[i];
      if (!w || w.offsetParent === null) continue;

      const origText = String(w.textContent || '').toLowerCase();
      const blobEntry = findBlobEntryForElement(w);
      const blobText = blobEntry ? (await readTextFromBlobOrUrl(blobEntry)).toLowerCase() : '';

      if (seq !== searchSeq) return;
      if (origText.includes(q) || blobText.includes(q)) {
        matches.push({
          el: w,
          lineNumber: i + 1,
        });
      }
    }

    if (seq === searchSeq) {
      jumpToMatch(0);
    }
  }

  function hookSearchControls() {
    const input = document.getElementById('cosmo-search-input');
    const bar = document.getElementById('cosmo-search-bar');
    if (!input || input.dataset.blobSearchHooked === '1') return;
    input.dataset.blobSearchHooked = '1';

    // 取代舊有監聽，直接走支援未渲染 Blob 與行號跳轉的搜尋
    const freshInput = input.cloneNode(true);
    input.replaceWith(freshInput);

    freshInput.addEventListener('input', () => {
      runBlobAwareSearch(freshInput.value);
    });

    freshInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!matches.length && freshInput.value.trim()) {
          runBlobAwareSearch(freshInput.value);
        } else {
          jumpToMatch(e.shiftKey ? currentIdx - 1 : currentIdx + 1);
        }
      } else if (e.key === 'Escape') {
        bar?.classList.remove('open');
        clearHits();
      }
    });

    if (bar) {
      const buttons = bar.querySelectorAll('button');
      // 依序為 prev (↑), next (↓), close (✕)
      if (buttons[0]) {
        const prevFresh = buttons[0].cloneNode(true);
        buttons[0].replaceWith(prevFresh);
        prevFresh.addEventListener('click', () => jumpToMatch(currentIdx - 1));
      }
      if (buttons[1]) {
        const nextFresh = buttons[1].cloneNode(true);
        buttons[1].replaceWith(nextFresh);
        nextFresh.addEventListener('click', () => jumpToMatch(currentIdx + 1));
      }
      if (buttons[2]) {
        const closeFresh = buttons[2].cloneNode(true);
        buttons[2].replaceWith(closeFresh);
        closeFresh.addEventListener('click', () => {
          bar.classList.remove('open');
          clearHits();
        });
      }
    }
  }

  hookSearchControls();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookSearchControls, { once: true });
  }

  const mo = new MutationObserver(() => hookSearchControls());
  mo.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });

  window.CosmoBlobSearch = {
    search: runBlobAwareSearch,
    jumpToMatch,
  };
})();

/* --- TRANSLATE BUTTON SELF-HEALING & PERSISTENCE GUARD --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_TRANSLATE_BTN_GUARD_INIT__) return;
  window.__COSMO_TRANSLATE_BTN_GUARD_INIT__ = true;

  const BTN_ID = 'btn-toggle-translate';
  let healTimer = null;

  function isTranslateActive() {
    if (typeof CosmoTranslate !== 'undefined' && typeof CosmoTranslate.isEnabled === 'function') {
      return Boolean(CosmoTranslate.isEnabled());
    }
    const existing = document.getElementById(BTN_ID);
    return existing?.dataset?.translateOn === '1';
  }

  function applyButtonVisual(btn, isOn) {
    if (!btn) return;
    btn.dataset.translateOn = isOn ? '1' : '0';
    btn.classList.toggle('active', isOn);
    btn.classList.toggle('is-active', isOn);
    btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    btn.title = isOn ? 'Translate: ON' : 'Translate (ON/OFF)';
    btn.setAttribute('aria-label', isOn ? 'Translate (ON/OFF)' : 'Translate (ON/OFF)');
  }

  function findTargetToolbar() {
    const searchBtn =
      document.getElementById('cosmo-member-search-btn') ||
      document.querySelector('[data-action="search"], .search-btn');
    if (searchBtn && searchBtn.parentElement) {
      return { parent: searchBtn.parentElement, anchor: searchBtn };
    }

    const candidates = [
      '#chat-header .header-actions',
      '#chat-header .toolbar',
      '#chat-header',
      '.chat-header .header-actions',
      '.chat-header',
      '#topbar .actions',
      '#topbar',
      'header',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) return { parent: el, anchor: null };
    }
    return null;
  }

  function createTranslateButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = BTN_ID;
    btn.className = 'icon-btn btn-toggle-translate';
    btn.innerHTML =
      '<svg class="icon icon-tabler icons-tabler-outline icon-tabler-language" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path stroke="none" d="M0 0h24v24H0z" fill="none"/>' +
      '<path d="M4 5h7" />' +
      '<path d="M9 3v2c0 4.418 -2.239 8 -5 8" />' +
      '<path d="M5 9c0 2.144 2.952 3.908 6.7 4" />' +
      '<path d="M12 20l4 -9l4 9" />' +
      '<path d="M19.1 18h-6.2" />' +
      '</svg>';

    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const nextOn =
        typeof CosmoTranslate !== 'undefined' && typeof CosmoTranslate.toggle === 'function'
          ? Boolean(CosmoTranslate.toggle())
          : btn.dataset.translateOn !== '1';
      applyButtonVisual(btn, nextOn);
    });

    if (typeof CosmoTranslate !== 'undefined' && typeof CosmoTranslate.onStateChange === 'function') {
      CosmoTranslate.onStateChange((isOn) => {
        applyButtonVisual(document.getElementById(BTN_ID) || btn, Boolean(isOn));
      });
    }

    applyButtonVisual(btn, isTranslateActive());
    return btn;
  }

  function ensureTranslateButtonPresent() {
    const loc = findTargetToolbar();
    if (!loc || !loc.parent) return;

    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = createTranslateButton();
    }

    const expectedNext = loc.anchor ? loc.anchor.nextSibling : null;
    if (btn.parentElement !== loc.parent || (loc.anchor && btn.previousElementSibling !== loc.anchor && btn.nextSibling !== expectedNext)) {
      if (loc.anchor && loc.anchor.parentElement === loc.parent) {
        loc.anchor.insertAdjacentElement('afterend', btn);
      } else {
        loc.parent.appendChild(btn);
      }
    }

    applyButtonVisual(btn, isTranslateActive());
  }

  function scheduleHeal() {
    if (healTimer !== null) return;
    healTimer = requestAnimationFrame(() => {
      healTimer = null;
      ensureTranslateButtonPresent();
    });
  }

  ensureTranslateButtonPresent();
  window.addEventListener('DOMContentLoaded', () => {
    ensureTranslateButtonPresent();
    setTimeout(ensureTranslateButtonPresent, 100);
    setTimeout(ensureTranslateButtonPresent, 500);
  });
  window.addEventListener('load', ensureTranslateButtonPresent);

  const observerTarget = document.body || document.documentElement;
  if (observerTarget && typeof MutationObserver !== 'undefined') {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList' && (m.removedNodes.length > 0 || m.addedNodes.length > 0)) {
          if (!document.getElementById(BTN_ID)) {
            scheduleHeal();
            break;
          }
        }
      }
    });
    mo.observe(observerTarget, { childList: true, subtree: true });
  }

  window.CosmoEnsureTranslateButton = ensureTranslateButtonPresent;
})();

/* --- ENGLISH-ONLY DATE LABELS (e.g. 2026년 11월 20일 -> Nov 20, 2026) --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_EN_DATE_FORMAT_INIT__) return;
  window.__COSMO_EN_DATE_FORMAT_INIT__ = true;

  const MONTHS_EN = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const DATE_SELECTORS = [
    '.date-divider',
    '.date-separator',
    '.msg-date',
    '.day-divider',
    '.chat-date-label',
    '.timeline-date',
  ].join(', ');

  function formatKoreanDateToEnglish(raw) {
    const text = String(raw || '').trim();
    if (!text) return text;
    // 匹配: 2026년 11월 20일 或 2026년11월20일
    const m = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (!m) return text;
    const year = Number(m[1]);
    const monthIdx = Number(m[2]) - 1;
    const day = Number(m[3]);
    if (monthIdx < 0 || monthIdx > 11) return text;
    const enDate = `${MONTHS_EN[monthIdx]} ${day}, ${year}`;
    return text.replace(m[0], enDate);
  }

  function applyEnglishDates() {
    document.querySelectorAll(DATE_SELECTORS).forEach((el) => {
      if (el.children && el.children.length > 0) {
        // 若有子節點，只轉換純文字節點或直接格式化文字內容
        el.childNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
            const nextVal = formatKoreanDateToEnglish(node.nodeValue);
            if (nextVal !== node.nodeValue) node.nodeValue = nextVal;
          }
        });
      } else {
        const nextText = formatKoreanDateToEnglish(el.textContent);
        if (nextText !== el.textContent) el.textContent = nextText;
      }
    });

    // 保底掃描聊天區內包含「년 ... 월 ... 일」的日期標籤元素
    const chatRoot = document.getElementById('chat') || document.body;
    if (!chatRoot) return;
    const walker = document.createTreeWalker(chatRoot, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const val = node.nodeValue || '';
      if (/\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/.test(val)) {
        const parentTag = node.parentElement?.tagName?.toLowerCase() || '';
        if (parentTag !== 'script' && parentTag !== 'style') {
          node.nodeValue = formatKoreanDateToEnglish(val);
        }
      }
    }
  }

  let timer = null;
  function scheduleApply() {
    if (timer !== null) return;
    timer = requestAnimationFrame(() => {
      timer = null;
      applyEnglishDates();
    });
  }

  applyEnglishDates();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyEnglishDates, { once: true });
  }

  const mo = new MutationObserver(() => scheduleApply());
  mo.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.CosmoApplyEnglishDates = applyEnglishDates;
})();

/* --- THEME-SAFE PASTE BUTTON HANDLER --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_THEME_SAFE_PASTE_INIT__) return;
  window.__COSMO_THEME_SAFE_PASTE_INIT__ = true;

  function findTargetInput(btn) {
    const container =
      btn.closest('form, .login-box, .login-card, .modal, .panel, [class*="login"], [id*="login"]') ||
      document;
    return (
      container.querySelector('textarea[id*="jwt" i], input[id*="jwt" i], textarea[placeholder*="JWT" i], input[placeholder*="JWT" i]') ||
      container.querySelector('textarea, input[type="text"], input[type="password"]') ||
      document.querySelector('textarea, input[type="text"], input[type="password"]')
    );
  }

  function applyPastedText(target, text) {
    if (!target || typeof text !== 'string') return false;
    target.focus();
    target.value = text;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  document.addEventListener(
    'click',
    async (ev) => {
      const btn = ev.target?.closest?.(
        '[id*="paste" i], [class*="paste" i], [data-action*="paste" i], button[aria-label*="paste" i], button[title*="paste" i]'
      );
      if (!btn) return;

      const target = findTargetInput(btn);
      if (!target) return;

      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        try {
          const clipText = await navigator.clipboard.readText();
          if (clipText) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            applyPastedText(target, clipText);
            return;
          }
        } catch (_) {
          // 權限被拒或非安全上下文時，focus 輸入框讓使用者可直接 Ctrl+V / 長按貼上
          target.focus();
        }
      } else {
        target.focus();
      }
    },
    true
  );
})();

/* --- STANDALONE SQUARE PASTE BUTTON HANDLER (THEME-INDEPENDENT) --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_STANDALONE_PASTE_BTN_INIT__) return;
  window.__COSMO_STANDALONE_PASTE_BTN_INIT__ = true;

  const PASTE_BTN_ID = 'jwt-paste-btn';
  const PASTE_ROW_CLASS = 'jwt-paste-outer-row';

  const CLIPBOARD_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="18" height="18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path stroke="none" d="M0 0h24v24H0z" fill="none"/>' +
    '<path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />' +
    '<path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />' +
    '</svg>';

  function getJwtInput() {
    return (
      document.getElementById('jwt-login-input') ||
      document.querySelector('textarea[id*="jwt" i], input[id*="jwt" i]')
    );
  }

  function findAnchorBeforeInput(jwtInput) {
    const card = jwtInput?.closest?.('.login-card') || document.querySelector('.login-card');
    if (!card) return null;

    const langSwitcher = card.querySelector('.login-lang-switcher, #login-lang-select');
    const headerRow = card.querySelector('.login-header-row');
    const group = jwtInput?.closest?.('.login-group') || card.querySelector('.login-group');

    return { card, langSwitcher, headerRow, group, jwtInput };
  }

  async function triggerPasteIntoJwt() {
    const input = getJwtInput();
    if (!input) return;

    input.focus();

    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        const text = await navigator.clipboard.readText();
        if (typeof text === 'string' && text.length > 0) {
          input.value = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      } catch (_) {
        // 若瀏覽器阻擋直接讀取剪貼簿，保留 focus 並嘗試 execCommand('paste')
        try {
          document.execCommand('paste');
        } catch (_) {}
      }
    }
  }

  function createPasteButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = PASTE_BTN_ID;
    btn.setAttribute('aria-label', 'Paste JWT');
    btn.setAttribute('title', 'Paste JWT');
    btn.innerHTML = CLIPBOARD_ICON_SVG;
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      triggerPasteIntoJwt();
    });
    return btn;
  }

  function ensureStandalonePasteButton() {
    const input = getJwtInput();
    if (!input) return;

    const ctx = findAnchorBeforeInput(input);
    if (!ctx || !ctx.group) return;

    let row = ctx.card.querySelector(`.${PASTE_ROW_CLASS}`);
    if (!row) {
      row = document.createElement('div');
      row.className = PASTE_ROW_CLASS;
    }

    let btn = document.getElementById(PASTE_BTN_ID);
    if (!btn) {
      btn = createPasteButton();
    }

    // 確保按鈕只有純 icon、無任何文字節點
    Array.from(btn.childNodes).forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) n.remove();
    });
    if (!btn.querySelector('svg')) {
      btn.innerHTML = CLIPBOARD_ICON_SVG;
    }

    if (btn.parentElement !== row) {
      row.appendChild(btn);
    }

    // 放在下拉選單下方、輸入框（.login-group）外面的右上角
    if (row.nextElementSibling !== ctx.group) {
      ctx.group.parentElement.insertBefore(row, ctx.group);
    }
  }

  ensureStandalonePasteButton();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureStandalonePasteButton, { once: true });
  }

  let rafId = null;
  const mo = new MutationObserver(() => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      ensureStandalonePasteButton();
    });
  });
  mo.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });

  window.CosmoEnsureStandalonePasteButton = ensureStandalonePasteButton;
})();

/* --- POLISHED JWT PASTE ROW & REMOVE OLD INLINE CLIPBOARD ICON --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_POLISHED_PASTE_INIT__) return;
  window.__COSMO_POLISHED_PASTE_INIT__ = true;

  const PASTE_BTN_ID = 'jwt-paste-btn';
  const PASTE_ROW_CLASS = 'jwt-paste-outer-row';

  const CLIPBOARD_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="17" height="17" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path stroke="none" d="M0 0h24v24H0z" fill="none"/>' +
    '<path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />' +
    '<path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />' +
    '</svg>';

  function removeLegacyInlineClipboardIcons(card) {
    if (!card) return;
    const candidates = card.querySelectorAll('button, [role="button"], span, svg');
    candidates.forEach((el) => {
      if (el.id === PASTE_BTN_ID || el.closest(`#${PASTE_BTN_ID}`)) return;
      if (el.id === 'jwt-login-btn' || el.id === 'jwt-guide-btn' || el.id === 'gasLoginBtn') return;
      if (el.closest('.login-header-row')) return;

      const cls = String(el.className || '').toLowerCase();
      const id = String(el.id || '').toLowerCase();
      const title = String(el.getAttribute?.('title') || el.getAttribute?.('aria-label') || '').toLowerCase();
      const isPasteLike =
        cls.includes('paste') ||
        id.includes('paste') ||
        title.includes('paste') ||
        cls.includes('clipboard') ||
        id.includes('clipboard') ||
        title.includes('clipboard');

      if (isPasteLike) {
        el.remove();
      }
    });
  }

  function syncCaptionText(card, captionEl) {
    if (!captionEl) return;
    const sub = card?.querySelector('.login-subtitle');
    const txt = (sub?.textContent || '').replace(/\s+/g, ' ').trim();
    if (txt && captionEl.textContent !== txt) {
      captionEl.textContent = txt;
    }
  }

  function ensurePolishedLayout() {
    const input =
      document.getElementById('jwt-login-input') ||
      document.querySelector('textarea[id*="jwt" i], input[id*="jwt" i]');
    if (!input) return;

    const card = input.closest('.login-card') || document.querySelector('.login-card');
    const group = input.closest('.login-group') || card?.querySelector('.login-group');
    if (!card || !group || !group.parentElement) return;

    removeLegacyInlineClipboardIcons(card);

    let row = card.querySelector(`.${PASTE_ROW_CLASS}`);
    if (!row) {
      row = document.createElement('div');
      row.className = PASTE_ROW_CLASS;
    }

    let captionEl = row.querySelector('.jwt-paste-caption');
    if (!captionEl) {
      captionEl = document.createElement('span');
      captionEl.className = 'jwt-paste-caption';
      row.appendChild(captionEl);
    }
    syncCaptionText(card, captionEl);

    let btn = document.getElementById(PASTE_BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = PASTE_BTN_ID;
      btn.setAttribute('aria-label', 'Paste JWT');
      btn.setAttribute('title', 'Paste JWT');
      btn.innerHTML = CLIPBOARD_ICON_SVG;
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        input.focus();
        if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
          try {
            const text = await navigator.clipboard.readText();
            if (typeof text === 'string' && text.length > 0) {
              input.value = text;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } catch (_) {
            try {
              document.execCommand('paste');
            } catch (_) {}
          }
        }
      });
    }

    Array.from(btn.childNodes).forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) n.remove();
    });
    if (!btn.querySelector('svg')) {
      btn.innerHTML = CLIPBOARD_ICON_SVG;
    }
    if (btn.parentElement !== row) {
      row.appendChild(btn);
    }

    // 緊貼在輸入框群組上方，左文字、右按鈕同一列對齊
    if (row.nextElementSibling !== group) {
      group.parentElement.insertBefore(row, group);
    }
  }

  ensurePolishedLayout();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensurePolishedLayout, { once: true });
  }

  let rafId = null;
  const mo = new MutationObserver(() => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      ensurePolishedLayout();
    });
  });
  mo.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });
})();

/* --- RELIABLE PASTE HANDLER & DEDUPLICATE CAPTION --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_CLEAN_PASTE_INIT__) return;
  window.__COSMO_CLEAN_PASTE_INIT__ = true;

  const PASTE_BTN_ID = 'jwt-paste-btn';
  const PASTE_ROW_CLASS = 'jwt-paste-outer-row';

  const CLIPBOARD_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="17" height="17" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path stroke="none" d="M0 0h24v24H0z" fill="none"/>' +
    '<path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />' +
    '<path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />' +
    '</svg>';

  function setStatusHint(msg) {
    const statusEl = document.getElementById('login-status');
    if (statusEl) {
      statusEl.textContent = msg;
    }
  }

  function applyValueToInput(input, text) {
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function handlePasteClick(input) {
    if (!input) return;
    input.focus();

    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        const text = await navigator.clipboard.readText();
        if (typeof text === 'string' && text.trim().length > 0) {
          applyValueToInput(input, text.trim());
          setStatusHint('');
          return;
        }
      } catch (_) {
        // 非 HTTPS 或瀏覽器阻擋 clipboard.readText 時改走 execCommand 與焦點提示
      }
    }

    try {
      const ok = document.execCommand && document.execCommand('paste');
      if (ok && input.value.trim().length > 0) {
        input.value = input.value.trim();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setStatusHint('');
        return;
      }
    } catch (_) {}

    setStatusHint('請按 Ctrl+V / Cmd+V 貼上 JWT');
  }

  function ensureCleanPasteUi() {
    const input =
      document.getElementById('jwt-login-input') ||
      document.querySelector('textarea[id*="jwt" i], input[id*="jwt" i]');
    if (!input) return;

    const card = input.closest('.login-card') || document.querySelector('.login-card');
    const group = input.closest('.login-group') || card?.querySelector('.login-group');
    if (!card || !group || !group.parentElement) return;

    let row = card.querySelector(`.${PASTE_ROW_CLASS}`);
    if (!row) {
      row = document.createElement('div');
      row.className = PASTE_ROW_CLASS;
    }

    // 移除重複的文字節點/元素，只保留純 icon 按鈕
    row.querySelectorAll('.jwt-paste-caption').forEach((el) => el.remove());

    let btn = document.getElementById(PASTE_BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = PASTE_BTN_ID;
      btn.setAttribute('aria-label', 'Paste JWT');
      btn.setAttribute('title', 'Paste JWT');
      btn.innerHTML = CLIPBOARD_ICON_SVG;
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        handlePasteClick(input);
      });
    }

    Array.from(btn.childNodes).forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) n.remove();
    });
    if (!btn.querySelector('svg')) {
      btn.innerHTML = CLIPBOARD_ICON_SVG;
    }
    if (btn.parentElement !== row) {
      row.appendChild(btn);
    }

    if (row.nextElementSibling !== group) {
      group.parentElement.insertBefore(row, group);
    }
  }

  ensureCleanPasteUi();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureCleanPasteUi, { once: true });
  }

  let rafId = null;
  const mo = new MutationObserver(() => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      ensureCleanPasteUi();
    });
  });
  mo.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });
})();

/* --- WORKING PASTE BUTTON FOR HTTP / HTTPS / ALL THEMES --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_WORKING_PASTE_INIT__) return;
  window.__COSMO_WORKING_PASTE_INIT__ = true;

  const PASTE_BTN_ID = 'jwt-paste-btn';
  let armedPasteInput = null;

  function getJwtInput() {
    return (
      document.getElementById('jwt-login-input') ||
      document.querySelector('textarea[id*="jwt" i], input[id*="jwt" i]')
    );
  }

  function setLoginStatusText(msg) {
    const el = document.getElementById('login-status');
    if (el) el.textContent = msg;
  }

  function writeTextToInput(input, rawText) {
    if (!input || typeof rawText !== 'string') return false;
    const cleaned = rawText.trim();
    if (!cleaned) return false;

    input.focus();
    const proto =
      input.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement?.prototype
        : window.HTMLInputElement?.prototype;
    const desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
    if (desc && typeof desc.set === 'function') {
      desc.set.call(input, cleaned);
    } else {
      input.value = cleaned;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    setLoginStatusText('');
    return true;
  }

  // 全域攔截 paste 事件，確保貼上內容能正確寫入並觸發既有監聽器
  document.addEventListener(
    'paste',
    (ev) => {
      const target =
        document.activeElement &&
        (document.activeElement.id === 'jwt-login-input' ||
          document.activeElement.matches?.('textarea[id*="jwt" i], input[id*="jwt" i]'))
          ? document.activeElement
          : armedPasteInput;

      if (!target) return;
      const clipText = ev.clipboardData?.getData('text');
      if (typeof clipText === 'string' && clipText.length > 0) {
        ev.preventDefault();
        writeTextToInput(target, clipText);
        armedPasteInput = null;
      }
    },
    true
  );

  async function onPasteButtonClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();

    const input = getJwtInput();
    if (!input) return;

    armedPasteInput = input;
    input.focus();

    // 1. 若環境允許（如 localhost / https 且已授權），直接讀取剪貼簿
    if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        const text = await navigator.clipboard.readText();
        if (writeTextToInput(input, text)) {
          armedPasteInput = null;
          return;
        }
      } catch (_) {
        // 轉入下方焦點引導
      }
    }

    // 2. 區網 HTTP 或未授權時，聚焦輸入框並提示 Ctrl+V / Cmd+V（配合上方 paste 監聽自動寫入）
    try {
      input.select?.();
    } catch (_) {}
    setLoginStatusText('已聚焦輸入框，請按 Ctrl+V / Cmd+V（或右鍵貼上）');
  }

  function bindPasteButton() {
    const btn = document.getElementById(PASTE_BTN_ID);
    if (!btn) return;
    if (btn.dataset.cosmoPasteBound === '1') return;
    btn.dataset.cosmoPasteBound = '1';
    btn.addEventListener('click', onPasteButtonClick, true);
  }

  bindPasteButton();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPasteButton, { once: true });
  }

  let rafId = null;
  const mo = new MutationObserver(() => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      bindPasteButton();
    });
  });
  mo.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });
})();

/* --- DIRECT PASTE FOR #jwt-paste-btn (NO MODAL) --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_DIRECT_PASTE_NO_MODAL_INIT__) return;
  window.__COSMO_DIRECT_PASTE_NO_MODAL_INIT__ = true;

  const BTN_ID = 'jwt-paste-btn';

  function getJwtInput() {
    return (
      document.getElementById('jwt-login-input') ||
      document.querySelector('textarea[id*="jwt" i], input[id*="jwt" i]')
    );
  }

  function applyJwtValue(val) {
    const input = getJwtInput();
    if (!input || typeof val !== 'string') return false;
    const text = val.trim();
    if (!text) return false;

    const proto =
      input.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement?.prototype
        : window.HTMLInputElement?.prototype;
    const desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
    if (desc && typeof desc.set === 'function') {
      desc.set.call(input, text);
    } else {
      input.value = text;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    return true;
  }

  async function runDirectPaste() {
    const input = getJwtInput();
    if (input) input.focus();

    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        const text = await navigator.clipboard.readText();
        if (applyJwtValue(text)) return;
      } catch (_) {}
    }

    if (input) {
      try {
        const ok = document.execCommand && document.execCommand('paste');
        if (ok && input.value && input.value.trim().length > 0) {
          applyJwtValue(input.value);
          return;
        }
      } catch (_) {}
      input.focus();
    }
  }

  function bindBtn() {
    const btn = document.getElementById(BTN_ID);
    if (!btn || btn.dataset.directPasteBound === '1') return;
    btn.dataset.directPasteBound = '1';
    btn.addEventListener(
      'click',
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        runDirectPaste();
      },
      true
    );
  }

  document.getElementById('jwt-http-paste-modal')?.remove();
  bindBtn();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindBtn, { once: true });
  }

  let rafId = null;
  const mo = new MutationObserver(() => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      document.getElementById('jwt-http-paste-modal')?.remove();
      bindBtn();
    });
  });
  mo.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });
})();

/* --- PLACE #jwt-paste-btn BESIDE #jwt-login-btn --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_PASTE_BESIDE_LOGIN_INIT__) return;
  window.__COSMO_PASTE_BESIDE_LOGIN_INIT__ = true;

  const BTN_ID = 'jwt-paste-btn';
  const ROW_CLASS = 'jwt-login-action-row';

  function placePasteBesideLoginBtn() {
    const loginBtn = document.getElementById('jwt-login-btn');
    const pasteBtn = document.getElementById(BTN_ID);
    if (!loginBtn || !pasteBtn || !loginBtn.parentElement) return;

    // 移除舊的上方獨立列
    document.querySelectorAll('.jwt-paste-outer-row').forEach((el) => el.remove());

    let row = loginBtn.closest(`.${ROW_CLASS}`);
    if (!row) {
      row = document.createElement('div');
      row.className = ROW_CLASS;
      loginBtn.parentElement.insertBefore(row, loginBtn);
      row.appendChild(loginBtn);
    }

    // 同步按鈕高度與 #jwt-login-btn 一致（維持正方形）
    const h = loginBtn.offsetHeight || 42;
    pasteBtn.style.width = `${h}px`;
    pasteBtn.style.height = `${h}px`;
    pasteBtn.style.minWidth = `${h}px`;
    pasteBtn.style.minHeight = `${h}px`;

    if (pasteBtn.parentElement !== row || pasteBtn.previousElementSibling !== loginBtn) {
      row.appendChild(pasteBtn);
    }
  }

  placePasteBesideLoginBtn();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', placePasteBesideLoginBtn, { once: true });
  }
  window.addEventListener('resize', placePasteBesideLoginBtn, { passive: true });

  let rafId = null;
  const mo = new MutationObserver(() => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      placePasteBesideLoginBtn();
    });
  });
  mo.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });
})();
