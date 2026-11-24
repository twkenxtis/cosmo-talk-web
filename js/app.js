(() => {
  'use strict';
  const tr = (key, vars) =>
    typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function'
      ? CosmoI18n.t(key, vars)
      : nfc(String(key));

  const {
    MEDIA_EXT_RE,
    nfc,
    resolveCodepointOrHtml,
    isEmpty,
    isMobile,
    fmtTime,
    fmtDay,
    fmtTimeline,
    getMinuteGroupKey,
    memberLabel,
    pickMediaUrl,
  } = CosmoUtils;

  const {
    API_BASE,
    authorizedFetch,
  } = CosmoAuth;

  const ARTIST_ID = encodeURIComponent(CosmoSync.ARTIST_ID);
  const REPLY_COUNT_URL_TEMPLATE = `${API_BASE}/bff/v3/channels/messages/{artist_member_id}/reply-count`;
  const STICKERS_URL = `${API_BASE}/bff/v3/artists/${ARTIST_ID}/stickers`;
  const SEND_REPLY_URL_TEMPLATE = `${API_BASE}/bff/v4/channels/messages/{artist_member_id}/{message_id}/replies`;

  const COPY_ICON_HTML = '<i class="ti ti-copy" aria-hidden="true"></i>';
  const CHECK_ICON_HTML = '<i class="ti ti-check" aria-hidden="true"></i>';
  const LOGOUT_ICON_HTML = '<i class="ti ti-logout" aria-hidden="true"></i>';
  const EXPORT_ICON_HTML = '<i class="ti ti-file-export" aria-hidden="true"></i>';
  const SETTINGS_ICON_HTML = '<i class="ti ti-tool" aria-hidden="true"></i>';

  const dom = {
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingProgressText: document.getElementById('loading-progress-text'),

    loginPage: document.getElementById('login-page'),
    jwtLoginInput: document.getElementById('jwt-login-input'),
    jwtLoginBtn: document.getElementById('jwt-login-btn'),
    jwtGuideBtn: document.getElementById('jwt-guide-btn'),
    loginStatus: document.getElementById('login-status'),

    chatShell: document.getElementById('chat-shell'),
    sidebarBackdrop: document.getElementById('sidebar-backdrop'),
    sidebarToggleInner: document.getElementById('sidebar-toggle-inner'),
    memberList: document.getElementById('member-list'),
    chatHeader: document.getElementById('chat-header'),
    chat: document.getElementById('chat'),
    timelineRail: document.getElementById('timeline-rail'),

    composerWrapper: document.getElementById('chat-composer-wrapper'),
    chatInput: document.getElementById('chat-input'),
    stickerToggleBtn: document.getElementById('sticker-toggle-btn'),
    sendMsgBtn: document.getElementById('send-msg-btn'),
    stickerPickerPanel: document.getElementById('sticker-picker-panel'),
    stickerGrid: document.getElementById('sticker-grid'),
    stickerPickerStatus: document.getElementById('sticker-picker-status'),
    stickerClearBtn: document.getElementById('sticker-clear-btn'),
    selectedStickerBar: document.getElementById('selected-sticker-bar'),
    selectedStickerImg: document.getElementById('selected-sticker-img'),
    selectedStickerRemove: document.getElementById('selected-sticker-remove'),
  };

  const state = {
    membersData: [],
    activeMemberId: null,
    currentRenderedItems: [],
    currentSegmentStarts: [],
    activeSyncGeneration: 0,

    remainingCount: null,
    textMaxLength: 200,
    stickersCache: null,
    selectedSticker: null,
    isSending: false,
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

  const loginLangBtn = document.getElementById('login-lang-btn');
  const loginLangSelect = document.getElementById('login-lang-select');

  function syncLoginLangControls() {
    if (typeof CosmoI18n === 'undefined') return;
    const curLang = CosmoI18n.getLang();
    if (loginLangSelect) {
      loginLangSelect.value = curLang;
    }
    if (dom.loginStatus && (!dom.loginStatus.textContent || !dom.loginStatus.textContent.trim())) {
      setLoginStatus(tr('login_prompt'));
    }
  }

  if (loginLangSelect) {
    loginLangSelect.onchange = () => {
      if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.setLang === 'function') {
        CosmoI18n.setLang(loginLangSelect.value);
      }
    };
  }

  if (loginLangBtn) {
    loginLangBtn.onclick = () => {
      if (!loginLangSelect) return;
      if (typeof loginLangSelect.showPicker === 'function') {
        try {
          loginLangSelect.showPicker();
          return;
        } catch (_) {}
      }
      loginLangSelect.focus();
      loginLangSelect.click();
    };
  }

  function updateComposerVisibility() {
    const composerEl = dom.composerWrapper || document.getElementById('chat-composer-wrapper');
    if (!composerEl) return;

    const isChatActive = Boolean(dom.chatShell && dom.chatShell.classList.contains('active'));
    const hasMembers = Array.isArray(state.membersData) && state.membersData.length > 0;
    const isLoginVisible = Boolean(
      dom.loginPage && getComputedStyle(dom.loginPage).display !== 'none'
    );
    const isLoadingVisible = Boolean(
      dom.loadingOverlay && dom.loadingOverlay.classList.contains('active')
    );

    const shouldShow = isChatActive && hasMembers && !isLoginVisible && !isLoadingVisible;
    composerEl.style.display = shouldShow ? '' : 'none';

    if (shouldShow) {
      updateSendButtonState();
    }
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

  async function copyTextToClipboard(text) {
    const value = String(text ?? '');
    if (!value) return false;

    const fallbackExecCopy = () => {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('aria-hidden', 'true');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.width = '2em';
      ta.style.height = '2em';
      ta.style.padding = '0';
      ta.style.border = 'none';
      ta.style.outline = 'none';
      ta.style.boxShadow = 'none';
      ta.style.background = 'transparent';
      ta.style.opacity = '0';
      ta.style.fontSize = '16px';
      document.body.appendChild(ta);

      try {
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        return Boolean(document.execCommand('copy'));
      } catch (_) {
        return false;
      } finally {
        ta.remove();
      }
    };

    if (
      window.isSecureContext &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (_) {
        return fallbackExecCopy();
      }
    }

    return fallbackExecCopy();
  }

  function getLatestMessageIdForMember(member) {
    if (!member) return '';
    if (member.lastMessageId) return String(member.lastMessageId);
    if (member.lastMessage && member.lastMessage.id) return String(member.lastMessage.id);

    const records = Array.isArray(member.records) ? member.records : [];
    for (let i = records.length - 1; i >= 0; i--) {
      const rec = records[i];
      const candidates = [
        rec?.message?.id,
        rec?.message?.messageId,
        rec?.messageId,
        rec?.id,
      ];
      for (const mid of candidates) {
        if (mid !== undefined && mid !== null && String(mid).trim() !== '') {
          return String(mid).trim();
        }
      }
    }
    return '';
  }

  function updateComposerPlaceholder() {
    if (!dom.chatInput) return;
    const countText =
      state.remainingCount === null || state.remainingCount === undefined
        ? '...'
        : String(state.remainingCount);
    dom.chatInput.placeholder = nfc(`可發送 ${countText} 次訊息`);

    if (typeof state.textMaxLength === 'number' && state.textMaxLength > 0 && !state.selectedSticker) {
      dom.chatInput.maxLength = state.textMaxLength;
    }
  }

  function updateSendButtonState() {
    if (!dom.sendMsgBtn) return;
    const hasText = Boolean(dom.chatInput && dom.chatInput.value.trim().length > 0);
    const hasSticker = Boolean(state.selectedSticker);
    const canSend = (hasText || hasSticker) && !state.isSending;
    dom.sendMsgBtn.classList.toggle('can-send', canSend);
  }

  async function fetchRemainingCount(memberId) {
    if (!memberId) return;
    try {
      const url = REPLY_COUNT_URL_TEMPLATE.replace(
        '{artist_member_id}',
        encodeURIComponent(String(memberId))
      );
      const resp = await authorizedFetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) return;

      const data = nfc(await resp.json());
      if (typeof data.remainingCount === 'number') {
        state.remainingCount = data.remainingCount;
      } else if (data.remainingCount === null || data.remainingCount === undefined) {
        state.remainingCount = 0;
      }

      if (typeof data.textMaxLength === 'number' && data.textMaxLength > 0) {
        state.textMaxLength = data.textMaxLength;
      }
      updateComposerPlaceholder();
    } catch (err) {
      console.debug('Fetch reply count failed:', err);
    }
  }

  function ensureRemainingCountIfNeeded(memberId) {
    if (!memberId) return;
    if (state.remainingCount === null) {
      fetchRemainingCount(memberId);
    } else {
      updateComposerPlaceholder();
    }
  }

  function pickStickerPreviewUrl(st) {
    if (!st || typeof st !== 'object') return '';
    return st.imageUrl || st.url || st.thumbnailUrl || st.imgUrl || st.image || '';
  }

  function resolveStickerUtf8Content(rawCodepoint) {
    if (!rawCodepoint) return '';
    const str = String(rawCodepoint).trim();

    const hexMatch = str.match(/^(?:\\u|u\+|0x)?\{?([0-9a-fA-F]{4,6})\}?$/);
    if (hexMatch) {
      const cp = parseInt(hexMatch[1], 16);
      if (!Number.isNaN(cp) && cp >= 0 && cp <= 0x10ffff) {
        return nfc(String.fromCodePoint(cp));
      }
    }
    return nfc(str);
  }

  function setSelectedSticker(sticker) {
    const barEl = dom.selectedStickerBar;
    const imgEl = dom.selectedStickerImg;

    if (!sticker) {
      state.selectedSticker = null;
      if (dom.chatInput) {
        dom.chatInput.disabled = false;
      }
      if (barEl) {
        barEl.style.display = 'none';
        barEl.classList.remove('active');
      }
      if (imgEl) {
        imgEl.removeAttribute('src');
        imgEl.style.display = 'none';
      }
      updateComposerPlaceholder();
      updateSendButtonState();
      return;
    }

    const utf8Char = resolveStickerUtf8Content(sticker.codepointHex);
    const previewUrl = pickStickerPreviewUrl(sticker);

    state.selectedSticker = {
      id: sticker.id,
      codepointHex: sticker.codepointHex,
      utf8Content: utf8Char,
      imageUrl: previewUrl,
    };

    if (dom.chatInput) {
      dom.chatInput.value = '';
      dom.chatInput.disabled = true;
      dom.chatInput.placeholder = nfc(
        `已選擇貼圖，按傳送發送（可發送 ${state.remainingCount ?? '...'} 次訊息）`
      );
    }

    if (barEl) {
      if (imgEl) {
        if (previewUrl) {
          imgEl.src = previewUrl;
          imgEl.alt = utf8Char || sticker.codepointHex || 'sticker';
          imgEl.style.display = 'block';
        } else {
          imgEl.removeAttribute('src');
          imgEl.style.display = 'none';
        }
      }
      barEl.style.display = 'flex';
      barEl.classList.add('active');
    }

    updateSendButtonState();
  }

  function syncStickerGridSquareRows() {
    if (!dom.stickerGrid) return;
    const firstItem = dom.stickerGrid.querySelector('.sticker-grid-item');
    if (!firstItem) return;
    const colWidth = firstItem.getBoundingClientRect().width;
    if (colWidth > 0) {
      dom.stickerGrid.style.gridAutoRows = `${Math.round(colWidth)}px`;
    }
  }

  function renderStickerGrid() {
    if (!dom.stickerGrid) return;
    dom.stickerGrid.replaceChildren();

    const list = Array.isArray(state.stickersCache) ? state.stickersCache : [];
    if (list.length === 0) {
      if (dom.stickerPickerStatus) {
        dom.stickerPickerStatus.textContent = nfc('沒有可用的貼圖');
      }
      return;
    }

    if (dom.stickerPickerStatus) {
      dom.stickerPickerStatus.textContent = nfc(`貼圖（共 ${list.length} 個，點選後按 ↑ 發送）`);
    }

    for (const st of list) {
      if (!st || !st.codepointHex) continue;
      const previewUrl = pickStickerPreviewUrl(st);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sticker-grid-item';
      if (state.selectedSticker && String(state.selectedSticker.codepointHex) === String(st.codepointHex)) {
        btn.classList.add('selected');
      }
      btn.title = nfc(st.codepointHex);

      const img = document.createElement('img');
      img.src = previewUrl;
      img.alt = nfc(st.codepointHex);
      img.loading = 'lazy';
      btn.appendChild(img);

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          setSelectedSticker({
            id: st.id,
            codepointHex: String(st.codepointHex),
            utf8Content: st.utf8Content || '',
            imageUrl: previewUrl,
          });
          if (dom.stickerPickerPanel) {
            dom.stickerPickerPanel.classList.remove('open');
          }
          renderStickerGrid();
        } catch (err) {
          console.error('Sticker selection error:', err);
        }
      };

      dom.stickerGrid.appendChild(btn);
    }

    requestAnimationFrame(syncStickerGridSquareRows);
  }

  async function loadAndToggleStickers() {
    if (!dom.stickerPickerPanel) return;
    const willOpen = !dom.stickerPickerPanel.classList.contains('open');
    if (!willOpen) {
      dom.stickerPickerPanel.classList.remove('open');
      return;
    }

    dom.stickerPickerPanel.classList.add('open');
    if (state.stickersCache !== null) {
      renderStickerGrid();
      return;
    }

    if (dom.stickerPickerStatus) {
      dom.stickerPickerStatus.textContent = nfc('載入貼圖中...');
    }

    try {
      const resp = await authorizedFetch(`${STICKERS_URL}?skip=0&take=9999`, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) {
        if (dom.stickerPickerStatus) {
          dom.stickerPickerStatus.textContent = nfc('貼圖載入失敗');
        }
        return;
      }
      const data = nfc(await resp.json());
      state.stickersCache = Array.isArray(data)
        ? data
        : (Array.isArray(data.stickers) ? data.stickers : []);
      renderStickerGrid();
    } catch (err) {
      console.debug('Load stickers failed:', err);
      if (dom.stickerPickerStatus) {
        dom.stickerPickerStatus.textContent = nfc('貼圖載入發生錯誤');
      }
    }
  }

  async function sendMessagePayload() {
    if (state.isSending || !state.activeMemberId) return;

    let payloadContent = '';
    if (state.selectedSticker) {
      payloadContent = resolveCodepointOrHtml(
        state.selectedSticker.utf8Content || state.selectedSticker.codepointHex
      );
    } else {
      const rawText = dom.chatInput ? dom.chatInput.value : '';
      const resolved = resolveCodepointOrHtml(rawText);
      if (!resolved.trim()) return;
      payloadContent = resolved;
    }

    const curMember = state.membersData.find(
      (m) => String(m.artistMemberId) === String(state.activeMemberId)
    );
    const targetMessageId = getLatestMessageIdForMember(curMember);
    if (!targetMessageId) {
      console.warn('Missing target messageId for member:', state.activeMemberId);
      return;
    }

    state.isSending = true;
    if (dom.sendMsgBtn) dom.sendMsgBtn.disabled = true;
    updateSendButtonState();

    try {
      const sentMemberId = state.activeMemberId;
      const url = SEND_REPLY_URL_TEMPLATE
        .replace('{artist_member_id}', encodeURIComponent(String(sentMemberId)))
        .replace('{message_id}', encodeURIComponent(String(targetMessageId)));

      const resp = await authorizedFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
        },
        body: JSON.stringify({
          content: payloadContent,
          messageId: targetMessageId,
        }),
      });

      if (resp.status === 201 || resp.status === 206 || resp.ok) {
        if (dom.chatInput) dom.chatInput.value = '';
        setSelectedSticker(null);
        renderStickerGrid();

        if (resp.status === 206) {
          await fetchRemainingCount(sentMemberId);
        } else if (typeof state.remainingCount === 'number' && state.remainingCount > 0) {
          state.remainingCount -= 1;
          updateComposerPlaceholder();
        }

        await refreshMemberFromNdjson(sentMemberId);
      } else {
        const errText = await resp.text().catch(() => '');
        const displayMsg = extractApiErrorMessage(errText, resp.status);
        console.warn('Send failed:', resp.status, errText);
        showToast(displayMsg, { type: 'error' });
      }
    } catch (err) {
      console.debug('Send message error:', err);
    } finally {
      state.isSending = false;
      if (dom.sendMsgBtn) dom.sendMsgBtn.disabled = false;
      updateSendButtonState();
    }
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
      renderSidebar();
      renderChat(updatedMember);
    }
  }

  function toggleSidebar(force) {
    if (!dom.chatShell) return;
    const next = typeof force === 'boolean'
      ? force
      : !dom.chatShell.classList.contains('sidebar-collapsed');
    dom.chatShell.classList.toggle('sidebar-collapsed', next);
  }

  function renderSidebar() {
    if (!dom.memberList) return;
    const frag = document.createDocumentFragment();

    for (const m of state.membersData) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'member-item' + (m.artistMemberId === state.activeMemberId ? ' active' : '');
      btn.onclick = () => {
        state.activeMemberId = m.artistMemberId;
        renderSidebar();
        renderChat(m);
        ensureRemainingCountIfNeeded(state.activeMemberId);
        if (isMobile()) toggleSidebar(true);
        window.scrollTo({ top: 0, behavior: 'instant' });
      };

      if (m.profileImageUrl) {
        const img = document.createElement('img');
        img.className = 'member-thumb';
        img.src = m.profileImageUrl;
        img.alt = memberLabel(m);
        img.loading = 'lazy';
        btn.appendChild(img);
      }

      const span = document.createElement('span');
      span.className = 'member-label';
      span.textContent = memberLabel(m);
      btn.appendChild(span);
      frag.appendChild(btn);
    }

    dom.memberList.replaceChildren(frag);
  }

