import { CosmoAuth } from "./auth.js";
import { CosmoToast } from "./toast.js";

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

  )();

export { CosmoTranslate };
