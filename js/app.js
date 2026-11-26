(() => {
  "use strict";

  const { nfc } = CosmoUtils;

  const tr = (key, vars) =>
    typeof CosmoI18n !== "undefined" && typeof CosmoI18n.t === "function"
      ? CosmoI18n.t(key, vars)
      : nfc(String(key));

  const dom = {
    loadingOverlay: document.getElementById("loading-overlay"),
    loadingProgressText: document.getElementById("loading-progress-text"),

    loginPage: document.getElementById("login-page"),
    jwtLoginInput: document.getElementById("jwt-login-input"),
    jwtLoginBtn: document.getElementById("jwt-login-btn"),
    jwtGuideBtn: document.getElementById("jwt-guide-btn"),
    loginStatus: document.getElementById("login-status"),
    loginLangBtn: document.getElementById("login-lang-btn"),
    loginLangSelect: document.getElementById("login-lang-select"),

    chatShell: document.getElementById("chat-shell"),
    sidebarBackdrop: document.getElementById("sidebar-backdrop"),
    sidebarToggleInner: document.getElementById("sidebar-toggle-inner"),
  };

  const state = {
    membersData: [],
    activeMemberId: null,
    activeSyncGeneration: 0,
    lastProgressPercent: 0,
  };

  const defaultLoginPlaceholder = dom.jwtLoginInput
    ? (dom.jwtLoginInput.getAttribute("placeholder") || "")
    : "";

  function ensureProgressElement() {
    if (dom.loadingProgressText) return dom.loadingProgressText;
    if (!dom.loadingOverlay) return null;

    const el = document.createElement("div");
    el.id = "loading-progress-text";
    el.className = "loading-progress-text";
    el.textContent = "0%";
    dom.loadingOverlay.appendChild(el);
    dom.loadingProgressText = el;
    return el;
  }

  function setLoadingOverlay(visible) {
    if (!dom.loadingOverlay) return;
    if (visible) {
      document.body.classList.add("is-login-view");
      if (dom.loginPage) dom.loginPage.style.display = "none";
      dom.loadingOverlay.classList.add("active");
      updateComposerVisibility();
    } else {
      dom.loadingOverlay.classList.remove("active");
    }
  }

  function setLoadingProgress(percent, label = "", { allowBackward = false } = {}) {
    const el = ensureProgressElement();
    if (!el) return;

    const raw = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const next = allowBackward ? raw : Math.max(state.lastProgressPercent, raw);
    state.lastProgressPercent = next;

    el.textContent = nfc(label ? `${next}% · ${label}` : `${next}%`);
  }

  function resizeJwtLoginTextarea(el = dom.jwtLoginInput) {
    if (!el || el.tagName !== "TEXTAREA") return;
    el.style.height = "auto";
    const nextHeight = Math.min(Math.max(el.scrollHeight, 44), 160);
    el.style.height = `${nextHeight}px`;
  }

  function syncCleanAppUrl() {
    try {
      const targetUrl =
        window.location.hostname === "twkenxtis.github.io"
          ? "https://twkenxtis.github.io/cosmo-talk-web/"
          : `${window.location.origin}${window.location.pathname}`;
      if (window.location.href !== targetUrl) {
        window.history.replaceState(null, "", targetUrl);
      }
    } catch (_) {}
  }

  function prepareRealLoginSession() {
    if (typeof window !== "undefined") {
      if (typeof window.enableProdSessionMode === "function") {
        window.enableProdSessionMode();
      } else {
        window.FORCE_DEMO_MODE = false;
        window.__FORCE_PROD_SESSION__ = true;
        window.IS_DEMO_MODE = false;
        window.__DEMO_NO_POST__ = false;
      }
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("demo")) {
          url.searchParams.delete("demo");
          window.history.replaceState(null, "", url.toString());
        }
      } catch (_) {}
    }
  }

  function forceProdModeNow() {
    if (typeof window === "undefined") return;
    window.FORCE_DEMO_MODE = false;
    window.__FORCE_PROD_SESSION__ = true;
    window.IS_DEMO_MODE = false;
    window.__DEMO_NO_POST__ = false;
    if (typeof window.enableProdSessionMode === "function") {
      try { window.enableProdSessionMode(); } catch (_) {}
    }
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("demo")) {
        url.searchParams.delete("demo");
        window.history.replaceState(null, "", url.toString());
      }
    } catch (_) {}
  }

  function setLoginStatus(msg) {
    if (dom.loginStatus) {
      dom.loginStatus.textContent = nfc(msg || "");
    }
  }

  function setAuthControlsVisible(visible) {
    const display = visible ? "" : "none";
    if (dom.jwtLoginInput) {
      dom.jwtLoginInput.style.display = display;
      if (!visible) {
        dom.jwtLoginInput.value = "";
        resizeJwtLoginTextarea(dom.jwtLoginInput);
      }
    }
    if (dom.jwtLoginBtn) {
      dom.jwtLoginBtn.style.display = display;
    }
    if (dom.jwtGuideBtn) {
      dom.jwtGuideBtn.style.display = visible ? "inline-flex" : "none";
    }
  }

  function syncLoginLangControls() {
    if (typeof CosmoI18n === "undefined") return;
    const curLang = CosmoI18n.getLang();
    if (dom.loginLangSelect) {
      dom.loginLangSelect.value = curLang;
    }
  }

  function updateComposerVisibility() {
    const isChatActive = Boolean(dom.chatShell && dom.chatShell.classList.contains("active"));
    const hasMembers = Array.isArray(state.membersData) && state.membersData.length > 0;
    const isLoginVisible = Boolean(
      dom.loginPage && getComputedStyle(dom.loginPage).display !== "none",
    );
    const isLoadingVisible = Boolean(
      dom.loadingOverlay && dom.loadingOverlay.classList.contains("active"),
    );

    const shouldShow = isChatActive && hasMembers && !isLoginVisible && !isLoadingVisible;
    CosmoComposer.setVisible(shouldShow);
  }

  function showLoginPage(statusMsg = "") {
    setLoadingOverlay(false);
    setAuthControlsVisible(true);
    document.body.classList.add("is-login-view");

    if (dom.loginPage) {
      dom.loginPage.style.display = "flex";
    }
    if (dom.chatShell) {
      dom.chatShell.classList.remove("active");
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
    document.body.classList.remove("is-login-view");

    if (dom.loginPage) {
      dom.loginPage.style.display = "none";
    }
    if (dom.chatShell) {
      dom.chatShell.classList.add("active");
    }

    updateComposerVisibility();
  }

  function getActiveMember() {
    return (
      state.membersData.find(
        (m) => String(m.artistMemberId) === String(state.activeMemberId),
      ) || null
    );
  }

  function applyMembersAndRender(nextMembers) {
    state.membersData = Array.isArray(nextMembers) ? nextMembers : [];
    if (state.membersData.length === 0) {
      state.activeMemberId = null;
      window.currentMember = null;
      CosmoChatView.renderSidebar(state.membersData, null);
      CosmoChatView.renderChat(null);
      return false;
    }

    if (
      !state.activeMemberId ||
      !state.membersData.some((m) => String(m.artistMemberId) === String(state.activeMemberId))
    ) {
      state.activeMemberId = state.membersData[0].artistMemberId;
    }

    const currentMember = getActiveMember();
    window.currentMember = currentMember;
    CosmoChatView.renderSidebar(state.membersData, state.activeMemberId);
    CosmoChatView.renderChat(currentMember);
    CosmoComposer.ensureRemainingCountIfNeeded(state.activeMemberId);
    showChatPage();
    return true;
  }

  async function refreshMemberFromNdjson(memberId) {
    const targetId = String(memberId ?? "").trim();
    if (!targetId) return;

    const syncGen = state.activeSyncGeneration;
    const updatedMember = await CosmoSync.syncMemberNow(targetId, {
      isCancelled: () => syncGen !== state.activeSyncGeneration,
    });
    if (!updatedMember || syncGen !== state.activeSyncGeneration) return;

    const idx = state.membersData.findIndex(
      (m) => String(m.artistMemberId) === targetId,
    );
    if (idx >= 0) {
      state.membersData[idx] = updatedMember;
    } else {
      state.membersData.push(updatedMember);
    }

    if (String(state.activeMemberId) === targetId) {
      window.currentMember = updatedMember;
      CosmoChatView.renderSidebar(state.membersData, state.activeMemberId);
      CosmoChatView.renderChat(updatedMember);
    }
  }

  function switchToProdSession() {
    if (typeof window === "undefined") return;
    window.FORCE_DEMO_MODE = false;
    window.__FORCE_PROD_SESSION__ = true;
    window.IS_DEMO_MODE = false;
    window.__DEMO_NO_POST__ = false;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("demo")) {
        url.searchParams.delete("demo");
        window.history.replaceState(null, "", url.toString());
      }
    } catch (_) {}
  }

  async function enterChatSession({ showOverlay = true } = {}) {
    const syncGen = ++state.activeSyncGeneration;
    if (showOverlay) {
      setLoadingOverlay(true);
      setLoadingProgress(0, tr("sync_prepare"), { allowBackward: true });
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
        await logoutToLoginPage(tr("no_channels_logout"));
        return;
      }

      setLoadingProgress(96, tr("sync_rendering"));
      applyMembersAndRender(results);
      setLoadingProgress(100, tr("sync_done"));
      if (typeof CosmoChatView?.scrollToBottomInitialOnce === "function") {
        CosmoChatView.scrollToBottomInitialOnce();
      }
    } catch (err) {
      if (syncGen === state.activeSyncGeneration) {
        setLoadingOverlay(false);
      }
      throw err;
    }
  }

  async function handleLoginSubmit() {
    const rawVal = dom.jwtLoginInput ? dom.jwtLoginInput.value : "";
    const parsed = CosmoAuth.parseLoginInput(rawVal);
    if (!parsed.accessToken && !parsed.refreshToken) {
      showLoginPage(tr("login_prompt"));
      return;
    }

    if ((typeof window !== "undefined" && window.IS_DEMO_MODE)) {
      if (dom.jwtLoginInput) {
        dom.jwtLoginInput.value = "";
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
        dom.jwtLoginInput.value = "";
        resizeJwtLoginTextarea(dom.jwtLoginInput);
      }
      await enterChatSession();
    } catch (err) {
      showLoginPage(err?.message || tr("expired_jwt"));
    }
  }

  async function logoutToLoginPage(statusMsg = tr("logged_out_cleared")) {
    if (window.__COSMO_LOGGING_OUT__) return;
    window.__COSMO_LOGGING_OUT__ = true;
    const wasDemo = Boolean(
      window.IS_DEMO_MODE ||
      window.FORCE_DEMO_MODE ||
      new URLSearchParams(window.location.search).get("demo"),
    );
    forceProdModeNow();
    await CosmoStorage.clearNdjsonCache().catch(() => {});
    syncCleanAppUrl();
    state.activeSyncGeneration++;
    state.lastProgressPercent = 0;

    CosmoComposer.reset();

    if (!(typeof window !== "undefined" && window.IS_DEMO_MODE)) {
      await CosmoStorage.clearTokens().catch(() => {});
      await CosmoStorage.clearNdjsonCache().catch(() => {});
    }

    state.membersData = [];
    state.activeMemberId = null;
    window.currentMember = null;
    CosmoChatView.renderSidebar(state.membersData, null);
    CosmoChatView.renderChat(null);
    showLoginPage(statusMsg);
    if (typeof window.__cosmoCleanLogoutRedirect === "function") {
      window.__cosmoCleanLogoutRedirect(wasDemo);
    } else {
      window.__COSMO_LOGGING_OUT__ = false;
    }
  }

  function bindEvents() {
    if (typeof CosmoI18n !== "undefined" && typeof CosmoI18n.onChange === "function") {
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
        if (typeof CosmoI18n !== "undefined" && typeof CosmoI18n.setLang === "function") {
          CosmoI18n.setLang(dom.loginLangSelect.value);
        }
      };
    }

    if (dom.loginLangBtn) {
      dom.loginLangBtn.onclick = () => {
        if (!dom.loginLangSelect) return;
        if (typeof dom.loginLangSelect.showPicker === "function") {
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
      dom.jwtLoginInput.addEventListener("input", () => resizeJwtLoginTextarea(dom.jwtLoginInput));
      dom.jwtLoginInput.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          handleLoginSubmit();
        }
      });
    }

    if (dom.jwtLoginBtn) {
      dom.jwtLoginBtn.onclick = handleLoginSubmit;
    }

    window.addEventListener("resize", () => {
      CosmoComposer.onWindowResize();
      if (dom.loginPage && getComputedStyle(dom.loginPage).display !== "none") {
        resizeJwtLoginTextarea(dom.jwtLoginInput);
      }
    });
  }

  async function bootstrap() {
    if (typeof CosmoI18n !== "undefined") {
      if (typeof CosmoI18n.applyDomI18n === "function") {
        CosmoI18n.applyDomI18n(document);
      }
      syncLoginLangControls();
    }

    CosmoChatView.init({
      onSelectMember: (member) => {
        state.activeMemberId = member.artistMemberId;
        window.currentMember = member;
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

    window.CosmoApp = {
      get activeMemberId() {
        return state.activeMemberId;
      },
      get currentMember() {
        return getActiveMember();
      },
      get membersData() {
        return state.membersData;
      },
      applyMembersAndRender,
      refreshMemberFromNdjson,
    };
    window.refreshMemberFromNdjson = refreshMemberFromNdjson;

    bindEvents();
    updateComposerVisibility();

    if (typeof CosmoStorage === "undefined" || typeof CosmoStorage.getTokens !== "function") {
      showLoginPage(tr("storage_missing"));
      return;
    }

    if ((typeof window !== "undefined" && window.IS_DEMO_MODE)) {
      try {
        await enterChatSession();
      } catch (err) {
        showLoginPage(err?.message || tr("login_retry"));
      }
      return;
    }

    const tokens = await CosmoStorage.getTokens();
    if (!tokens.accessToken && !tokens.refreshToken) {
      showLoginPage(tr("login_prompt"));
      return;
    }

    try {
      await enterChatSession();
    } catch (err) {
      showLoginPage(
        tr("login_loading_failed", { reason: err?.message || tr("login_retry") }),
      );
    }
  }

  bootstrap();
})();

/* --- 10S SILENT MESSAGE API POLLING & AUTO BLOB TRANSLATION HOOK --- */
(() => {
  if (typeof window === "undefined") return;
  if (window.__COSMO_10S_SILENT_POLL_INIT__) return;
  window.__COSMO_10S_SILENT_POLL_INIT__ = true;

  const POLL_INTERVAL_MS = 10000;
  let pollTimer = null;
  let pollInFlight = false;
  const memberCursorSnapshot = new Map();

  function getMemberLatestCursor(member) {
    if (!member || typeof member !== "object") return "";
    const records = Array.isArray(member.records) ? member.records : [];
    const lastRec = records.length > 0 ? records[records.length - 1] : null;
    const rawCursor =
      member.latestCursor ??
      member.cursor ??
      lastRec?.cursor ??
      lastRec?.message?.cursor ??
      lastRec?.sourceId ??
      lastRec?.message?.sourceId ??
      "";
    return `${records.length}:${String(rawCursor)}`;
  }

  function isChatSessionReadyForPolling() {
    if (window.__COSMO_LOGGING_OUT__) return false;
    if (document.hidden) return false;
    if (document.body.classList.contains("is-login-view")) return false;
    const chatShell = document.getElementById("chat-shell");
    if (!chatShell || !chatShell.classList.contains("active")) return false;
    const isDemo =
      window.__FORCE_PROD_SESSION__ !== true &&
      (window.IS_DEMO_MODE === true || window.FORCE_DEMO_MODE === true);
    if (isDemo) return false;
    return typeof CosmoSync !== "undefined" && typeof CosmoSync.syncAllChannels === "function";
  }

  function resolveCurrentViewedMember(updatedMembers) {
    const activeMid = String(
      window.CosmoApp?.activeMemberId ??
      window.currentMember?.artistMemberId ??
      document.getElementById("chat")?.dataset?.artistMemberId ??
      "",
    ).trim();

    if (activeMid) {
      const byId = updatedMembers.find(
        (m) => String(m?.artistMemberId ?? m?.id ?? "").trim() === activeMid,
      );
      if (byId) return byId;
    }

    const activeHeaderName =
      document.querySelector("#chat-header .member-name, #chat-header .header-title")?.textContent?.trim() || "";
    if (activeHeaderName) {
      const byLabel = updatedMembers.find((m) => {
        const lbl = typeof CosmoUtils?.memberLabel === "function" ? CosmoUtils.memberLabel(m) : "";
        return (
          String(lbl).trim() === activeHeaderName ||
          String(m?.artistMemberName ?? "").trim() === activeHeaderName ||
          String(m?.name ?? m?.originalName ?? "").trim() === activeHeaderName
        );
      });
      if (byLabel) return byLabel;
    }

    return updatedMembers[0] || null;
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
        const mid = String(m?.artistMemberId ?? m?.id ?? "").trim();
        if (!mid) continue;
        const sig = getMemberLatestCursor(m);
        if (memberCursorSnapshot.get(mid) !== sig) {
          memberCursorSnapshot.set(mid, sig);
          hasAnyNewCursor = true;
        }
      }

      const currentMember = resolveCurrentViewedMember(updatedMembers);
      const currentMid = String(currentMember?.artistMemberId ?? currentMember?.id ?? "").trim();

      for (const m of updatedMembers) {
        const mid = String(m?.artistMemberId ?? m?.id ?? "").trim();
        if (!mid) continue;
        if (window.CosmoSilentTranslate?.updateKnownMemberCursor) {
          window.CosmoSilentTranslate.updateKnownMemberCursor(m);
        }
        const isCurrentViewed = Boolean(currentMid && mid === currentMid);

        if ((hasAnyNewCursor || isCurrentViewed) && window.CosmoSilentTranslate?.runSilentBatchTranslateWithCursorCheck) {
          window.CosmoSilentTranslate.runSilentBatchTranslateWithCursorCheck(m, {
            getLatestMember: (targetMid) =>
              updatedMembers.find((item) => String(item?.artistMemberId ?? item?.id) === String(targetMid)) || null,
          });
        }
      }

      if (hasAnyNewCursor && typeof CosmoChatView !== "undefined" && currentMember) {
        window.currentMember = currentMember;
        const updateDom = () => {
          if (typeof CosmoChatView.renderSidebar === "function") {
            CosmoChatView.renderSidebar(updatedMembers, currentMember.artistMemberId);
          }
          if (typeof CosmoChatView.renderChat === "function") {
            CosmoChatView.renderChat(currentMember);
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
      console.debug("[10s Silent Poll] skipped:", err);
    } finally {
      pollInFlight = false;
    }
  }

  function startPollingLoop() {
    if (pollTimer !== null) return;
    pollTimer = setInterval(runSilentPollTick, POLL_INTERVAL_MS);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      runSilentPollTick();
    }
  });

  window.addEventListener("pagehide", () => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });

  startPollingLoop();
})();

