<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import { IconChevronDown } from "@tabler/icons-vue";
import { useChatStore } from "../composables/useChatStore.js";
import { CosmoUtils } from "../services/utils.js";
import { CosmoSecurity } from "../services/security.js";

const { store, activeMember, t, queueTranslations, prefetchMemberTranslations } = useChatStore();
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const AUDIO_EXT_RE = /\.(mp3|m4a|aac|ogg|opus|wav|flac)(\?.*)?$/i;
const VIDEO_EXT_RE = /\.(mp4|m4v|m4s|webm|mov)(\?.*)?$/i;

const showScrollBottom = ref(false);
const activeHitAnchor = ref("");
const hitIndex = ref(0);
let scrollRafId = 0;

watch(
  () => store.scrollToBottomTick,
  async (tick) => {
    if (!tick) return;
    await nextTick();
    scrollToBottom(true);
    if (activeMember.value && !store.isDemo) {
      queueVisibleTranslations();
    }
  }
);

function fmtEnglishDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function classifyMedia(url) {
  const clean = String(url || "").trim();
  if (!clean) return "image";
  if (AUDIO_EXT_RE.test(clean)) return "audio";
  if (VIDEO_EXT_RE.test(clean) || CosmoUtils.MEDIA_EXT_RE?.test(clean)) return "video";
  return "image";
}

function pickStickerUrl(stickerMeta) {
  if (!stickerMeta) return "";
  if (typeof stickerMeta === "string") return stickerMeta;
  return (
    stickerMeta.imageUrl ||
    stickerMeta.url ||
    stickerMeta.stickerUrl ||
    stickerMeta.thumbnailUrl ||
    stickerMeta.mediaUrl ||
    ""
  );
}

const displayItems = computed(() => {
  const member = activeMember.value;
  if (!member) return [];
  const records = Array.isArray(member.records) ? member.records : [];
  const items = [];
  let lastDay = null;
  let prevGroup = null;
  let count = 0;

  for (const rec of records) {
    const msg = rec?.message || {};
    const hasText = !CosmoUtils.isEmpty(msg.content);
    const hasSticker = !CosmoUtils.isEmpty(msg.stickerMetadata);
    const hasMedia = !CosmoUtils.isEmpty(msg.mediaMetadata);
    const isReply = !CosmoUtils.isEmpty(msg.replyContent);
    if (!hasText && !hasSticker && !hasMedia && !isReply) continue;

    count += 1;
    const anchorId = `msg-${member.artistMemberId}-${count}`;
    const day = fmtEnglishDay(msg.createdAt);
    const showDay = Boolean(day && day !== lastDay);
    if (showDay) {
      lastDay = day;
      prevGroup = null;
    }

    const sourceType = msg.sourceType || rec?.sourceType || "";
    const isUserReply = sourceType === "userReply";
    const minuteKey = CosmoUtils.getMinuteGroupKey(msg.createdAt);
    const senderKey = `${msg.senderType || ""}|${sourceType}`;
    const groupedWithPrev = Boolean(
      prevGroup &&
      prevGroup.day === day &&
      minuteKey &&
      prevGroup.minuteKey === minuteKey &&
      prevGroup.senderKey === senderKey
    );

    if (groupedWithPrev && items.length > 0) {
      items[items.length - 1].showTime = false;
    }

    const isArtist = msg.senderType === "artistMember" && !isUserReply;
    const sourceId = String(msg.sourceId || rec?.sourceId || "");
    const translatedText = sourceId
      ? store.translationsMap[`${member.artistMemberId}:${sourceId}`] || ""
      : "";

    const stickerUrl = hasSticker ? pickStickerUrl(msg.stickerMetadata) : "";
    const mediaList = hasMedia
      ? (Array.isArray(msg.mediaMetadata) ? msg.mediaMetadata : [msg.mediaMetadata])
          .map((item) => CosmoUtils.pickMediaUrl(item))
          .filter(Boolean)
          .map((url) => ({ url, kind: classifyMedia(url) }))
      : [];

    // 貼圖與媒體不使用 bubble chat；僅文字或回覆文字（且非純貼圖）使用氣泡框
    const hasNonStickerMedia = mediaList.length > 0;
    const hasStickerImage = Boolean(hasSticker && stickerUrl);
    const useBubble = Boolean(!hasStickerImage && !hasNonStickerMedia && (isReply || isUserReply || hasText));

    items.push({
      anchorId,
      sourceId,
      msg,
      day,
      showDay,
      isArtist,
      isUserReply,
      isReply,
      hasText,
      hasSticker: hasStickerImage,
      stickerUrl,
      mediaList,
      useBubble,
      groupedWithPrev,
      showTime: true,
      timeText: CosmoUtils.fmtTime(msg.createdAt),
      translatedText,
    });
    prevGroup = { day, minuteKey, senderKey };
  }
  return items;
});

