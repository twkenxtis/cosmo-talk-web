if (typeof window !== 'undefined' && !window.__DEMO_CHAT_VIEW_GUARD__) {
  window.__DEMO_CHAT_VIEW_GUARD__ = true;
  window.__DEMO_ENSURE_MEMBER_MESSAGES__ = async function (member) {
    if (!(typeof window !== 'undefined' && window.IS_DEMO_MODE) || !member || typeof member !== 'object') return member;
    const existing = Array.isArray(member.messages)
      ? member.messages
      : Array.isArray(member.items)
        ? member.items
        : null;
    if (existing && existing.length > 0) return member;

    try {
      const res = await fetch('demo/last.json', { cache: 'no-store' });
      if (!res.ok) return member;
      const json = await res.json();
      const rawList = Array.isArray(json?.messages) ? json.messages : [];
      const mid = member.artistMemberId ?? member.id ?? 3;
      const normalized = rawList.map((entry, idx) => {
        const m = entry?.message && typeof entry.message === 'object' ? entry.message : entry;
        return {
          ...m,
          artistMemberId: mid,
          syncId: `${m.syncId || 'demo_msg'}_${mid}_${idx}`,
          cursor: entry?.cursor || m.cursor || String(idx + 1),
        };
      });
      member.messages = normalized;
    } catch (_) {}
    return member;
  };
}

