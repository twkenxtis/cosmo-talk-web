const CosmoTranslate = (() => {
  'use strict';

  const BATCH_SIZE = 130;
  const API_BASE = 'https://api.cosmo.fans';

  // 純記憶體 + Blob 快取（頁面重新整理即消失）
  const blobCache = new Map(); // key: `${memberId}:${messageId}` -> { messageId, translatedContent, blob, blobUrl }
  const attemptedKeys = new Set();
  const inflightKeys = new Set();

  let enabled = false;
  let currentMemberId = null;
  let candidateQueue = [];
  let nextIndex = 0;
  let isBatchRunning = false;
  let stateListeners = [];

  let demoDictPromise = null;

  function isDemoTranslateMode() {
    return (
      typeof window !== 'undefined' &&
      window.__FORCE_PROD_SESSION__ !== true &&
      window.IS_DEMO_MODE === true
    );
  }

  async function loadDemoTranslations() {
    if (!demoDictPromise) {
      demoDictPromise = fetch('demo/demo_translate.json', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : { translations: {} }))
        .then((json) => (json && typeof json.translations === 'object' ? json.translations : {}))
        .catch(() => ({}));
    }
    return demoDictPromise;
  }

  function notifyErrorToast(errText) {
    const msg = String(errText || 'Unknown error');
    if (typeof CosmoToast !== 'undefined') {
      if (typeof CosmoToast.error === 'function') return CosmoToast.error(msg);
      if (typeof CosmoToast.show === 'function') return CosmoToast.show(msg);
      if (typeof CosmoToast === 'function') return CosmoToast(msg);
    }
    console.error('[Translate API Error]', msg);
  }

  function notifyStateChange() {
    for (const fn of stateListeners) {
      try { fn(enabled); } catch (_) {}
    }
  }

  function storeInBlob(memberId, messageId, translatedContent) {
    const mid = String(memberId);
    const msgId = String(messageId);
    const key = `${mid}:${msgId}`;

    const prev = blobCache.get(key);
    if (prev?.blobUrl) {
      try { URL.revokeObjectURL(prev.blobUrl); } catch (_) {}
    }

    const text = String(translatedContent ?? '');
    const blob = new Blob(
      [JSON.stringify({ messageId: msgId, translatedContent: text })],
      { type: 'application/json;charset=utf-8' }
    );
    const blobUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(blob)
      : null;

    const record = {
      messageId: msgId,
      translatedContent: text,
      blob,
      blobUrl,
    };
    blobCache.set(key, record);
    return record;
  }

  function getCached(memberId, messageId) {
    if (!memberId || !messageId) return null;
    return blobCache.get(`${String(memberId)}:${String(messageId)}`) || null;
  }

  function extractSourceId(rec, msg) {
    if (msg?.sourceId !== undefined && msg?.sourceId !== null && String(msg.sourceId).trim() !== '') {
      return String(msg.sourceId).trim();
    }
    if (rec?.sourceId !== undefined && rec?.sourceId !== null && String(rec.sourceId).trim() !== '') {
      return String(rec.sourceId).trim();
    }
    if (typeof msg?.syncId === 'string' && msg.syncId.includes(':')) {
      return msg.syncId.split(':').pop().trim();
    }
    return '';
  }

  function parseCursorValue(rec, msg, fallbackIdx) {
    const raw = rec?.cursor ?? msg?.cursor ?? extractSourceId(rec, msg) ?? String(fallbackIdx);
    const num = Number(raw);
    if (Number.isFinite(num)) return num;
    const digits = String(raw).replace(/\D+/g, '');
    return digits ? Number(digits) : fallbackIdx;
  }

  function isTargetArtistText(msg) {
    if (!msg || typeof msg !== 'object') return false;
    return msg.messageType === 'text' && msg.senderType === 'artistMember';
  }

  function buildQueueFromMember(member) {
    const mid = member?.artistMemberId ?? member?.id ?? '';
    const records = Array.isArray(member?.records) ? member.records : [];
    const list = [];

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (!rec || rec.op === 'delete') continue;
      const msg = rec.message && typeof rec.message === 'object' ? rec.message : rec;
      if (!isTargetArtistText(msg)) continue;

      const sourceId = extractSourceId(rec, msg);
      if (!sourceId) continue;

      const memberId = String(msg.artistMemberId ?? mid ?? '');
      if (!memberId) continue;

      list.push({
        memberId,
        sourceId,
        cursorVal: parseCursorValue(rec, msg, i),
        orderIdx: i,
      });
    }

    // cursor 由大到小（最新 / 最後一則優先）
    list.sort((a, b) => {
      if (b.cursorVal !== a.cursorVal) return b.cursorVal - a.cursorVal;
      return b.orderIdx - a.orderIdx;
    });

    return {
      memberId: mid ? String(mid) : null,
      items: list,
    };
  }

  function applyTranslationToDom(memberId, messageId, translatedContent) {
    if (!enabled) return;
    const msgId = String(messageId || '').trim();
    const transText = String(translatedContent ?? '');
    if (!msgId || !transText) return;

    const mid = String(memberId || currentMemberId || '');
    const selector = mid
      ? `[data-source-id="${CSS.escape(msgId)}"][data-artist-member-id="${CSS.escape(mid)}"]`
      : `[data-source-id="${CSS.escape(msgId)}"]`;

    const wrapEl = document.querySelector(selector) || document.querySelector(`[data-source-id="${CSS.escape(msgId)}"]`);
    if (!wrapEl) return;

    const bubble = wrapEl.querySelector('.bubble');
    if (!bubble) return;

    // 保留原始文字最後一個字元，換行後直接顯示譯文（不空一行）
    let origSpan = bubble.querySelector('.cosmo-orig-text');
    if (!origSpan) {
      const rawContent = String(bubble.textContent || '');
      origSpan = document.createElement('span');
      origSpan.className = 'cosmo-orig-text';
      origSpan.dataset.rawText = rawContent;
      origSpan.textContent = rawContent;
      bubble.textContent = '';
      bubble.appendChild(origSpan);
    }

    const baseText = origSpan.dataset.rawText ?? String(origSpan.textContent || '');
    origSpan.textContent = baseText;

    let transEl = bubble.querySelector('.cosmo-translated-text');
    if (!transEl) {
      transEl = document.createElement('span');
      transEl.className = 'cosmo-translated-text';
      transEl.style.display = 'block';
      transEl.style.margin = '0';
      transEl.style.padding = '0';
      transEl.style.whiteSpace = 'pre-line';
      bubble.appendChild(transEl);
    }
    transEl.textContent = transText;
  }

  function clearAllTranslationsFromDom() {
    document.querySelectorAll('.cosmo-translated-text').forEach((el) => el.remove());
    document.querySelectorAll('.bubble .cosmo-orig-text').forEach((span) => {
      const bubble = span.parentElement;
      const raw = span.dataset.rawText ?? String(span.textContent || '');
      if (bubble) {
        bubble.textContent = raw;
      }
    });
  }

  function renderCachedForCurrentView() {
    if (!enabled) return;
    document.querySelectorAll('[data-source-id]').forEach((wrapEl) => {
      const sid = wrapEl.getAttribute('data-source-id') || '';
      const mid = wrapEl.getAttribute('data-artist-member-id') || currentMemberId || '';
      if (!sid || !mid) return;
      const cached = getCached(mid, sid);
      if (cached) {
        applyTranslationToDom(mid, cached.messageId || sid, cached.translatedContent);
      }
    });
  }

  async function fetchTranslationForItem(memberId, sourceId) {
    const mid = String(memberId);
    const sid = String(sourceId);
    const key = `${mid}:${sid}`;

    if (blobCache.has(key)) {
      const existing = blobCache.get(key);
      if (enabled) {
        applyTranslationToDom(mid, existing.messageId || sid, existing.translatedContent);
      }
      return existing;
    }

    if (attemptedKeys.has(key) || inflightKeys.has(key)) {
      return null;
    }

    inflightKeys.add(key);
    attemptedKeys.add(key);

    if (isDemoTranslateMode()) {
      try {
        const dict = await loadDemoTranslations();
        const entry = dict[sid] || dict[String(Number(sid))] || null;
        if (!entry || !entry.translatedContent) {
          return null;
        }
        const responseMsgId = String(entry.messageId ?? sid);
        const translatedContent = String(entry.translatedContent ?? '');
        const record = storeInBlob(mid, responseMsgId, translatedContent);
        if (enabled) {
          applyTranslationToDom(mid, responseMsgId, translatedContent);
        }
        return record;
      } finally {
        inflightKeys.delete(key);
      }
    }

    const url = `${API_BASE}/bff/v3/channels/messages/${encodeURIComponent(mid)}/${encodeURIComponent(sid)}/translated-contents`;

    try {
      const resp =
        typeof CosmoAuth !== 'undefined' && typeof CosmoAuth.authorizedFetch === 'function'
          ? await CosmoAuth.authorizedFetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
          : await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, referrerPolicy: 'no-referrer' });

      if (resp.status === 404) {
        return null;
      }

      const rawBody = await resp.text();
      if (resp.status !== 200) {
        notifyErrorToast(rawBody || `HTTP ${resp.status}`);
        return null;
      }

      let parsed = null;
      try {
        parsed = JSON.parse(rawBody);
      } catch (parseErr) {
        notifyErrorToast(rawBody || parseErr.message);
        return null;
      }

      const responseMsgId = String(parsed?.messageId ?? sid);
      const translatedContent = String(parsed?.translatedContent ?? '');
      const record = storeInBlob(mid, responseMsgId, translatedContent);

      if (enabled) {
        applyTranslationToDom(mid, responseMsgId, translatedContent);
      }
      return record;
    } catch (err) {
      notifyErrorToast(err?.message || String(err));
      return null;
    } finally {
      inflightKeys.delete(key);
    }
  }

  async function requestNextBatch() {
    if (!enabled || isBatchRunning) return;
    if (!currentMemberId || nextIndex >= candidateQueue.length) return;

    isBatchRunning = true;
    try {
      const batch = [];
      while (batch.length < BATCH_SIZE && nextIndex < candidateQueue.length) {
        batch.push(candidateQueue[nextIndex++]);
      }
      if (batch.length === 0) return;

      const concurrency = 6;
      let ptr = 0;
      async function worker() {
        while (ptr < batch.length && enabled) {
          const item = batch[ptr++];
          await fetchTranslationForItem(item.memberId || currentMemberId, item.sourceId);
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, worker));
    } finally {
      isBatchRunning = false;
    }
  }

  function setMemberContext(member) {
    if (!member) {
      currentMemberId = null;
      candidateQueue = [];
      nextIndex = 0;
      return;
    }
    const built = buildQueueFromMember(member);
    const prevMid = currentMemberId;
    currentMemberId = built.memberId;

    // 切換到不同成員時才重置；同一成員若只是重新 renderChat（例如跳轉），保留進度並補齊新訊息
    if (!prevMid || String(prevMid) !== String(currentMemberId)) {
      candidateQueue = built.items;
      nextIndex = 0;
    } else if (candidateQueue.length === 0) {
      candidateQueue = built.items;
      nextIndex = 0;
    } else {
      const existingIds = new Set(candidateQueue.map((x) => `${x.memberId}:${x.sourceId}`));
      const appended = built.items.filter((x) => !existingIds.has(`${x.memberId}:${x.sourceId}`));
      if (appended.length > 0) {
        candidateQueue = [...appended, ...candidateQueue].sort((a, b) =>
          b.cursorVal !== a.cursorVal ? b.cursorVal - a.cursorVal : b.orderIdx - a.orderIdx
        );
        nextIndex = Math.min(nextIndex + appended.length, candidateQueue.length);
      }
    }

    if (enabled && currentMemberId) {
      renderCachedForCurrentView();
      requestNextBatch();
    }
  }

  function setEnabled(nextVal) {
    const next = Boolean(nextVal);
    if (enabled === next) return;
    enabled = next;
    notifyStateChange();

    if (enabled) {
      renderCachedForCurrentView();
      if (currentMemberId && candidateQueue.length > 0) {
        requestNextBatch();
      }
    } else {
      clearAllTranslationsFromDom();
    }
  }

  function toggle() {
    setEnabled(!enabled);
    return enabled;
  }

  function isEnabled() {
    return enabled;
  }

  function onStateChange(fn) {
    if (typeof fn === 'function') {
      stateListeners.push(fn);
    }
  }

  function getProgress() {
    return {
      enabled,
      currentMemberId,
      fetchedCount: nextIndex,
      totalCandidates: candidateQueue.length,
      isBatchRunning,
    };
  }

  return {
    BATCH_SIZE,
    setEnabled,
    toggle,
    isEnabled,
    onStateChange,
    setMemberContext,
    requestNextBatch,
    getCached,
    renderCachedForCurrentView,
    getProgress,
  };
})();

if (typeof window !== 'undefined') {
  window.CosmoTranslate = CosmoTranslate;
}
