if (typeof window !== 'undefined' && !window.__DEMO_PATCH_SYNC_PAYLOAD__) {
  window.__DEMO_PATCH_SYNC_PAYLOAD__ = true;
  window.__DEMO_EXPAND_SHARED_PAYLOAD__ = function (data, memberId) {
    if (!(typeof window !== 'undefined' && window.IS_DEMO_MODE) || !data || typeof data !== 'object') return data;
    const rawList = Array.isArray(data.messages)
      ? data.messages
      : Array.isArray(data.events)
        ? data.events
        : [];
    if (!rawList.length) return data;

    const midNum = Number(memberId);
    const resolvedMid = Number.isFinite(midNum) && midNum > 0 ? midNum : (memberId ?? 3);

    const expanded = rawList.map((entry, i) => {
      const item = entry && typeof entry === 'object' ? { ...entry } : {};
      const msg = item.message && typeof item.message === 'object'
        ? { ...item.message }
        : { ...item };

      const uniqueSuffix = `${resolvedMid}_${i + 1}_${Math.random().toString(36).slice(2, 7)}`;
      msg.artistMemberId = resolvedMid;
      if (msg.syncId) {
        msg.syncId = `${String(msg.syncId)}__demo_${uniqueSuffix}`;
      }
      item.message = msg;
      if (item.cursor !== undefined) {
        item.cursor = String(Number(item.cursor || 0) + i + 1);
      }
      return item;
    });

    return {
      ...data,
      messages: expanded,
      eof: true,
    };
  };
}

if (typeof window !== 'undefined' && !window.__DEMO_SHARED_MSG_TRANSFORM__) {
  window.__DEMO_SHARED_MSG_TRANSFORM__ = true;
  window.__DEMO_SHARED_MSG_TRANSFORM__ = function (eventObj, memberId) {
    if (!(typeof window !== 'undefined' && window.IS_DEMO_MODE)) return eventObj;
    const copy = eventObj && typeof eventObj === 'object' ? { ...eventObj } : {};
    const msg = copy.message && typeof copy.message === 'object' ? { ...copy.message } : {};
    if (memberId !== undefined && memberId !== null) {
      msg.artistMemberId = memberId;
    }
    copy.message = msg;
    return copy;
  };
}

// --- DEMO SHARED LAST.JSON HELPER ---
if (typeof window !== 'undefined' && !window.__DEMO_SHARE_LAST_JSON_PATCHED__) {
  window.__DEMO_SHARE_LAST_JSON_PATCHED__ = true;
  window.__DEMO_NORMALIZE_SHARED_MESSAGES__ = function (rawData, targetMemberId) {
    const list = Array.isArray(rawData)
      ? rawData
      : Array.isArray(rawData?.messages)
        ? rawData.messages
        : Array.isArray(rawData?.events)
          ? rawData.events
          : [];

    return list.map((item, idx) => {
      const base = item && typeof item === 'object' && item.message && typeof item.message === 'object'
        ? { ...item, message: { ...item.message } }
        : { cursor: String(idx + 1), op: 'upsert', message: { ...(item || {}) } };

      if ((typeof window !== 'undefined' && window.IS_DEMO_MODE) && targetMemberId !== undefined && targetMemberId !== null) {
        base.message.artistMemberId = targetMemberId;
      }
      return base;
    });
  };
}

// --- DEMO MODE GUARD (AUTO-INJECTED) ---
if (typeof window !== "undefined" && window.IS_DEMO_MODE) {
  window.__DEMO_NO_POST__ = true;
}

