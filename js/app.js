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
