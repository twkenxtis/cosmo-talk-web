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
/* --- SPLIT FROM APP.JS: TOPBAR TRANSLATE TOGGLE & SILENT CURRENT-MEMBER BLOB PREFETCH --- */
(() => {
  if (typeof window === 'undefined' || typeof CosmoTranslate === 'undefined') return;
  if (window.__COSMO_SPLIT_TRANSLATE_EXT_INIT__) return;
  window.__COSMO_SPLIT_TRANSLATE_EXT_INIT__ = true;

  const BTN_ID = 'btn-toggle-translate';
  const SVG_ICON_HTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'class="icon icon-tabler icons-tabler-outline icon-tabler-language" aria-hidden="true">' +
    '<path stroke="none" d="M0 0h24v24H0z" fill="none"/>' +
    '<path d="M4 5h7" /><path d="M9 3v2c0 4.418 -2.239 8 -5 8" />' +
    '<path d="M5 9c0 2.144 2.952 3.908 6.7 4" /><path d="M12 20l4 -9l4 9" />' +
    '<path d="M19.1 18h-6.2" /></svg>';

  function findTargetToolbar() {
    const searchBtn = document.getElementById('cosmo-member-search-btn') || document.querySelector('[data-action="search"], .search-btn');
    if (searchBtn && searchBtn.parentElement) return { parent: searchBtn.parentElement, anchor: searchBtn };
    for (const sel of ['#chat-header .header-actions', '#chat-header', '.chat-header', '#topbar']) {
      const el = document.querySelector(sel);
      if (el) return { parent: el, anchor: null };
    }
    return null;
  }

  function ensureTranslateButton() {
    const loc = findTargetToolbar();
    if (!loc || !loc.parent) return;
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = BTN_ID;
      btn.className = 'icon-btn btn-toggle-translate';
      btn.title = 'Translate (ON/OFF)';
      btn.setAttribute('aria-label', 'Translate (ON/OFF)');
      btn.innerHTML = SVG_ICON_HTML;
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof CosmoTranslate.toggle === 'function') CosmoTranslate.toggle();
      });
    }
    if (btn.parentElement !== loc.parent) {
      if (loc.anchor && loc.anchor.parentElement === loc.parent) {
        loc.anchor.insertAdjacentElement('afterend', btn);
      } else {
        loc.parent.appendChild(btn);
      }
    }
    const isOn = typeof CosmoTranslate.isEnabled === 'function' ? Boolean(CosmoTranslate.isEnabled()) : false;
    btn.dataset.translateOn = isOn ? '1' : '0';
    btn.classList.toggle('active', isOn);
    btn.classList.toggle('is-active', isOn);
  }

  ensureTranslateButton();
  const mo = new MutationObserver(() => ensureTranslateButton());
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();
/* --- SAFARI SAFE TRANSLATE BUTTON ICON SYNC --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_SAFARI_TRANSLATE_ICON_INIT__) return;
  window.__COSMO_SAFARI_TRANSLATE_ICON_INIT__ = true;

  const BTN_ID = 'btn-toggle-translate';
  const SAFARI_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true" style="width:20px;height:20px;min-width:20px;min-height:20px;display:block;flex-shrink:0;">' +
    '<path stroke="none" d="M0 0h24v24H0z" fill="none"/>' +
    '<path d="M4 5h7" /><path d="M9 3v2c0 4.418 -2.239 8 -5 8" />' +
    '<path d="M5 9c0 2.144 2.952 3.908 6.7 4" /><path d="M12 20l4 -9l4 9" />' +
    '<path d="M19.1 18h-6.2" /></svg>';

  function syncSafariTranslateIcon() {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    if (!btn.querySelector('svg')) {
      btn.innerHTML = SAFARI_SVG;
    }
    const svg = btn.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', '20');
      svg.setAttribute('height', '20');
      svg.style.width = '20px';
      svg.style.height = '20px';
      svg.style.display = 'block';
      svg.style.flexShrink = '0';
    }
  }

  syncSafariTranslateIcon();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncSafariTranslateIcon, { once: true });
  }
  const mo = new MutationObserver(() => syncSafariTranslateIcon());
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();

/* --- NO-SCROLL TRANSLATION RENDER, BLOB CACHE & CURSOR-AWARE BATCH RUNNER --- */
(() => {
  if (typeof window === 'undefined' || typeof CosmoTranslate === 'undefined') return;
  if (window.__COSMO_NOSCROLL_CURSOR_TRANSLATE_INIT__) return;
  window.__COSMO_NOSCROLL_CURSOR_TRANSLATE_INIT__ = true;

  const MAX_BLOB_ENTRIES = 800;
  const BATCH_SIZE = 25;
  const CONCURRENCY = 3;
  const STREAM_TIMEOUT_MS = 12000;

  const blobStore =
    window.__COSMO_SILENT_BLOB_STORE__ instanceof Map
      ? window.__COSMO_SILENT_BLOB_STORE__
      : (window.__COSMO_SILENT_BLOB_STORE__ = new Map());
  const blobUrlPool = Array.isArray(window.__COSMO_BLOB_URL_POOL__)
    ? window.__COSMO_BLOB_URL_POOL__
    : (window.__COSMO_BLOB_URL_POOL__ = []);

  // 記錄各成員已處理到的最新 cursor，供每批次結束時比對
  const latestKnownCursorByMember = new Map();
  const runningMemberSet = new Set();
  const abortByMember = new Map();

  function parseNumericCursor(raw) {
    if (raw === undefined || raw === null) return 0;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
    const digits = String(raw).replace(/\D+/g, '');
    return digits ? Number(digits) : 0;
  }

  function extractLatestCursorFromMember(member) {
    if (!member || typeof member !== 'object') return 0;
    let maxCursor = parseNumericCursor(member.latestCursor ?? member.cursor ?? 0);
    const records = Array.isArray(member.records) ? member.records : [];
    for (let i = records.length - 1; i >= Math.max(0, records.length - 30); i--) {
      const rec = records[i];
      if (!rec) continue;
      const msg = rec.message && typeof rec.message === 'object' ? rec.message : rec;
      const c = parseNumericCursor(rec.cursor ?? msg?.cursor ?? rec.sourceId ?? msg?.sourceId);
      if (c > maxCursor) maxCursor = c;
    }
    return maxCursor;
  }

  function updateKnownMemberCursor(member) {
    if (!member) return 0;
    const mid = String(member.artistMemberId ?? member.id ?? '').trim();
    if (!mid) return 0;
    const latest = extractLatestCursorFromMember(member);
    const prev = latestKnownCursorByMember.get(mid) || 0;
    if (latest > prev) {
      latestKnownCursorByMember.set(mid, latest);
    }
    return latestKnownCursorByMember.get(mid) || latest;
  }

  // 1. 捲動錨點鎖定器：在 DOM 插入翻譯節點前後維持閱讀視窗完全不跳動
  function captureScrollAnchor() {
    const chatEl = document.getElementById('chat');
    if (!chatEl) return null;

    const chatRect = chatEl.getBoundingClientRect();
    const wrappers = chatEl.querySelectorAll('.msg-wrapper[data-source-id]');
    let anchorEl = null;
    let anchorTopOffset = 0;

    for (let i = 0; i < wrappers.length; i++) {
      const el = wrappers[i];
      const rect = el.getBoundingClientRect();
      if (rect.bottom >= chatRect.top + 4) {
        anchorEl = el;
        anchorTopOffset = rect.top - chatRect.top;
        break;
      }
    }

    return {
      chatEl,
      scrollTop: chatEl.scrollTop,
      scrollHeight: chatEl.scrollHeight,
      anchorSid: anchorEl ? anchorEl.getAttribute('data-source-id') : null,
      anchorTopOffset,
      prevScrollBehavior: chatEl.style.scrollBehavior,
    };
  }

  function restoreScrollAnchor(snap) {
    if (!snap || !snap.chatEl) return;
    const { chatEl, anchorSid, anchorTopOffset, scrollTop, prevScrollBehavior } = snap;
    chatEl.style.scrollBehavior = 'auto';

    if (anchorSid) {
      const target = chatEl.querySelector(`.msg-wrapper[data-source-id="${CSS.escape(anchorSid)}"]`);
      if (target) {
        const chatRect = chatEl.getBoundingClientRect();
        const nextOffset = target.getBoundingClientRect().top - chatRect.top;
        const delta = nextOffset - anchorTopOffset;
        if (Math.abs(delta) > 0.5) {
          chatEl.scrollTop += delta;
        }
        chatEl.style.scrollBehavior = prevScrollBehavior || '';
        return;
      }
    }

    chatEl.scrollTop = scrollTop;
    chatEl.style.scrollBehavior = prevScrollBehavior || '';
  }

  function runWithNoScroll(fn) {
    const snap = captureScrollAnchor();
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.finally(() => {
        requestAnimationFrame(() => restoreScrollAnchor(snap));
      });
    }
    restoreScrollAnchor(snap);
    requestAnimationFrame(() => restoreScrollAnchor(snap));
    return res;
  }

  // 包裝 CosmoTranslate 的 DOM 渲染方法，確保開啟/補繪翻譯時畫面完全不捲動
  for (const methodName of ['renderCachedForCurrentView', 'applyTranslationsToDom', 'setEnabled', 'toggle']) {
    if (typeof CosmoTranslate[methodName] === 'function') {
      const orig = CosmoTranslate[methodName].bind(CosmoTranslate);
      CosmoTranslate[methodName] = function wrappedNoScrollMethod(...args) {
        return runWithNoScroll(() => orig(...args));
      };
    }
  }

  // 攔截 .msg-wrapper 內翻譯子節點插入，即時回補捲動差值
  function installChatDomScrollLockObserver() {
    const chatEl = document.getElementById('chat');
    if (!chatEl || chatEl.dataset.cosmoScrollLockObserved === '1') return;
    chatEl.dataset.cosmoScrollLockObserved = '1';

    let pendingSnap = null;
    let lockRaf = null;

    const mo = new MutationObserver((mutations) => {
      let touchedTranslation = false;
      for (const m of mutations) {
        if (m.type !== 'childList') continue;
        for (const node of m.addedNodes) {
          if (
            node &&
            node.nodeType === 1 &&
            (node.classList?.contains('cosmo-translated-text') ||
              node.querySelector?.('.cosmo-translated-text'))
          ) {
            touchedTranslation = true;
            break;
          }
        }
        if (touchedTranslation) break;
      }
      if (!touchedTranslation) return;

      if (!pendingSnap) {
        pendingSnap = captureScrollAnchor();
      }
      if (lockRaf !== null) return;
      lockRaf = requestAnimationFrame(() => {
        const snap = pendingSnap;
        pendingSnap = null;
        lockRaf = null;
        restoreScrollAnchor(snap);
      });
    });

    mo.observe(chatEl, { childList: true, subtree: true });
  }

  // 2. 寫入翻譯結果到 Blob 快取
  function saveTranslationToBlob(mid, sid, translatedContent, cursorVal = 0) {
    const text = String(translatedContent ?? '').trim();
    if (!text) return null;

    const payload = JSON.stringify({
      memberId: String(mid),
      messageId: String(sid),
      cursor: cursorVal,
      translatedContent: text,
      updatedAt: Date.now(),
    });
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const blobUrl =
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(blob)
        : null;

    if (blobUrl) {
      blobUrlPool.push(blobUrl);
      while (blobUrlPool.length > MAX_BLOB_ENTRIES) {
        const old = blobUrlPool.shift();
        if (old) {
          try { URL.revokeObjectURL(old); } catch (_) {}
        }
      }
    }

    const key = `${mid}:${sid}`;
    const prev = blobStore.get(key);
    if (prev?.blobUrl && prev.blobUrl !== blobUrl) {
      try { URL.revokeObjectURL(prev.blobUrl); } catch (_) {}
    }

    const entry = {
      memberId: String(mid),
      messageId: String(sid),
      cursor: cursorVal,
      translatedContent: text,
      blob,
      blobUrl,
    };
    blobStore.set(key, entry);
    return entry;
  }

  async function readStreamText(resp, signal) {
    if (!resp.body || typeof resp.body.getReader !== 'function') {
      return await resp.text();
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let out = '';
    const timer = setTimeout(() => {
      try { reader.cancel('timeout'); } catch (_) {}
    }, STREAM_TIMEOUT_MS);

    try {
      while (true) {
        if (signal?.aborted) {
          try { reader.cancel('aborted'); } catch (_) {}
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (value) out += decoder.decode(value, { stream: true });
      }
      out += decoder.decode();
      return out;
    } finally {
      clearTimeout(timer);
      try { reader.releaseLock(); } catch (_) {}
    }
  }

  async function fetchSingleTranslationToBlob(mid, sid, cursorVal, signal) {
    const key = `${mid}:${sid}`;
    if (blobStore.has(key)) return blobStore.get(key);

    if (typeof CosmoTranslate.getCached === 'function') {
      const cached = CosmoTranslate.getCached(mid, sid);
      if (cached?.translatedContent) {
        return saveTranslationToBlob(mid, sid, cached.translatedContent, cursorVal);
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
        const dict = json?.translations || {};
        const hit = dict[sid] || dict[String(Number(sid))];
        if (hit?.translatedContent) {
          return saveTranslationToBlob(mid, sid, hit.translatedContent, cursorVal);
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

      if (!resp || resp.status !== 200) return null;
      const raw = await readStreamText(resp, signal);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const transText = String(parsed?.translatedContent ?? '').trim();
      if (!transText) return null;
      return saveTranslationToBlob(mid, parsed?.messageId ?? sid, transText, cursorVal);
    } catch (_) {
      return null;
    }
  }

  function buildSortedPendingItems(member) {
    const mid = String(member?.artistMemberId ?? member?.id ?? '').trim();
    if (!mid) return { mid: '', items: [], latestCursor: 0 };

    const latestCursor = updateKnownMemberCursor(member);
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
      if (blobStore.has(`${mid}:${sid}`)) continue;

      const cursorVal = parseNumericCursor(rec.cursor ?? msg.cursor ?? sid);
      items.push({ memberId: mid, sourceId: sid, cursorVal, orderIdx: i });
    }

    items.sort((a, b) => (b.cursorVal !== a.cursorVal ? b.cursorVal - a.cursorVal : b.orderIdx - a.orderIdx));
    return { mid, items, latestCursor };
  }

  // 3. 靜默翻譯執行器：每跑完一個 batch 檢查最新訊息指標 cursor，若有更新則優先從最新 cursor 重跑
  async function runSilentBatchTranslateWithCursorCheck(member, { getLatestMember } = {}) {
    if (!member) return;
    const mid = String(member.artistMemberId ?? member.id ?? '').trim();
    if (!mid) return;

    updateKnownMemberCursor(member);
    if (runningMemberSet.has(mid)) return;

    runningMemberSet.add(mid);
    const controller = new AbortController();
    abortByMember.set(mid, controller);

    try {
      let currentMemberSnapshot = member;
      let restartFromNewestCursor = true;

      while (restartFromNewestCursor && !controller.signal.aborted) {
        restartFromNewestCursor = false;
        const { items, latestCursor: runStartCursor } = buildSortedPendingItems(currentMemberSnapshot);
        if (!items.length) break;

        for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
          if (controller.signal.aborted) break;
          const batch = items.slice(offset, offset + BATCH_SIZE);
          let cursorIdx = 0;

          async function worker() {
            while (cursorIdx < batch.length && !controller.signal.aborted) {
              const item = batch[cursorIdx++];
              await fetchSingleTranslationToBlob(
                item.memberId,
                item.sourceId,
                item.cursorVal,
                controller.signal
              );
            }
          }

          await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker)
          );

          // 若目前翻譯開關為開啟狀態，以鎖定捲動的方式無感渲染剛完成的批次譯文
          if (
            typeof CosmoTranslate.isEnabled === 'function' &&
            CosmoTranslate.isEnabled() &&
            typeof CosmoTranslate.renderCachedForCurrentView === 'function'
          ) {
            runWithNoScroll(() => CosmoTranslate.renderCachedForCurrentView());
          }

          // 每跑完一個批次，檢查最新訊息指標 cursor 是否已有推進
          const freshestMember =
            typeof getLatestMember === 'function' ? getLatestMember(mid) : null;
          const freshestCursor = freshestMember
            ? updateKnownMemberCursor(freshestMember)
            : (latestKnownCursorByMember.get(mid) || runStartCursor);

          if (freshestCursor > runStartCursor) {
            currentMemberSnapshot = freshestMember || currentMemberSnapshot;
            restartFromNewestCursor = true;
            break;
          }

          await new Promise((r) => setTimeout(r, 20));
        }
      }
    } finally {
      runningMemberSet.delete(mid);
      if (abortByMember.get(mid) === controller) {
        abortByMember.delete(mid);
      }
    }
  }

  if (typeof CosmoTranslate.setMemberContext === 'function') {
    const origSetMember = CosmoTranslate.setMemberContext.bind(CosmoTranslate);
    CosmoTranslate.setMemberContext = function wrappedSetMember(member, ...rest) {
      const res = origSetMember(member, ...rest);
      if (member) {
        updateKnownMemberCursor(member);
        runSilentBatchTranslateWithCursorCheck(member);
      }
      return res;
    };
  }

  installChatDomScrollLockObserver();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installChatDomScrollLockObserver, { once: true });
  }

  window.CosmoSilentTranslate = Object.assign(window.CosmoSilentTranslate || {}, {
    runSilentBatchTranslateWithCursorCheck,
    runOnceForCurrentMember: (member, opts) => runSilentBatchTranslateWithCursorCheck(member, opts),
    updateKnownMemberCursor,
    getKnownCursor: (mid) => latestKnownCursorByMember.get(String(mid)) || 0,
    runWithNoScroll,
    getSilentBlobEntry: (mid, sid) => blobStore.get(`${String(mid)}:${String(sid)}`) || null,
  });
})();