const CosmoChatView = (() => {
  'use strict';

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

  const tr = (key, vars) =>
    typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function'
      ? CosmoI18n.t(key, vars)
      : nfc(String(key));

  const COPY_ICON_HTML = '<i class="ti ti-copy" aria-hidden="true"></i>';
  const CHECK_ICON_HTML = '<i class="ti ti-check" aria-hidden="true"></i>';
  const LOGOUT_ICON_HTML = '<i class="ti ti-logout" aria-hidden="true"></i>';
  const EXPORT_ICON_HTML = '<i class="ti ti-file-export" aria-hidden="true"></i>';
  const SETTINGS_ICON_HTML = '<i class="ti ti-tool" aria-hidden="true"></i>';

  const dom = {
    chatShell: document.getElementById('chat-shell'),
    memberList: document.getElementById('member-list'),
    chatHeader: document.getElementById('chat-header'),
    chat: document.getElementById('chat'),
    timelineRail: document.getElementById('timeline-rail'),
  };

  const viewState = {
    currentRenderedItems: [],
    currentSegmentStarts: [],
  };

  let callbacks = {
    onSelectMember: () => {},
    onLogout: () => {},
  };

  async function copyTextToClipboard(text) {
    const value = String(text ?? '');
    if (!value) return false;

    const fallbackExecCopy = () => {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('aria-hidden', 'true');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.width = '2em';
      ta.style.height = '2em';
      ta.style.padding = '0';
      ta.style.border = 'none';
      ta.style.outline = 'none';
      ta.style.boxShadow = 'none';
      ta.style.background = 'transparent';
      ta.style.opacity = '0';
      ta.style.fontSize = '16px';
      document.body.appendChild(ta);

      try {
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        return Boolean(document.execCommand('copy'));
      } catch (_) {
        return false;
      } finally {
        ta.remove();
      }
    };

    if (
      window.isSecureContext &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (_) {
        return fallbackExecCopy();
      }
    }

    return fallbackExecCopy();
  }

  function toggleSidebar(force) {
    if (!dom.chatShell) return;
    const next = typeof force === 'boolean'
      ? force
      : !dom.chatShell.classList.contains('sidebar-collapsed');
    dom.chatShell.classList.toggle('sidebar-collapsed', next);
  }

  function renderSidebar(membersData, activeMemberId) {
    if (!dom.memberList) return;
    const frag = document.createDocumentFragment();

    for (const m of membersData) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'member-item' + (m.artistMemberId === activeMemberId ? ' active' : '');
      btn.onclick = () => {
        callbacks.onSelectMember(m);
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

    dom.memberList.replaceChildren(frag);
  }

  function buildHeaderActions(member) {
    const actions = document.createElement('div');
    actions.className = 'header-actions';

    const expBtn = document.createElement('button');
    expBtn.type = 'button';
    expBtn.className = 'icon-btn';
    expBtn.title = tr('export_text');
    expBtn.setAttribute('aria-label', tr('export_text'));
    expBtn.innerHTML = EXPORT_ICON_HTML;
    expBtn.onclick = () =>
      CosmoExport.exportMemberText({
        member,
        renderedItems: viewState.currentRenderedItems,
        segmentStarts: viewState.currentSegmentStarts,
        headerEl: dom.chatHeader,
      });

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'icon-btn';
    copyBtn.title = tr('copy_artist_text');
    copyBtn.setAttribute('aria-label', tr('copy_artist_text'));
    copyBtn.innerHTML = COPY_ICON_HTML;
    copyBtn.onclick = async () => {
      const { text } = CosmoExport.buildMemberText({
        renderedItems: viewState.currentRenderedItems,
        segmentStarts: viewState.currentSegmentStarts,
        headerEl: dom.chatHeader,
      });
      if (!text) return;

      const ok = await copyTextToClipboard(text);
      copyBtn.innerHTML = ok ? CHECK_ICON_HTML : COPY_ICON_HTML;
      copyBtn.title = ok ? tr('copied') : tr('copy_failed');
      copyBtn.disabled = true;

      setTimeout(() => {
        copyBtn.innerHTML = COPY_ICON_HTML;
        copyBtn.title = tr('copy_artist_text');
        copyBtn.disabled = false;
      }, 1500);
    };

    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'icon-btn';
    settingsBtn.title = tr('settings');
    settingsBtn.setAttribute('aria-label', tr('settings'));
    settingsBtn.innerHTML = SETTINGS_ICON_HTML;
    settingsBtn.onclick = () => {
      if (typeof CosmoSettings !== 'undefined' && typeof CosmoSettings.toggle === 'function') {
        CosmoSettings.toggle();
      }
    };

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'icon-btn';
    logoutBtn.title = tr('logout');
    logoutBtn.setAttribute('aria-label', tr('logout'));
    logoutBtn.innerHTML = LOGOUT_ICON_HTML;
    logoutBtn.onclick = () => callbacks.onLogout();

    actions.appendChild(expBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(settingsBtn);
    actions.appendChild(logoutBtn);
    return actions;
  }

  function renderChat(member) {
  if (typeof window !== 'undefined' && window.CosmoTranslate && typeof window.CosmoTranslate.setMemberContext === 'function') { window.CosmoTranslate.setMemberContext(member); }
  if ((typeof window !== 'undefined' && window.IS_DEMO_MODE) && arguments[0] && !Array.isArray(arguments[0].messages)) { window.__DEMO_ENSURE_MEMBER_MESSAGES__(arguments[0]); }
    if (!dom.chatHeader || !dom.chat || !dom.timelineRail) return;

    dom.chatHeader.replaceChildren();
    dom.chat.replaceChildren();
    dom.timelineRail.replaceChildren();
    dom.timelineRail.classList.add('empty');
    viewState.currentRenderedItems = [];
    viewState.currentSegmentStarts = [];

    if (!member) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = tr('no_channel_data');
      dom.chat.appendChild(empty);
      return;
    }

    const label = memberLabel(member);
    const left = document.createElement('div');
    left.className = 'header-left';

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'icon-btn';
    menuBtn.title = tr('toggle_sidebar');
    menuBtn.setAttribute('aria-label', tr('toggle_sidebar'));
    menuBtn.textContent = '☰';
    menuBtn.onclick = () => toggleSidebar();
    left.appendChild(menuBtn);

    const title = document.createElement('div');
    title.className = 'header-title';
    title.textContent = label;
    left.appendChild(title);

    dom.chatHeader.appendChild(left);
    dom.chatHeader.appendChild(buildHeaderActions(member));

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

      if (isGroupedWithPrev && prevGroupInfo.timeEl) {
        prevGroupInfo.timeEl.textContent = '';
      }

      const other = msg.senderType === 'artistMember' && !isUserReply;
      const wrap = document.createElement('div');
      wrap.className = 'msg-wrapper' + (isGroupedWithPrev ? ' grouped-next' : '');
      const anchorId = `msg-${member.artistMemberId}-${count}`;
    const __srcId = (msg && (msg.sourceId || (typeof msg.syncId === 'string' && msg.syncId.includes(':') ? msg.syncId.split(':').pop() : ''))) || '';
    const __mid = (msg && msg.artistMemberId) ?? member.artistMemberId ?? '';
      wrap.id = anchorId; if (__srcId) wrap.dataset.sourceId = String(__srcId); if (__mid !== '') wrap.dataset.artistMemberId = String(__mid);
      if (!other) wrap.style.flexDirection = 'row-reverse';

      if (other) {
        const av = document.createElement('div');
        av.className = 'avatar';
        if (member.profileImageUrl) {
          av.style.backgroundImage = `url('${member.profileImageUrl}')`;
        }
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
        qh.textContent = nfc(tr('replied_by', { name: member.artistMemberName || '' }));
        const qt = document.createElement('div');
        qt.textContent = nfc(
          typeof msg.replyContent === 'object'
            ? JSON.stringify(msg.replyContent)
            : msg.replyContent
        );
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
      viewState.currentRenderedItems.push({ element: wrap, msg });

      const ms = msg.createdAt ? Date.parse(msg.createdAt) : NaN;
      if (!Number.isNaN(ms)) {
        if (lastMs === null || Math.abs(ms - lastMs) / 60000 > 31) {
          viewState.currentSegmentStarts.push({
            id: anchorId,
            iso: msg.createdAt,
            renderedIndex: idx,
          });
        }
        lastMs = ms;
      }

      prevGroupInfo = {
        day,
        minuteKey,
        senderKey,
        timeEl: tEl,
      };
    }

    dom.chat.appendChild(chatFrag);

    if (viewState.currentSegmentStarts.length > 0) {
      dom.timelineRail.classList.remove('empty');
      const railFrag = document.createDocumentFragment();
      for (const seg of viewState.currentSegmentStarts) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'timeline-btn';
        b.textContent = fmtTimeline(seg.iso);
        b.onclick = () => {
          const target = document.getElementById(seg.id);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        };
        railFrag.appendChild(b);
      }
      dom.timelineRail.appendChild(railFrag);

      const lastSeg = viewState.currentSegmentStarts[viewState.currentSegmentStarts.length - 1];
      const lastTarget = document.getElementById(lastSeg.id);
      if (lastTarget) {
        requestAnimationFrame(() => {
          lastTarget.scrollIntoView({ behavior: 'instant', block: 'start' });
        });
      }
    }
  }

  function init(options = {}) {
    callbacks = { ...callbacks, ...options };
  }

  return {
    init,
    toggleSidebar,
    renderSidebar,
    renderChat,
  };
})();