const timelineSegments = computed(() => {
  const segs = [];
  let lastMs = null;
  for (let i = 0; i < displayItems.value.length; i++) {
    const item = displayItems.value[i];
    const ms = item.msg.createdAt ? Date.parse(item.msg.createdAt) : NaN;
    if (!Number.isNaN(ms) && (lastMs === null || Math.abs(ms - lastMs) / 60000 > 31)) {
      segs.push({
        index: i,
        id: item.anchorId,
        label: CosmoUtils.fmtTimeline(item.msg.createdAt),
      });
      lastMs = ms;
    }
  }
  return segs;
});

const searchMatches = computed(() => {
  const q = store.searchQuery.trim().toLowerCase();
  if (!q) return [];
  return displayItems.value
    .filter((it) => {
      const orig = String(it.msg.content || "").toLowerCase();
      const tr = String(it.translatedText || "").toLowerCase();
      return orig.includes(q) || tr.includes(q);
    })
    .map((it) => it.anchorId);
});

function queueVisibleTranslations() {
  if (store.isDemo || !activeMember.value) return;
  const mid = String(activeMember.value.artistMemberId);
  const vh = window.innerHeight || 800;
  const buffer = 360;
  const visibleSourceIds = [];

  for (const item of displayItems.value) {
    if (!item.isArtist || !item.hasText || !item.sourceId || item.translatedText) continue;
    const el = document.getElementById(item.anchorId);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.bottom >= -buffer && rect.top <= vh + buffer) {
      visibleSourceIds.push(item.sourceId);
    }
  }

  if (visibleSourceIds.length > 0) {
    queueTranslations(mid, visibleSourceIds, true);
  }
}