/* --- STRICT NO-SCROLL LOCK DURING TRANSLATION RENDER & DOM INSERTION --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_STRICT_NO_SCROLL_TRANSLATE_INIT__) return;
  window.__COSMO_STRICT_NO_SCROLL_TRANSLATE_INIT__ = true;

  let freezeScrollUntil = 0;

  function getScrollTargets() {
    const list = [];
    const chat = document.getElementById('chat');
    if (chat) list.push(chat);
    const se = document.scrollingElement || document.documentElement;
    if (se && !list.includes(se)) list.push(se);
    if (document.body && !list.includes(document.body)) list.push(document.body);
    return list;
  }

  function captureAnchor() {
    const chat = document.getElementById('chat');
    const sc = chat && chat.scrollHeight > chat.clientHeight + 2
      ? chat
      : (document.scrollingElement || document.documentElement);

    let anchorEl = null;
    let anchorTop = 0;
    if (chat) {
      const cRect = chat.getBoundingClientRect();
      const items = chat.querySelectorAll('.msg-wrapper, [data-source-id], [data-message-id]');
      for (const el of items) {
        const r = el.getBoundingClientRect();
        if (r.bottom > cRect.top + 8 && r.top < cRect.bottom) {
          anchorEl = el;
          anchorTop = r.top - cRect.top;
          break;
        }
      }
    }

    return {
      sc,
      scrollTop: sc ? sc.scrollTop : 0,
      anchorEl,
      anchorTop,
    };
  }

  function restoreAnchor(snap) {
    if (!snap || !snap.sc) return;
    const { sc, scrollTop, anchorEl, anchorTop } = snap;
    const prevBehavior = sc.style.scrollBehavior;
    sc.style.scrollBehavior = 'auto';

    if (anchorEl && anchorEl.isConnected) {
      const chat = document.getElementById('chat');
      const baseTop = chat ? chat.getBoundingClientRect().top : 0;
      const nowTop = anchorEl.getBoundingClientRect().top - baseTop;
      const diff = nowTop - anchorTop;
      if (Math.abs(diff) > 0.5) {
        sc.scrollTop += diff;
      }
    } else {
      sc.scrollTop = scrollTop;
    }

    sc.style.scrollBehavior = prevBehavior || '';
  }

  // 在翻譯渲染視窗內，攔截非使用者主動捲動的 scrollTop 改寫
  if (typeof Element !== 'undefined' && Element.prototype) {
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    if (desc && typeof desc.set === 'function' && !desc.set.__cosmoLockedSet) {
      const origSet = desc.set;
      Object.defineProperty(Element.prototype, 'scrollTop', {
        configurable: true,
        get: desc.get,
        set(val) {
          if (Date.now() < freezeScrollUntil && (this.id === 'chat' || this === document.documentElement || this === document.body)) {
            return;
          }
          return origSet.call(this, val);
        },
      });
    }
  }

  function runFrozen(fn) {
    const snap = captureAnchor();
    freezeScrollUntil = Date.now() + 250;
    try {
      const res = fn();
      restoreAnchor(snap);
      requestAnimationFrame(() => {
        restoreAnchor(snap);
        requestAnimationFrame(() => {
          restoreAnchor(snap);
          freezeScrollUntil = 0;
        });
      });
      return res;
    } catch (e) {
      freezeScrollUntil = 0;
      throw e;
    }
  }

  if (typeof CosmoTranslate !== 'undefined') {
    for (const name of ['toggle', 'setEnabled', 'renderCachedForCurrentView', 'applyTranslationsToDom']) {
      if (typeof CosmoTranslate[name] === 'function' && !CosmoTranslate[name].__cosmoStrictNoScroll) {
        const orig = CosmoTranslate[name].bind(CosmoTranslate);
        const wrapped = function (...args) {
          return runFrozen(() => orig(...args));
        };
        wrapped.__cosmoStrictNoScroll = true;
        CosmoTranslate[name] = wrapped;
      }
    }
  }

  const origForceRender = window.CosmoForceRenderTranslations;
  if (typeof origForceRender === 'function' && !origForceRender.__cosmoStrictNoScroll) {
    const wrappedForce = function (...args) {
      return runFrozen(() => origForceRender(...args));
    };
    wrappedForce.__cosmoStrictNoScroll = true;
    window.CosmoForceRenderTranslations = wrappedForce;
  }

  window.CosmoFreezeTranslationScroll = runFrozen;
})();
