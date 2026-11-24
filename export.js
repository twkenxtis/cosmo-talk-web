const CosmoExport = (() => {
  const { nfc, fmtTimeline, fmtExportTs } = CosmoUtils;

  function getCurrentExportStartIndex({ renderedItems, segmentStarts, headerEl }) {
    if (!Array.isArray(renderedItems) || renderedItems.length === 0) {
      return 0;
    }

    const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 60;
    const referenceY = headerHeight + 16;

    let currentIdx = 0;
    for (let i = 0; i < renderedItems.length; i++) {
      const el = renderedItems[i]?.element;
      if (!el) continue;
      const top = el.getBoundingClientRect().top;
      if (top <= referenceY) {
        currentIdx = i;
      } else {
        break;
      }
    }

    if (Array.isArray(segmentStarts) && segmentStarts.length > 0) {
      let segStartIdx = 0;
      for (const seg of segmentStarts) {
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

  function exportMemberText({ member, renderedItems, segmentStarts, headerEl }) {
    if (!member) return;
    const startIdx = getCurrentExportStartIndex({ renderedItems, segmentStarts, headerEl });
    const blocks = [];

    for (let i = startIdx; i < renderedItems.length; i++) {
      const msg = renderedItems[i]?.msg;
      if (msg && msg.messageType === 'text' && typeof msg.content === 'string' && msg.content.trim()) {
        const ts = fmtExportTs(msg.createdAt);
        blocks.push(ts ? `${ts}\n${nfc(msg.content)}` : nfc(msg.content));
      }
    }

    const startIso = renderedItems[startIdx]?.msg?.createdAt;
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

  return {
    getCurrentExportStartIndex,
    exportMemberText,
  };
})();