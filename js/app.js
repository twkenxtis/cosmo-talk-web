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

/* --- 10S SILENT MESSAGE API POLLING & AUTO BLOB TRANSLATION HOOK --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_10S_SILENT_POLL_INIT__) return;
  window.__COSMO_10S_SILENT_POLL_INIT__ = true;

  const POLL_INTERVAL_MS = 10000;
  let pollTimer = null;
  let pollInFlight = false;
  const memberCursorSnapshot = new Map();

  function getMemberLatestCursor(member) {
    if (!member || typeof member !== 'object') return '';
    const records = Array.isArray(member.records) ? member.records : [];
    const lastRec = records.length > 0 ? records[records.length - 1] : null;
    const rawCursor =
      member.latestCursor ??
      member.cursor ??
      lastRec?.cursor ??
      lastRec?.message?.cursor ??
      lastRec?.sourceId ??
      lastRec?.message?.sourceId ??
      '';
    return `${records.length}:${String(rawCursor)}`;
  }

  function isChatSessionReadyForPolling() {
    if (window.__COSMO_LOGGING_OUT__) return false;
    if (document.hidden) return false;
    if (document.body.classList.contains('is-login-view')) return false;
    const chatShell = document.getElementById('chat-shell');
    if (!chatShell || !chatShell.classList.contains('active')) return false;
    const isDemo =
      window.__FORCE_PROD_SESSION__ !== true &&
      (window.IS_DEMO_MODE === true || window.FORCE_DEMO_MODE === true);
    if (isDemo) return false;
    return typeof CosmoSync !== 'undefined' && typeof CosmoSync.syncAllChannels === 'function';
  }

  async function runSilentPollTick() {
    if (pollInFlight || !isChatSessionReadyForPolling()) return;
    pollInFlight = true;

    try {
      const updatedMembers = await CosmoSync.syncAllChannels({
        silent: true,
        isCancelled: () => Boolean(window.__COSMO_LOGGING_OUT__),
      });

      if (!Array.isArray(updatedMembers) || updatedMembers.length === 0) return;

      let hasAnyNewCursor = false;
      for (const m of updatedMembers) {
        const mid = String(m?.artistMemberId ?? m?.id ?? '').trim();
        if (!mid) continue;
        const sig = getMemberLatestCursor(m);
        if (memberCursorSnapshot.get(mid) !== sig) {
          memberCursorSnapshot.set(mid, sig);
          hasAnyNewCursor = true;
        }
      }

      // 每次打完訊息 API 後，針對有更新（或當前開啟）的成員自動在背景執行靜默翻譯並存入 Blob
      const activeHeaderName =
        document.querySelector('#chat-header .member-name, #chat-header .header-title')?.textContent?.trim() || '';

      for (const m of updatedMembers) {
        const mid = String(m?.artistMemberId ?? m?.id ?? '').trim();
        if (!mid) continue;
        if (window.CosmoSilentTranslate?.updateKnownMemberCursor) {
          window.CosmoSilentTranslate.updateKnownMemberCursor(m);
        }
        const isCurrentViewed =
          activeHeaderName &&
          String(m?.name ?? m?.originalName ?? '').trim() === activeHeaderName;

        if ((hasAnyNewCursor || isCurrentViewed) && window.CosmoSilentTranslate?.runSilentBatchTranslateWithCursorCheck) {
          window.CosmoSilentTranslate.runSilentBatchTranslateWithCursorCheck(m, {
            getLatestMember: (targetMid) =>
              updatedMembers.find((item) => String(item?.artistMemberId ?? item?.id) === String(targetMid)) || null,
          });
        }
      }

      // 若有新訊息進來，無感刷新側邊欄與當前聊天畫面（鎖定捲動位置不跳動）
      if (hasAnyNewCursor && typeof CosmoChatView !== 'undefined') {
        const currentMember =
          updatedMembers.find(
            (m) => String(m?.name ?? m?.originalName ?? '').trim() === activeHeaderName
          ) || updatedMembers[0];

        const updateDom = () => {
          if (typeof CosmoChatView.renderSidebar === 'function' && currentMember) {
            CosmoChatView.renderSidebar(updatedMembers, currentMember.artistMemberId);
          }
          if (typeof CosmoChatView.renderChat === 'function' && currentMember) {
            CosmoChatView.renderChat(currentMember);
          }
          if (typeof CosmoTranslate !== 'undefined' && currentMember) {
            if (typeof CosmoTranslate.setMemberContext === 'function') {
              CosmoTranslate.setMemberContext(currentMember);
            }
            if (typeof window.CosmoAutoFlushTranslations === 'function') {
              window.CosmoAutoFlushTranslations();
            }
          }
        };

        if (window.CosmoViewportLock?.renderWithLockedViewport) {
          window.CosmoViewportLock.renderWithLockedViewport(updateDom, {
            hasNewMessages: true,
            newCount: 1,
          });
        } else {
          updateDom();
        }
      }
    } catch (err) {
      console.debug('[10s Silent Poll] skipped:', err);
    } finally {
      pollInFlight = false;
    }
  }

  function startPollingLoop() {
    if (pollTimer !== null) return;
    pollTimer = setInterval(runSilentPollTick, POLL_INTERVAL_MS);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      runSilentPollTick();
    }
  });

  window.addEventListener('pagehide', () => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });

  startPollingLoop();
})();

/* --- TRIGGER SILENT BLOB TRANSLATION ON EVERY 10S FETCH --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_10S_FETCH_BLOB_HOOK_INIT__) return;
  window.__COSMO_10S_FETCH_BLOB_HOOK_INIT__ = true;

  if (typeof CosmoSync !== 'undefined' && typeof CosmoSync.syncAllChannels === 'function') {
    const origSync = CosmoSync.syncAllChannels.bind(CosmoSync);
    if (!origSync.__cosmoBlobHooked) {
      const wrapped = async function (...args) {
        const res = await origSync(...args);
        if (Array.isArray(res) && res.length > 0 && window.CosmoSilentPollBlob?.translateMembers) {
          window.CosmoSilentPollBlob.translateMembers(res);
        }
        return res;
      };
      wrapped.__cosmoBlobHooked = true;
      CosmoSync.syncAllChannels = wrapped;
    }
  }
})();

/* --- CORE ARCHITECTURE: ANCHOR COMPENSATED TRANSLATE & ID-BASED NEW MSG --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_CORE_CHAT_ARCH_INIT__) return;
  window.__COSMO_CORE_CHAT_ARCH_INIT__ = true;

  const BTN_ID = 'cosmo-scroll-down-btn';
  const BOTTOM_THRESHOLD_PX = 48;

  // 各成員已確認的最新訊息 ID（cursor），只由真實訊息 ID 推進
  const confirmedCursorByMember = new Map();
  const memberInitialized = new Set();

  let unseenCount = 0;
  let userScrollingUntil = 0;
  let translatingDepth = 0;

  // 記錄使用者主動捲動，避免在「使用者正在滑動」時做任何位置補償
  for (const evName of ['wheel', 'touchstart', 'touchmove', 'pointerdown']) {
    window.addEventListener(evName, () => {
      userScrollingUntil = Date.now() + 180;
    }, { passive: true, capture: true });
  }

  function getScrollContainer() {
    const chat = document.getElementById('chat');
    if (chat && chat.scrollHeight > chat.clientHeight + 2) {
      return chat;
    }
    return document.scrollingElement || document.documentElement;
  }

  function isNearBottom(sc) {
    if (!sc) return true;
    return sc.scrollHeight - sc.scrollTop - sc.clientHeight <= BOTTOM_THRESHOLD_PX;
  }

  function formatNewMsgLabel(count) {
    const n = Math.max(1, Number(count) || 1);
    const text =
      typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function'
        ? CosmoI18n.t('new_messages_btn', { count: n })
        : `新訊息 (${n})`;
    const trimmed = String(text || '').trim();
    if (/^[↓⬇▼]/.test(trimmed)) return trimmed;
    return `↓ ${trimmed}`;
  }

  function alignButtonAboveInput(btn) {
    if (!btn) return;
    const inputs = [...document.querySelectorAll('textarea, input[type="text"]')].filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 50 && r.height > 18;
    });
    if (inputs.length === 0) return;
    inputs.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
    const rect = inputs[0].getBoundingClientRect();
    const h = btn.offsetHeight || 36;
    btn.style.left = `${Math.max(12, Math.round(rect.left))}px`;
    btn.style.top = `${Math.max(48, Math.round(rect.top - h - 10))}px`;
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  }

  function hideNewMsgButton() {
    unseenCount = 0;
    const btn = document.getElementById(BTN_ID);
    if (btn) {
      btn.classList.remove('visible');
      btn.style.display = 'none';
    }
  }

  // 僅在確認有「真實新增訊息」且不在底部時顯示按鈕
  function showConfirmedNewMessages(count) {
    if (translatingDepth > 0) return;
    const add = Number(count) || 0;
    if (add <= 0) return;
    if (document.body.classList.contains('is-login-view')) return;

    const sc = getScrollContainer();
    if (isNearBottom(sc)) {
      hideNewMsgButton();
      return;
    }

    unseenCount += add;
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = BTN_ID;
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const targetSc = getScrollContainer();
        if (targetSc) {
          targetSc.scrollTop = targetSc.scrollHeight;
        }
        hideNewMsgButton();
      });
      document.body.appendChild(btn);
    }

    btn.textContent = formatNewMsgLabel(unseenCount);
    btn.classList.add('visible');
    btn.style.display = 'inline-flex';
    alignButtonAboveInput(btn);
  }

  // 抓取目前可視區頂部訊息元素作為錨點，讓譯文撐高時畫面維持在同一則訊息
  function captureVisibleAnchor(sc) {
    if (!sc) return null;
    const scRect = sc.getBoundingClientRect();
    const chat = document.getElementById('chat');
    if (!chat) return { sc, scrollTop: sc.scrollTop, el: null, relTop: 0 };

    const items = chat.querySelectorAll('.msg-wrapper, [data-source-id], [data-message-id]');
    for (const el of items) {
      const r = el.getBoundingClientRect();
      if (r.bottom > scRect.top + 6 && r.top < scRect.bottom) {
        return {
          sc,
          scrollTop: sc.scrollTop,
          el,
          relTop: r.top - scRect.top,
        };
      }
    }
    return { sc, scrollTop: sc.scrollTop, el: null, relTop: 0 };
  }

  function compensateAnchorAfterLayout(anchor) {
    if (!anchor || !anchor.sc) return;
    if (Date.now() < userScrollingUntil) return;
    const { sc, scrollTop, el, relTop } = anchor;

    // 若原本就在最底部，維持貼底
    if (scrollTop + sc.clientHeight >= sc.scrollHeight - BOTTOM_THRESHOLD_PX - 24) {
      return;
    }

    if (el && el.isConnected) {
      const scRect = sc.getBoundingClientRect();
      const currentRelTop = el.getBoundingClientRect().top - scRect.top;
      const diff = currentRelTop - relTop;
      if (Math.abs(diff) > 0.5) {
        sc.scrollTop = sc.scrollTop + diff;
      }
    } else if (Math.abs(sc.scrollTop - scrollTop) > 0.5) {
      sc.scrollTop = scrollTop;
    }
  }

  // 包裝翻譯函式：只在翻譯排版前後做一次錨點位移補償，不攔截原型也不觸發新訊息
  function wrapTranslationExecution(obj, methodName) {
    if (!obj || typeof obj[methodName] !== 'function') return;
    const orig = obj[methodName];
    if (orig.__cosmoCoreTransWrapped) return;

    const wrapped = function (...args) {
      const sc = getScrollContainer();
      const anchor = captureVisibleAnchor(sc);
      translatingDepth += 1;

      const finish = () => {
        requestAnimationFrame(() => {
          compensateAnchorAfterLayout(anchor);
          translatingDepth = Math.max(0, translatingDepth - 1);
        });
      };

      try {
        const res = orig.apply(this, args);
        if (res && typeof res.then === 'function') {
          return res.finally(finish);
        }
        finish();
        return res;
      } catch (err) {
        finish();
        throw err;
      }
    };
    wrapped.__cosmoCoreTransWrapped = true;
    obj[methodName] = wrapped;
  }

  if (typeof CosmoTranslate !== 'undefined') {
    for (const key of Object.getOwnPropertyNames(CosmoTranslate)) {
      if (typeof CosmoTranslate[key] === 'function') {
        wrapTranslationExecution(CosmoTranslate, key);
      }
    }
  }

  // 訊息 ID 比較（支援數字或 "prefix:id" 格式）
  function parseMsgId(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return { raw: '', num: null };
    const tail = s.includes(':') ? s.split(':').pop().trim() : s;
    const num = /^\d+$/.test(tail) ? Number(tail) : null;
    return { raw: tail, num };
  }

  function isMsgIdNewer(nextId, prevId) {
    const a = parseMsgId(nextId);
    const b = parseMsgId(prevId);
    if (!a.raw) return false;
    if (!b.raw) return true;
    if (a.raw === b.raw) return false;
    if (a.num !== null && b.num !== null) return a.num > b.num;
    return a.raw > b.raw;
  }

  // 供外部以真實訊息 ID 清單比對新增數量（首次建立基準線回傳 0）
  function diffMemberMessageIds(memberId, messageIds) {
    const mid = String(memberId ?? '').trim();
    if (!mid) return 0;

    let maxId = confirmedCursorByMember.get(mid) || '';
    const list = Array.isArray(messageIds) ? messageIds : [];
    for (const id of list) {
      if (isMsgIdNewer(id, maxId)) {
        maxId = String(id).trim();
      }
    }

    if (!memberInitialized.has(mid)) {
      memberInitialized.add(mid);
      if (maxId) confirmedCursorByMember.set(mid, maxId);
      return 0;
    }

    const prevCursor = confirmedCursorByMember.get(mid) || '';
    let added = 0;
    for (const id of list) {
      if (isMsgIdNewer(id, prevCursor)) {
        added += 1;
      }
    }
    if (isMsgIdNewer(maxId, prevCursor)) {
      confirmedCursorByMember.set(mid, maxId);
    }
    return added;
  }

  // 對外暴露乾淨介面
  window.CosmoViewportLock = Object.assign(window.CosmoViewportLock || {}, {
    showScrollDownButton: (count = 1) => showConfirmedNewMessages(count),
    hideScrollDownButton: hideNewMsgButton,
  });
  window.showScrollDownButton = (count = 1) => showConfirmedNewMessages(count);
  window.CosmoNotifyConfirmedNewMessages = (count = 1) => showConfirmedNewMessages(count);
  window.CosmoDiffMemberMessageIds = diffMemberMessageIds;

  window.addEventListener('scroll', () => {
    const sc = getScrollContainer();
    if (isNearBottom(sc)) {
      hideNewMsgButton();
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    const btn = document.getElementById(BTN_ID);
    if (btn && btn.classList.contains('visible')) {
      alignButtonAboveInput(btn);
    }
  }, { passive: true });
})();
