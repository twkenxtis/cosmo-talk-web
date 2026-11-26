const CosmoComposer = (() => {
  'use strict';

  const { nfc, resolveCodepointOrHtml } = CosmoUtils;
  const { API_BASE, authorizedFetch } = CosmoAuth;

  const tr = (key, vars) =>
    typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function'
      ? CosmoI18n.t(key, vars)
      : nfc(String(key));

  const ARTIST_ID = encodeURIComponent(CosmoSync.ARTIST_ID);
  const REPLY_COUNT_URL_TEMPLATE = `${API_BASE}/bff/v3/channels/messages/{artist_member_id}/reply-count`;
  const STICKERS_URL = `${API_BASE}/bff/v3/artists/${ARTIST_ID}/stickers`;
  const SEND_REPLY_URL_TEMPLATE = `${API_BASE}/bff/v4/channels/messages/{artist_member_id}/{message_id}/replies`;

  const dom = {
    composerWrapper: document.getElementById('chat-composer-wrapper'),
    chatInput: document.getElementById('chat-input'),
    stickerToggleBtn: document.getElementById('sticker-toggle-btn'),
    sendMsgBtn: document.getElementById('send-msg-btn'),
    stickerPickerPanel: document.getElementById('sticker-picker-panel'),
    stickerGrid: document.getElementById('sticker-grid'),
    stickerPickerStatus: document.getElementById('sticker-picker-status'),
    selectedStickerBar: document.getElementById('selected-sticker-bar'),
    selectedStickerImg: document.getElementById('selected-sticker-img'),
  };

  const state = {
    remainingCount: null,
    textMaxLength: 200,
    stickersCache: null,
    selectedSticker: null,
    isSending: false,
  };

  let callbacks = {
    getActiveMember: () => null,
    onMessageSent: async () => {},
  };

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

  function updatePlaceholder() {
    if (!dom.chatInput) return;
    const countText =
      state.remainingCount === null || state.remainingCount === undefined
        ? '...'
        : String(state.remainingCount);

    dom.chatInput.placeholder = state.selectedSticker
      ? tr('sticker_selected_placeholder', { count: countText })
      : tr('composer_placeholder', { count: countText });

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

  function setVisible(visible) {
    const composerEl = dom.composerWrapper || document.getElementById('chat-composer-wrapper');
    if (!composerEl) return;
    composerEl.style.display = visible ? '' : 'none';
    if (visible) {
      updateSendButtonState();
    }
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
      updatePlaceholder();
    } catch (err) {
      console.debug('Fetch reply count failed:', err);
    }
  }

  function ensureRemainingCountIfNeeded(memberId) {
    if (!memberId) return;
    if (state.remainingCount === null) {
      fetchRemainingCount(memberId);
    } else {
      updatePlaceholder();
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

  function clearSelectedSticker() {
    setSelectedSticker(null);
    if (state.stickersCache !== null) {
      renderStickerGrid();
    } else {
      document
        .querySelectorAll('.sticker-grid-item.selected')
        .forEach((item) => item.classList.remove('selected'));
    }
  }

  function setSelectedSticker(sticker) {
    const barEl = dom.selectedStickerBar || document.getElementById('selected-sticker-bar');
    const imgEl = dom.selectedStickerImg || document.getElementById('selected-sticker-img');

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
      updatePlaceholder();
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
      updatePlaceholder();
    }

    if (barEl) {
      if (imgEl) {
        if (previewUrl) {
          imgEl.src = CosmoSecurity.safeImgUrl(previewUrl);
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
        dom.stickerPickerStatus.textContent = tr('no_stickers');
      }
      return;
    }

    if (dom.stickerPickerStatus) {
      dom.stickerPickerStatus.textContent = tr('sticker_picker_hint', { count: list.length });
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
      img.src = CosmoSecurity.safeImgUrl(previewUrl);
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
      dom.stickerPickerStatus.textContent = tr('loading_stickers');
    }

    try {
      const resp = await authorizedFetch(`${STICKERS_URL}?skip=0&take=9999`, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) {
        if (dom.stickerPickerStatus) {
          dom.stickerPickerStatus.textContent = tr('stickers_load_failed');
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
        dom.stickerPickerStatus.textContent = tr('stickers_load_error');
      }
    }
  }

  async function sendMessagePayload() {
    const curMember = callbacks.getActiveMember();
    if (state.isSending || !curMember || !curMember.artistMemberId) return;

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

    const targetMessageId = getLatestMessageIdForMember(curMember);
    if (!targetMessageId) {
      console.warn('Missing target messageId for member:', curMember.artistMemberId);
      return;
    }

    state.isSending = true;
    if (dom.sendMsgBtn) dom.sendMsgBtn.disabled = true;
    updateSendButtonState();

    try {
      const sentMemberId = curMember.artistMemberId;
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
        clearSelectedSticker();

        if (resp.status === 206) {
          await fetchRemainingCount(sentMemberId);
        } else if (typeof state.remainingCount === 'number' && state.remainingCount > 0) {
          state.remainingCount -= 1;
          updatePlaceholder();
        }

        await callbacks.onMessageSent(sentMemberId);
      } else {
        const errText = await resp.text().catch(() => '');
        const displayMsg = CosmoToast.extractApiErrorMessage(errText, resp.status);
        console.warn('Send failed:', resp.status, errText);
        CosmoToast.show(displayMsg, { type: 'error' });
      }
    } catch (err) {
      console.debug('Send message error:', err);
    } finally {
      state.isSending = false;
      if (dom.sendMsgBtn) dom.sendMsgBtn.disabled = false;
      updateSendButtonState();
    }
  }

  function reset() {
    state.remainingCount = null;
    if (dom.stickerPickerPanel) dom.stickerPickerPanel.classList.remove('open');
    if (dom.chatInput) dom.chatInput.value = '';
    clearSelectedSticker();
  }

  function onLanguageChanged() {
    updatePlaceholder();
    if (state.stickersCache !== null) {
      renderStickerGrid();
    }
  }

  function onWindowResize() {
    if (dom.stickerPickerPanel && dom.stickerPickerPanel.classList.contains('open')) {
      requestAnimationFrame(syncStickerGridSquareRows);
    }
  }

  function setupStickerChrome() {
    if (!document.getElementById('cosmo-swap-sticker-style')) {
      const style = document.createElement('style');
      style.id = 'cosmo-swap-sticker-style';
      style.textContent = `
        .chat-composer-wrapper .selected-sticker-bar,
        .chat-composer-wrapper #selected-sticker-bar {
          order: 1;
          align-self: center;
          margin-left: auto;
          margin-right: auto;
        }
        .chat-composer-wrapper .sticker-picker-panel,
        .chat-composer-wrapper #sticker-picker-panel {
          order: 2;
        }
        .chat-composer-wrapper .composer-bar {
          order: 3;
        }
        .chat-composer-wrapper #btn-scroll-to-bottom {
          order: 0;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    const wrapper = dom.composerWrapper || document.querySelector('.chat-composer-wrapper');
    const panel = dom.stickerPickerPanel || document.getElementById('sticker-picker-panel');
    const bar = dom.selectedStickerBar || document.getElementById('selected-sticker-bar');

    if (panel && !panel.querySelector('.sticker-panel-close-x')) {
      const header = panel.querySelector('.sticker-picker-header') || panel.firstElementChild;
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'icon-btn sticker-panel-close-x';
      closeBtn.title = 'Close';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.textContent = '✕';
      closeBtn.style.marginLeft = 'auto';
      closeBtn.style.width = '28px';
      closeBtn.style.height = '28px';
      closeBtn.style.minWidth = '28px';
      closeBtn.style.minHeight = '28px';
      closeBtn.style.fontSize = '15px';
      closeBtn.style.color = '#e5e5ea';
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        panel.classList.remove('open');
      });
      if (header) {
        header.appendChild(closeBtn);
      } else {
        panel.insertBefore(closeBtn, panel.firstChild);
      }
    }

    if (bar && !bar.querySelector('.selected-sticker-close-x')) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'selected-sticker-close-x';
      removeBtn.title = 'Remove sticker';
      removeBtn.setAttribute('aria-label', 'Remove sticker');
      removeBtn.textContent = '✕';
      removeBtn.style.position = 'absolute';
      removeBtn.style.top = '8px';
      removeBtn.style.right = '8px';
      removeBtn.style.width = '28px';
      removeBtn.style.height = '28px';
      removeBtn.style.padding = '0';
      removeBtn.style.border = 'none';
      removeBtn.style.borderRadius = '50%';
      removeBtn.style.background = 'transparent';
      removeBtn.style.color = 'rgba(255, 255, 255, 0.85)';
      removeBtn.style.fontSize = '16px';
      removeBtn.style.lineHeight = '1';
      removeBtn.style.display = 'inline-flex';
      removeBtn.style.alignItems = 'center';
      removeBtn.style.justifyContent = 'center';
      removeBtn.style.cursor = 'pointer';
      removeBtn.style.zIndex = '2';

      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearSelectedSticker();
        if (dom.chatInput) {
          dom.chatInput.focus();
        }
      });

      bar.appendChild(removeBtn);
    }

    if (wrapper && bar && panel && bar.parentElement === wrapper && panel.parentElement === wrapper) {
      if (bar.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_PRECEDING) {
        wrapper.insertBefore(bar, panel);
      }
      bar.style.alignSelf = 'center';
      bar.style.marginLeft = 'auto';
      bar.style.marginRight = 'auto';
    }
  }

  function init(options = {}) {
    callbacks = { ...callbacks, ...options };

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

    setupStickerChrome();
    clearSelectedSticker();
  }

  return {
    init,
    reset,
    clearSelectedSticker,
    setVisible,
    ensureRemainingCountIfNeeded,
    onLanguageChanged,
    onWindowResize,
  };
})();

if (typeof window !== 'undefined') {
  window.CosmoComposer = CosmoComposer;
}
