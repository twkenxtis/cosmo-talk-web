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

/* --- CANONICAL DEMO JSON ROUTING & JWT V4 ISOLATION --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_CANONICAL_DEMO_JWT_ROUTING__) return;
  window.__COSMO_CANONICAL_DEMO_JWT_ROUTING__ = true;

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

  window.IS_DEMO_MODE = isDemoSession();

  const baseFetch =
    typeof window.__COSMO_NATIVE_FETCH__ === 'function'
      ? window.__COSMO_NATIVE_FETCH__
      : window.fetch.bind(window);
  window.__COSMO_NATIVE_FETCH__ = baseFetch;

  window.fetch = async function (input, init) {
    const rawUrl = typeof input === 'string' ? input : (input?.url || '');
    const urlStr = String(rawUrl);

    if (isDemoSession()) {
      if (urlStr.includes('/bff/v4/channels/messages')) {
        return baseFetch('demo/artistId.json', { cache: 'no-store' });
      }
      if (urlStr.includes('demo_translate') || urlStr.includes('/translated-contents')) {
        return baseFetch('demo/demo_translate.json', { cache: 'no-store' });
      }
      if (urlStr.includes('sticker')) {
        return baseFetch('demo/sticker.json', { cache: 'no-store' });
      }
      if (/^https?:\/\/api\.cosmo\.fans\//i.test(urlStr)) {
        return baseFetch('demo/last.json', { cache: 'no-store' });
      }
    }

    return baseFetch(input, init);
  };
})();

/* --- DEMO JSON TEXT RENDER FALLBACK --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_DEMO_TEXT_RENDER_FALLBACK_INIT__) return;
  window.__COSMO_DEMO_TEXT_RENDER_FALLBACK_INIT__ = true;

  function isDemoSession() {
    try {
      const q = new URLSearchParams(window.location.search || '');
      if (window.FORCE_DEMO_MODE === true) return true;
      if (q.get('demo') === '1' || q.get('demo') === 'true') return true;
    } catch (_) {}
    return Boolean(window.IS_DEMO_MODE === true);
  }

  function extractTextFromRecord(rec) {
    if (!rec || typeof rec !== 'object') return '';
    const msg = rec.message && typeof rec.message === 'object' ? rec.message : rec;
    const candidates = [
      msg.text,
      msg.content,
      msg.body,
      msg.messageText,
      msg.caption,
      rec.text,
      rec.content,
      rec.body,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
      if (c && typeof c === 'object' && typeof c.text === 'string' && c.text.trim()) {
        return c.text.trim();
      }
    }
    return '';
  }

  function collectMessagesFromPayload(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.messages)) return payload.messages;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.events)) return payload.events;
    if (payload.data && typeof payload.data === 'object') {
      return collectMessagesFromPayload(payload.data);
    }
    return [];
  }

  async function renderDemoJsonIfChatEmpty() {
    if (!isDemoSession()) return;
    const chat = document.getElementById('chat');
    if (!chat) return;

    const hasTextInChat = [...chat.querySelectorAll('.msg-wrapper, .message, .msg-bubble, [data-source-id], [data-message-id]')]
      .some((el) => (el.textContent || '').trim().length > 0);
    if (hasTextInChat) return;

    const nativeFetch =
      typeof window.__COSMO_NATIVE_FETCH__ === 'function'
        ? window.__COSMO_NATIVE_FETCH__
        : window.fetch.bind(window);

    let rawList = [];
    for (const path of ['demo/last.json', 'demo/artistId.json']) {
      try {
        const resp = await nativeFetch(path, { cache: 'no-store' });
        if (!resp || !resp.ok) continue;
        const txt = await resp.text();
        if (!txt.trim()) continue;
        try {
          const parsed = JSON.parse(txt);
          rawList = rawList.concat(collectMessagesFromPayload(parsed));
        } catch (_) {
          for (const line of txt.split(/\r?\n/)) {
            if (!line.trim()) continue;
            try {
              rawList.push(JSON.parse(line));
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    const texts = rawList.map(extractTextFromRecord).filter(Boolean);
    if (texts.length === 0) return;

    if (typeof window.CosmoChatView?.renderChat === 'function') {
      const cur = window.currentMember || window.CosmoApp?.currentMember || null;
      try {
        await window.CosmoChatView.renderChat(cur);
      } catch (_) {}
      const renderedNow = [...chat.querySelectorAll('.msg-wrapper, .message, .msg-bubble')]
        .some((el) => (el.textContent || '').trim().length > 0);
      if (renderedNow) return;
    }

    const frag = document.createDocumentFragment();
    for (const t of texts) {
      const wrap = document.createElement('div');
      wrap.className = 'msg-wrapper demo-fallback-msg';
      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.textContent = t;
      wrap.appendChild(bubble);
      frag.appendChild(wrap);
    }
    chat.appendChild(frag);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(renderDemoJsonIfChatEmpty, 220), { once: true });
  } else {
    setTimeout(renderDemoJsonIfChatEmpty, 220);
  }
  window.addEventListener('load', () => setTimeout(renderDemoJsonIfChatEmpty, 500), { once: true });
})();

/* --- INITIAL F5 ONCE SCROLL TO BOTTOM --- */
(() => {
  if (typeof window === 'undefined') return;
  if (window.__COSMO_INITIAL_F5_SCROLL_BOTTOM_INIT__) return;
  window.__COSMO_INITIAL_F5_SCROLL_BOTTOM_INIT__ = true;

  let hasScrolledInitially = false;

  function performInstantBottomScroll() {
    if (document.body?.classList.contains('is-login-view')) return false;
    const chatShell = document.getElementById('chat-shell');
    if (!chatShell || !chatShell.classList.contains('active')) return false;

    const chatEl = document.getElementById('chat');
    if (!chatEl) return false;

    const msgNodes = chatEl.querySelectorAll('.msg-wrapper');
    if (msgNodes.length === 0) return false;

    const docEl = document.scrollingElement || document.documentElement || document.body;
    const targets = [chatEl, docEl].filter(Boolean);

    for (const el of targets) {
      const prevBehavior = el.style?.scrollBehavior;
      if (el.style) el.style.scrollBehavior = 'auto';
      el.scrollTop = el.scrollHeight;
      if (el.style) el.style.scrollBehavior = prevBehavior || '';
    }

    const maxDocTop = Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0
    );
    window.scrollTo({ top: maxDocTop, behavior: 'auto' });

    if (typeof window.CosmoViewportLock?.hideScrollDownButton === 'function') {
      window.CosmoViewportLock.hideScrollDownButton();
    }
    const floatBtn = document.getElementById('btn-scroll-to-bottom');
    if (floatBtn) floatBtn.classList.remove('visible');

    return true;
  }

  function scrollToBottomInitialOnce() {
    if (hasScrolledInitially) return;

    requestAnimationFrame(() => {
      if (hasScrolledInitially) return;
      if (performInstantBottomScroll()) {
        hasScrolledInitially = true;
        // 補一幀避免圖片/字型剛撐開高度造成的微小偏移
        requestAnimationFrame(() => {
          performInstantBottomScroll();
        });
      }
    });
  }

  if (typeof CosmoChatView !== 'undefined') {
    CosmoChatView.scrollToBottomInitialOnce = scrollToBottomInitialOnce;
  }
  window.CosmoScrollToBottomInitialOnce = scrollToBottomInitialOnce;
})();