/* --- TRANSLATION BUBBLE & CONTINUOUS SCROLL UP INTEGRATION (V6) --- */
(() => {
  if (typeof window === 'undefined' || typeof CosmoTranslate === 'undefined') return;
  if (window.__COSMO_TRANSLATE_CHAT_HOOK_V6__) return;
  window.__COSMO_TRANSLATE_CHAT_HOOK_V6__ = true;

  if (typeof CosmoChatView !== 'undefined' && typeof CosmoChatView.renderChat === 'function') {
    window.CosmoChatView = CosmoChatView;
    const origRenderChat = CosmoChatView.renderChat.bind(CosmoChatView);
    CosmoChatView.renderChat = function (member, ...rest) {
      const res = origRenderChat(member, ...rest);
      CosmoTranslate.setMemberContext(member);
      if (CosmoTranslate.isEnabled()) {
        CosmoTranslate.renderCachedForCurrentView();
      }
      return res;
    };
  }

  // 只要向上捲動（包含 window、#chat 或任何可捲動容器）就漸進觸發下一批 30 筆（無最大請求限制）
  const lastTopByEl = new WeakMap();

  function triggerIfScrollingUp(el) {
    if (!CosmoTranslate.isEnabled()) return;
    const scroller =
      el && el !== document && el.scrollHeight > el.clientHeight
        ? el
        : document.scrollingElement || document.documentElement;
    const curTop = Number(scroller.scrollTop || 0);
    const prevTop = lastTopByEl.get(scroller);
    lastTopByEl.set(scroller, curTop);

    if (prevTop !== undefined && curTop < prevTop) {
      CosmoTranslate.requestNextBatch();
    }
  }

  window.addEventListener('scroll', (ev) => {
    triggerIfScrollingUp(ev?.target);
  }, { passive: true, capture: true });

  window.addEventListener('wheel', (ev) => {
    if (!CosmoTranslate.isEnabled()) return;
    if (typeof ev.deltaY === 'number' && ev.deltaY < 0) {
      CosmoTranslate.requestNextBatch();
    }
  }, { passive: true, capture: true });

  // 時間軸跳轉後補齊可視區快取與下一批
  document.addEventListener('click', (ev) => {
    const tBtn = ev.target?.closest?.('.timeline-btn');
    if (tBtn && CosmoTranslate.isEnabled()) {
      setTimeout(() => {
        if (CosmoTranslate.isEnabled()) {
          CosmoTranslate.renderCachedForCurrentView();
          CosmoTranslate.requestNextBatch();
        }
      }, 200);
    }
  }, { passive: true, capture: true });
})();
