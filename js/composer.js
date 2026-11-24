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
    stickerClearBtn: document.getElementById('sticker-clear-btn'),
    selectedStickerBar: document.getElementById('selected-sticker-bar'),
    selectedStickerImg: document.getElementById('selected-sticker-img'),
    selectedStickerRemove: document.getElementById('selected-sticker-remove'),
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
        setSelectedSticker(null);
        renderStickerGrid();

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
    state.selectedSticker = null;
    if (dom.stickerPickerPanel) dom.stickerPickerPanel.classList.remove('open');
    if (dom.selectedStickerBar) dom.selectedStickerBar.style.display = 'none';
    if (dom.chatInput) {
      dom.chatInput.disabled = false;
      dom.chatInput.value = '';
    }
    updateSendButtonState();
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

    setSelectedSticker(null);
    updateSendButtonState();
  }

  return {
    init,
    reset,
    setVisible,
    ensureRemainingCountIfNeeded,
    onLanguageChanged,
    onWindowResize,
  };
})();