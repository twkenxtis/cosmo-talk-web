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

    try {
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
    state.activeSyncGeneration++;
    state.lastProgressPercent = 0;

    CosmoComposer.reset();

    await CosmoStorage.clearTokens().catch(() => {});
    await CosmoStorage.clearNdjsonCache().catch(() => {});

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