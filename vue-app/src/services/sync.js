import { CosmoUtils } from "./utils.js";
import { CosmoStorage } from "./storage.js";
import { CosmoAuth } from "./auth.js";
import { CosmoI18n } from "./i18n.js";

const CosmoSync = (() => {

  const tr = (key, vars) =>
    typeof CosmoI18n !== "undefined" && typeof CosmoI18n.t === "function"
      ? CosmoI18n.t(key, vars)
      : String(key);
  const { nfc } = CosmoUtils;
  const { API_BASE, authorizedFetch } = CosmoAuth;

  const ARTIST_ID = "tripleS";
  const EXPIRED_JWT_MESSAGE = "JWT已經過期 請重新取得新JWT";

  const DEV_MOCK_CONFIG = {
    enabled: false,
    sources: {
      "3": "./mock/member_3.json",
    },
    persistCache: false,
  };

  function resolveMockSource(mid, afterCursor) {
    if (!DEV_MOCK_CONFIG.enabled) return null;
    const key = String(mid);
    const src = DEV_MOCK_CONFIG.sources?.[key];
    if (!src) return null;
    return typeof src === "function" ? src(key, afterCursor) : src;
  }

  function parseNdjson(rawText) {
    const out = [];
    const normalized = String(rawText || "").replace(/^\uFEFF/, "").trim();
    if (!normalized) return out;

    const lines = normalized.split(/\r?\n/);
    let allSingleLineJson = true;
    const lineParsed = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        lineParsed.push(nfc(JSON.parse(trimmed)));
      } catch {
        allSingleLineJson = false;
        break;
      }
    }
    if (allSingleLineJson) {
      return lineParsed;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    let start = -1;

    for (let i = 0; i < normalized.length; i++) {
      const ch = normalized[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && start !== -1) {
          const chunk = normalized.slice(start, i + 1);
          out.push(nfc(JSON.parse(chunk)));
          start = -1;
        }
      }
    }

    return out;
  }

  function extractCursor(records, fallback = "0") {
    if (!Array.isArray(records) || records.length === 0) return fallback;
    const last = records[records.length - 1];
    const candidate = last?.cursor ?? last?.id ?? last?.seq ?? last?.eventId;
    return candidate !== undefined && candidate !== null ? String(candidate) : fallback;
  }

  function getRecordUniqueKey(rec) {
    if (!rec || typeof rec !== "object") return "";
    if (rec.id !== undefined && rec.id !== null) return `id:${rec.id}`;
    if (rec.eventId !== undefined && rec.eventId !== null) return `ev:${rec.eventId}`;
    const msg = rec.message || {};
    if (msg.id !== undefined && msg.id !== null) return `msg:${msg.id}`;
    return `${msg.createdAt || ""}|${msg.senderType || ""}|${msg.content || ""}`;
  }

  function mergeRecords(existingRecords, incomingRecords) {
    const base = Array.isArray(existingRecords) ? existingRecords : [];
    const next = Array.isArray(incomingRecords) ? incomingRecords : [];
    if (base.length === 0) return next;
    if (next.length === 0) return base;

    const seen = new Set();
    const merged = [];
    for (const item of [...base, ...next]) {
      const key = getRecordUniqueKey(item);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      merged.push(item);
    }
    return merged;
  }

  function extractChannelLastMessage(ch) {
    const lastMsg = ch?.lastMessage && typeof ch.lastMessage === "object" ? ch.lastMessage : null;
    const rawId = ch?.lastMessageId ?? lastMsg?.id ?? lastMsg?.messageId ?? "";
    const lastMessageId = rawId !== undefined && rawId !== null ? String(rawId).trim() : "";
    return { lastMessageId, lastMessage: lastMsg };
  }

  async function fetchMemberNdjson(mid, afterCursor = "0") {
    const memberId = encodeURIComponent(String(mid ?? "").trim());
    const cursorParam = encodeURIComponent(String(afterCursor ?? "0").trim() || "0");
    const targetUrl = `${API_BASE}/bff/v3/channels/messages/${memberId}/sync-events/latest.ndjson?afterCursor=${cursorParam}`;
    const ndResp = await authorizedFetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/x-ndjson",
      },
    });
    const ndRaw = await ndResp.text();
    if (ndResp.status !== 200) {
      console.warn(`NDJSON ${mid} HTTP ${ndResp.status}:`, nfc(ndRaw));
      return null;
    }
    return parseNdjson(ndRaw);
  }
  async function syncSingleChannel(ch, cachedEntry, isCancelled = () => false) {
    const mid = ch.artistMemberId;
    const { lastMessageId, lastMessage } = extractChannelLastMessage(ch);
    const isMocked = Boolean((typeof resolveMockSource === "function" ? resolveMockSource(mid, "0") : ""));
    const cachedRecords = Array.isArray(cachedEntry?.records) ? cachedEntry.records : [];
    const cursor = cachedRecords.length > 0 ? (cachedEntry?.lastCursor || extractCursor(cachedRecords, "0")) : "0";

    let incoming;
    try {
      incoming = await fetchMemberNdjson(mid, cursor);
      if (isCancelled()) return null;

      if (cursor !== "0" && (!incoming || incoming.length === 0)) {
        const full = await fetchMemberNdjson(mid, "0");
        if (isCancelled()) return null;
        if (Array.isArray(full)) incoming = full;
      }
    } catch (_err) { incoming = null; }

    if (isCancelled()) return null;

    let finalRecords = cachedRecords;
    if (Array.isArray(incoming)) {
      if (cursor === "0") {
        finalRecords = incoming.length > 0 || cachedRecords.length === 0 ? incoming : cachedRecords;
      } else {
        finalRecords = mergeRecords(cachedRecords, incoming);
      }
    }

    const nextCursor = extractCursor(finalRecords, cursor);
    const shouldSaveCache = Array.isArray(incoming) && (!isMocked || DEV_MOCK_CONFIG.persistCache);
    if (shouldSaveCache && !isCancelled()) {
      await CosmoStorage.saveNdjsonCache(ARTIST_ID, mid, finalRecords, nextCursor);
    }

    return nfc({
      artistMemberId: mid,
      artistMemberName: ch.artistMemberName || String(mid),
      originalName: ch.originalName || "",
      profileImageUrl: ch.profileImageUrl || "",
      lastMessageId,
      lastMessage,
      records: finalRecords,
    });
  }

  async function syncMemberNow(memberId, { isCancelled = () => false } = {}) {
    const targetId = String(memberId ?? "").trim();
    if (!targetId) return null;

    const chResp = await authorizedFetch(
      `${API_BASE}/bff/v4/channels/messages?artistId=${encodeURIComponent(ARTIST_ID)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );
    if (isCancelled()) return null;

    const rawBody = await chResp.text();
    if (chResp.status === 401) {
      await CosmoStorage.clearTokens();
      const detail = nfc(rawBody || "");
      throw new Error(detail ? `${EXPIRED_JWT_MESSAGE}\n${detail}` : EXPIRED_JWT_MESSAGE);
    }
    if (chResp.status !== 200) {
      throw new Error(`HTTP ${chResp.status}: ${nfc(rawBody || "(empty response body)")}`);
    }

    let chJson;
    try {
      chJson = nfc(JSON.parse(rawBody));
    } catch (_) { throw new Error(`JSON 解析失敗: ${nfc(rawBody)}`, { cause: _ }); }

    const channels = Array.isArray(chJson.channels) ? chJson.channels : [];
    const matchedCh = channels.find(
      (ch) => String(ch.artistMemberId) === targetId,
    );

    const cachedEntry = await CosmoStorage.getNdjsonCache(ARTIST_ID, targetId).catch(() => null);
    if (isCancelled()) return null;

    const baseCh = matchedCh || {
      artistMemberId: targetId,
      artistMemberName: targetId,
      originalName: "",
      profileImageUrl: "",
    };

    return syncSingleChannel(baseCh, cachedEntry, isCancelled);
  }

  async function syncAllChannels({
    isCancelled = () => false,
    onCachedReady = null,
    onProgress = null,
  } = {}) {
    const reportProgress = (pct, label = "") => {
      if (typeof onProgress !== "function" || isCancelled()) return;
      const clamped = Math.max(0, Math.min(100, Math.round(pct)));
      onProgress(clamped, label);
    };

    reportProgress(5, tr("sync_prune_cache"));
    await CosmoStorage.pruneExpiredNdjsonCache().catch(() => {});
    if (isCancelled()) return null;

    reportProgress(12, tr("sync_fetch_channels"));
    const chResp = await authorizedFetch(
      `${API_BASE}/bff/v4/channels/messages?artistId=${encodeURIComponent(ARTIST_ID)}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (isCancelled()) return null;

    const rawBody = await chResp.text();
    if (chResp.status === 401) {
      await CosmoStorage.clearTokens();
      const detail = nfc(rawBody || "");
      throw new Error(detail ? `${EXPIRED_JWT_MESSAGE}\n${detail}` : EXPIRED_JWT_MESSAGE);
    }

    if (chResp.status !== 200) {
      const detail = nfc(rawBody || "(empty response body)");
      throw new Error(`HTTP ${chResp.status}: ${detail}`);
    }

    let chJson;
    try {
      chJson = nfc(JSON.parse(rawBody));
    } catch (_) { throw new Error(`JSON 解析失敗: ${nfc(rawBody)}`, { cause: _ }); }

    const channels = (Array.isArray(chJson.channels) ? chJson.channels : []).filter(
      (ch) => ch.artistMemberId !== undefined && ch.artistMemberId !== null,
    );

    if (channels.length === 0) {
      reportProgress(100, tr("sync_no_channels"));
      return [];
    }

    reportProgress(20, tr("sync_read_cache"));
    const cachedList = await Promise.all(
      channels.map((ch) => CosmoStorage.getNdjsonCache(ARTIST_ID, ch.artistMemberId).catch(() => null)),
    );
    if (isCancelled()) return null;

    const hasAnyCache = cachedList.some((c) => Array.isArray(c?.records) && c.records.length > 0);
    if (hasAnyCache && typeof onCachedReady === "function") {
      const cachedMembers = channels.map((ch, i) => {
        const {
          lastMessageId,
          lastMessage,
        } = extractChannelLastMessage(ch);
        return nfc({
          artistMemberId: ch.artistMemberId,
          artistMemberName: ch.artistMemberName || String(ch.artistMemberId),
          originalName: ch.originalName || "",
          profileImageUrl: ch.profileImageUrl || "",
          lastMessageId,
          lastMessage,
          records: Array.isArray(cachedList[i]?.records) ? cachedList[i].records : [],
        });
      });
      onCachedReady(cachedMembers);
    }

    reportProgress(35, `同步頻道資料 (0/${channels.length})`);
    let completedCount = 0;
    const totalCount = channels.length;

    const results = await Promise.all(
      channels.map(async (ch, i) => {
        const res = await syncSingleChannel(ch, cachedList[i], isCancelled);
        if (!isCancelled()) {
          completedCount++;
          const pct = 35 + (completedCount / totalCount) * 55;
          reportProgress(pct, tr("sync_channels_progress", { done: completedCount, total: totalCount }));
        }
        return res;
      }),
    );
    if (isCancelled()) return null;

    reportProgress(92, tr("sync_prepare_records"));
    return results.filter(Boolean);
  }

  return {
    ARTIST_ID,
    EXPIRED_JWT_MESSAGE,
    DEV_MOCK_CONFIG,
    parseNdjson,
    syncSingleChannel,
    syncMemberNow,
    syncAllChannels,
  };
})();

export { CosmoSync };