const CosmoSync = (() => {
  const tr = (key, vars) =>
  typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function'
    ? CosmoI18n.t(key, vars)
    : String(key);
  const { nfc } = CosmoUtils;
  const { API_BASE, authorizedFetch } = CosmoAuth;

  const ARTIST_ID = 'tripleS';
  const EXPIRED_JWT_MESSAGE = 'JWT已經過期 請重新取得新JWT';

  const DEV_MOCK_CONFIG = {
    enabled: false,
    sources: {
      '3': './mock/member_3.json',
    },
    persistCache: false,
  };

  function resolveMockSource(mid, afterCursor) {
    if (!DEV_MOCK_CONFIG.enabled) return null;
    const key = String(mid);
    const src = DEV_MOCK_CONFIG.sources?.[key];
    if (!src) return null;
    return typeof src === 'function' ? src(key, afterCursor) : src;
  }

  function parseNdjson(rawText) {
    const out = [];
    const normalized = String(rawText || '').replace(/^\uFEFF/, '').trim();
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
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
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

  function extractCursor(records, fallback = '0') {
    if (!Array.isArray(records) || records.length === 0) return fallback;
    const last = records[records.length - 1];
    const candidate = last?.cursor ?? last?.id ?? last?.seq ?? last?.eventId;
    return candidate !== undefined && candidate !== null ? String(candidate) : fallback;
  }

  function getRecordUniqueKey(rec) {
    if (!rec || typeof rec !== 'object') return '';
    if (rec.id !== undefined && rec.id !== null) return `id:${rec.id}`;
    if (rec.eventId !== undefined && rec.eventId !== null) return `ev:${rec.eventId}`;
    const msg = rec.message || {};
    if (msg.id !== undefined && msg.id !== null) return `msg:${msg.id}`;
    return `${msg.createdAt || ''}|${msg.senderType || ''}|${msg.content || ''}`;
  }

  function mergeRecords(existingRecords, incomingRecords) {
    const base = Array.isArray(existingRecords) ? existingRecords : [];
    const next = Array.isArray(incomingRecords) ? incomingRecords : [];
    if (base.length === 0) return next;
    if (next.length === 0) return base;

    const seen = new Set();
    const merged = [];
    for (const item of [base, next]) {
      const key = getRecordUniqueKey(item);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      merged.push(item);
    }
    return merged;
  }

  function extractChannelLastMessage(ch) {
    const lastMsg = ch?.lastMessage && typeof ch.lastMessage === 'object' ? ch.lastMessage : null;
    const rawId = ch?.lastMessageId ?? lastMsg?.id ?? lastMsg?.messageId ?? '';
    const lastMessageId = rawId !== undefined && rawId !== null ? String(rawId).trim() : '';
    return { lastMessageId, lastMessage: lastMsg };
  }

  async function fetchMemberNdjson(mid, afterCursor = '0') {
    const memberId = encodeURIComponent(String(mid ?? '').trim());
    const cursorParam = encodeURIComponent(String(afterCursor ?? '0').trim() || '0');
    const targetUrl = `${API_BASE}/bff/v3/channels/messages/${memberId}/sync-events/latest.ndjson?afterCursor=${cursorParam}`;
    const ndResp = await authorizedFetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/x-ndjson',
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
    const isMocked = Boolean((typeof resolveMockSource === 'function' ? resolveMockSource(mid, '0') : ''));
    const cachedRecords = Array.isArray(cachedEntry?.records) ? cachedEntry.records : [];
    const cursor = cachedRecords.length > 0 ? (cachedEntry?.lastCursor || extractCursor(cachedRecords, '0')) : '0';

    let incoming = null;
    try {
      incoming = await fetchMemberNdjson(mid, cursor);
      if (isCancelled()) return null;

      if (cursor !== '0' && (!incoming || incoming.length === 0)) {
        const full = await fetchMemberNdjson(mid, '0');
        if (isCancelled()) return null;
        if (Array.isArray(full)) incoming = full;
      }
    } catch (err) {
      incoming = null;
    }

    if (isCancelled()) return null;

    let finalRecords = cachedRecords;
    if (Array.isArray(incoming)) {
      if (cursor === '0') {
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
      originalName: ch.originalName || '',
      profileImageUrl: ch.profileImageUrl || '',
      lastMessageId,
      lastMessage,
      records: finalRecords,
    });
  }

  async function syncMemberNow(memberId, { isCancelled = () => false } = {}) {
  const targetId = String(memberId ?? '').trim();
  if (!targetId) return null;

  const chResp = await authorizedFetch(
    `${API_BASE}/bff/v4/channels/messages?artistId=${encodeURIComponent(ARTIST_ID)}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    }
  );
  if (isCancelled()) return null;

  const rawBody = await chResp.text();
  if (chResp.status === 401) {
    await CosmoStorage.clearTokens();
    const detail = nfc(rawBody || '');
    throw new Error(detail ? `${EXPIRED_JWT_MESSAGE}\n${detail}` : EXPIRED_JWT_MESSAGE);
  }
  if (chResp.status !== 200) {
    throw new Error(`HTTP ${chResp.status}: ${nfc(rawBody || '(empty response body)')}`);
  }

  let chJson;
  try {
    chJson = nfc(JSON.parse(rawBody));
  } catch (_) {
    throw new Error(`JSON 解析失敗: ${nfc(rawBody)}`);
  }

  const channels = Array.isArray(chJson.channels) ? chJson.channels : [];
  const matchedCh = channels.find(
    (ch) => String(ch.artistMemberId) === targetId
  );

  const cachedEntry = await CosmoStorage.getNdjsonCache(ARTIST_ID, targetId).catch(() => null);
  if (isCancelled()) return null;

  const baseCh = matchedCh || {
    artistMemberId: targetId,
    artistMemberName: targetId,
    originalName: '',
    profileImageUrl: '',
  };

  return syncSingleChannel(baseCh, cachedEntry, isCancelled);
}

async function syncAllChannels({
		isCancelled = () => false,
		onCachedReady = null,
		onProgress = null,
	} = {}) {
		const reportProgress = (pct, label = '') => {
			if (typeof onProgress !== 'function' || isCancelled()) return;
			const clamped = Math.max(0, Math.min(100, Math.round(pct)));
			onProgress(clamped, label);
		};

		reportProgress(5, tr('sync_prune_cache'));
		await CosmoStorage.pruneExpiredNdjsonCache().catch(() => {});
		if (isCancelled()) return null;

		reportProgress(12, tr('sync_fetch_channels'));
		const chResp = await authorizedFetch(
			`${API_BASE}/bff/v4/channels/messages?artistId=${encodeURIComponent(ARTIST_ID)}`, {
				method: 'GET',
				headers: {
					Accept: 'application/json',
				},
			}
		);

		if (isCancelled()) return null;

		const rawBody = await chResp.text();
		if (chResp.status === 401) {
			await CosmoStorage.clearTokens();
			const detail = nfc(rawBody || '');
			throw new Error(detail ? `${EXPIRED_JWT_MESSAGE}\n${detail}` : EXPIRED_JWT_MESSAGE);
		}

		if (chResp.status !== 200) {
			const detail = nfc(rawBody || '(empty response body)');
			throw new Error(`HTTP ${chResp.status}: ${detail}`);
		}

		let chJson;
		try {
			chJson = nfc(JSON.parse(rawBody));
		} catch (_) {
			throw new Error(`JSON 解析失敗: ${nfc(rawBody)}`);
		}

		const channels = (Array.isArray(chJson.channels) ? chJson.channels : []).filter(
			(ch) => ch.artistMemberId !== undefined && ch.artistMemberId !== null
		);

		if (channels.length === 0) {
			reportProgress(100, tr('sync_no_channels'));
			return [];
		}

		reportProgress(20, tr('sync_read_cache'));
		const cachedList = await Promise.all(
			channels.map((ch) => CosmoStorage.getNdjsonCache(ARTIST_ID, ch.artistMemberId).catch(() => null))
		);
		if (isCancelled()) return null;

		const hasAnyCache = cachedList.some((c) => Array.isArray(c?.records) && c.records.length > 0);
		if (hasAnyCache && typeof onCachedReady === 'function') {
			const cachedMembers = channels.map((ch, i) => {
				const {
					lastMessageId,
					lastMessage
				} = extractChannelLastMessage(ch);
				return nfc({
					artistMemberId: ch.artistMemberId,
					artistMemberName: ch.artistMemberName || String(ch.artistMemberId),
					originalName: ch.originalName || '',
					profileImageUrl: ch.profileImageUrl || '',
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
					reportProgress(pct, tr('sync_channels_progress', { done: completedCount, total: totalCount }));
				}
				return res;
			})
		);
		if (isCancelled()) return null;

		reportProgress(92, tr('sync_prepare_records'));
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

/* --- JWT NATIVE NDJSON TRIGGER --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_JWT_NATIVE_NDJSON_INIT__) return;
  window.__COSMO_JWT_NATIVE_NDJSON_INIT__ = true;

  let triggering = false;

  function isDemoSession() {
    try {
      const q = new URLSearchParams(window.location.search || '');
      if (window.FORCE_DEMO_MODE === true) return true;
      if (window.__FORCE_PROD_SESSION__ === true) return false;
      const v = q.get('demo');
      if (v === '1' || v === 'true') return true;
      if (v === '0' || v === 'false') return false;
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
        document.getElementById('chat')?.getAttribute('data-artist-member-id') ??
        ''
      ).trim();

      const targetIds = activeMid
        ? [activeMid]
        : channels.map((c) => String(c?.artistMemberId ?? '').trim()).filter(Boolean);

      if (typeof window.refreshMemberFromNdjson === 'function' && targetIds.length > 0) {
        for (const mid of targetIds.slice(0, 1)) {
          await window.refreshMemberFromNdjson(mid);
        }
      } else if (typeof window.CosmoSync?.syncAllChannels === 'function') {
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
    typeof window.__COSMO_NATIVE_FETCH__ === 'function'
      ? window.__COSMO_NATIVE_FETCH__
      : window.fetch.bind(window);
  window.__COSMO_NATIVE_FETCH__ = baseFetch;

  window.fetch = async function (input, init) {
    const urlStr = String(typeof input === 'string' ? input : (input?.url || ''));
    const resp = await baseFetch(input, init);
    if (!isDemoSession() && urlStr.includes('/bff/v4/channels/messages') && resp && resp.ok) {
      runJwtNdjsonSyncAfterV4(resp).catch(() => {});
    }
    return resp;
  };
})();

/* --- JWT SYNC-EVENTS LATEST.NDJSON & V4 TRIGGER --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_JWT_SYNC_EVENTS_NDJSON_INIT__) return;
  window.__COSMO_JWT_SYNC_EVENTS_NDJSON_INIT__ = true;

  const DEFAULT_API_BASE = 'https://api.cosmo.fans';
  let runningSyncFromV4 = false;

  function isDemoActive() {
    try {
      const q = new URLSearchParams(window.location.search || '');
      if (window.FORCE_DEMO_MODE === true) return true;
      if (window.__FORCE_PROD_SESSION__ === true) return false;
      const d = q.get('demo');
      if (d === '1' || d === 'true') return true;
      if (d === '0' || d === 'false') return false;
    } catch (_) {}
    return Boolean(window.IS_DEMO_MODE === true);
  }

  function buildSyncEventsNdjsonUrl(mid, afterCursor = '0') {
    const apiRoot =
      typeof API_BASE === 'string' && API_BASE.trim()
        ? API_BASE.trim().replace(/\/+$/, '')
        : DEFAULT_API_BASE;
    const memberId = encodeURIComponent(String(mid ?? '').trim());
    const cursor = encodeURIComponent(String(afterCursor ?? '0').trim() || '0');
    return `${apiRoot}/bff/v3/channels/messages/${memberId}/sync-events/latest.ndjson?afterCursor=${cursor}`;
  }

  async function triggerJwtSyncEventsNdjson(resp) {
    if (isDemoActive() || runningSyncFromV4) return;
    runningSyncFromV4 = true;
    try {
      let channels = [];
      try {
        const payload = await resp.clone().json();
        if (Array.isArray(payload?.channels)) channels = payload.channels;
      } catch (_) {}

      const cur = window.currentMember || window.CosmoApp?.currentMember || null;
      const activeMid = String(
        cur?.artistMemberId ??
        cur?.id ??
        document.getElementById('chat')?.getAttribute('data-artist-member-id') ??
        ''
      ).trim();

      const memberIds = activeMid
        ? [activeMid]
        : channels.map((c) => String(c?.artistMemberId ?? '').trim()).filter(Boolean);

      if (typeof window.refreshMemberFromNdjson === 'function' && memberIds.length > 0) {
        await window.refreshMemberFromNdjson(memberIds[0]);
      } else if (typeof window.CosmoSync?.syncAllChannels === 'function') {
        await window.CosmoSync.syncAllChannels({ memberIds });
      }
    } catch (_) {
    } finally {
      runningSyncFromV4 = false;
    }
  }

  const baseFetch =
    typeof window.__COSMO_NATIVE_FETCH__ === 'function'
      ? window.__COSMO_NATIVE_FETCH__
      : window.fetch.bind(window);
  window.__COSMO_NATIVE_FETCH__ = baseFetch;

  window.fetch = async function (input, init) {
    const rawUrl = typeof input === 'string' ? input : (input?.url || '');
    const urlStr = String(rawUrl);
    const resp = await baseFetch(input, init);

    if (!isDemoActive() && urlStr.includes('/bff/v4/channels/messages') && resp && resp.ok) {
      triggerJwtSyncEventsNdjson(resp).catch(() => {});
    }
    return resp;
  };

  window.CosmoSyncEventsNdjson = {
    buildUrl: buildSyncEventsNdjsonUrl,
  };
})();