function stepSearch(delta) {
  const list = searchMatches.value;
  if (!list.length) {
    activeHitAnchor.value = "";
    return;
  }
  hitIndex.value = (((hitIndex.value + delta) % list.length) + list.length) % list.length;
  activeHitAnchor.value = list[hitIndex.value];
  document.getElementById(activeHitAnchor.value)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function jumpToAnchor(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToBottom(smooth = true) {
  const maxTop = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  window.scrollTo({ top: maxTop, behavior: smooth ? "smooth" : "auto" });
}

function handleScroll() {
  const doc = document.documentElement;
  const dist = doc.scrollHeight - window.scrollY - window.innerHeight;
  showScrollBottom.value = dist >= window.innerHeight * 1.2;

  if (scrollRafId) return;
  scrollRafId = window.requestAnimationFrame(() => {
    scrollRafId = 0;
    queueVisibleTranslations();
  });
}

function getCurrentViewedItemIndex(list) {
  if (!list.length) return 0;
  const anchorProbeY = Math.min(window.innerHeight * 0.35, 260);
  let currentIdx = 0;

  for (let i = 0; i < list.length; i++) {
    const el = document.getElementById(list[i].anchorId);
    if (!el) continue;
    const top = el.getBoundingClientRect().top;
    if (top <= anchorProbeY) {
      currentIdx = i;
    } else {
      break;
    }
  }
  return currentIdx;
}

function buildExportPlainText() {
  const list = displayItems.value;
  if (!list.length) return "";

  const viewedIdx = getCurrentViewedItemIndex(list);
  const segs = timelineSegments.value;

  // 找出使用者目前畫面所在位置所屬的 timeline 區段起點
  let startIdx = 0;
  let endIdx = list.length;
  if (segs.length > 0) {
    for (let s = 0; s < segs.length; s++) {
      if (segs[s].index <= viewedIdx) {
        startIdx = segs[s].index;
        endIdx = s + 1 < segs.length ? segs[s + 1].index : list.length;
      } else {
        break;
      }
    }
  }

  const lines = [];
  for (let i = startIdx; i < endIdx; i++) {
    const it = list[i];
    if (!it.isArtist || !it.hasText) continue;
    const text = CosmoUtils.nfc(String(it.msg.content || "")).trim();
    if (!text) continue;
    if (store.includeTimestamp) {
      const ts = CosmoUtils.fmtExportTs(it.msg.createdAt);
      lines.push(ts ? `${ts}\n${text}` : text);
    } else {
      lines.push(text);
    }
  }
  return lines.join("\n");
}

watch(
  () => store.activeMemberId,
  async () => {
    await nextTick();
    scrollToBottom(false);
    if (activeMember.value && !store.isDemo) {
      prefetchMemberTranslations(activeMember.value, 25);
      queueVisibleTranslations();
    }
  },
  { immediate: true }
);

onMounted(() => {
  window.addEventListener("scroll", handleScroll, { passive: true });
  queueVisibleTranslations();
});

onUnmounted(() => {
  window.removeEventListener("scroll", handleScroll);
  if (scrollRafId) {
    window.cancelAnimationFrame(scrollRafId);
    scrollRafId = 0;
  }
});

defineExpose({ stepSearch, buildExportPlainText, scrollToBottom });
</script>

<template>
  <nav
    v-if="timelineSegments.length > 0"
    aria-label="Timeline"
    class="fixed top-14 inset-x-0 md:inset-x-auto md:right-3 md:top-1/2 md:-translate-y-1/2 max-w-full md:max-h-[92vh] overflow-x-auto md:overflow-x-visible md:overflow-y-auto flex md:flex-col items-center md:items-stretch gap-1.5 md:gap-1 px-2.5 py-1.5 md:p-0 bg-(--sidebar-bg)/95 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none border-b md:border-b-0 border-(--border-color) z-20"
  >
    <button
      v-for="seg in timelineSegments"
      :key="seg.id"
      type="button"
      class="shrink-0 min-h-8 md:min-h-0 px-3 py-1.5 md:px-1.5 md:py-0.5 text-xs md:text-xs font-medium rounded-md md:rounded-none border border-(--border-color) bg-(--sidebar-bg) hover:bg-(--sidebar-hover) active:opacity-80 text-(--text-color) cursor-pointer whitespace-nowrap"
      :class="activeTimelineKey === seg.key ? 'bg-(--sidebar-active) text-(--purple-text) border-(--purple-text)/60 font-semibold' : 'bg-(--bg-color)/80 text-(--text-color)/85 border-(--border-color)/80 hover:bg-(--sidebar-hover) hover:text-(--text-color)'"
      @click="jumpToAnchor(seg.id)"
    >
      {{ seg.label }}
    </button>
  </nav>

  <div class="w-full max-w-[640px] px-1 pt-4 pb-28 flex flex-col gap-1 relative z-1">
    <div v-if="!activeMember" class="text-center text-(--text-muted) py-10 text-sm">
      {{ t("no_channel_data") }}
    </div>

    <template v-for="item in displayItems" :key="item.anchorId">
      <div
        v-if="item.showDay"
        class="self-center my-5 px-4 py-1.5 rounded-full bg-(--bubble-bg) border border-(--border-color) text-(--text-color) text-xs font-medium"
      >
        {{ item.day }}
      </div>

      <div
        :id="item.anchorId"
        class="flex items-start gap-2.5 scroll-mt-20"
        :class="[
          item.groupedWithPrev ? 'mb-0.5' : 'mb-1.5',
          !item.isArtist ? 'flex-row-reverse' : '',
          activeHitAnchor === item.anchorId ? 'ring-2 ring-(--purple-text) rounded-2xl' : '',
        ]"
      >
        <div
          v-if="item.isArtist"
          class="w-9 h-9 rounded-full shrink-0 bg-cover bg-center"
          :style="item.groupedWithPrev
            ? { height: '0px', borderColor: 'transparent' }
            : {
                border: '2.5px solid var(--avatar-outline)',
                backgroundColor: '#333',
                backgroundImage: activeMember?.profileImageUrl ? `url('${CosmoSecurity.safeImgUrl(activeMember.profileImageUrl)}')` : 'none',
              }"
        />

        <div class="flex flex-col max-w-[80%]" :class="!item.isArtist ? 'items-end' : ''">
          <div v-if="item.isArtist && !item.groupedWithPrev" class="text-[13px] text-(--text-muted) mb-1">
            {{ CosmoUtils.nfc(activeMember?.artistMemberName || activeMember?.originalName || "") }}
          </div>

          <div class="flex items-end gap-1.5" :class="!item.isArtist ? 'flex-row-reverse' : ''">
            <!-- 純文字 / 回覆文字才套用 bubble chat 外框 -->
            <div
              v-if="item.useBubble"
              class="text-[15px] leading-snug break-words"
              :class="[
                item.isReply
                  ? 'bg-(--bubble-reply-bg) border border-[#3b1c5e] px-3.5 py-2.5 rounded-2xl'
                  : item.isUserReply
                    ? 'bg-[#361892] text-white px-3.5 py-2.5 rounded-2xl rounded-tr-sm'
                    : 'bg-(--bubble-bg) text-(--text-color) px-3.5 py-2.5 rounded-2xl rounded-tl-sm',
              ]"
            >
              <template v-if="item.isReply">
                <div class="text-[13px] text-(--purple-text) font-semibold mb-1">
                  {{ t("replied_by", { name: activeMember?.artistMemberName || "" }) }}
                </div>
                <div class="whitespace-pre-wrap">{{ CosmoUtils.nfc(typeof item.msg.replyContent === "object" ? JSON.stringify(item.msg.replyContent) : item.msg.replyContent) }}</div>
              </template>

              <template v-else>
                <div class="whitespace-pre-wrap">{{ CosmoUtils.nfc(String(item.msg.content)) }}</div>
                <div
                  v-if="store.translateEnabled && item.translatedText"
                  class="mt-1 pt-1 border-t border-white/10 text-[14px] leading-snug text-[#b49dff] whitespace-pre-wrap"
                >
                  {{ item.translatedText }}
                </div>
              </template>
            </div>

            <!-- 非文字訊息（Sticker / 影片 / Audio / 圖片，含 userReply 貼圖）一律不使用 bubble chat 外框 -->
            <div v-else class="flex flex-col gap-1.5" :class="!item.isArtist ? 'items-end' : ''">
              <img
                v-if="item.hasSticker && item.stickerUrl"
                :src="CosmoSecurity.safeImgUrl(item.stickerUrl)"
                loading="lazy"
                class="block max-w-[168px] max-h-[168px] object-contain"
              />

              <template v-else-if="item.mediaList.length > 0">
                <template v-for="m in item.mediaList" :key="m.url">
                  <video
                    v-if="m.kind === 'video'"
                    :src="CosmoSecurity.safeImgUrl(m.url)"
                    controls
                    preload="metadata"
                    class="block max-w-full max-h-[380px] rounded-xl"
                  />
                  <audio
                    v-else-if="m.kind === 'audio'"
                    :src="CosmoSecurity.safeImgUrl(m.url)"
                    controls
                    preload="metadata"
                    class="block max-w-[280px]"
                  />
                  <img
                    v-else
                    :src="CosmoSecurity.safeImgUrl(m.url)"
                    loading="lazy"
                    class="block max-w-[320px] max-h-[400px] rounded-xl object-cover"
                  />
                </template>
              </template>
            </div>

            <span v-if="item.showTime" class="text-[11px] text-(--text-muted) tabular-nums whitespace-nowrap">
              {{ item.timeText }}
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>

  <button
      v-if="showScrollBottom"
      type="button"
      title="Scroll to bottom"
      class="fixed bottom-18 lg:bottom-20 right-[calc(50%-min(50vw-12px,320px)+4px)] lg:right-[calc(50%-130px-min(50vw-150px,390px)+4px)] w-9 h-9 rounded-full bg-(--sidebar-bg)/95 hover:bg-(--sidebar-hover) text-(--purple-text) border border-(--border-color) shadow-lg inline-flex items-center justify-center transition-colors z-23 cursor-pointer"
      @click="scrollToBottom(true)"
    >
      <IconChevronDown :size="20" />
    </button>
</template>