/* --- TRIGGER SILENT BLOB TRANSLATION ON EVERY 10S FETCH --- */
(() => {
  if (typeof window === "undefined") return;
  if (window.__COSMO_10S_FETCH_BLOB_HOOK_INIT__) return;
  window.__COSMO_10S_FETCH_BLOB_HOOK_INIT__ = true;

  if (typeof CosmoSync !== "undefined" && typeof CosmoSync.syncAllChannels === "function") {
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

/* --- JWT NATIVE NDJSON TRIGGER --- */
(() => {
  if (typeof window === "undefined") return;
  if (window.__COSMO_JWT_NATIVE_NDJSON_INIT__) return;
  window.__COSMO_JWT_NATIVE_NDJSON_INIT__ = true;

  let triggering = false;

  function isDemoSession() {
    try {
      const q = new URLSearchParams(window.location.search || "");
      if (window.FORCE_DEMO_MODE === true) return true;
      if (window.__FORCE_PROD_SESSION__ === true) return false;
      const v = q.get("demo");
      if (v === "1" || v === "true") return true;
      if (v === "0" || v === "false") return false;
    } catch (_) {}
    return Boolean(window.IS_DEMO_MODE === true);
  }

  async function runJwtNdjsonSyncAfterV4(resp) {
    if (isDemoSession() || triggering) return;
    triggering = true;
    try {
      let channels = [];
      try {
        const data = await resp.clone().json();
        if (Array.isArray(data?.channels)) {
          channels = data.channels;
        }
      } catch (_) {}

      const cur = window.currentMember || window.CosmoApp?.currentMember || null;
      const activeMid = String(
        cur?.artistMemberId ??
        cur?.id ??
        document.getElementById("chat")?.getAttribute("data-artist-member-id") ??
        "",
      ).trim();

      const targetIds = activeMid
        ? [activeMid]
        : channels.map((c) => String(c?.artistMemberId ?? "").trim()).filter(Boolean);

      if (typeof window.refreshMemberFromNdjson === "function" && targetIds.length > 0) {
        for (const mid of targetIds.slice(0, 1)) {
          await window.refreshMemberFromNdjson(mid);
        }
      } else if (typeof window.CosmoSync?.syncAllChannels === "function") {
        await window.CosmoSync.syncAllChannels({
          memberIds: targetIds.length > 0 ? targetIds : undefined,
        });
      }
    } catch (_) {
    } finally {
      triggering = false;
    }
  }

  const baseFetch =
    typeof window.__COSMO_NATIVE_FETCH__ === "function"
      ? window.__COSMO_NATIVE_FETCH__
      : window.fetch.bind(window);
  window.__COSMO_NATIVE_FETCH__ = baseFetch;

  window.fetch = async function (input, init) {
    const urlStr = String(typeof input === "string" ? input : (input?.url || ""));
    const resp = await baseFetch(input, init);
    if (!isDemoSession() && urlStr.includes("/bff/v4/channels/messages") && resp && resp.ok) {
      runJwtNdjsonSyncAfterV4(resp).catch(() => {});
    }
    return resp;
  };
})();

/* --- TRIGGER INITIAL F5 SCROLL TO BOTTOM ON SESSION LOAD --- */
(() => {
  if (typeof window === "undefined") return;
  if (window.__COSMO_APP_INITIAL_SCROLL_TRIGGER__) return;
  window.__COSMO_APP_INITIAL_SCROLL_TRIGGER__ = true;

  let done = false;
  let attempts = 0;
  const MAX_ATTEMPTS = 40;

  function tryScrollOnce() {
    if (done) return;
    attempts += 1;

    const overlay = document.getElementById("loading-overlay");
    const isOverlayActive = Boolean(overlay && overlay.classList.contains("active"));
    const chatEl = document.getElementById("chat");
    const hasMessages = Boolean(chatEl && chatEl.querySelectorAll(".msg-wrapper").length > 0);

    if (!isOverlayActive && hasMessages) {
      done = true;
      if (typeof window.CosmoScrollToBottomInitialOnce === "function") {
        window.CosmoScrollToBottomInitialOnce();
      }
      return;
    }

    if (attempts < MAX_ATTEMPTS) {
      setTimeout(tryScrollOnce, 100);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryScrollOnce, { once: true });
  } else {
    tryScrollOnce();
  }
})();
