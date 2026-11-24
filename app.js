const {
  MEDIA_EXT_RE,
  nfc,
  isEmpty,
  isMobile,
  fmtTime,
  fmtDay,
  fmtTimeline,
  getMinuteGroupKey,
  memberLabel,
  pickMediaUrl,
} = CosmoUtils;

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

function setLoginStatus(msg) {
  if (loginStatusEl) loginStatusEl.textContent = nfc(msg || '');
}

function toggleSidebar(force) {
  const next = typeof force === 'boolean' ? force : !chatShellEl.classList.contains('sidebar-collapsed');
  chatShellEl.classList.toggle('sidebar-collapsed', next);
}

sidebarToggleInnerEl.onclick = () => toggleSidebar(true);
sidebarBackdropEl.onclick = () => toggleSidebar(true);

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
  expBtn.onclick = () =>
    CosmoExport.exportMemberText({
      member,
      renderedItems: currentRenderedItems,
      segmentStarts: currentSegmentStarts,
      headerEl: chatHeaderEl,
    });

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'btn';
  logoutBtn.textContent = '登出';
  logoutBtn.onclick = () => logoutToLoginPage();

  actions.appendChild(expBtn);
  actions.appendChild(logoutBtn);

  chatHeaderEl.appendChild(left);
  chatHeaderEl.appendChild(actions);

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

    const other = msg.senderType === 'artistMember' && !isUserReply;
    const wrap = document.createElement('div');
    wrap.className = 'msg-wrapper' + (isGroupedWithPrev ? ' grouped-next' : '');
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

    prevGroupInfo = {
      day,
      minuteKey,
      senderKey,
    };
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

function applyMembersAndRender(nextMembers) {
  membersData = Array.isArray(nextMembers) ? nextMembers : [];
  if (membersData.length === 0) {
    activeMemberId = null;
    renderSidebar();
    renderChat(null);
    return false;
  }

  if (!activeMemberId || !membersData.some((m) => m.artistMemberId === activeMemberId)) {
    activeMemberId = membersData[0].artistMemberId;
  }
  renderSidebar();
  renderChat(membersData.find((m) => m.artistMemberId === activeMemberId) || null);
  showChatPage();
  return true;
}

async function enterChatSession() {
  const syncGen = ++activeSyncGeneration;
  setLoginStatus('正在載入頻道與訊息...');

  const results = await CosmoSync.syncAllChannels({
    isCancelled: () => syncGen !== activeSyncGeneration,
    onCachedReady: (cachedMembers) => {
      if (syncGen === activeSyncGeneration && Array.isArray(cachedMembers) && cachedMembers.length > 0) {
        applyMembersAndRender(cachedMembers);
      }
    },
  });

  if (syncGen !== activeSyncGeneration || !results) return;

  if (results.length === 0) {
    await logoutToLoginPage('目前帳號沒有可用頻道，已自動登出並清除快取');
    return;
  }

  applyMembersAndRender(results);
}

jwtLoginBtnEl.onclick = async () => {
  const parsed = CosmoAuth.parseLoginInput(jwtLoginInputEl.value);
  if (!parsed.accessToken && !parsed.refreshToken) {
    showLoginPage('請輸入 JWT Access Token 或 Refresh Token');
    return;
  }

  try {
    await CosmoStorage.saveTokens(parsed);
    if (!parsed.accessToken && parsed.refreshToken) {
      await CosmoAuth.ensureFreshTokens({ force: true });
    }
    jwtLoginInputEl.value = '';
    await enterChatSession();
  } catch (err) {
    showLoginPage(err?.message || CosmoSync.EXPIRED_JWT_MESSAGE);
  }
};

async function logoutToLoginPage(statusMsg = '已登出並清除 IndexedDB 中的憑證與快取') {
  activeSyncGeneration++;
  await CosmoStorage.clearTokens();
  await CosmoStorage.clearNdjsonCache().catch(() => {});
  membersData = [];
  activeMemberId = null;
  renderSidebar();
  renderChat(null);
  showLoginPage(statusMsg);
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