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

/* --- USE REAL MESSAGE-ID DIFF ONLY (IGNORE TRANSLATION TEXT & CURSOR NOISE) --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_APP_REAL_NEW_MSG_DIFF_INIT__) return;
  window.__COSMO_APP_REAL_NEW_MSG_DIFF_INIT__ = true;

  if (typeof CosmoSync !== 'undefined' && typeof CosmoSync.syncAllChannels === 'function') {
    const origSync = CosmoSync.syncAllChannels.bind(CosmoSync);
    if (!origSync.__cosmoRealDiffWrapped) {
      const wrappedSync = async function (...args) {
        const members = await origSync(...args);
        if (Array.isArray(members) && members.length > 0 && window.CosmoRealNewMsg?.diffRealNewMessages) {
          let totalNew = 0;
          for (const m of members) {
            const mid = String(m?.artistMemberId ?? m?.id ?? '').trim();
            if (!mid) continue;
            totalNew += window.CosmoRealNewMsg.diffRealNewMessages(mid, m);
          }
          if (totalNew > 0 && typeof window.CosmoRealNewMsg.notifyIfRealNewMessages === 'function') {
            window.CosmoRealNewMsg.notifyIfRealNewMessages(totalNew);
          }
        }
        return members;
      };
      wrappedSync.__cosmoRealDiffWrapped = true;
      CosmoSync.syncAllChannels = wrappedSync;
    }
  }
})();

/* --- CURSOR SYNC WITHOUT /latest.ndjson OR /lasest.ndjson URL REQUESTS --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_NO_NDJSON_URL_FETCH_INIT__) return;
  window.__COSMO_NO_NDJSON_URL_FETCH_INIT__ = true;

  const V4_CHANNELS_URL = 'https://api.cosmo.fans/bff/v4/channels/messages?artistId=tripleS';
  const POLL_INTERVAL_MS = 10000;

  const memberCursorMap = new Map();
  const memberBaselineReady = new Set();
  let isPolling = false;
  let isSyncing = false;

  function toComparableId(val) {
    const s = String(val ?? '').trim();
    if (!s) return { raw: '', num: null };
    const tail = s.includes(':') ? s.split(':').pop().trim() : s;
    const n = Number(tail);
    return {
      raw: tail,
      num: Number.isFinite(n) && /^\d+$/.test(tail) ? n : null,
    };
  }

  function isAhead(candidate, current) {
    const a = toComparableId(candidate);
    const b = toComparableId(current);
    if (!a.raw) return false;
    if (!b.raw) return true;
    if (a.raw === b.raw) return false;
    if (a.num !== null && b.num !== null) return a.num > b.num;
    return a.raw > b.raw;
  }

  function getActiveMemberId() {
    const cur = window.currentMember || window.CosmoApp?.currentMember || null;
    const activeId =
      cur?.artistMemberId ??
      cur?.id ??
      document.querySelector('#chat')?.getAttribute('data-artist-member-id') ??
      '';
    return String(activeId ?? '').trim();
  }

  // 從現有 DOM / 記憶體狀態建立各成員 cursor 基準，不發送任何 ndjson 檔案請求
  function seedCursorsFromExistingState() {
    document.querySelectorAll('#chat .msg-wrapper, #chat [data-source-id], #chat [data-message-id]').forEach((el) => {
      const mid = String(
        el.getAttribute('data-artist-member-id') ||
        el.dataset?.artistMemberId ||
        getActiveMemberId() ||
        ''
      ).trim();
      const rawId = String(
        el.getAttribute('data-source-id') ||
        el.getAttribute('data-message-id') ||
        el.dataset?.sourceId ||
        el.dataset?.messageId ||
        ''
      ).trim();
      if (!mid || !rawId) return;
      const prev = memberCursorMap.get(mid);
      if (!prev || isAhead(rawId, prev)) {
        memberCursorMap.set(mid, rawId);
      }
      memberBaselineReady.add(mid);
    });
  }

  async function syncLaggingMembers(laggingMemberIds = []) {
    if (isSyncing) return;
    isSyncing = true;
    try {
      if (typeof CosmoSync?.syncAllChannels === 'function') {
        await CosmoSync.syncAllChannels(laggingMemberIds);
      }
    } catch (_) {
    } finally {
      isSyncing = false;
    }
  }

  async function pollV4ChannelsOnce() {
    if (isPolling || document.hidden) return;
    isPolling = true;
    try {
      const resp =
        typeof CosmoAuth !== 'undefined' && typeof CosmoAuth.authorizedFetch === 'function'
          ? await CosmoAuth.authorizedFetch(V4_CHANNELS_URL, {
              method: 'GET',
              headers: { Accept: 'application/json' },
              cache: 'no-store',
            })
          : await fetch(V4_CHANNELS_URL, {
              method: 'GET',
              headers: { Accept: 'application/json' },
              cache: 'no-store',
              referrerPolicy: 'no-referrer',
            });

      if (!resp || !resp.ok) return;
      const payload = await resp.json();
      const channels = Array.isArray(payload?.channels) ? payload.channels : [];
      if (channels.length === 0) return;

      const activeMid = getActiveMemberId();
      const laggingMembers = [];
      let activeMemberNewCount = 0;

      for (const ch of channels) {
        const mid = String(ch?.artistMemberId ?? '').trim();
        const lastMsgId = String(ch?.lastMessage?.id ?? '').trim();
        if (!mid || !lastMsgId) continue;

        const currentCursor = memberCursorMap.get(mid) || '';
        if (!memberBaselineReady.has(mid)) {
          memberBaselineReady.add(mid);
          if (!currentCursor || isAhead(lastMsgId, currentCursor)) {
            memberCursorMap.set(mid, lastMsgId);
          }
          continue;
        }

        if (isAhead(lastMsgId, currentCursor)) {
          memberCursorMap.set(mid, lastMsgId);
          laggingMembers.push(mid);
          if (activeMid && mid === activeMid) {
            activeMemberNewCount += 1;
          }
        }
      }

      if (laggingMembers.length > 0) {
        await syncLaggingMembers(laggingMembers);
        if (activeMemberNewCount > 0 && window.CosmoViewportLock?.showScrollDownButton) {
          window.CosmoViewportLock.showScrollDownButton(activeMemberNewCount);
        }
      }
    } catch (_) {
    } finally {
      isPolling = false;
    }
  }

  seedCursorsFromExistingState();
  pollV4ChannelsOnce();

  if (!window.__COSMO_V4_POLL_TIMER__) {
    window.__COSMO_V4_POLL_TIMER__ = setInterval(pollV4ChannelsOnce, POLL_INTERVAL_MS);
  }

  window.CosmoV4ChannelPoll = {
    pollNow: pollV4ChannelsOnce,
    getCursors: () => Object.fromEntries(memberCursorMap.entries()),
  };
})();

/* --- FIX JUMP TO TOP & BLOCK PHANTOM NEW MESSAGE --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_FIX_TOP_AND_PHANTOM_MSG_INIT__) return;
  window.__COSMO_FIX_TOP_AND_PHANTOM_MSG_INIT__ = true;

  const BTN_ID = 'cosmo-scroll-down-btn';
  const BOTTOM_THRESHOLD_PX = 48;

  const rawDesc =
    typeof Element !== 'undefined' && Element.prototype
      ? Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
      : null;
  const rawSetTop = rawDesc && typeof rawDesc.set === 'function' ? rawDesc.set : null;

  const lastScrollTopByEl = new WeakMap();
  let lastUserActionAt = 0;
  let allowConfirmedBadge = false;
  let badgeTotal = 0;

  const markUserAction = () => {
    lastUserActionAt = Date.now();
  };
  for (const evName of ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'mousedown', 'keydown']) {
    window.addEventListener(evName, markUserAction, { passive: true, capture: true });
  }

  function isUserActive() {
    return Date.now() - lastUserActionAt < 220;
  }

  function forceTop(el, topVal) {
    if (!el || typeof topVal !== 'number' || Number.isNaN(topVal) || topVal <= 2) return;
    if (el === window) {
      window.scrollTo(0, topVal);
      return;
    }
    const clamped =
      typeof el.scrollHeight === 'number' && typeof el.clientHeight === 'number'
        ? Math.max(0, Math.min(topVal, Math.max(0, el.scrollHeight - el.clientHeight)))
        : topVal;
    const prev = el.style?.scrollBehavior;
    if (el.style) el.style.scrollBehavior = 'auto';
    if (rawSetTop) {
      rawSetTop.call(el, clamped);
    } else {
      el.scrollTop = clamped;
    }
    if (el.style) el.style.scrollBehavior = prev || '';
  }

  // 記錄捲動位置；若非主動操作突然掉到最頂層（<= 2），直接還原到前一個記錄的位置
  document.addEventListener('scroll', (ev) => {
    const target =
      ev.target === document
        ? (document.scrollingElement || document.documentElement)
        : ev.target;
    if (!target || typeof target.scrollTop !== 'number') return;

    const cur = target.scrollTop;
    if (cur > 4) {
      lastScrollTopByEl.set(target, cur);
      return;
    }

    const prevTop = lastScrollTopByEl.get(target) || 0;
    if (!isUserActive() && prevTop > 20 && target.scrollHeight > target.clientHeight + 20) {
      forceTop(target, prevTop);
      requestAnimationFrame(() => {
        if (target.scrollTop <= 2 && !isUserActive()) {
          forceTop(target, prevTop);
        }
      });
    }
  }, { passive: true, capture: true });

  function getScroller() {
    const chat = document.getElementById('chat');
    if (chat && chat.scrollHeight > chat.clientHeight + 2) return chat;
    return document.scrollingElement || document.documentElement;
  }

  function isAtBottom() {
    const sc = getScroller();
    if (!sc) return true;
    return sc.scrollHeight - sc.scrollTop - sc.clientHeight <= BOTTOM_THRESHOLD_PX;
  }

  function hideBtn() {
    badgeTotal = 0;
    const btn = document.getElementById(BTN_ID);
    if (btn) {
      btn.classList.remove('visible');
      btn.style.display = 'none';
    }
  }

  function formatLabel(count) {
    const n = Math.max(1, Number(count) || 1);
    const raw =
      typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function'
        ? CosmoI18n.t('new_messages_btn', { count: n })
        : `新訊息 (${n})`;
    const t = String(raw || '').trim();
    if (t.startsWith('↓') || t.startsWith('⬇') || t.startsWith('▼')) return t;
    return `↓ ${t}`;
  }

  function renderConfirmedBadge(count) {
    if (!allowConfirmedBadge) return;
    allowConfirmedBadge = false;

    const n = Number(count) || 0;
    if (n <= 0) return;
    if (document.body.classList.contains('is-login-view')) return;
    if (isAtBottom()) {
      hideBtn();
      return;
    }

    badgeTotal += n;
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    btn.textContent = formatLabel(badgeTotal);
    btn.classList.add('visible');
    btn.style.display = 'inline-flex';
  }

  const lockedShowFn = function (count = 1) {
    renderConfirmedBadge(count);
  };

  window.showScrollDownButton = lockedShowFn;
  window.CosmoViewportLock = Object.assign(window.CosmoViewportLock || {}, {
    showScrollDownButton: lockedShowFn,
    hideScrollDownButton: hideBtn,
  });

  window.CosmoNotifyConfirmedNewMessages = function (count = 1) {
    const n = Number(count) || 0;
    if (n <= 0) return;
    allowConfirmedBadge = true;
    renderConfirmedBadge(n);
  };

  window.addEventListener('scroll', () => {
    if (isAtBottom()) hideBtn();
  }, { passive: true });
})();
