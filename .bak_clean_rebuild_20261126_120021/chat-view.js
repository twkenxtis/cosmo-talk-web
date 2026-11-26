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
          // [DISABLED AUTO-JUMP TO LAST TIMELINE] lastTarget.scrollIntoView({ behavior: 'instant', block: 'start' });
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

/* --- FLOATING SCROLL-TO-BOTTOM BUTTON (RELATIVE ABOVE SEND BTN) --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_SCROLL_BOTTOM_BTN_INIT__) return;
  window.__COSMO_SCROLL_BOTTOM_BTN_INIT__ = true;

  const TI_CHEVRON_HTML = '<i class="ti ti-chevron-down" aria-hidden="true"></i>';

  const SVG_CHEVRON_HTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" ' +
    'fill="none" stroke="#10202b" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" ' +
    'class="icon icon-tabler icons-tabler-outline icon-tabler-chevron-down" aria-hidden="true" ' +
    'style="width:22px;height:22px;min-width:22px;min-height:22px;display:block;flex-shrink:0;">' +
    '<path stroke="none" d="M0 0h24v24H0z" fill="none"/>' +
    '<path d="M6 9l6 6l6 -6" /></svg>';

  let useSvgFallback = false;

  function ensureScopedStyle() {
    if (document.getElementById('cosmo-scroll-bottom-style')) return;
    const style = document.createElement('style');
    style.id = 'cosmo-scroll-bottom-style';
    style.textContent = `
      #btn-scroll-to-bottom {
        position: relative;
        align-self: flex-end;
        margin-right: 1px;
        margin-bottom: 2px;
        width: 42px;
        height: 42px;
        min-width: 42px;
        min-height: 42px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background-color: #99d6ff;
        color: #10202b;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        line-height: 1;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.38);
        cursor: pointer;
        z-index: 24;
        flex-shrink: 0;
        transition: transform 0.16s ease, background-color 0.15s ease;
        -webkit-tap-highlight-color: transparent;
      }
      #btn-scroll-to-bottom.visible {
        display: inline-flex;
      }
      #btn-scroll-to-bottom:hover {
        background-color: #82cbff;
      }
      #btn-scroll-to-bottom:active {
        transform: scale(0.94);
      }
      #btn-scroll-to-bottom i.ti {
        color: #10202b;
        font-size: 22px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      @media (max-width: 768px) {
        #btn-scroll-to-bottom {
          width: 40px;
          height: 40px;
          min-width: 40px;
          min-height: 40px;
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  async function detectFontFallback() {
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      const probe = document.createElement('i');
      probe.className = 'ti ti-chevron-down';
      probe.style.position = 'fixed';
      probe.style.left = '-9999px';
      probe.style.visibility = 'hidden';
      document.body.appendChild(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      if (w < 8) {
        useSvgFallback = true;
      }
    } catch (_) {
      useSvgFallback = true;
    }
    const btn = document.getElementById('btn-scroll-to-bottom');
    if (btn) {
      const desired = useSvgFallback ? SVG_CHEVRON_HTML : TI_CHEVRON_HTML;
      if (btn.innerHTML !== desired) btn.innerHTML = desired;
    }
  }

  function isChatScreenActive() {
    const shell = document.getElementById('chat-shell');
    if (!shell || !shell.classList.contains('active')) return false;
    const overlay = document.getElementById('loading-overlay');
    if (overlay && overlay.classList.contains('active')) return false;
    const loginPage = document.getElementById('login-page');
    if (loginPage && getComputedStyle(loginPage).display !== 'none') return false;
    return true;
  }

  function getScrollMetrics() {
    const docEl = document.scrollingElement || document.documentElement || document.body;
    const chatEl = document.getElementById('chat');
    if (chatEl && chatEl.scrollHeight > chatEl.clientHeight + 20) {
      const maxTop = Math.max(0, chatEl.scrollHeight - chatEl.clientHeight);
      const distFromBottom = Math.max(0, maxTop - chatEl.scrollTop);
      return { scroller: chatEl, isWindow: false, maxTop, distFromBottom };
    }
    const viewH = window.innerHeight || docEl.clientHeight || 0;
    const scrollH = Math.max(docEl.scrollHeight || 0, document.body?.scrollHeight || 0);
    const curTop = window.scrollY ?? window.pageYOffset ?? docEl.scrollTop ?? 0;
    const maxTop = Math.max(0, scrollH - viewH);
    const distFromBottom = Math.max(0, maxTop - curTop);
    return { scroller: docEl, isWindow: true, maxTop, distFromBottom };
  }

  function scrollToAbsoluteBottom() {
    const { scroller, isWindow } = getScrollMetrics();
    if (isWindow) {
      const targetTop = Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
      setTimeout(() => {
        const finalTop = Math.max(
          document.documentElement?.scrollHeight || 0,
          document.body?.scrollHeight || 0
        );
        window.scrollTo({ top: finalTop, behavior: 'smooth' });
      }, 320);
    } else if (scroller) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
      setTimeout(() => {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
      }, 320);
    }
  }

  function alignAboveSendButton(btn) {
    const wrapper = document.querySelector('.chat-composer-wrapper');
    const sendBtn = document.getElementById('send-msg-btn') || document.querySelector('.send-msg-btn');
    if (!wrapper || !btn) return;

    if (btn.parentElement !== wrapper) {
      wrapper.appendChild(btn);
    }

    // 確保位於 .composer-bar 正上方，並依發送按鈕寬度微調右側對齊
    const composerBar = wrapper.querySelector('.composer-bar');
    if (composerBar && btn.nextElementSibling !== composerBar) {
      wrapper.insertBefore(btn, composerBar);
    }

    if (sendBtn && wrapper.getBoundingClientRect) {
      const wRect = wrapper.getBoundingClientRect();
      const sRect = sendBtn.getBoundingClientRect();
      if (wRect.width > 0 && sRect.width > 0) {
        const offsetRight = Math.max(0, Math.round(wRect.right - sRect.right + (sRect.width - btn.offsetWidth) / 2));
        btn.style.marginRight = `${offsetRight}px`;
      }
    }
  }

  function updateVisibility() {
    const btn = ensureButton();
    if (!btn) return;

    if (!isChatScreenActive()) {
      btn.classList.remove('visible');
      return;
    }

    alignAboveSendButton(btn);
    const { distFromBottom } = getScrollMetrics();
    const thresholdPx = (window.innerHeight || document.documentElement.clientHeight || 600) * 1.5;
    const shouldShow = distFromBottom >= thresholdPx;
    btn.classList.toggle('visible', shouldShow);
    if (shouldShow) {
      alignAboveSendButton(btn);
    }
  }

  function ensureButton() {
    const wrapper = document.querySelector('.chat-composer-wrapper');
    if (!wrapper) return null;
    ensureScopedStyle();

    let btn = document.getElementById('btn-scroll-to-bottom');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btn-scroll-to-bottom';
      btn.title = 'Scroll to bottom';
      btn.setAttribute('aria-label', 'Scroll to bottom');
      btn.innerHTML = useSvgFallback ? SVG_CHEVRON_HTML : TI_CHEVRON_HTML;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        scrollToAbsoluteBottom();
      });
      wrapper.appendChild(btn);
    }
    alignAboveSendButton(btn);
    return btn;
  }

  function init() {
    ensureButton();
    detectFontFallback();
    updateVisibility();

    window.addEventListener('scroll', updateVisibility, { passive: true, capture: true });
    window.addEventListener('resize', updateVisibility, { passive: true });

    const mo = new MutationObserver(() => updateVisibility());
    mo.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
/* --- SPLIT FROM APP.JS: MEMBER AVATAR RING, REPLY CHAINS, SEARCH & ENGLISH DATES --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_SPLIT_CHAT_VIEW_EXT_INIT__) return;
  window.__COSMO_SPLIT_CHAT_VIEW_EXT_INIT__ = true;

  const ORIGINAL_NAME_COLORS = {
    SeoYeon: '#22AEFF', HyeRin: '#9200FF', JiWoo: '#FFF800', ChaeYeon: '#98F21D',
    YooYeon: '#DB0C74', SooMin: '#FC83A4', NaKyoung: '#6799A0', YuBin: '#FFE3E2',
    Kaede: '#FFC935', DaHyun: '#FF9AD6', Kotone: '#FFDE00', YeonJi: '#5974FF',
    Nien: '#FF953F', SoHyun: '#1222B5', Xinyu: '#D51313', Mayu: '#FE8E76',
    Lynn: '#AC62B7', JooBin: '#B7F54C', HaYeon: '#52D9BB', ShiOn: '#FF428A',
    ChaeWon: '#C7A3E0', Sullin: '#7BBA8D', SeoAh: '#CFF3FF', JiYeon: '#FFAB62',
    tripleS: '#333333',
  };
  const LOWER_NAME_COLORS = Object.fromEntries(
    Object.entries(ORIGINAL_NAME_COLORS).map(([k, v]) => [k.toLowerCase(), v])
  );

  function resolveColorByOriginalName(originalName) {
    if (!originalName || typeof originalName !== 'string') return null;
    const t = originalName.trim();
    if (!t) return null;
    if (ORIGINAL_NAME_COLORS[t]) return ORIGINAL_NAME_COLORS[t];
    const low = t.toLowerCase();
    if (LOWER_NAME_COLORS[low]) return LOWER_NAME_COLORS[low];
    for (const [k, hex] of Object.entries(LOWER_NAME_COLORS)) {
      if (low.includes(k)) return hex;
    }
    return null;
  }

  function applySidebarThumbBorders() {
    const byId = window.__COSMO_CHANNEL_COLOR_BY_ID__ || {};
    const byName = window.__COSMO_CHANNEL_COLOR_BY_NAME__ || {};
    const items = document.querySelectorAll(
      '#sidebar .member-item, .sidebar .member-item, #member-list .member-item, #member-list button, #member-list [data-member-id], #member-list [data-channel-id]'
    );
    items.forEach((item) => {
      const thumb = item.querySelector('.member-thumb') || item.querySelector('img');
      if (!thumb) return;
      const idAttr = item.dataset.memberId || item.dataset.channelId || item.dataset.artistId || item.getAttribute('data-id') || '';
      const labelText = (item.querySelector('.member-label')?.textContent || item.textContent || '').trim();
      const color = (idAttr && byId[String(idAttr).trim()]) || (labelText ? (byName[labelText.toLowerCase()] || resolveColorByOriginalName(labelText)) : null);
      if (color) {
        thumb.style.borderRadius = '50%';
        thumb.style.border = `2.5px solid ${color}`;
        thumb.style.boxSizing = 'border-box';
      }
    });
  }

  window.CosmoOriginalNameColors = window.CosmoOriginalNameColors || {
    map: ORIGINAL_NAME_COLORS,
    resolve: resolveColorByOriginalName,
    applySidebarThumbBorders,
  };

  const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function formatKoreanDateToEnglish(raw) {
    const text = String(raw || '').trim();
    const m = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (!m) return text;
    const monthIdx = Number(m[2]) - 1;
    if (monthIdx < 0 || monthIdx > 11) return text;
    return text.replace(m[0], `${MONTHS_EN[monthIdx]} ${Number(m[3])}, ${Number(m[1])}`);
  }

  function applyEnglishDates() {
    const chatRoot = document.getElementById('chat') || document.body;
    if (!chatRoot) return;
    const walker = document.createTreeWalker(chatRoot, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const val = node.nodeValue || '';
      if (/\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/.test(val)) {
        const tag = node.parentElement?.tagName?.toLowerCase() || '';
        if (tag !== 'script' && tag !== 'style') node.nodeValue = formatKoreanDateToEnglish(val);
      }
    }
  }

  function syncChatViewExtras() {
    applySidebarThumbBorders();
    applyEnglishDates();
  }

  syncChatViewExtras();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncChatViewExtras, { once: true });
  }
  const mo = new MutationObserver(() => syncChatViewExtras());
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true, characterData: true });
})();
/* --- TOPBAR SEARCH BUTTON (#cosmo-member-search-btn) & SEARCH BAR --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_CHAT_VIEW_SEARCH_INIT__) return;
  window.__COSMO_CHAT_VIEW_SEARCH_INIT__ = true;

  const BTN_ID = 'cosmo-member-search-btn';
  const BAR_ID = 'cosmo-search-bar';
  const INPUT_ID = 'cosmo-search-input';
  const COUNT_ID = 'cosmo-search-count';

  let matches = [];
  let currentIdx = -1;

  function getSearchPlaceholder() {
    if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function') {
      const val = CosmoI18n.t('search_member_placeholder');
      if (val && val !== 'search_member_placeholder') return val;
    }
    return '搜尋目前成員（包含翻譯內容）...';
  }

  function clearHits() {
    document.querySelectorAll('.cosmo-search-hit').forEach((el) => {
      el.classList.remove('cosmo-search-hit');
    });
  }

  function jumpToMatch(idx) {
    clearHits();
    const countEl = document.getElementById(COUNT_ID);
    if (!matches.length) {
      if (countEl) countEl.textContent = '0 / 0';
      return;
    }
    currentIdx = ((idx % matches.length) + matches.length) % matches.length;
    const target = matches[currentIdx];
    target.classList.add('cosmo-search-hit');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (countEl) countEl.textContent = `${currentIdx + 1} / ${matches.length}`;
  }

  function runSearch(rawQuery) {
    const q = String(rawQuery || '').trim().toLowerCase();
    matches = [];
    currentIdx = -1;
    clearHits();

    const countEl = document.getElementById(COUNT_ID);
    if (!q) {
      if (countEl) countEl.textContent = '0 / 0';
      return;
    }

    const chatEl = document.getElementById('chat');
    if (!chatEl) return;

    const wrappers = Array.from(chatEl.querySelectorAll('.msg-wrapper'));
    for (const w of wrappers) {
      if (w.offsetParent === null) continue;
      const text = String(w.textContent || '').toLowerCase();
      if (text.includes(q)) {
        matches.push(w);
      }
    }
    jumpToMatch(0);
  }

  function ensureSearchUi() {
    const header = document.getElementById('chat-header') || document.querySelector('.chat-header');
    if (!header) return;

    const actions = header.querySelector('.header-actions') || header;
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = BTN_ID;
      btn.className = 'icon-btn';
      btn.innerHTML = '<i class="ti ti-search" aria-hidden="true"></i>';
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const bar = document.getElementById(BAR_ID);
        if (!bar) return;
        bar.classList.toggle('open');
        if (bar.classList.contains('open')) {
          document.getElementById(INPUT_ID)?.focus();
        } else {
          clearHits();
        }
      });
    }

    const placeholderText = getSearchPlaceholder();
    const cleanLabel = placeholderText.replace(/\.{3,}$/, '').trim();
    btn.title = cleanLabel;
    btn.setAttribute('aria-label', cleanLabel);
    btn.style.display = 'inline-flex';

    if (btn.parentElement !== actions) {
      actions.prepend(btn);
    }

    let bar = document.getElementById(BAR_ID);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = BAR_ID;
      bar.className = 'cosmo-search-bar';

      const input = document.createElement('input');
      input.type = 'search';
      input.id = INPUT_ID;
      input.className = 'cosmo-search-input';
      input.placeholder = placeholderText;
      input.setAttribute('aria-label', cleanLabel);

      const countSpan = document.createElement('span');
      countSpan.id = COUNT_ID;
      countSpan.className = 'cosmo-search-count';
      countSpan.textContent = '0 / 0';

      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'icon-btn';
      prevBtn.title = '上一筆';
      prevBtn.textContent = '↑';
      prevBtn.addEventListener('click', () => jumpToMatch(currentIdx - 1));

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'icon-btn';
      nextBtn.title = '下一筆';
      nextBtn.textContent = '↓';
      nextBtn.addEventListener('click', () => jumpToMatch(currentIdx + 1));

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'icon-btn';
      closeBtn.title = '關閉搜尋';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', () => {
        bar.classList.remove('open');
        clearHits();
      });

      input.addEventListener('input', () => runSearch(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          jumpToMatch(e.shiftKey ? currentIdx - 1 : currentIdx + 1);
        } else if (e.key === 'Escape') {
          bar.classList.remove('open');
          clearHits();
        }
      });

      bar.appendChild(input);
      bar.appendChild(countSpan);
      bar.appendChild(prevBtn);
      bar.appendChild(nextBtn);
      bar.appendChild(closeBtn);
    } else {
      const input = document.getElementById(INPUT_ID);
      if (input && input.placeholder !== placeholderText) {
        input.placeholder = placeholderText;
        input.setAttribute('aria-label', cleanLabel);
      }
    }

    if (header.nextElementSibling !== bar) {
      header.insertAdjacentElement('afterend', bar);
    }
  }

  ensureSearchUi();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureSearchUi, { once: true });
  }
  if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.onChange === 'function') {
    CosmoI18n.onChange(ensureSearchUi);
  }
  const mo = new MutationObserver(() => ensureSearchUi());
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();
/* --- GUARANTEED TRANSLATE BUTTON ALONGSIDE SEARCH BUTTON (SAFARI SAFE) --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_GUARANTEED_TRANSLATE_BTN_INIT__) return;
  window.__COSMO_GUARANTEED_TRANSLATE_BTN_INIT__ = true;

  const BTN_ID = 'btn-toggle-translate';
  const ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'style="width:20px;height:20px;display:block;flex-shrink:0;pointer-events:none;">' +
    '<path stroke="none" d="M0 0h24v24H0z" fill="none"/>' +
    '<path d="M4 5h7" /><path d="M9 3v2c0 4.418 -2.239 8 -5 8" />' +
    '<path d="M5 9c0 2.144 2.952 3.908 6.7 4" /><path d="M12 20l4 -9l4 9" />' +
    '<path d="M19.1 18h-6.2" /></svg>';

  function syncTranslateBtnInHeader() {
    const header = document.getElementById('chat-header') || document.querySelector('.chat-header');
    if (!header) return;

    const actions = header.querySelector('.header-actions') || header;
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = BTN_ID;
      btn.className = 'icon-btn btn-toggle-translate';
      btn.title = 'Translate (ON/OFF)';
      btn.setAttribute('aria-label', 'Translate (ON/OFF)');
      btn.innerHTML = ICON_SVG;

      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof window.CosmoTranslate !== 'undefined' && typeof window.CosmoTranslate.toggle === 'function') {
          const isOn = Boolean(window.CosmoTranslate.toggle());
          btn.dataset.translateOn = isOn ? '1' : '0';
          btn.classList.toggle('active', isOn);
          btn.classList.toggle('is-active', isOn);
        } else {
          const next = btn.dataset.translateOn !== '1';
          btn.dataset.translateOn = next ? '1' : '0';
          btn.classList.toggle('active', next);
          btn.classList.toggle('is-active', next);
        }
      });
    }

    // 確保內部一定有明確尺寸的 SVG，防止 Safari 壓扁或字型遺失
    if (!btn.querySelector('svg')) {
      btn.innerHTML = ICON_SVG;
    }

    // 放在搜尋按鈕旁邊（若搜尋按鈕存在，插在它後面；否則放在 actions 最前面）
    const searchBtn = document.getElementById('cosmo-member-search-btn');
    if (searchBtn && searchBtn.parentElement === actions) {
      if (searchBtn.nextElementSibling !== btn) {
        searchBtn.insertAdjacentElement('afterend', btn);
      }
    } else if (btn.parentElement !== actions) {
      actions.prepend(btn);
    }

    if (typeof window.CosmoTranslate !== 'undefined' && typeof window.CosmoTranslate.isEnabled === 'function') {
      const isOn = Boolean(window.CosmoTranslate.isEnabled());
      btn.dataset.translateOn = isOn ? '1' : '0';
      btn.classList.toggle('active', isOn);
      btn.classList.toggle('is-active', isOn);
    }
  }

  syncTranslateBtnInHeader();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncTranslateBtnInHeader, { once: true });
  }
  const mo = new MutationObserver(() => syncTranslateBtnInHeader());
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();

/* --- LOCK USER VIEWPORT ON FETCH & SHOW SCROLL DOWN BUTTON WHEN NEW MSG OFF-SCREEN --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_VIEWPORT_LOCK_AND_SCROLL_BTN_INIT__) return;
  window.__COSMO_VIEWPORT_LOCK_AND_SCROLL_BTN_INIT__ = true;

  const BTN_ID = 'cosmo-scroll-down-btn';
  const BOTTOM_THRESHOLD_PX = 48;
  let unseenNewCount = 0;

  function getChatScroller() {
    const chatEl = document.getElementById('chat');
    if (chatEl && chatEl.scrollHeight > chatEl.clientHeight + 2) {
      return chatEl;
    }
    return document.scrollingElement || document.documentElement;
  }

  function isNearBottom(scroller = getChatScroller()) {
    if (!scroller) return true;
    const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    return remaining <= BOTTOM_THRESHOLD_PX;
  }

  function captureViewportSnapshot() {
    const scroller = getChatScroller();
    if (!scroller) return null;
    const wasAtBottom = isNearBottom(scroller);
    const chatEl = document.getElementById('chat');
    let anchorSid = null;
    let anchorTopOffset = 0;

    if (!wasAtBottom && chatEl) {
      const chatRect = chatEl.getBoundingClientRect();
      const wrappers = chatEl.querySelectorAll('.msg-wrapper[data-source-id]');
      for (let i = 0; i < wrappers.length; i++) {
        const el = wrappers[i];
        const rect = el.getBoundingClientRect();
        if (rect.bottom >= chatRect.top + 4) {
          anchorSid = el.getAttribute('data-source-id');
          anchorTopOffset = rect.top - chatRect.top;
          break;
        }
      }
    }

    return {
      scroller,
      wasAtBottom,
      scrollTop: scroller.scrollTop,
      anchorSid,
      anchorTopOffset,
    };
  }

  function restoreViewportSnapshot(snap) {
    if (!snap || !snap.scroller) return;
    const { scroller, wasAtBottom, scrollTop, anchorSid, anchorTopOffset } = snap;
    const prevBehavior = scroller.style.scrollBehavior;
    scroller.style.scrollBehavior = 'auto';

    if (wasAtBottom) {
      scroller.scrollTop = scroller.scrollHeight;
      scroller.style.scrollBehavior = prevBehavior || '';
      return;
    }

    const chatEl = document.getElementById('chat');
    if (anchorSid && chatEl) {
      const target = chatEl.querySelector(`.msg-wrapper[data-source-id="${CSS.escape(anchorSid)}"]`);
      if (target) {
        const chatRect = chatEl.getBoundingClientRect();
        const nextOffset = target.getBoundingClientRect().top - chatRect.top;
        const delta = nextOffset - anchorTopOffset;
        if (Math.abs(delta) > 0.5) {
          scroller.scrollTop += delta;
        }
        scroller.style.scrollBehavior = prevBehavior || '';
        return;
      }
    }

    scroller.scrollTop = scrollTop;
    scroller.style.scrollBehavior = prevBehavior || '';
  }

  function ensureScrollDownButton() {
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = BTN_ID;
      btn.setAttribute('aria-label', '捲動至最新訊息');
      btn.title = '捲動至最新訊息';
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const scroller = getChatScroller();
        if (scroller) {
          scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
        }
        hideScrollDownButton();
      });
      document.body.appendChild(btn);
    }
    return btn;
  }

  function updateScrollDownButtonLabel(btn) {
    btn.textContent = unseenNewCount > 0 ? `↓ 新訊息 (${unseenNewCount})` : '↓';
  }

  function showScrollDownButton(addedCount = 1) {
    if (document.body.classList.contains('is-login-view')) return;
    if (isNearBottom()) {
      hideScrollDownButton();
      return;
    }
    unseenNewCount += Math.max(1, Number(addedCount) || 1);
    const btn = ensureScrollDownButton();
    updateScrollDownButtonLabel(btn);
    btn.classList.add('visible');
  }

  function hideScrollDownButton() {
    unseenNewCount = 0;
    const btn = document.getElementById(BTN_ID);
    if (btn) {
      btn.classList.remove('visible');
      updateScrollDownButtonLabel(btn);
    }
  }

  function bindBottomCheckListeners() {
    const check = () => {
      if (isNearBottom()) {
        hideScrollDownButton();
      }
    };
    const chatEl = document.getElementById('chat');
    if (chatEl && chatEl.dataset.cosmoScrollBtnBound !== '1') {
      chatEl.dataset.cosmoScrollBtnBound = '1';
      chatEl.addEventListener('scroll', check, { passive: true });
    }
    window.addEventListener('scroll', check, { passive: true });
  }

  // 供 fetch 完成渲染前後呼叫：鎖定畫面不跳動，若新訊息在視窗下方看不到則顯示按鈕
  function renderWithLockedViewport(renderFn, { hasNewMessages = false, newCount = 1 } = {}) {
    const snap = captureViewportSnapshot();
    renderFn();
    restoreViewportSnapshot(snap);
    requestAnimationFrame(() => {
      restoreViewportSnapshot(snap);
      if (hasNewMessages && !isNearBottom()) {
        showScrollDownButton(newCount);
      } else if (isNearBottom()) {
        hideScrollDownButton();
      }
    });
  }

  ensureScrollDownButton();
  bindBottomCheckListeners();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureScrollDownButton();
      bindBottomCheckListeners();
    }, { once: true });
  }
  const mo = new MutationObserver(() => bindBottomCheckListeners());
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });

  window.CosmoViewportLock = {
    renderWithLockedViewport,
    showScrollDownButton,
    hideScrollDownButton,
    isNearBottom,
  };
})();

/* --- EXACT LEFT & TOP ALIGNMENT ABOVE CHAT INPUT + SAFE BOTTOM SCROLL --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_EXACT_INPUT_BTN_INIT__) return;
  window.__COSMO_EXACT_INPUT_BTN_INIT__ = true;

  const BTN_ID = 'cosmo-scroll-down-btn';
  const BOTTOM_THRESHOLD_PX = 48;
  let unseenCount = 0;

  function isReallyVisible(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 50 && r.height > 18 && r.bottom > 0 && r.top < window.innerHeight;
  }

  function findTargetInput() {
    const phMatches = [...document.querySelectorAll('textarea, input[type="text"]')].filter((el) => {
      if (!isReallyVisible(el)) return false;
      const ph = (el.getAttribute('placeholder') || '').toLowerCase();
      return (
        ph.includes('message') ||
        ph.includes('訊息') ||
        ph.includes('消息') ||
        ph.includes('메시지') ||
        ph.includes('メッセージ') ||
        ph.includes('發送') ||
        ph.includes('發送')
      );
    });
    if (phMatches.length > 0) {
      // 挑最靠近畫面底部的輸入框
      phMatches.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
      return phMatches[0];
    }

    const fallback = [...document.querySelectorAll('#chat-shell textarea, #chat-shell input[type="text"]')].filter((el) => {
      if (!isReallyVisible(el)) return false;
      const meta = `${el.id || ''} ${el.className || ''}`.toLowerCase();
      return !meta.includes('search') && !meta.includes('filter');
    });
    if (fallback.length > 0) {
      fallback.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
      return fallback[0];
    }
    return null;
  }

  function getActiveScroller() {
    const chatEl = document.getElementById('chat');
    if (chatEl && chatEl.scrollHeight > chatEl.clientHeight + 2) {
      return chatEl;
    }
    return document.scrollingElement || document.documentElement;
  }

  function isAtBottom() {
    const sc = getActiveScroller();
    if (!sc) return true;
    return sc.scrollHeight - sc.scrollTop - sc.clientHeight <= BOTTOM_THRESHOLD_PX;
  }

  function scrollToBottomImmediate() {
    const chatEl = document.getElementById('chat');
    if (chatEl) {
      const prev = chatEl.style.scrollBehavior;
      chatEl.style.scrollBehavior = 'auto';
      chatEl.scrollTop = chatEl.scrollHeight;
      chatEl.style.scrollBehavior = prev || '';
    }
    const sc = document.scrollingElement || document.documentElement;
    if (sc) {
      const prevDoc = sc.style.scrollBehavior;
      sc.style.scrollBehavior = 'auto';
      sc.scrollTop = sc.scrollHeight;
      sc.style.scrollBehavior = prevDoc || '';
    }
    window.scrollTo(0, document.body ? document.body.scrollHeight : 0);
  }

  function formatLabel(count) {
    const n = Math.max(1, Number(count) || 1);
    const raw =
      typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function'
        ? CosmoI18n.t('new_messages_btn', { count: n })
        : `新訊息 (${n})`;
    const t = String(raw || '').trim();
    if (t.startsWith('↓') || t.startsWith('⬇') || t.startsWith('▼')) return t;
    return `↓ ${t}`;
  }

  function positionButtonExact() {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    if (btn.parentElement !== document.body) {
      document.body.appendChild(btn);
    }

    btn.textContent = formatLabel(unseenCount || 1);

    const inputEl = findTargetInput();
    if (inputEl) {
      const r = inputEl.getBoundingClientRect();
      const btnHeight = btn.offsetHeight || 36;
      const leftVal = Math.max(12, Math.round(r.left));
      const topVal = Math.max(48, Math.round(r.top - btnHeight - 10));
      btn.style.left = `${leftVal}px`;
      btn.style.top = `${topVal}px`;
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
      return;
    }

    const firstBubble = document.querySelector('#chat .bubble, #chat .msg-wrapper');
    if (firstBubble && isReallyVisible(firstBubble)) {
      const br = firstBubble.getBoundingClientRect();
      btn.style.left = `${Math.max(12, Math.round(br.left))}px`;
      btn.style.top = `${Math.max(48, Math.round(window.innerHeight - 130))}px`;
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
    }
  }

  function ensureButton() {
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = BTN_ID;
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        scrollToBottomImmediate();
        hideButton();
      });
      document.body.appendChild(btn);
    }
    return btn;
  }

  function showButton(count = 1) {
    if (document.body.classList.contains('is-login-view')) return;
    if (isAtBottom()) {
      hideButton();
      return;
    }
    unseenCount += Math.max(1, Number(count) || 1);
    const btn = ensureButton();
    btn.classList.add('visible');
    positionButtonExact();
    requestAnimationFrame(positionButtonExact);
  }

  function hideButton() {
    unseenCount = 0;
    const btn = document.getElementById(BTN_ID);
    if (btn) {
      btn.classList.remove('visible');
    }
  }

  window.addEventListener('resize', () => requestAnimationFrame(positionButtonExact), { passive: true });
  window.addEventListener('scroll', () => {
    if (isAtBottom()) hideButton();
    const btn = document.getElementById(BTN_ID);
    if (btn && btn.classList.contains('visible')) {
      requestAnimationFrame(positionButtonExact);
    }
  }, { passive: true });

  if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.onChange === 'function') {
    CosmoI18n.onChange(() => requestAnimationFrame(positionButtonExact));
  }

  ensureButton();
  window.CosmoViewportLock = Object.assign(window.CosmoViewportLock || {}, {
    showScrollDownButton: showButton,
    hideScrollDownButton: hideButton,
    scrollToBottomNow: scrollToBottomImmediate,
  });
})();

/* --- NO AUTO-JUMP TO LAST TIMELINE & REAL NEW-MESSAGE DETECTION ONLY --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_REAL_NEW_MSG_NO_TIMELINE_JUMP_INIT__) return;
  window.__COSMO_REAL_NEW_MSG_NO_TIMELINE_JUMP_INIT__ = true;

  const BTN_ID = 'cosmo-scroll-down-btn';
  const BOTTOM_THRESHOLD_PX = 48;

  // 記錄各成員已看過的真實訊息 ID 集合（只認訊息 ID/cursor，不認翻譯節點或總筆數變動）
  const seenMsgIdsByMember = new Map();
  const initializedMemberSet = new Set();

  let unseenRealCount = 0;

  function extractRealMsgIds(member) {
    const ids = new Set();
    if (!member || typeof member !== 'object') return ids;
    const records = Array.isArray(member.records) ? member.records : [];
    for (const rec of records) {
      if (!rec || rec.op === 'delete') continue;
      const msg = rec.message && typeof rec.message === 'object' ? rec.message : rec;
      const rawId =
        msg?.sourceId ??
        msg?.messageId ??
        msg?.id ??
        rec?.sourceId ??
        rec?.messageId ??
        rec?.cursor ??
        msg?.cursor ??
        '';
      const sid = String(rawId ?? '').trim();
      if (sid) {
        ids.add(sid);
      }
    }
    return ids;
  }

  // 回傳「真正新增」的訊息數量；首次載入建立基準線時回傳 0，避免把歷史訊息當新訊息
  function diffRealNewMessages(mid, member) {
    const key = String(mid ?? '').trim();
    if (!key) return 0;
    const currentIds = extractRealMsgIds(member);

    if (!initializedMemberSet.has(key)) {
      initializedMemberSet.add(key);
      seenMsgIdsByMember.set(key, currentIds);
      return 0;
    }

    const prevIds = seenMsgIdsByMember.get(key) || new Set();
    let added = 0;
    for (const id of currentIds) {
      if (!prevIds.has(id)) {
        added += 1;
      }
    }

    // 合併最新已知 ID
    for (const id of currentIds) {
      prevIds.add(id);
    }
    seenMsgIdsByMember.set(key, prevIds);
    return added;
  }

  function getActiveScroller() {
    const chatEl = document.getElementById('chat');
    if (chatEl && chatEl.scrollHeight > chatEl.clientHeight + 2) return chatEl;
    return document.scrollingElement || document.documentElement;
  }

  function isAtBottom() {
    const sc = getActiveScroller();
    if (!sc) return true;
    return sc.scrollHeight - sc.scrollTop - sc.clientHeight <= BOTTOM_THRESHOLD_PX;
  }

  function formatLabel(count) {
    const n = Math.max(1, Number(count) || 1);
    const raw =
      typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function'
        ? CosmoI18n.t('new_messages_btn', { count: n })
        : `新訊息 (${n})`;
    const t = String(raw || '').trim();
    if (t.startsWith('↓') || t.startsWith('⬇') || t.startsWith('▼')) return t;
    return `↓ ${t}`;
  }

  function hideBtn() {
    unseenRealCount = 0;
    const btn = document.getElementById(BTN_ID);
    if (btn) {
      btn.classList.remove('visible');
    }
  }

  function showRealNewMsgBtn(addedCount) {
    const count = Number(addedCount) || 0;
    if (count <= 0) return;
    if (document.body.classList.contains('is-login-view')) return;
    if (isAtBottom()) {
      hideBtn();
      return;
    }
    unseenRealCount += count;
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    btn.textContent = formatLabel(unseenRealCount);
    btn.classList.add('visible');
    if (typeof window.CosmoSnapNewMsgBtn === 'function') {
      requestAnimationFrame(window.CosmoSnapNewMsgBtn);
    }
  }

  // 攔截外部誤呼叫 showScrollDownButton：若沒有明確傳入正數真實新訊息，不隨便跳出
  if (window.CosmoViewportLock && typeof window.CosmoViewportLock.showScrollDownButton === 'function') {
    window.CosmoViewportLock.showScrollDownButton = (count = 0) => {
      if (Number(count) > 0) {
        showRealNewMsgBtn(Number(count));
      }
    };
    window.CosmoViewportLock.hideScrollDownButton = hideBtn;
    window.CosmoViewportLock.diffRealNewMessages = diffRealNewMessages;
  }

  // 停用翻譯結束或非主動跳轉時把畫面拉到最後一個 timeline 的行為
  if (typeof CosmoTranslate !== 'undefined') {
    for (const fnName of ['toggle', 'setEnabled', 'renderCachedForCurrentView', 'applyTranslationsToDom']) {
      if (typeof CosmoTranslate[fnName] === 'function' && !CosmoTranslate[fnName].__cosmoNoTimelineJump) {
        const orig = CosmoTranslate[fnName].bind(CosmoTranslate);
        const wrapped = function (...args) {
          const sc = getActiveScroller();
          const beforeTop = sc ? sc.scrollTop : 0;
          const res = orig(...args);
          const restore = () => {
            if (!sc) return;
            const prev = sc.style.scrollBehavior;
            sc.style.scrollBehavior = 'auto';
            sc.scrollTop = beforeTop;
            sc.style.scrollBehavior = prev || '';
          };
          restore();
          requestAnimationFrame(restore);
          return res;
        };
        wrapped.__cosmoNoTimelineJump = true;
        CosmoTranslate[fnName] = wrapped;
      }
    }
  }

  window.CosmoRealNewMsg = {
    diffRealNewMessages,
    notifyIfRealNewMessages: showRealNewMsgBtn,
    hideBtn,
  };
})();

/* --- CURSOR SYNC WITHOUT /latest.ndjson OR /lasest.ndjson URL REQUESTS --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_NO_NDJSON_URL_FETCH_INIT__) return;
  window.__COSMO_NO_NDJSON_URL_FETCH_INIT__ = true;

  const V4_CHANNELS_URL = 'https://api.cosmo.fans/bff/v4/channels/messages?artistId=tripleS';
  const POLL_INTERVAL_MS = 10000;

  const memberCursorMap = new Map();
  const memberBaselineReady = new Set();
  let isPolling = false;
  let isSyncing = false;

  function toComparableId(val) {
    const s = String(val ?? '').trim();
    if (!s) return { raw: '', num: null };
    const tail = s.includes(':') ? s.split(':').pop().trim() : s;
    const n = Number(tail);
    return {
      raw: tail,
      num: Number.isFinite(n) && /^\d+$/.test(tail) ? n : null,
    };
  }

  function isAhead(candidate, current) {
    const a = toComparableId(candidate);
    const b = toComparableId(current);
    if (!a.raw) return false;
    if (!b.raw) return true;
    if (a.raw === b.raw) return false;
    if (a.num !== null && b.num !== null) return a.num > b.num;
    return a.raw > b.raw;
  }

  function getActiveMemberId() {
    const cur = window.currentMember || window.CosmoApp?.currentMember || null;
    const activeId =
      cur?.artistMemberId ??
      cur?.id ??
      document.querySelector('#chat')?.getAttribute('data-artist-member-id') ??
      '';
    return String(activeId ?? '').trim();
  }

  // 從現有 DOM / 記憶體狀態建立各成員 cursor 基準，不發送任何 ndjson 檔案請求
  function seedCursorsFromExistingState() {
    document.querySelectorAll('#chat .msg-wrapper, #chat [data-source-id], #chat [data-message-id]').forEach((el) => {
      const mid = String(
        el.getAttribute('data-artist-member-id') ||
        el.dataset?.artistMemberId ||
        getActiveMemberId() ||
        ''
      ).trim();
      const rawId = String(
        el.getAttribute('data-source-id') ||
        el.getAttribute('data-message-id') ||
        el.dataset?.sourceId ||
        el.dataset?.messageId ||
        ''
      ).trim();
      if (!mid || !rawId) return;
      const prev = memberCursorMap.get(mid);
      if (!prev || isAhead(rawId, prev)) {
        memberCursorMap.set(mid, rawId);
      }
      memberBaselineReady.add(mid);
    });
  }

  async function syncLaggingMembers(laggingMemberIds = []) {
    if (isSyncing) return;
    isSyncing = true;
    try {
      if (typeof CosmoSync?.syncAllChannels === 'function') {
        await CosmoSync.syncAllChannels(laggingMemberIds);
      }
    } catch (_) {
    } finally {
      isSyncing = false;
    }
  }

  async function pollV4ChannelsOnce() {
    if (isPolling || document.hidden) return;
    isPolling = true;
    try {
      const resp =
        typeof CosmoAuth !== 'undefined' && typeof CosmoAuth.authorizedFetch === 'function'
          ? await CosmoAuth.authorizedFetch(V4_CHANNELS_URL, {
              method: 'GET',
              headers: { Accept: 'application/json' },
              cache: 'no-store',
            })
          : await fetch(V4_CHANNELS_URL, {
              method: 'GET',
              headers: { Accept: 'application/json' },
              cache: 'no-store',
              referrerPolicy: 'no-referrer',
            });

      if (!resp || !resp.ok) return;
      const payload = await resp.json();
      const channels = Array.isArray(payload?.channels) ? payload.channels : [];
      if (channels.length === 0) return;

      const activeMid = getActiveMemberId();
      const laggingMembers = [];
      let activeMemberNewCount = 0;

      for (const ch of channels) {
        const mid = String(ch?.artistMemberId ?? '').trim();
        const lastMsgId = String(ch?.lastMessage?.id ?? '').trim();
        if (!mid || !lastMsgId) continue;

        const currentCursor = memberCursorMap.get(mid) || '';
        if (!memberBaselineReady.has(mid)) {
          memberBaselineReady.add(mid);
          if (!currentCursor || isAhead(lastMsgId, currentCursor)) {
            memberCursorMap.set(mid, lastMsgId);
          }
          continue;
        }

        if (isAhead(lastMsgId, currentCursor)) {
          memberCursorMap.set(mid, lastMsgId);
          laggingMembers.push(mid);
          if (activeMid && mid === activeMid) {
            activeMemberNewCount += 1;
          }
        }
      }

      if (laggingMembers.length > 0) {
        await syncLaggingMembers(laggingMembers);
        if (activeMemberNewCount > 0 && window.CosmoViewportLock?.showScrollDownButton) {
          window.CosmoViewportLock.showScrollDownButton(activeMemberNewCount);
        }
      }
    } catch (_) {
    } finally {
      isPolling = false;
    }
  }

  seedCursorsFromExistingState();
  pollV4ChannelsOnce();

  if (!window.__COSMO_V4_POLL_TIMER__) {
    window.__COSMO_V4_POLL_TIMER__ = setInterval(pollV4ChannelsOnce, POLL_INTERVAL_MS);
  }

  window.CosmoV4ChannelPoll = {
    pollNow: pollV4ChannelsOnce,
    getCursors: () => Object.fromEntries(memberCursorMap.entries()),
  };
})();

/* --- PREVENT JUMP TO INITIAL/LAST TIMELINE & IGNORE TRANSLATION DOM AS NEW MSG --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_FIX_INIT_TRANSLATE_JUMP_1_INIT__) return;
  window.__COSMO_FIX_INIT_TRANSLATE_JUMP_1_INIT__ = true;

  let translationRenderingUntil = 0;
  let lastUserScrollAt = 0;

  // 追蹤使用者主動捲動時間（wheel / touchmove / 拖曳捲軸 / PageUp/Down/方向鍵）
  const markUserScroll = () => {
    lastUserScrollAt = Date.now();
  };
  window.addEventListener('wheel', markUserScroll, { passive: true });
  window.addEventListener('touchmove', markUserScroll, { passive: true });
  window.addEventListener('keydown', (ev) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(ev.key)) {
      markUserScroll();
    }
  }, { passive: true });

  function getScroller() {
    const chat = document.getElementById('chat');
    if (chat && chat.scrollHeight > chat.clientHeight + 2) return chat;
    return document.scrollingElement || document.documentElement;
  }

  function snapshotViewport() {
    const sc = getScroller();
    const chat = document.getElementById('chat');
    const cTop = chat ? chat.getBoundingClientRect().top : 0;

    let anchorEl = null;
    let anchorOffset = 0;
    if (chat) {
      const rows = chat.querySelectorAll('.msg-wrapper, [data-source-id], [data-message-id]');
      for (const el of rows) {
        const r = el.getBoundingClientRect();
        if (r.bottom > cTop + 6 && r.top < cTop + chat.clientHeight) {
          anchorEl = el;
          anchorOffset = r.top - cTop;
          break;
        }
      }
    }

    return {
      sc,
      scrollTop: sc ? sc.scrollTop : 0,
      anchorEl,
      anchorOffset,
    };
  }

  function restoreViewport(snap) {
    if (!snap || !snap.sc) return;
    const { sc, scrollTop, anchorEl, anchorOffset } = snap;
    const prevBehavior = sc.style.scrollBehavior;
    sc.style.scrollBehavior = 'auto';

    if (anchorEl && anchorEl.isConnected) {
      const chat = document.getElementById('chat');
      const baseTop = chat ? chat.getBoundingClientRect().top : 0;
      const nowOffset = anchorEl.getBoundingClientRect().top - baseTop;
      const delta = nowOffset - anchorOffset;
      if (Math.abs(delta) > 0.5) {
        sc.scrollTop = sc.scrollTop + delta;
      }
    } else {
      sc.scrollTop = scrollTop;
    }

    sc.style.scrollBehavior = prevBehavior || '';
  }

  function isTranslationMutationOnly(mutations) {
    if (!Array.isArray(mutations) || mutations.length === 0) return false;
    for (const m of mutations) {
      if (m.type === 'characterData') {
        const p = m.target?.parentElement;
        if (!p || !p.closest('.cosmo-translated-text')) return false;
        continue;
      }
      if (m.type === 'childList') {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) {
            const el = n;
            if (!el.classList?.contains('cosmo-translated-text') && !el.closest?.('.cosmo-translated-text')) {
              return false;
            }
          }
        }
        for (const n of m.removedNodes) {
          if (n.nodeType === 1) {
            const el = n;
            if (!el.classList?.contains('cosmo-translated-text') && !el.closest?.('.cosmo-translated-text')) {
              return false;
            }
          }
        }
        continue;
      }
      // 屬性變動若發生在翻譯渲染視窗內也視為翻譯相關
      if (Date.now() <= translationRenderingUntil) continue;
      return false;
    }
    return true;
  }

  // 在翻譯渲染期間，防止非使用者主動捲動把畫面跳回初始化或最後一個 timeline
  if (typeof Element !== 'undefined' && Element.prototype) {
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    if (desc && typeof desc.set === 'function' && !desc.set.__cosmoInitTranslateGuard) {
      const origSet = desc.set;
      Object.defineProperty(Element.prototype, 'scrollTop', {
        configurable: true,
        get: desc.get,
        set(v) {
          const inTransWindow = Date.now() <= translationRenderingUntil;
          const recentUserScroll = Date.now() - lastUserScrollAt < 120;
          if (inTransWindow && !recentUserScroll && (this.id === 'chat' || this === document.documentElement || this === document.body)) {
            return;
          }
          return origSet.call(this, v);
        },
      });
    }
  }

  // 攔截 showScrollDownButton：翻譯渲染期間絕對不把翻譯文字當成新訊息 "1"
  if (window.CosmoViewportLock && typeof window.CosmoViewportLock.showScrollDownButton === 'function') {
    const origShow = window.CosmoViewportLock.showScrollDownButton.bind(window.CosmoViewportLock);
    if (!origShow.__cosmoIgnoreTranslateNewMsg) {
      const guardedShow = function (count = 1, ...rest) {
        if (Date.now() <= translationRenderingUntil) {
          return;
        }
        return origShow(count, ...rest);
      };
      guardedShow.__cosmoIgnoreTranslateNewMsg = true;
      window.CosmoViewportLock.showScrollDownButton = guardedShow;
    }
  }

  // 包裝翻譯相關函式，渲染前後鎖定視窗位置並延長保護視窗涵蓋非同步/rAF 渲染
  function wrapTranslationMethod(obj, methodName) {
    if (!obj || typeof obj[methodName] !== 'function') return;
    const fn = obj[methodName];
    if (fn.__cosmoInitTranslateWrapped) return;
    const wrapped = function (...args) {
      const snap = snapshotViewport();
      translationRenderingUntil = Date.now() + 600;
      const out = fn.apply(this, args);
      const settle = () => {
        restoreViewport(snap);
      };
      settle();
      requestAnimationFrame(() => {
        settle();
        requestAnimationFrame(() => {
          settle();
          setTimeout(() => {
            settle();
            translationRenderingUntil = 0;
          }, 120);
        });
      });
      return out;
    };
    wrapped.__cosmoInitTranslateWrapped = true;
    obj[methodName] = wrapped;
  }

  if (typeof CosmoTranslate !== 'undefined') {
    for (const name of ['toggle', 'setEnabled', 'renderCachedForCurrentView', 'applyTranslationsToDom', 'translateMessage', 'translateBatch']) {
      wrapTranslationMethod(CosmoTranslate, name);
    }
  }
  if (typeof window.CosmoForceRenderTranslations === 'function' && !window.CosmoForceRenderTranslations.__cosmoInitTranslateWrapped) {
    const origForce = window.CosmoForceRenderTranslations;
    const wrappedForce = function (...args) {
      const snap = snapshotViewport();
      translationRenderingUntil = Date.now() + 600;
      const r = origForce.apply(this, args);
      restoreViewport(snap);
      requestAnimationFrame(() => restoreViewport(snap));
      setTimeout(() => {
        restoreViewport(snap);
        translationRenderingUntil = 0;
      }, 150);
      return r;
    };
    wrappedForce.__cosmoInitTranslateWrapped = true;
    window.CosmoForceRenderTranslations = wrappedForce;
  }

  // 若有外部 observer 僅因 .cosmo-translated-text 變動而觸發，提供 helper 供判別
  window.CosmoTranslateGuard = {
    isTranslationMutationOnly,
    markTranslating: (ms = 500) => {
      translationRenderingUntil = Math.max(translationRenderingUntil, Date.now() + ms);
    },
  };
})();

/* --- SILENT TRANSLATION ANTI-JUMP & ANTI-FALSE-NEW-MSG GUARD --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_SILENT_TRANSLATE_GUARD_INIT__) return;
  window.__COSMO_SILENT_TRANSLATE_GUARD_INIT__ = true;

  let silentGuardUntil = 0;
  let lastUserInputAt = 0;

  const markUserInput = () => {
    lastUserInputAt = Date.now();
  };
  window.addEventListener('wheel', markUserInput, { passive: true });
  window.addEventListener('touchmove', markUserInput, { passive: true });
  window.addEventListener('pointerdown', markUserInput, { passive: true });
  window.addEventListener('keydown', markUserInput, { passive: true });

  function armSilentGuard(ms = 900) {
    silentGuardUntil = Math.max(silentGuardUntil, Date.now() + ms);
  }

  function isSilentGuardActive() {
    return Date.now() <= silentGuardUntil;
  }

  function isUserActivelyScrolling() {
    return Date.now() - lastUserInputAt < 140;
  }

  function findChatScroller() {
    const chat = document.getElementById('chat');
    if (chat && chat.scrollHeight > chat.clientHeight + 2) return chat;
    let cur = chat ? chat.parentElement : null;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const cs = getComputedStyle(cur);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight + 2) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function captureAnchorState() {
    const sc = findChatScroller();
    const chat = document.getElementById('chat');
    const baseTop = chat ? chat.getBoundingClientRect().top : 0;
    const viewHeight = chat && chat.clientHeight > 0 ? chat.clientHeight : window.innerHeight;

    let anchorEl = null;
    let anchorTop = 0;
    if (chat) {
      const rows = chat.querySelectorAll('.msg-wrapper, [data-source-id], [data-message-id]');
      for (const el of rows) {
        const r = el.getBoundingClientRect();
        if (r.bottom > baseTop + 4 && r.top < baseTop + viewHeight) {
          anchorEl = el;
          anchorTop = r.top - baseTop;
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

  function restoreAnchorState(snap) {
    if (!snap || !snap.sc) return;
    const { sc, scrollTop, anchorEl, anchorTop } = snap;
    const prevBehavior = sc.style.scrollBehavior;
    sc.style.scrollBehavior = 'auto';

    if (anchorEl && anchorEl.isConnected) {
      const chat = document.getElementById('chat');
      const baseTop = chat ? chat.getBoundingClientRect().top : 0;
      const nowTop = anchorEl.getBoundingClientRect().top - baseTop;
      const delta = nowTop - anchorTop;
      if (Math.abs(delta) > 0.5) {
        sc.scrollTop = sc.scrollTop + delta;
      }
    } else if (Math.abs(sc.scrollTop - scrollTop) > 0.5) {
      sc.scrollTop = scrollTop;
    }

    sc.style.scrollBehavior = prevBehavior || '';
  }

  function runProtected(fn, holdMs = 900) {
    const snap = captureAnchorState();
    armSilentGuard(holdMs);
    let result;
    try {
      result = typeof fn === 'function' ? fn() : undefined;
    } finally {
      restoreAnchorState(snap);
    }

    const settleFrames = () => {
      restoreAnchorState(snap);
      requestAnimationFrame(() => {
        restoreAnchorState(snap);
        setTimeout(() => {
          restoreAnchorState(snap);
        }, 80);
        setTimeout(() => {
          restoreAnchorState(snap);
        }, 240);
      });
    };

    if (result && typeof result.then === 'function') {
      return result.finally(() => {
        armSilentGuard(600);
        settleFrames();
      });
    }

    settleFrames();
    return result;
  }

  // 1. 攔截所有元素的 scrollTop 寫入：靜默翻譯保護期間若非使用者主動操作，一律擋掉
  if (typeof Element !== 'undefined' && Element.prototype) {
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    if (desc && typeof desc.set === 'function' && !desc.set.__cosmoSilentGuardSet) {
      const origSet = desc.set;
      const guardedSet = function (v) {
        if (isSilentGuardActive() && !isUserActivelyScrolling()) {
          return;
        }
        return origSet.call(this, v);
      };
      guardedSet.__cosmoSilentGuardSet = true;
      Object.defineProperty(Element.prototype, 'scrollTop', {
        configurable: true,
        get: desc.get,
        set: guardedSet,
      });
    }
  }

  // 2. 攔截 window.scrollTo / window.scroll / window.scrollBy
  for (const fnName of ['scrollTo', 'scroll', 'scrollBy']) {
    if (typeof window[fnName] === 'function' && !window[fnName].__cosmoSilentGuardWin) {
      const origWinFn = window[fnName].bind(window);
      const guardedWinFn = function (...args) {
        if (isSilentGuardActive() && !isUserActivelyScrolling()) {
          return;
        }
        return origWinFn(...args);
      };
      guardedWinFn.__cosmoSilentGuardWin = true;
      window[fnName] = guardedWinFn;
    }
  }

  // 3. 攔截 showScrollDownButton：靜默翻譯期間絕對不把翻譯當成新訊息 "1"
  function patchShowBtn() {
    if (window.CosmoViewportLock && typeof window.CosmoViewportLock.showScrollDownButton === 'function') {
      const origShow = window.CosmoViewportLock.showScrollDownButton.bind(window.CosmoViewportLock);
      if (!origShow.__cosmoSilentGuardShow) {
        const guardedShow = function (count = 1, ...rest) {
          if (isSilentGuardActive()) {
            return;
          }
          return origShow(count, ...rest);
        };
        guardedShow.__cosmoSilentGuardShow = true;
        window.CosmoViewportLock.showScrollDownButton = guardedShow;
      }
    }
  }
  patchShowBtn();

  // 4. 攔截背景 translated-contents 請求：只要有靜默抓譯文發生，立刻啟動防跳轉與防新訊息誤報
  if (typeof window.fetch === 'function' && !window.fetch.__cosmoSilentTransFetch) {
    const origFetch = window.fetch;
    const hookedFetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      const isTranslateApi = /translated-contents/i.test(String(url));
      if (isTranslateApi) {
        armSilentGuard(1200);
      }
      const resp = await origFetch.apply(this, args);
      if (isTranslateApi) {
        const snap = captureAnchorState();
        armSilentGuard(1200);
        setTimeout(() => restoreAnchorState(snap), 30);
        setTimeout(() => restoreAnchorState(snap), 150);
        setTimeout(() => restoreAnchorState(snap), 350);
      }
      return resp;
    };
    hookedFetch.__cosmoSilentTransFetch = true;
    window.fetch = hookedFetch;
  }

  // 5. 包裝 CosmoTranslate 上所有方法（含靜默背景翻譯/快取渲染）
  if (typeof CosmoTranslate !== 'undefined') {
    for (const key of Object.getOwnPropertyNames(CosmoTranslate)) {
      if (typeof CosmoTranslate[key] === 'function' && !CosmoTranslate[key].__cosmoSilentWrapped) {
        const origMethod = CosmoTranslate[key].bind(CosmoTranslate);
        const wrappedMethod = function (...args) {
          return runProtected(() => origMethod(...args), 900);
        };
        wrappedMethod.__cosmoSilentWrapped = true;
        CosmoTranslate[key] = wrappedMethod;
      }
    }
  }

  // 6. 監聽 #chat 內僅新增/更新 .cosmo-translated-text 的變動，自動鎖定視窗並擋掉誤報
  const chatEl = document.getElementById('chat');
  if (chatEl && chatEl.dataset.cosmoSilentTransObserver !== '1') {
    chatEl.dataset.cosmoSilentTransObserver = '1';
    const mo = new MutationObserver((mutations) => {
      let touchesTranslation = false;
      for (const m of mutations) {
        for (const n of m.addedNodes || []) {
          if (n.nodeType === 1 && (n.classList?.contains('cosmo-translated-text') || n.querySelector?.('.cosmo-translated-text'))) {
            touchesTranslation = true;
            break;
          }
        }
        if (!touchesTranslation && m.target?.nodeType === 1 && m.target.closest?.('.cosmo-translated-text')) {
          touchesTranslation = true;
        }
        if (touchesTranslation) break;
      }
      if (touchesTranslation) {
        const snap = captureAnchorState();
        armSilentGuard(900);
        restoreAnchorState(snap);
        requestAnimationFrame(() => restoreAnchorState(snap));
      }
    });
    mo.observe(chatEl, { childList: true, subtree: true, characterData: true });
  }

  window.CosmoSilentTranslateGuard = {
    arm: armSilentGuard,
    runProtected,
    isActive: isSilentGuardActive,
  };
})();

/* --- ROOT-CAUSE FIX: ANCHOR SCROLL BY ELEMENT OFFSET & BLOCK FALSE "1" NEW MSG --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_ROOT_CAUSE_SILENT_TRANS_INIT__) return;
  window.__COSMO_ROOT_CAUSE_SILENT_TRANS_INIT__ = true;

  let isApplyingTranslationDom = false;
  let allowNextRealNewMsgShow = false;

  function getChatContainer() {
    return document.getElementById('chat');
  }

  function getScrollContainer() {
    const chat = getChatContainer();
    if (chat && chat.scrollHeight > chat.clientHeight + 2) {
      return chat;
    }
    return document.scrollingElement || document.documentElement;
  }

  // 以訊息元素在捲動容器內的視覺位置做錨點快照
  function takeVisualAnchor() {
    const sc = getScrollContainer();
    const chat = getChatContainer();
    if (!sc) return null;

    const scRect = sc.getBoundingClientRect();
    let bestEl = null;
    let bestTopInSc = 0;

    if (chat) {
      const candidates = chat.querySelectorAll('.msg-wrapper, [data-source-id], [data-message-id]');
      for (const el of candidates) {
        const r = el.getBoundingClientRect();
        // 找第一個在可視區內或剛跨過頂緣的訊息元素
        if (r.bottom > scRect.top + 10 && r.top < scRect.bottom) {
          bestEl = el;
          bestTopInSc = r.top - scRect.top;
          break;
        }
      }
    }

    return {
      sc,
      scrollTop: sc.scrollTop,
      bestEl,
      bestTopInSc,
    };
  }

  // 譯文插入造成上方或該元素變高時，把該錨點元素拉回原本相對於捲動容器的 top 位置
  function applyVisualAnchor(snap) {
    if (!snap || !snap.sc) return;
    const { sc, scrollTop, bestEl, bestTopInSc } = snap;
    const prevBehavior = sc.style.scrollBehavior;
    sc.style.scrollBehavior = 'auto';

    if (bestEl && bestEl.isConnected) {
      const scRect = sc.getBoundingClientRect();
      const nowTopInSc = bestEl.getBoundingClientRect().top - scRect.top;
      const diff = nowTopInSc - bestTopInSc;
      if (Math.abs(diff) > 0.5) {
        sc.scrollTop = sc.scrollTop + diff;
      }
    } else if (Math.abs(sc.scrollTop - scrollTop) > 0.5) {
      sc.scrollTop = scrollTop;
    }

    sc.style.scrollBehavior = prevBehavior || '';
  }

  // 只有明確標記為「真實新訊息」時，才允許顯示新訊息按鈕
  function guardNewMsgButton() {
    if (!window.CosmoViewportLock || typeof window.CosmoViewportLock.showScrollDownButton !== 'function') {
      return;
    }
    const origShow = window.CosmoViewportLock.showScrollDownButton.bind(window.CosmoViewportLock);
    if (origShow.__cosmoStrictRealOnly) return;

    const strictShow = function (count = 1, ...rest) {
      if (isApplyingTranslationDom || !allowNextRealNewMsgShow) {
        return;
      }
      allowNextRealNewMsgShow = false;
      return origShow(count, ...rest);
    };
    strictShow.__cosmoStrictRealOnly = true;
    window.CosmoViewportLock.showScrollDownButton = strictShow;
  }

  // 供真實新訊息輪詢在確認有新訊息 ID 時呼叫
  window.CosmoAllowRealNewMsgBadge = (count = 1) => {
    if (isApplyingTranslationDom) return;
    allowNextRealNewMsgShow = true;
    if (window.CosmoViewportLock?.showScrollDownButton) {
      window.CosmoViewportLock.showScrollDownButton(count);
    }
    allowNextRealNewMsgShow = false;
  };

  function wrapWithAnchorLock(obj, fnName) {
    if (!obj || typeof obj[fnName] !== 'function') return;
    const orig = obj[fnName];
    if (orig.__cosmoAnchorLocked) return;

    const wrapped = function (...args) {
      const snap = takeVisualAnchor();
      isApplyingTranslationDom = true;
      allowNextRealNewMsgShow = false;

      const finish = () => {
        applyVisualAnchor(snap);
        requestAnimationFrame(() => {
          applyVisualAnchor(snap);
          isApplyingTranslationDom = false;
        });
      };

      try {
        const res = orig.apply(this, args);
        if (res && typeof res.then === 'function') {
          return res.finally(finish);
        }
        finish();
        return res;
      } catch (err) {
        finish();
        throw err;
      }
    };
    wrapped.__cosmoAnchorLocked = true;
    obj[fnName] = wrapped;
  }

  guardNewMsgButton();
  setTimeout(guardNewMsgButton, 200);
  setTimeout(guardNewMsgButton, 1000);

  if (typeof CosmoTranslate !== 'undefined') {
    for (const name of Object.getOwnPropertyNames(CosmoTranslate)) {
      if (typeof CosmoTranslate[name] === 'function') {
        wrapWithAnchorLock(CosmoTranslate, name);
      }
    }
  }

  if (typeof window.CosmoForceRenderTranslations === 'function') {
    wrapWithAnchorLock(window, 'CosmoForceRenderTranslations');
  }

  // 監聽 #chat 中只有 .cosmo-translated-text 變動的情況，立刻做錨點回補並擋掉誤報
  const chatEl = getChatContainer();
  if (chatEl && chatEl.dataset.cosmoAnchorGuard !== '1') {
    chatEl.dataset.cosmoAnchorGuard = '1';
    const mo = new MutationObserver((mutations) => {
      let onlyTranslation = false;
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && (n.classList?.contains('cosmo-translated-text') || n.querySelector?.('.cosmo-translated-text'))) {
              onlyTranslation = true;
            }
          }
        } else if (m.type === 'characterData') {
          if (m.target?.parentElement?.closest?.('.cosmo-translated-text')) {
            onlyTranslation = true;
          }
        }
      }
      if (onlyTranslation) {
        const snap = takeVisualAnchor();
        isApplyingTranslationDom = true;
        allowNextRealNewMsgShow = false;
        applyVisualAnchor(snap);
        requestAnimationFrame(() => {
          applyVisualAnchor(snap);
          isApplyingTranslationDom = false;
        });
      }
    });
    mo.observe(chatEl, { childList: true, subtree: true, characterData: true });
  }
})();

/* --- STRICT GUARD FOR showScrollDownButton & NO AUTO SCROLL-TO-BOTTOM ON TRANSLATE --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_CHAT_VIEW_472_GUARD_INIT__) return;
  window.__COSMO_CHAT_VIEW_472_GUARD_INIT__ = true;

  let allowManualBottomScroll = false;
  window.__COSMO_ALLOW_REAL_NEW_MSG__ = false;

  // 僅當使用者點擊「新訊息按鈕」或「回到底部按鈕」時允許跳到底部
  document.addEventListener('click', (ev) => {
    const t = ev.target?.closest?.('#cosmo-scroll-down-btn, .scroll-down-btn, [data-action="scroll-bottom"]');
    if (t) {
      allowManualBottomScroll = true;
      setTimeout(() => { allowManualBottomScroll = false; }, 600);
    }
  }, true);

  // 包裝 showScrollDownButton：未明確放行真實新訊息時不顯示（阻擋翻譯 DOM 誤報 "1"）
  if (typeof showScrollDownButton === 'function' && !showScrollDownButton.__cosmoStrictGuard) {
    const rawShow = showScrollDownButton;
    showScrollDownButton = function strictShowScrollDownButton(addedCount = 1) {
      if (!window.__COSMO_ALLOW_REAL_NEW_MSG__) {
        return;
      }
      window.__COSMO_ALLOW_REAL_NEW_MSG__ = false;
      return rawShow(addedCount);
    };
    showScrollDownButton.__cosmoStrictGuard = true;
  }

  if (window.CosmoViewportLock) {
    const origLockShow = window.CosmoViewportLock.showScrollDownButton;
    if (typeof origLockShow === 'function' && !origLockShow.__cosmoStrictGuard) {
      window.CosmoViewportLock.showScrollDownButton = function (count = 1) {
        if (!window.__COSMO_ALLOW_REAL_NEW_MSG__) {
          return;
        }
        window.__COSMO_ALLOW_REAL_NEW_MSG__ = false;
        return origLockShow(count);
      };
      window.CosmoViewportLock.showScrollDownButton.__cosmoStrictGuard = true;
    }
  }

  // 供真實新訊息輪詢在確認有新訊息 ID 時呼叫
  window.CosmoTriggerRealNewMessage = function (count = 1) {
    const n = Number(count) || 0;
    if (n <= 0) return;
    window.__COSMO_ALLOW_REAL_NEW_MSG__ = true;
    if (typeof showScrollDownButton === 'function') {
      showScrollDownButton(n);
    } else if (window.CosmoViewportLock?.showScrollDownButton) {
      window.CosmoViewportLock.showScrollDownButton(n);
    }
    setTimeout(() => { window.__COSMO_ALLOW_REAL_NEW_MSG__ = false; }, 50);
  };

  window.CosmoAllowManualBottomScroll = (flag = true) => {
    allowManualBottomScroll = Boolean(flag);
  };
})();

/* --- PREVENT JUMPING TO TOP (scrollTop = 0) DURING TRANSLATION / DOM UPDATE --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_ANTI_JUMP_TOP_INIT__) return;
  window.__COSMO_ANTI_JUMP_TOP_INIT__ = true;

  let guardUntil = 0;
  let savedTopByEl = new WeakMap();
  let lastGoodScrollTop = 0;
  let userInitiatedTopAt = 0;

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Home') {
      userInitiatedTopAt = Date.now();
    }
  }, { passive: true });

  function getMainScroller() {
    const chat = document.getElementById('chat');
    if (chat && chat.scrollHeight > chat.clientHeight + 2) return chat;
    let cur = chat ? chat.parentElement : null;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const cs = getComputedStyle(cur);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight + 2) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function recordCurrentPositions() {
    const sc = getMainScroller();
    if (sc && sc.scrollTop > 10) {
      lastGoodScrollTop = sc.scrollTop;
      savedTopByEl.set(sc, sc.scrollTop);
    }
    const chat = document.getElementById('chat');
    if (chat && chat.scrollTop > 10) {
      savedTopByEl.set(chat, chat.scrollTop);
    }
    const docEl = document.scrollingElement || document.documentElement;
    if (docEl && docEl.scrollTop > 10) {
      savedTopByEl.set(docEl, docEl.scrollTop);
    }
  }

  function restoreFromTopIfNeeded(targetEl) {
    if (Date.now() - userInitiatedTopAt < 300) return;
    const sc = targetEl || getMainScroller();
    if (!sc) return;
    const fallbackTop = savedTopByEl.get(sc) || lastGoodScrollTop;
    if (fallbackTop > 10 && sc.scrollTop <= 2 && sc.scrollHeight > sc.clientHeight + 20) {
      const prev = sc.style.scrollBehavior;
      sc.style.scrollBehavior = 'auto';
      sc.scrollTop = fallbackTop;
      sc.style.scrollBehavior = prev || '';
    }
  }

  // 持續記錄使用者在下方瀏覽時的 scrollTop
  const scroller = getMainScroller();
  if (scroller) {
    scroller.addEventListener('scroll', () => {
      if (scroller.scrollTop > 10) {
        lastGoodScrollTop = scroller.scrollTop;
        savedTopByEl.set(scroller, scroller.scrollTop);
      }
    }, { passive: true });
  }

  // 攔截把 scrollTop 設為 0（跳最上層）的非預期寫入
  if (typeof Element !== 'undefined' && Element.prototype) {
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    if (desc && typeof desc.set === 'function' && !desc.set.__cosmoAntiTopSet) {
      const origSet = desc.set;
      const guardedSet = function (val) {
        const numVal = Number(val);
        const isMain = this.id === 'chat' || this === document.documentElement || this === document.body || this === getMainScroller();
        const prevTop = savedTopByEl.get(this) || lastGoodScrollTop;
        if (isMain && numVal <= 2 && prevTop > 20 && Date.now() - userInitiatedTopAt > 300 && (Date.now() <= guardUntil || prevTop > 80)) {
          return origSet.call(this, prevTop);
        }
        const res = origSet.call(this, val);
        if (isMain && Number(val) > 10) {
          lastGoodScrollTop = Number(val);
          savedTopByEl.set(this, Number(val));
        }
        return res;
      };
      guardedSet.__cosmoAntiTopSet = true;
      Object.defineProperty(Element.prototype, 'scrollTop', {
        configurable: true,
        get: desc.get,
        set: guardedSet,
      });
    }
  }

  function wrapAntiTop(obj, fnName) {
    if (!obj || typeof obj[fnName] !== 'function') return;
    const orig = obj[fnName];
    if (orig.__cosmoAntiTopWrapped) return;
    const wrapped = function (...args) {
      recordCurrentPositions();
      guardUntil = Math.max(guardUntil, Date.now() + 800);
      const res = orig.apply(this, args);
      const check = () => {
        restoreFromTopIfNeeded(getMainScroller());
        restoreFromTopIfNeeded(document.getElementById('chat'));
        restoreFromTopIfNeeded(document.scrollingElement || document.documentElement);
      };
      check();
      requestAnimationFrame(() => {
        check();
        setTimeout(check, 60);
        setTimeout(check, 200);
      });
      return res;
    };
    wrapped.__cosmoAntiTopWrapped = true;
    obj[fnName] = wrapped;
  }

  if (typeof CosmoTranslate !== 'undefined') {
    for (const k of Object.getOwnPropertyNames(CosmoTranslate)) {
      if (typeof CosmoTranslate[k] === 'function') {
        wrapAntiTop(CosmoTranslate, k);
      }
    }
  }

  if (typeof window.CosmoForceRenderTranslations === 'function') {
    wrapAntiTop(window, 'CosmoForceRenderTranslations');
  }

  // 監聽 #chat 變動：若發生變動後 scrollTop 突然掉到最上層，立刻拉回原本位置
  const chatEl = document.getElementById('chat');
  if (chatEl && chatEl.dataset.cosmoAntiTopObs !== '1') {
    chatEl.dataset.cosmoAntiTopObs = '1';
    const mo = new MutationObserver(() => {
      recordCurrentPositions();
      requestAnimationFrame(() => {
        restoreFromTopIfNeeded(getMainScroller());
        restoreFromTopIfNeeded(chatEl);
      });
    });
    mo.observe(chatEl, { childList: true, subtree: true, characterData: true });
  }
})();

/* --- FIX JUMP TO TOP & BLOCK PHANTOM NEW MESSAGE --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_FIX_TOP_AND_PHANTOM_MSG_INIT__) return;
  window.__COSMO_FIX_TOP_AND_PHANTOM_MSG_INIT__ = true;

  const BTN_ID = 'cosmo-scroll-down-btn';
  const BOTTOM_THRESHOLD_PX = 48;

  const rawDesc =
    typeof Element !== 'undefined' && Element.prototype
      ? Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
      : null;
  const rawSetTop = rawDesc && typeof rawDesc.set === 'function' ? rawDesc.set : null;

  const lastScrollTopByEl = new WeakMap();
  let lastUserActionAt = 0;
  let allowConfirmedBadge = false;
  let badgeTotal = 0;

  const markUserAction = () => {
    lastUserActionAt = Date.now();
  };
  for (const evName of ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'mousedown', 'keydown']) {
    window.addEventListener(evName, markUserAction, { passive: true, capture: true });
  }

  function isUserActive() {
    return Date.now() - lastUserActionAt < 220;
  }

  function forceTop(el, topVal) {
    if (!el || typeof topVal !== 'number' || Number.isNaN(topVal) || topVal <= 2) return;
    if (el === window) {
      window.scrollTo(0, topVal);
      return;
    }
    const clamped =
      typeof el.scrollHeight === 'number' && typeof el.clientHeight === 'number'
        ? Math.max(0, Math.min(topVal, Math.max(0, el.scrollHeight - el.clientHeight)))
        : topVal;
    const prev = el.style?.scrollBehavior;
    if (el.style) el.style.scrollBehavior = 'auto';
    if (rawSetTop) {
      rawSetTop.call(el, clamped);
    } else {
      el.scrollTop = clamped;
    }
    if (el.style) el.style.scrollBehavior = prev || '';
  }

  // 記錄捲動位置；若非主動操作突然掉到最頂層（<= 2），直接還原到前一個記錄的位置
  document.addEventListener('scroll', (ev) => {
    const target =
      ev.target === document
        ? (document.scrollingElement || document.documentElement)
        : ev.target;
    if (!target || typeof target.scrollTop !== 'number') return;

    const cur = target.scrollTop;
    if (cur > 4) {
      lastScrollTopByEl.set(target, cur);
      return;
    }

    const prevTop = lastScrollTopByEl.get(target) || 0;
    if (!isUserActive() && prevTop > 20 && target.scrollHeight > target.clientHeight + 20) {
      forceTop(target, prevTop);
      requestAnimationFrame(() => {
        if (target.scrollTop <= 2 && !isUserActive()) {
          forceTop(target, prevTop);
        }
      });
    }
  }, { passive: true, capture: true });

  function getScroller() {
    const chat = document.getElementById('chat');
    if (chat && chat.scrollHeight > chat.clientHeight + 2) return chat;
    return document.scrollingElement || document.documentElement;
  }

  function isAtBottom() {
    const sc = getScroller();
    if (!sc) return true;
    return sc.scrollHeight - sc.scrollTop - sc.clientHeight <= BOTTOM_THRESHOLD_PX;
  }

  function hideBtn() {
    badgeTotal = 0;
    const btn = document.getElementById(BTN_ID);
    if (btn) {
      btn.classList.remove('visible');
      btn.style.display = 'none';
    }
  }

  function formatLabel(count) {
    const n = Math.max(1, Number(count) || 1);
    const raw =
      typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function'
        ? CosmoI18n.t('new_messages_btn', { count: n })
        : `新訊息 (${n})`;
    const t = String(raw || '').trim();
    if (t.startsWith('↓') || t.startsWith('⬇') || t.startsWith('▼')) return t;
    return `↓ ${t}`;
  }

  function renderConfirmedBadge(count) {
    if (!allowConfirmedBadge) return;
    allowConfirmedBadge = false;

    const n = Number(count) || 0;
    if (n <= 0) return;
    if (document.body.classList.contains('is-login-view')) return;
    if (isAtBottom()) {
      hideBtn();
      return;
    }

    badgeTotal += n;
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    btn.textContent = formatLabel(badgeTotal);
    btn.classList.add('visible');
    btn.style.display = 'inline-flex';
  }

  const lockedShowFn = function (count = 1) {
    renderConfirmedBadge(count);
  };

  window.showScrollDownButton = lockedShowFn;
  window.CosmoViewportLock = Object.assign(window.CosmoViewportLock || {}, {
    showScrollDownButton: lockedShowFn,
    hideScrollDownButton: hideBtn,
  });

  window.CosmoNotifyConfirmedNewMessages = function (count = 1) {
    const n = Number(count) || 0;
    if (n <= 0) return;
    allowConfirmedBadge = true;
    renderConfirmedBadge(n);
  };

  window.addEventListener('scroll', () => {
    if (isAtBottom()) hideBtn();
  }, { passive: true });
})();
