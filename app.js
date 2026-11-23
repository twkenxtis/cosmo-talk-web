const ARTIST_ID = 'tripleS';
const API_BASE = 'https://api.cosmo.fans';
const REFRESH_ENDPOINT = `${API_BASE}/bff/v3/users/refresh-access-token`;
const COSMO_KEY_BASE64 = 'aUkaF3wWVltAI1QYVmxsZXfTV6L7mPTxA5+MMkLV9DE=';
const REFRESH_BUFFER_SEC = 12 * 60 * 60; // 到期前 12 小時自動刷新

const loginPageEl = document.getElementById('login-page');
const chatShellEl = document.getElementById('chat-shell');
const jwtLoginInputEl = document.getElementById('jwt-login-input');
const jwtLoginBtnEl = document.getElementById('jwt-login-btn');
const loginStatusEl = document.getElementById('login-status');

const sidebarBackdropEl = document.getElementById('sidebar-backdrop');
const sidebarToggleInnerEl = document.getElementById('sidebar-toggle-inner');
const memberListEl = document.getElementById('member-list');
const chatHeaderEl = document.getElementById('chat-header');
const chatEl = document.getElementById('chat');
const timelineRailEl = document.getElementById('timeline-rail');

let membersData = [];
let activeMemberId = null;
let currentRenderedItems = [];
let currentSegmentStarts = [];
let activeSyncGeneration = 0;
let inflightRefreshPromise = null;

function nfc(v) {
  if (typeof v === 'string') return v.normalize('NFC');
  if (Array.isArray(v)) return v.map(nfc);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k.normalize('NFC')] = nfc(val);
    return out;
  }
  return v;
}

function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && Object.keys(v).length === 0) return true;
  return false;
}

function setLoginStatus(msg) {
  if (loginStatusEl) loginStatusEl.textContent = nfc(msg || '');
}

function isMobile() {
  return window.innerWidth <= 768;
}

function toggleSidebar(force) {
  const next = typeof force === 'boolean' ? force : !chatShellEl.classList.contains('sidebar-collapsed');
  chatShellEl.classList.toggle('sidebar-collapsed', next);
}

