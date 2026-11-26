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
        if (typeof seg.renderedIndex === "number" && seg.renderedIndex <= currentIdx) {
          segStartIdx = seg.renderedIndex;
        } else {
          break;
        }
      }
      return segStartIdx;
    }

    return currentIdx;
  }

  function buildMemberText({ renderedItems, segmentStarts, headerEl }) {
    const startIdx = getCurrentExportStartIndex({ renderedItems, segmentStarts, headerEl });
    const includeTs =
      typeof CosmoSettings !== "undefined" && typeof CosmoSettings.getIncludeTimestamp === "function"
        ? CosmoSettings.getIncludeTimestamp()
        : true;
    const blocks = [];

    for (let i = startIdx; i < renderedItems.length; i++) {
      const msg = renderedItems[i]?.msg;
      if (!msg) continue;

      const isArtist = msg.senderType === "artistMember" && msg.sourceType !== "userReply";
      if (!isArtist) continue;

      if (msg.messageType === "text" && typeof msg.content === "string" && msg.content.trim()) {
        const cleanText = nfc(msg.content);
        if (includeTs) {
          const ts = fmtExportTs(msg.createdAt);
          blocks.push(ts ? `${ts}\n${cleanText}` : cleanText);
        } else {
          blocks.push(cleanText);
        }
      }
    }

    return {
      text: blocks.join("\n"),
      startIdx,
    };
  }

  function exportMemberText({ member, renderedItems, segmentStarts, headerEl }) {
    if (!member) return;
    const { text, startIdx } = buildMemberText({ renderedItems, segmentStarts, headerEl });

    const startIso = renderedItems[startIdx]?.msg?.createdAt;
    const startTag = startIso ? fmtTimeline(startIso).replace(/[: ]/g, "-") : "start";
    const safeName = nfc(
      String(member.originalName || member.artistMemberName || member.artistMemberId).replace(
        /[\\/:*?"<>|]/g,
        "_",
      ),
    );

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = CosmoSecurity.safeLinkUrl(url);
    a.download = `${safeName}_from_${startTag}_chat.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return {
    getCurrentExportStartIndex,
    buildMemberText,
    exportMemberText,
  };
})();
