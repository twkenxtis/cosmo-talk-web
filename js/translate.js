const CosmoTranslate = (() => {
  "use strict";

  const BATCH_SIZE = 130;
  const API_BASE = "https://api.cosmo.fans";

  // 純記憶體 + Blob 快取（頁面重新整理即消失）
  const blobCache = new Map(); // key: `${memberId}:${messageId}` -> { messageId, translatedContent, blob, blobUrl }
  const attemptedKeys = new Set();
  const inflightKeys = new Set();

  let enabled = false;
  let currentMemberId = null;
  let candidateQueue = [];
  let nextIndex = 0;
  let isBatchRunning = false;
  const stateListeners = [];

  let demoDictPromise = null;

  function isDemoTranslateMode() {
    return (
      typeof window !== "undefined" &&
      window.__FORCE_PROD_SESSION__ !== true &&
      window.IS_DEMO_MODE === true
    );
  }

  async function loadDemoTranslations() {
    if (!demoDictPromise) {
      demoDictPromise = fetch("demo/demo_translate.json", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : { translations: {} }))
        .then((json) => (json && typeof json.translations === "object" ? json.translations : {}))
        .catch(() => ({}));
    }
    return demoDictPromise;
  }

  function notifyErrorToast(errText) {
    const msg = String(errText || "Unknown error");
    if (typeof CosmoToast !== "undefined") {
      if (typeof CosmoToast.error === "function") return CosmoToast.error(msg);
      if (typeof CosmoToast.show === "function") return CosmoToast.show(msg);
      if (typeof CosmoToast === "function") return CosmoToast(msg);
    }
    console.error("[Translate API Error]", msg);
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

    const text = String(translatedContent ?? "");
    const blob = new Blob(
      [JSON.stringify({ messageId: msgId, translatedContent: text })],
      { type: "application/json;charset=utf-8" },
    );
    const blobUrl = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
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
    const mid = String(memberId);
    const sid = String(messageId);
    const direct = blobCache.get(`${mid}:${sid}`);
    if (direct) return direct;
    const silentEntry = window.CosmoSilentTranslate?.getSilentBlobEntry?.(mid, sid);
    if (silentEntry?.translatedContent) {
      return storeInBlob(mid, silentEntry.messageId || sid, silentEntry.translatedContent);
    }
    return null;
  }

  function extractSourceId(rec, msg) {
    if (msg?.sourceId !== undefined && msg?.sourceId !== null && String(msg.sourceId).trim() !== "") {
      return String(msg.sourceId).trim();
    }
    if (rec?.sourceId !== undefined && rec?.sourceId !== null && String(rec.sourceId).trim() !== "") {
      return String(rec.sourceId).trim();
    }
    if (typeof msg?.syncId === "string" && msg.syncId.includes(":")) {
      return msg.syncId.split(":").pop().trim();
    }
    return "";
  }

  function parseCursorValue(rec, msg, fallbackIdx) {
    const raw = rec?.cursor ?? msg?.cursor ?? extractSourceId(rec, msg) ?? String(fallbackIdx);
    const num = Number(raw);
    if (Number.isFinite(num)) return num;
    const digits = String(raw).replace(/\D+/g, "");
    return digits ? Number(digits) : fallbackIdx;
  }

  function isTargetArtistText(msg) {
    if (!msg || typeof msg !== "object") return false;
    return msg.messageType === "text" && msg.senderType === "artistMember";
  }

  function buildQueueFromMember(member) {
    const mid = member?.artistMemberId ?? member?.id ?? "";
    const records = Array.isArray(member?.records) ? member.records : [];
    const list = [];

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (!rec || rec.op === "delete") continue;
      const msg = rec.message && typeof rec.message === "object" ? rec.message : rec;
      if (!isTargetArtistText(msg)) continue;

      const sourceId = extractSourceId(rec, msg);
      if (!sourceId) continue;

      const memberId = String(msg.artistMemberId ?? mid ?? "");
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
    const msgId = String(messageId || "").trim();
    const transText = String(translatedContent ?? "");
    if (!msgId || !transText) return;

    const mid = String(memberId || currentMemberId || "");
    const selector = mid
      ? `[data-source-id="${CSS.escape(msgId)}"][data-artist-member-id="${CSS.escape(mid)}"]`
      : `[data-source-id="${CSS.escape(msgId)}"]`;

    const wrapEl = document.querySelector(selector) || document.querySelector(`[data-source-id="${CSS.escape(msgId)}"]`);
    if (!wrapEl) return;

    const bubble = wrapEl.querySelector(".bubble");
    if (!bubble) return;

    let origSpan = bubble.querySelector(".cosmo-orig-text");
    if (!origSpan) {
      const rawContent = String(bubble.textContent || "");
      origSpan = document.createElement("span");
      origSpan.className = "cosmo-orig-text";
      origSpan.dataset.rawText = rawContent;
      origSpan.textContent = rawContent;
      bubble.textContent = "";
      bubble.appendChild(origSpan);
    }

    const baseText = origSpan.dataset.rawText ?? String(origSpan.textContent || "");
    origSpan.textContent = baseText;

    let transEl = bubble.querySelector(".cosmo-translated-text");
    if (!transEl) {
      transEl = document.createElement("span");
      transEl.className = "cosmo-translated-text";
      transEl.style.display = "block";
      transEl.style.margin = "0";
      transEl.style.padding = "0";
      transEl.style.whiteSpace = "pre-line";
      bubble.appendChild(transEl);
    }
    transEl.textContent = transText;
  }

  function clearAllTranslationsFromDom() {
    document.querySelectorAll(".cosmo-translated-text").forEach((el) => el.remove());
    document.querySelectorAll(".bubble .cosmo-orig-text").forEach((span) => {
      const bubble = span.parentElement;
      const raw = span.dataset.rawText ?? String(span.textContent || "");
      if (bubble) {
        bubble.textContent = raw;
      }
    });
  }

  function renderCachedForCurrentView() {
    if (!enabled) return;
    document.querySelectorAll("[data-source-id]").forEach((wrapEl) => {
      const sid = wrapEl.getAttribute("data-source-id") || "";
      const mid = wrapEl.getAttribute("data-artist-member-id") || currentMemberId || "";
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

    const existing = getCached(mid, sid);
    if (existing) {
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
        const translatedContent = String(entry.translatedContent ?? "");
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
        typeof CosmoAuth !== "undefined" && typeof CosmoAuth.authorizedFetch === "function"
          ? await CosmoAuth.authorizedFetch(url, { method: "GET", headers: { Accept: "application/json" } })
          : await fetch(url, { method: "GET", headers: { Accept: "application/json" }, referrerPolicy: "no-referrer" });

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
      const translatedContent = String(parsed?.translatedContent ?? "");
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
        const cand = candidateQueue[nextIndex++];
        const key = `${cand.memberId || currentMemberId}:${cand.sourceId}`;
        if (!attemptedKeys.has(key) && !getCached(cand.memberId || currentMemberId, cand.sourceId)) {
          batch.push(cand);
        }
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

    // 切換到不同成員時才重置；同一成員新增訊息時將未嘗試的新訊息置頂，不跳過未抓到的舊訊息
    if (!prevMid || String(prevMid) !== String(currentMemberId) || candidateQueue.length === 0) {
      candidateQueue = built.items;
      nextIndex = 0;
    } else {
      const existingIds = new Set(candidateQueue.map((x) => `${x.memberId}:${x.sourceId}`));
      const appended = built.items
        .filter((x) => !existingIds.has(`${x.memberId}:${x.sourceId}`))
        .sort((a, b) => (b.cursorVal !== a.cursorVal ? b.cursorVal - a.cursorVal : b.orderIdx - a.orderIdx));

      if (appended.length > 0) {
        candidateQueue = [...appended, ...candidateQueue];
        // 讓 nextIndex 指向這批新插入的頂端項目（從 0 開始抓新訊息），舊進度靠 attemptedKeys / getCached 自動 O(1) 跳過
        nextIndex = 0;
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
    if (typeof fn === "function") {
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

if (typeof window !== "undefined") {
  window.CosmoTranslate = CosmoTranslate;
}

/* --- CLEAN SINGLE-SOURCE TRANSLATE SCROLL GUARD & SILENT BLOB RUNNER --- */
(() => {
  if (typeof window === "undefined" || typeof CosmoTranslate === "undefined") return;
  if (window.__COSMO_CLEAN_TRANSLATE_SCROLL_GUARD_INIT__) return;
  window.__COSMO_CLEAN_TRANSLATE_SCROLL_GUARD_INIT__ = true;

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

  const latestKnownCursorByMember = new Map();
  const runningMemberSet = new Set();
  const abortByMember = new Map();

  let lastUserInputAt = 0;
  for (const ev of ["wheel", "touchstart", "touchmove", "pointerdown"]) {
    window.addEventListener(ev, () => {
      lastUserInputAt = Date.now();
    }, { passive: true, capture: true });
  }

  function getActiveScroller() {
    const chat = document.getElementById("chat");
    if (chat && chat.scrollHeight > chat.clientHeight + 2) {
      return chat;
    }
    return document.scrollingElement || document.documentElement || document.body;
  }

  function captureHeightState(sc) {
    if (!sc) return null;
    const prevTop = Number(sc.scrollTop || 0);
    const prevHeight = Number(sc.scrollHeight || 0);
    const clientH = Number(sc.clientHeight || 0);
    const wasAtBottom = prevTop + clientH >= prevHeight - 48;
    return { sc, prevTop, prevHeight, wasAtBottom };
  }

  function preservePositionWithoutTopJump(snap) {
    if (!snap || !snap.sc) return;
    if (Date.now() - lastUserInputAt < 160) return;

    const { sc, prevTop, prevHeight, wasAtBottom } = snap;
    const nowHeight = Number(sc.scrollHeight || 0);
    const nowTop = Number(sc.scrollTop || 0);

    if (wasAtBottom) {
      sc.scrollTop = nowHeight;
      return;
    }

    const heightDelta = nowHeight - prevHeight;
    if (Math.abs(heightDelta) > 0.5 && prevTop > 4 && nowTop <= 2) {
      sc.scrollTop = Math.max(0, prevTop + heightDelta);
    } else if (prevTop > 4 && nowTop === 0) {
      sc.scrollTop = prevTop;
    }
  }

  function runSafelyWithoutJump(fn) {
    const sc = getActiveScroller();
    const snap = captureHeightState(sc);
    const finish = () => {
      requestAnimationFrame(() => preservePositionWithoutTopJump(snap));
    };
    try {
      const res = fn();
      if (res && typeof res.then === "function") {
        return res.finally(finish);
      }
      finish();
      return res;
    } catch (err) {
      finish();
      throw err;
    }
  }

  for (const name of ["toggle", "setEnabled", "renderCachedForCurrentView"]) {
    if (typeof CosmoTranslate[name] === "function" && !CosmoTranslate[name].__cosmoCleanGuard) {
      const orig = CosmoTranslate[name].bind(CosmoTranslate);
      const wrapped = function (...args) {
        return runSafelyWithoutJump(() => orig(...args));
      };
      wrapped.__cosmoCleanGuard = true;
      CosmoTranslate[name] = wrapped;
    }
  }

  function parseNumericCursor(raw) {
    if (raw === undefined || raw === null) return 0;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
    const digits = String(raw).replace(/\D+/g, "");
    return digits ? Number(digits) : 0;
  }

  function extractLatestCursorFromMember(member) {
    if (!member || typeof member !== "object") return 0;
    let maxCursor = parseNumericCursor(member.latestCursor ?? member.cursor ?? 0);
    const records = Array.isArray(member.records) ? member.records : [];
    for (let i = records.length - 1; i >= Math.max(0, records.length - 30); i--) {
      const rec = records[i];
      if (!rec) continue;
      const msg = rec.message && typeof rec.message === "object" ? rec.message : rec;
      const c = parseNumericCursor(rec.cursor ?? msg?.cursor ?? rec.sourceId ?? msg?.sourceId);
      if (c > maxCursor) maxCursor = c;
    }
    return maxCursor;
  }

  function updateKnownMemberCursor(member) {
    if (!member) return 0;
    const mid = String(member.artistMemberId ?? member.id ?? "").trim();
    if (!mid) return 0;
    const latest = extractLatestCursorFromMember(member);
    const prev = latestKnownCursorByMember.get(mid) || 0;
    if (latest > prev) {
      latestKnownCursorByMember.set(mid, latest);
    }
    return latestKnownCursorByMember.get(mid) || latest;
  }

  function saveTranslationToBlob(mid, sid, translatedContent, cursorVal = 0) {
    const text = String(translatedContent ?? "").trim();
    if (!text) return null;

    const payload = JSON.stringify({
      memberId: String(mid),
      messageId: String(sid),
      cursor: cursorVal,
      translatedContent: text,
      updatedAt: Date.now(),
    });
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const blobUrl =
      typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
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
    if (!resp.body || typeof resp.body.getReader !== "function") {
      return await resp.text();
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let out = "";
    const timer = setTimeout(() => {
      try { reader.cancel("timeout"); } catch (_) {}
    }, STREAM_TIMEOUT_MS);

    try {
      while (true) {
        if (signal?.aborted) {
          try { reader.cancel("aborted"); } catch (_) {}
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

    if (typeof CosmoTranslate.getCached === "function") {
      const cached = CosmoTranslate.getCached(mid, sid);
      if (cached?.translatedContent) {
        return saveTranslationToBlob(mid, sid, cached.translatedContent, cursorVal);
      }
    }

    const isDemo =
      typeof window !== "undefined" &&
      window.__FORCE_PROD_SESSION__ !== true &&
      window.IS_DEMO_MODE === true;

    if (isDemo) {
      try {
        const res = await fetch("demo/demo_translate.json", { cache: "no-store", signal });
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
        typeof CosmoAuth !== "undefined" && typeof CosmoAuth.authorizedFetch === "function"
          ? await CosmoAuth.authorizedFetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal,
          })
          : await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            referrerPolicy: "no-referrer",
            signal,
          });

      if (!resp || resp.status !== 200) return null;
      const raw = await readStreamText(resp, signal);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const transText = String(parsed?.translatedContent ?? "").trim();
      if (!transText) return null;
      return saveTranslationToBlob(mid, parsed?.messageId ?? sid, transText, cursorVal);
    } catch (_) {
      return null;
    }
  }

  function buildSortedPendingItems(member) {
    const mid = String(member?.artistMemberId ?? member?.id ?? "").trim();
    if (!mid) return { mid: "", items: [], latestCursor: 0 };

    const latestCursor = updateKnownMemberCursor(member);
    const records = Array.isArray(member.records) ? member.records : [];
    const items = [];

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (!rec || rec.op === "delete") continue;
      const msg = rec.message && typeof rec.message === "object" ? rec.message : rec;
      if (!msg || msg.messageType !== "text" || msg.senderType !== "artistMember") continue;

      let sid = "";
      if (msg.sourceId !== undefined && msg.sourceId !== null && String(msg.sourceId).trim() !== "") {
        sid = String(msg.sourceId).trim();
      } else if (rec.sourceId !== undefined && rec.sourceId !== null && String(rec.sourceId).trim() !== "") {
        sid = String(rec.sourceId).trim();
      } else if (typeof msg.syncId === "string" && msg.syncId.includes(":")) {
        sid = msg.syncId.split(":").pop().trim();
      }
      if (!sid) continue;
      if (blobStore.has(`${mid}:${sid}`)) continue;

      const cursorVal = parseNumericCursor(rec.cursor ?? msg.cursor ?? sid);
      items.push({ memberId: mid, sourceId: sid, cursorVal, orderIdx: i });
    }

    items.sort((a, b) => (b.cursorVal !== a.cursorVal ? b.cursorVal - a.cursorVal : b.orderIdx - a.orderIdx));
    return { mid, items, latestCursor };
  }

  async function runSilentBatchTranslateWithCursorCheck(member, { getLatestMember } = {}) {
    if (!member) return;
    const mid = String(member.artistMemberId ?? member.id ?? "").trim();
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
                controller.signal,
              );
            }
          }

          await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker),
          );

          if (
            typeof CosmoTranslate.isEnabled === "function" &&
            CosmoTranslate.isEnabled() &&
            typeof CosmoTranslate.renderCachedForCurrentView === "function"
          ) {
            runSafelyWithoutJump(() => CosmoTranslate.renderCachedForCurrentView());
          }

          const freshestMember =
            typeof getLatestMember === "function" ? getLatestMember(mid) : null;
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

  if (typeof CosmoTranslate.setMemberContext === "function" && !CosmoTranslate.setMemberContext.__cosmoSilentHook) {
    const origSetMember = CosmoTranslate.setMemberContext.bind(CosmoTranslate);
    const wrappedSetMember = function (member, ...rest) {
      const res = origSetMember(member, ...rest);
      if (member) {
        updateKnownMemberCursor(member);
        runSilentBatchTranslateWithCursorCheck(member);
      }
      return res;
    };
    wrappedSetMember.__cosmoSilentHook = true;
    CosmoTranslate.setMemberContext = wrappedSetMember;
  }

  window.CosmoSilentTranslate = Object.assign(window.CosmoSilentTranslate || {}, {
    runSilentBatchTranslateWithCursorCheck,
    runOnceForCurrentMember: (member, opts) => runSilentBatchTranslateWithCursorCheck(member, opts),
    updateKnownMemberCursor,
    getKnownCursor: (mid) => latestKnownCursorByMember.get(String(mid)) || 0,
    getSilentBlobEntry: (mid, sid) => blobStore.get(`${String(mid)}:${String(sid)}`) || null,
  });
})();