sidebarToggleInnerEl.onclick = () => toggleSidebar(true);
sidebarBackdropEl.onclick = () => toggleSidebar(true);

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function fmtDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, '0')}월 ${String(d.getDate()).padStart(2, '0')}일`;
}

function fmtTimeline(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtExportTs(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function setAuthControlsVisible(visible) {
  const display = visible ? '' : 'none';
  if (jwtLoginInputEl) {
    jwtLoginInputEl.style.display = display;
    if (!visible) jwtLoginInputEl.value = '';
  }
  if (jwtLoginBtnEl) {
    jwtLoginBtnEl.style.display = display;
  }
}

function showLoginPage(statusMsg = '') {
  setAuthControlsVisible(true);
  loginPageEl.style.display = 'flex';
  chatShellEl.classList.remove('active');
  setLoginStatus(statusMsg);
}

function showChatPage() {
  setAuthControlsVisible(false);
  loginPageEl.style.display = 'none';
  chatShellEl.classList.add('active');
}

function memberLabel(m) {
  const orig = nfc(m.originalName || '');
  const disp = nfc(m.artistMemberName || '');
  if (orig && disp) return nfc(`${orig} (${disp})`);
  return nfc(orig || disp || String(m.artistMemberId));
}

function getCurrentExportStartIndex() {
  if (!Array.isArray(currentRenderedItems) || currentRenderedItems.length === 0) {
    return 0;
  }

  const headerHeight = chatHeaderEl ? chatHeaderEl.getBoundingClientRect().height : 60;
  const referenceY = headerHeight + 16;

  let currentIdx = 0;
  for (let i = 0; i < currentRenderedItems.length; i++) {
    const el = currentRenderedItems[i]?.element;
    if (!el) continue;
    const top = el.getBoundingClientRect().top;
    if (top <= referenceY) {
      currentIdx = i;
    } else {
      break;
    }
  }

  if (Array.isArray(currentSegmentStarts) && currentSegmentStarts.length > 0) {
    let segStartIdx = 0;
    for (const seg of currentSegmentStarts) {
      if (typeof seg.renderedIndex === 'number' && seg.renderedIndex <= currentIdx) {
        segStartIdx = seg.renderedIndex;
      } else {
        break;
      }
    }
    return segStartIdx;
  }

  return currentIdx;
}

function exportMemberText(member) {
  if (!member) return;
  const startIdx = getCurrentExportStartIndex();
  const blocks = [];

  for (let i = startIdx; i < currentRenderedItems.length; i++) {
    const msg = currentRenderedItems[i]?.msg;
    if (msg && msg.messageType === 'text' && typeof msg.content === 'string' && msg.content.trim()) {
      const ts = fmtExportTs(msg.createdAt);
      blocks.push(ts ? `${ts}\n${nfc(msg.content)}` : nfc(msg.content));
    }
  }

  const startIso = currentRenderedItems[startIdx]?.msg?.createdAt;
  const startTag = startIso ? fmtTimeline(startIso).replace(/[: ]/g, '-') : 'start';
  const safeName = nfc(
    String(member.originalName || member.artistMemberName || member.artistMemberId).replace(
      /[\\/:*?"<>|]/g,
      '_'
    )
  );

  const blob = new Blob([blocks.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}_from_${startTag}_chat.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderSidebar() {
  const frag = document.createDocumentFragment();
  for (const m of membersData) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'member-item' + (m.artistMemberId === activeMemberId ? ' active' : '');
    btn.onclick = () => {
      activeMemberId = m.artistMemberId;
      renderSidebar();
      renderChat(m);
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
  memberListEl.replaceChildren(frag);
}

const MEDIA_EXT_RE = /\.(mp4|m4a|m4v|m4s)(?:[?#]|$)/i;

function pickMediaUrl(item) {
  if (typeof item === 'string') {
    return item.trim();
  }
  if (!item || typeof item !== 'object') {
    return '';
  }

  const candidates = [
    item.thumbnailUrl,
    item.originalUrl,
    item.url,
  ]
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter(Boolean);

  const preferred = candidates.find((u) => MEDIA_EXT_RE.test(u));
  return preferred || candidates[0] || '';
}

function renderChat(member) {
  chatHeaderEl.replaceChildren();
  chatEl.replaceChildren();
  timelineRailEl.replaceChildren();
  timelineRailEl.classList.add('empty');
  currentRenderedItems = [];
  currentSegmentStarts = [];

  if (!member) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '沒有可用的頻道資料';
    chatEl.appendChild(empty);
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

  const actions = document.createElement('div');
  actions.className = 'header-actions';

  const expBtn = document.createElement('button');
  expBtn.type = 'button';
  expBtn.className = 'btn';
  expBtn.textContent = '匯出純文本';
  expBtn.onclick = () => exportMemberText(member);

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'btn';
  logoutBtn.textContent = '登出';
  logoutBtn.onclick = logoutToLoginPage;

  actions.appendChild(expBtn);
  actions.appendChild(logoutBtn);

  chatHeaderEl.appendChild(left);
  chatHeaderEl.appendChild(actions);

  const records = Array.isArray(member.records) ? member.records : [];
  const chatFrag = document.createDocumentFragment();
  let lastDay = null;
  let lastMs = null;
  let count = 0;

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
    }

    const other = msg.senderType === 'artistMember';
    const wrap = document.createElement('div');
    wrap.className = 'msg-wrapper';
    const anchorId = `msg-${member.artistMemberId}-${count}`;
    wrap.id = anchorId;
    if (!other) wrap.style.flexDirection = 'row-reverse';

    if (other) {
      const av = document.createElement('div');
      av.className = 'avatar';
      if (member.profileImageUrl) av.style.backgroundImage = `url('${member.profileImageUrl}')`;
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

    const bubble = document.createElement('div');
    bubble.className = 'bubble' + (isReply ? ' reply-bubble' : '');

    if (isReply) {
      const qh = document.createElement('div');
      qh.className = 'quote-header';
      qh.textContent = nfc(`${member.artistMemberName || ''} 回覆了`);
      const qt = document.createElement('div');
      qt.textContent = nfc(typeof msg.replyContent === 'object' ? JSON.stringify(msg.replyContent) : msg.replyContent);
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
    currentRenderedItems.push({ element: wrap, msg });

    const ms = msg.createdAt ? Date.parse(msg.createdAt) : NaN;
    if (!Number.isNaN(ms)) {
      if (lastMs === null || Math.abs(ms - lastMs) / 60000 > 31) {
        currentSegmentStarts.push({ id: anchorId, iso: msg.createdAt, renderedIndex: idx });
      }
      lastMs = ms;
    }
  }

  chatEl.appendChild(chatFrag);

  if (currentSegmentStarts.length > 0) {
    timelineRailEl.classList.remove('empty');
    const railFrag = document.createDocumentFragment();
    for (const seg of currentSegmentStarts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'timeline-btn';
      b.textContent = fmtTimeline(seg.iso);
      b.onclick = () => {
        const target = document.getElementById(seg.id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      railFrag.appendChild(b);
    }
    timelineRailEl.appendChild(railFrag);

    const lastSeg = currentSegmentStarts[currentSegmentStarts.length - 1];
    const lastTarget = document.getElementById(lastSeg.id);
    if (lastTarget) {
      requestAnimationFrame(() => {
        lastTarget.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
    }
  }
}

// JWT 檢查與靜默刷新
function decodeJwtExp(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(pad));
    const exp = Number(payload?.exp);
    return Number.isFinite(exp) ? exp : null;
  } catch (_) {
    return null;
  }
}

function isTokenExpiringSoon(token, bufferSec = REFRESH_BUFFER_SEC) {
  if (!token) return true;
  const exp = decodeJwtExp(token);
  if (!exp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return exp - nowSec <= bufferSec;
}

function base64ToBytes(b64) {
  const bin = atob(String(b64 || '').trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function encryptCosmoPayload(plaintext, keyBase64 = COSMO_KEY_BASE64) {
  if (!window.crypto?.subtle) {
    throw new Error('Web Crypto unavailable');
  }
  const keyBytes = base64ToBytes(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const plainBytes = new TextEncoder().encode(plaintext);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CBC' },
    false,
    ['encrypt']
  );
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    cryptoKey,
    plainBytes
  );
  const cipherBytes = new Uint8Array(cipherBuf);
  const combined = new Uint8Array(iv.length + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, iv.length);
  return bytesToBase64(combined);
}

function extractCredsFromResponse(obj) {
  function find(node, camel, snake) {
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = find(item, camel, snake);
        if (found) return found;
      }
      return null;
    }
    if (node && typeof node === 'object') {
      if (node[camel]) return String(node[camel]).trim();
      if (node[snake]) return String(node[snake]).trim();
      for (const val of Object.values(node)) {
        const found = find(val, camel, snake);
        if (found) return found;
      }
    }
    return null;
  }

  return {
    accessToken: find(obj, 'accessToken', 'access_token') || '',
    refreshToken: find(obj, 'refreshToken', 'refresh_token') || '',
  };
}

async function performSilentRefresh(currentRefreshToken) {
  const tokenToUse = String(currentRefreshToken || '').trim();
  if (!tokenToUse) {
    throw new Error('Missing refreshToken');
  }

  const encryptedBody = await encryptCosmoPayload(
    JSON.stringify({ refreshToken: tokenToUse }),
    COSMO_KEY_BASE64
  );

  const resp = await fetch(REFRESH_ENDPOINT, {
    method: 'POST',
    referrerPolicy: 'no-referrer',
    headers: {
      'Content-Type': 'text/plain',
      'x-cosmo-encrypted': '1',
      'Accept': 'application/json',
    },
    body: encryptedBody,
  });

  if (resp.status !== 200 && resp.status !== 201) {
    throw new Error(`Refresh failed with HTTP ${resp.status}`);
  }

  const json = await resp.json();
  const extracted = extractCredsFromResponse(json);
  const nextAccess = extracted.accessToken;
  const nextRefresh = extracted.refreshToken || tokenToUse;

  if (!nextAccess) {
    throw new Error('Refresh response missing accessToken');
  }

  return CosmoStorage.saveTokens({
    accessToken: nextAccess,
    refreshToken: nextRefresh,
  });
}

async function ensureFreshTokens({ force = false } = {}) {
  const tokens = await CosmoStorage.getTokens();
  const shouldRefresh = force || isTokenExpiringSoon(tokens.accessToken, REFRESH_BUFFER_SEC);

  if (!shouldRefresh && tokens.accessToken) {
    return tokens;
  }

  if (!tokens.refreshToken) {
    if (tokens.accessToken && !force) {
      return tokens;
    }
    throw new Error('No refreshToken available');
  }

  if (!inflightRefreshPromise) {
    inflightRefreshPromise = performSilentRefresh(tokens.refreshToken).finally(() => {
      inflightRefreshPromise = null;
    });
  }

  return inflightRefreshPromise;
}

async function authorizedFetch(url, init = {}, allowRetryOn401 = true) {
  let tokens = await ensureFreshTokens({ force: false });
  const buildInit = (accessToken) => ({
    ...init,
    referrerPolicy: 'no-referrer',
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  let resp = await fetch(url, buildInit(tokens.accessToken));
  if (resp.status === 401 && allowRetryOn401) {
    tokens = await ensureFreshTokens({ force: true });
    resp = await fetch(url, buildInit(tokens.accessToken));
  }
  return resp;
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
  for (const item of [...base, ...next]) {
    const key = getRecordUniqueKey(item);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(item);
  }
  return merged;
}

async function fetchMemberNdjson(mid, afterCursor = '0') {
  const url = `${API_BASE}/bff/v3/channels/messages/${encodeURIComponent(String(mid))}/sync-events/latest.ndjson?afterCursor=${encodeURIComponent(String(afterCursor))}`;
  const ndResp = await authorizedFetch(url, {
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

async function syncSingleChannel(ch, cachedEntry) {
  const mid = ch.artistMemberId;
  const cachedRecords = Array.isArray(cachedEntry?.records) ? cachedEntry.records : [];
  const cursor = cachedRecords.length > 0 ? (cachedEntry?.lastCursor || extractCursor(cachedRecords, '0')) : '0';

  let incoming = await fetchMemberNdjson(mid, cursor);
  if (cursor !== '0' && (!incoming || incoming.length === 0)) {
    const full = await fetchMemberNdjson(mid, '0');
    if (Array.isArray(full)) incoming = full;
  }

  const finalRecords = Array.isArray(incoming)
    ? (cursor === '0' ? incoming : mergeRecords(cachedRecords, incoming))
    : cachedRecords;

  const nextCursor = extractCursor(finalRecords, cursor);
  if (Array.isArray(incoming)) {
    await CosmoStorage.saveNdjsonCache(ARTIST_ID, mid, finalRecords, nextCursor);
  }

  return nfc({
    artistMemberId: mid,
    artistMemberName: ch.artistMemberName || String(mid),
    originalName: ch.originalName || '',
    profileImageUrl: ch.profileImageUrl || '',
    records: finalRecords,
  });
}

const EXPIRED_JWT_MESSAGE = 'JWT已經過期 請重新取得新JWT';

async function enterChatSession() {
  const syncGen = ++activeSyncGeneration;
  setLoginStatus('正在載入頻道與訊息...');
  await CosmoStorage.pruneExpiredNdjsonCache().catch(() => {});

  const chResp = await authorizedFetch(
    `${API_BASE}/bff/v4/channels/messages?artistId=${encodeURIComponent(ARTIST_ID)}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (syncGen !== activeSyncGeneration) return;

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
  } catch (err) {
    throw new Error(`JSON 解析失敗: ${nfc(rawBody)}`);
  }

  const channels = (Array.isArray(chJson.channels) ? chJson.channels : []).filter(
    (ch) => ch.artistMemberId !== undefined && ch.artistMemberId !== null
  );

  const cachedList = await Promise.all(
    channels.map((ch) => CosmoStorage.getNdjsonCache(ARTIST_ID, ch.artistMemberId).catch(() => null))
  );
  if (syncGen !== activeSyncGeneration) return;

  const hasAnyCache = cachedList.some((c) => Array.isArray(c?.records) && c.records.length > 0);
  if (hasAnyCache) {
    membersData = channels.map((ch, i) => nfc({
      artistMemberId: ch.artistMemberId,
      artistMemberName: ch.artistMemberName || String(ch.artistMemberId),
      originalName: ch.originalName || '',
      profileImageUrl: ch.profileImageUrl || '',
      records: Array.isArray(cachedList[i]?.records) ? cachedList[i].records : [],
    }));
    activeMemberId = membersData.length > 0 ? membersData[0].artistMemberId : null;
    renderSidebar();
    renderChat(membersData.find((m) => m.artistMemberId === activeMemberId) || null);
    showChatPage();
  }

  const results = await Promise.all(
    channels.map((ch, i) => syncSingleChannel(ch, cachedList[i]))
  );
  if (syncGen !== activeSyncGeneration) return;

  membersData = results;
  if (!activeMemberId && membersData.length > 0) {
    activeMemberId = membersData[0].artistMemberId;
  } else if (activeMemberId && !membersData.some((m) => m.artistMemberId === activeMemberId)) {
    activeMemberId = membersData.length > 0 ? membersData[0].artistMemberId : null;
  }
  renderSidebar();
  renderChat(membersData.find((m) => m.artistMemberId === activeMemberId) || null);
  showChatPage();
}