function buildHeaderActions(member) {
    const actions = document.createElement('div');
    actions.className = 'header-actions';

    const expBtn = document.createElement('button');
    expBtn.type = 'button';
    expBtn.className = 'icon-btn';
    expBtn.title = '匯出純文本';
    expBtn.setAttribute('aria-label', '匯出純文本');
    expBtn.innerHTML = EXPORT_ICON_HTML;
    expBtn.onclick = () =>
      CosmoExport.exportMemberText({
        member,
        renderedItems: state.currentRenderedItems,
        segmentStarts: state.currentSegmentStarts,
        headerEl: dom.chatHeader,
      });

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'icon-btn';
    copyBtn.title = '複製 Artist 純文本';
    copyBtn.setAttribute('aria-label', '複製 Artist 純文本');
    copyBtn.innerHTML = COPY_ICON_HTML;
    copyBtn.onclick = async () => {
      const { text } = CosmoExport.buildMemberText({
        renderedItems: state.currentRenderedItems,
        segmentStarts: state.currentSegmentStarts,
        headerEl: dom.chatHeader,
      });
      if (!text) return;

      const ok = await copyTextToClipboard(text);
      copyBtn.innerHTML = ok ? CHECK_ICON_HTML : COPY_ICON_HTML;
      copyBtn.title = ok ? '已複製' : '複製失敗';
      copyBtn.disabled = true;

      setTimeout(() => {
        copyBtn.innerHTML = COPY_ICON_HTML;
        copyBtn.title = '複製 Artist 純文本';
        copyBtn.disabled = false;
      }, 1500);
    };

    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'icon-btn';
    settingsBtn.title = '設定';
    settingsBtn.setAttribute('aria-label', '設定');
    settingsBtn.innerHTML = SETTINGS_ICON_HTML;
    settingsBtn.onclick = () => {
      if (typeof CosmoSettings !== 'undefined' && typeof CosmoSettings.toggle === 'function') {
        CosmoSettings.toggle();
      }
    };

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'icon-btn';
    logoutBtn.title = '登出';
    logoutBtn.setAttribute('aria-label', '登出');
    logoutBtn.innerHTML = LOGOUT_ICON_HTML;
    logoutBtn.onclick = () => logoutToLoginPage();

    actions.appendChild(expBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(settingsBtn);
    actions.appendChild(logoutBtn);
    return actions;
  }

  function renderChat(member) {
    if (!dom.chatHeader || !dom.chat || !dom.timelineRail) return;

    dom.chatHeader.replaceChildren();
    dom.chat.replaceChildren();
    dom.timelineRail.replaceChildren();
    dom.timelineRail.classList.add('empty');
    state.currentRenderedItems = [];
    state.currentSegmentStarts = [];

    if (!member) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = tr('no_channel_data');
      dom.chat.appendChild(empty);
      return;
    }

    const label = memberLabel(member);
    const left = document.createElement('div');
    left.className = 'header-left';

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'icon-btn';
    menuBtn.textContent = '☰';
    menuBtn.onclick = () => toggleSidebar();
    left.appendChild(menuBtn);

    if (member.profileImageUrl) {
      const avatar = document.createElement('img');
      avatar.className = 'header-avatar';
      avatar.src = member.profileImageUrl;
      avatar.alt = label;
      left.appendChild(avatar);
    }

    const title = document.createElement('div');
    title.className = 'header-title';
    title.textContent = label;
    left.appendChild(title);

    dom.chatHeader.appendChild(left);
    dom.chatHeader.appendChild(buildHeaderActions(member));

    const records = Array.isArray(member.records) ? member.records : [];
    const chatFrag = document.createDocumentFragment();
    let lastDay = null;
    let lastMs = null;
    let count = 0;
    let prevGroupInfo = null;

    for (const rec of records) {
      const msg = rec?.message || {};
      const hasText = !isEmpty(msg.content);
      const hasSticker = !isEmpty(msg.stickerMetadata);
      const hasMedia = !isEmpty(msg.mediaMetadata);
      const isReply = !isEmpty(msg.replyContent);
      if (!hasText && !hasSticker && !hasMedia && !isReply) continue;

      const idx = count++;
      const day = fmtDay(msg.createdAt);
      if (day && day !== lastDay) {
        const dEl = document.createElement('div');
        dEl.className = 'day';
        dEl.textContent = day;
        chatFrag.appendChild(dEl);
        lastDay = day;
        prevGroupInfo = null;
      }

      const sourceType = msg.sourceType || rec?.sourceType || '';
      const isUserReply = sourceType === 'userReply';
      const minuteKey = getMinuteGroupKey(msg.createdAt);
      const senderKey = `${msg.senderType || ''}|${sourceType}`;

      const isGroupedWithPrev =
        prevGroupInfo !== null &&
        prevGroupInfo.day === day &&
        minuteKey !== '' &&
        prevGroupInfo.minuteKey === minuteKey &&
        prevGroupInfo.senderKey === senderKey;

      if (isGroupedWithPrev && prevGroupInfo.timeEl) {
        prevGroupInfo.timeEl.textContent = '';
      }

      const other = msg.senderType === 'artistMember' && !isUserReply;
      const wrap = document.createElement('div');
      wrap.className = 'msg-wrapper' + (isGroupedWithPrev ? ' grouped-next' : '');
      const anchorId = `msg-${member.artistMemberId}-${count}`;
      wrap.id = anchorId;
      if (!other) wrap.style.flexDirection = 'row-reverse';

      if (other) {
        const av = document.createElement('div');
        av.className = 'avatar';
        if (member.profileImageUrl) {
          av.style.backgroundImage = `url('${member.profileImageUrl}')`;
        }
        wrap.appendChild(av);
      }

      const box = document.createElement('div');
      box.className = 'msg-content';
      if (!other) box.style.alignItems = 'flex-end';

      if (other) {
        const sName = document.createElement('div');
        sName.className = 'sender-name';
        sName.textContent = nfc(member.artistMemberName || member.originalName || '');
        box.appendChild(sName);
      }

      const row = document.createElement('div');
      row.className = 'bubble-row';
      if (!other) row.style.flexDirection = 'row-reverse';

      const isMediaOnly =
        !isReply &&
        !hasText &&
        (hasSticker || hasMedia || (msg.messageType && msg.messageType !== 'text'));

      const bubble = document.createElement('div');
      bubble.className =
        'bubble' +
        (isReply ? ' reply-bubble' : '') +
        (isUserReply ? ' user-reply' : '') +
        (isMediaOnly ? ' media-bubble' : '');

      if (isReply) {
        const qh = document.createElement('div');
        qh.className = 'quote-header';
        qh.textContent = nfc(tr('replied_by', { name: member.artistMemberName || '' }));
        const qt = document.createElement('div');
        qt.textContent = nfc(
          typeof msg.replyContent === 'object'
            ? JSON.stringify(msg.replyContent)
            : msg.replyContent
        );
        bubble.appendChild(qh);
        bubble.appendChild(qt);
      } else if (hasText) {
        bubble.textContent = nfc(String(msg.content));
      } else if (hasSticker && msg.stickerMetadata?.imageUrl) {
        const sImg = document.createElement('img');
        sImg.className = 'sticker-img';
        sImg.src = msg.stickerMetadata.imageUrl;
        sImg.loading = 'lazy';
        bubble.appendChild(sImg);
      } else if (hasMedia) {
        const arr = Array.isArray(msg.mediaMetadata) ? msg.mediaMetadata : [msg.mediaMetadata];
        for (const item of arr) {
          const u = pickMediaUrl(item);
          if (!u) continue;

          if (MEDIA_EXT_RE.test(u)) {
            const vid = document.createElement('video');
            vid.className = 'media-video';
            vid.src = u;
            vid.controls = true;
            vid.preload = 'metadata';
            bubble.appendChild(vid);
          } else {
            const mImg = document.createElement('img');
            mImg.className = 'media-img';
            mImg.src = u;
            mImg.loading = 'lazy';
            bubble.appendChild(mImg);
          }
        }
      }

      const tEl = document.createElement('div');
      tEl.className = 'time';
      tEl.textContent = fmtTime(msg.createdAt);

      if (!other) {
        row.appendChild(tEl);
        row.appendChild(bubble);
      } else {
        row.appendChild(bubble);
        row.appendChild(tEl);
      }

      box.appendChild(row);
      wrap.appendChild(box);
      chatFrag.appendChild(wrap);
      state.currentRenderedItems.push({ element: wrap, msg });

      const ms = msg.createdAt ? Date.parse(msg.createdAt) : NaN;
      if (!Number.isNaN(ms)) {
        if (lastMs === null || Math.abs(ms - lastMs) / 60000 > 31) {
          state.currentSegmentStarts.push({
            id: anchorId,
            iso: msg.createdAt,
            renderedIndex: idx,
          });
        }
        lastMs = ms;
      }

      prevGroupInfo = {
        day,
        minuteKey,
        senderKey,
        timeEl: tEl,
      };
    }

    dom.chat.appendChild(chatFrag);

    if (state.currentSegmentStarts.length > 0) {
      dom.timelineRail.classList.remove('empty');
      const railFrag = document.createDocumentFragment();
      for (const seg of state.currentSegmentStarts) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'timeline-btn';
        b.textContent = fmtTimeline(seg.iso);
        b.onclick = () => {
          const target = document.getElementById(seg.id);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        };
        railFrag.appendChild(b);
      }
      dom.timelineRail.appendChild(railFrag);

      const lastSeg = state.currentSegmentStarts[state.currentSegmentStarts.length - 1];
      const lastTarget = document.getElementById(lastSeg.id);
      if (lastTarget) {
        requestAnimationFrame(() => {
          lastTarget.scrollIntoView({ behavior: 'instant', block: 'start' });
        });
      }
    }
  }

  function applyMembersAndRender(nextMembers) {
    state.membersData = Array.isArray(nextMembers) ? nextMembers : [];
    if (state.membersData.length === 0) {
      state.activeMemberId = null;
      renderSidebar();
      renderChat(null);
      return false;
    }

    if (
      !state.activeMemberId ||
      !state.membersData.some((m) => m.artistMemberId === state.activeMemberId)
    ) {
      state.activeMemberId = state.membersData[0].artistMemberId;
    }

    const currentMember =
      state.membersData.find((m) => m.artistMemberId === state.activeMemberId) || null;
    renderSidebar();
    renderChat(currentMember);
    ensureRemainingCountIfNeeded(state.activeMemberId);
    showChatPage();
    return true;
  }

  async function enterChatSession({ showOverlay = true } = {}) {
    const syncGen = ++state.activeSyncGeneration;
    if (showOverlay) {
      setLoadingOverlay(true);
      setLoadingProgress(0, '準備同步', { allowBackward: true });
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

      setLoadingProgress(96, '渲染聊天室...');
      applyMembersAndRender(results);
      setLoadingProgress(100, '完成');
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
      showLoginPage(err?.message || CosmoSync.EXPIRED_JWT_MESSAGE);
    }
  }

  let toastTimer = null;

  function ensureToastElement() {
    let el = document.getElementById('cosmo-toast');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'cosmo-toast';
    el.className = 'cosmo-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    return el;
  }

  function showToast(message, { type = 'error', duration = 3500 } = {}) {
    const text = nfc(String(message ?? '')).trim();
    if (!text) return;

    const el = ensureToastElement();
    el.textContent = text;
    el.className = `cosmo-toast cosmo-toast--${type} show`;

    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
    }, duration);
  }

  function extractApiErrorMessage(rawText, status) {
    const trimmed = String(rawText ?? '').trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        const errMsg = parsed?.error?.message;
        if (typeof errMsg === 'string' && errMsg.trim()) {
          return nfc(errMsg.trim());
        }
      } catch (_) {
      }
      return nfc(trimmed);
    }
    return `請求失敗 (HTTP ${status})`;
  }

  async function logoutToLoginPage(statusMsg = '已登出並清除 IndexedDB 中的憑證與快取') {
    state.activeSyncGeneration++;
    state.remainingCount = null;
    state.selectedSticker = null;
    state.lastProgressPercent = 0;

    if (dom.stickerPickerPanel) dom.stickerPickerPanel.classList.remove('open');
    if (dom.selectedStickerBar) dom.selectedStickerBar.style.display = 'none';
    if (dom.chatInput) {
      dom.chatInput.disabled = false;
      dom.chatInput.value = '';
    }

    await CosmoStorage.clearTokens().catch(() => {});
    await CosmoStorage.clearNdjsonCache().catch(() => {});

    state.membersData = [];
    state.activeMemberId = null;
    renderSidebar();
    renderChat(null);
    showLoginPage(statusMsg);
  }

  function bindEvents() {
    if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.onChange === 'function') {
      CosmoI18n.onChange(() => {
        CosmoI18n.applyDomI18n(document);
        syncLoginLangControls();
        updateComposerPlaceholder();
        if (state.membersData.length > 0) {
          renderSidebar();
          const cur = state.membersData.find(
            (m) => String(m.artistMemberId) === String(state.activeMemberId)
          );
          if (cur) renderChat(cur);
        }
        if (state.stickersCache !== null) {
          renderStickerGrid();
        }
      });
    }
    if (dom.sidebarToggleInner) {
      dom.sidebarToggleInner.onclick = () => toggleSidebar(true);
    }
    if (dom.sidebarBackdrop) {
      dom.sidebarBackdrop.onclick = () => toggleSidebar(true);
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

    if (dom.chatInput) {
      dom.chatInput.value = '';
      dom.chatInput.addEventListener('input', updateSendButtonState);
      dom.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          sendMessagePayload();
        }
      });
    }

    if (dom.stickerToggleBtn) {
      dom.stickerToggleBtn.onclick = loadAndToggleStickers;
    }

    if (dom.stickerClearBtn) {
      dom.stickerClearBtn.onclick = () => {
        setSelectedSticker(null);
        renderStickerGrid();
      };
    }

    if (dom.selectedStickerRemove) {
      dom.selectedStickerRemove.onclick = () => {
        setSelectedSticker(null);
        renderStickerGrid();
      };
    }

    if (dom.sendMsgBtn) {
      dom.sendMsgBtn.onclick = sendMessagePayload;
    }

    document.addEventListener('click', (e) => {
      if (!dom.stickerPickerPanel || !dom.stickerPickerPanel.classList.contains('open')) {
        return;
      }

      const target = e.target;
      if (!(target instanceof Node)) return;

      const clickedInsidePanel = dom.stickerPickerPanel.contains(target);
      const clickedToggleBtn =
        dom.stickerToggleBtn && dom.stickerToggleBtn.contains(target);
      const clickedTextInput =
        (dom.chatInput && dom.chatInput.contains(target)) ||
        (target instanceof Element && Boolean(target.closest('#chat-input, .composer-pill')));

      if (!clickedInsidePanel && !clickedToggleBtn && !clickedTextInput) {
        dom.stickerPickerPanel.classList.remove('open');
      }
    });

    window.addEventListener('resize', () => {
      if (dom.stickerPickerPanel && dom.stickerPickerPanel.classList.contains('open')) {
        requestAnimationFrame(syncStickerGridSquareRows);
      }
      if (dom.loginPage && getComputedStyle(dom.loginPage).display !== 'none') {
        resizeJwtLoginTextarea(dom.jwtLoginInput);
      }
    });
  }

  async function bootstrap() {
      bindEvents();
      setSelectedSticker(null);
      updateSendButtonState();
      updateComposerVisibility();

      if (typeof CosmoStorage === 'undefined' || typeof CosmoStorage.getTokens !== 'function') {
        showLoginPage('儲存模組 (CosmoStorage) 未載入，請檢查 index.html 腳本順序');
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
        showLoginPage(`既有憑證載入失敗：${err?.message || '請重新輸入'}`);
      }
    }

  bootstrap();
})();