function parseLoginInput(rawInput) {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) return { accessToken: '', refreshToken: '' };

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const extracted = extractCredsFromResponse(parsed);
      return {
        accessToken: extracted.accessToken.replace(/^Bearer\s+/i, '').trim(),
        refreshToken: extracted.refreshToken.trim(),
      };
    } catch (_) {}
  }

  const cleaned = trimmed.replace(/^Bearer\s+/i, '').trim();
  const isJwtLike = cleaned.split('.').length === 3 && !/\s/.test(cleaned);
  return isJwtLike
    ? { accessToken: cleaned, refreshToken: '' }
    : { accessToken: '', refreshToken: cleaned };
}

jwtLoginBtnEl.onclick = async () => {
  const parsed = parseLoginInput(jwtLoginInputEl.value);
  if (!parsed.accessToken && !parsed.refreshToken) {
    showLoginPage('請輸入 JWT Access Token 或 Refresh Token');
    return;
  }

  try {
    await CosmoStorage.saveTokens(parsed);
    if (!parsed.accessToken && parsed.refreshToken) {
      await ensureFreshTokens({ force: true });
    }
    jwtLoginInputEl.value = '';
    await enterChatSession();
  } catch (err) {
    showLoginPage(err?.message || EXPIRED_JWT_MESSAGE);
  }
};

async function logoutToLoginPage() {
  activeSyncGeneration++;
  await CosmoStorage.clearTokens();
  await CosmoStorage.clearNdjsonCache().catch(() => {});
  membersData = [];
  activeMemberId = null;
  renderSidebar();
  renderChat(null);
  showLoginPage('已登出並清除 IndexedDB 中的憑證與快取');
}

(async () => {
  const tokens = await CosmoStorage.getTokens();
  if (!tokens.accessToken && !tokens.refreshToken) {
    showLoginPage('請輸入 JWT Access Token 或 Refresh Token');
    return;
  }
  try {
    await enterChatSession();
  } catch (err) {
    showLoginPage(`既有憑證載入失敗：${err.message || '請重新輸入'}`);
  }
})();