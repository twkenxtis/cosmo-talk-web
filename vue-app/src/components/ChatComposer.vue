<script setup>
import { ref, computed, watch } from "vue";
import { IconX, IconArrowUp } from "@tabler/icons-vue";
import { useChatStore } from "../composables/useChatStore.js";
import { CosmoUtils } from "../services/utils.js";
import { CosmoAuth } from "../services/auth.js";
import { CosmoSync } from "../services/sync.js";
import { CosmoSecurity } from "../services/security.js";

const { store, activeMember, t, showToast, refreshActiveMember } = useChatStore();

const inputText = ref("");
const remainingCount = ref(null);
const stickerPanelOpen = ref(false);
const stickers = ref([]);
const stickersLoaded = ref(false);
const selectedSticker = ref(null);
const isSending = ref(false);

const canSend = computed(() =>
  !isSending.value && (inputText.value.trim().length > 0 || Boolean(selectedSticker.value))
);

const placeholderText = computed(() => {
  const count = remainingCount.value === null ? "..." : String(remainingCount.value);
  return selectedSticker.value
    ? t("sticker_selected_placeholder", { count })
    : t("composer_placeholder", { count });
});

function getLatestMessageId(member) {
  if (!member) return "";
  if (member.lastMessageId) return String(member.lastMessageId);
  const recs = Array.isArray(member.records) ? member.records : [];
  for (let i = recs.length - 1; i >= 0; i--) {
    const id = recs[i]?.message?.id ?? recs[i]?.id;
    if (id !== undefined && id !== null && String(id).trim() !== "") return String(id).trim();
  }
  return "";
}

async function fetchRemainingCount(mid) {
  if (!mid || store.isDemo) return;
  try {
    const url = `${CosmoAuth.API_BASE}/bff/v3/channels/messages/${encodeURIComponent(mid)}/reply-count`;
    const resp = await CosmoAuth.authorizedFetch(url, { headers: { Accept: "application/json" } });
    if (resp.ok) {
      const data = await resp.json();
      remainingCount.value = typeof data.remainingCount === "number" ? data.remainingCount : 0;
    }
  } catch (_) {}
}

async function toggleStickers() {
  stickerPanelOpen.value = !stickerPanelOpen.value;
  if (!stickerPanelOpen.value || stickersLoaded.value) return;
  try {
    const url = store.isDemo
      ? "demo/sticker.json"
      : `${CosmoAuth.API_BASE}/bff/v3/artists/${encodeURIComponent(CosmoSync.ARTIST_ID)}/stickers?skip=0&take=9999`;
    const resp = store.isDemo
      ? await fetch(url, { cache: "no-store" })
      : await CosmoAuth.authorizedFetch(url, { headers: { Accept: "application/json" } });
    if (resp.ok) {
      const data = await resp.json();
      stickers.value = Array.isArray(data) ? data : (Array.isArray(data.stickers) ? data.stickers : []);
      stickersLoaded.value = true;
    }
  } catch (_) {}
}

function selectSticker(st) {
  selectedSticker.value = st;
  inputText.value = "";
  stickerPanelOpen.value = false;
}

async function sendMessage() {
  const member = activeMember.value;
  if (!canSend.value || !member) return;
  if (store.isDemo) {
    showToast("DEMO mode blocks POST/write requests.", "error");
    return;
  }

  const content = selectedSticker.value
    ? CosmoUtils.resolveCodepointOrHtml(selectedSticker.value.utf8Content || selectedSticker.value.codepointHex)
    : CosmoUtils.resolveCodepointOrHtml(inputText.value);
  if (!content.trim()) return;

  const targetMsgId = getLatestMessageId(member);
  if (!targetMsgId) return;

  isSending.value = true;
  try {
    const mid = String(member.artistMemberId);
    const url = `${CosmoAuth.API_BASE}/bff/v4/channels/messages/${encodeURIComponent(mid)}/${encodeURIComponent(targetMsgId)}/replies`;
    const resp = await CosmoAuth.authorizedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ content, messageId: targetMsgId }),
    });

    if (resp.ok) {
      inputText.value = "";
      selectedSticker.value = null;
      if (typeof remainingCount.value === "number" && remainingCount.value > 0) {
        remainingCount.value -= 1;
      }
      await refreshActiveMember();
    } else {
      const errText = await resp.text().catch(() => "");
      showToast(errText || t("request_failed", { status: resp.status }), "error");
    }
  } finally {
    isSending.value = false;
  }
}

watch(
  () => store.activeMemberId,
  (mid) => {
    selectedSticker.value = null;
    if (mid && remainingCount.value === null) fetchRemainingCount(mid);
  },
  { immediate: true }
);
</script>

<template>
  <div class="fixed bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-[640px] z-22 flex flex-col gap-2">
    <div
      v-if="selectedSticker"
      class="relative self-center w-44 h-44 rounded-[22px] bg-(--bubble-reply-bg) border border-(--border-color) shadow-xl flex items-center justify-center p-4"
    >
      <img
        :src="CosmoSecurity.safeImgUrl(selectedSticker.imageUrl || selectedSticker.url)"
        alt="selected sticker"
        class="w-32 h-32 object-contain"
      />
      <button
        type="button"
        class="absolute top-2 right-2 w-7 h-7 rounded-full inline-flex items-center justify-center text-white/80 hover:bg-white/10 cursor-pointer"
        @click="selectedSticker = null"
      >
        <IconX :size="16" />
      </button>
    </div>

    <div
      v-if="stickerPanelOpen"
      class="w-[calc(100%-52px)] rounded-[18px] bg-(--sidebar-bg) border border-(--border-color) p-3 shadow-2xl flex flex-col gap-2"
    >
      <div class="flex items-center justify-between text-xs text-(--text-muted) px-1">
        <span>{{ t("sticker_picker_hint", { count: stickers.length }) }}</span>
        <button type="button" class="w-6 h-6 inline-flex items-center justify-center cursor-pointer" @click="stickerPanelOpen = false">
          <IconX :size="15" />
        </button>
      </div>
      <div class="grid grid-cols-4 gap-2 max-h-[320px] overflow-y-auto">
        <button
          v-for="st in stickers"
          :key="st.id || st.codepointHex"
          type="button"
          class="aspect-square rounded-xl border border-transparent hover:border-(--purple-text) bg-white/5 p-1.5 flex items-center justify-center cursor-pointer"
          @click="selectSticker(st)"
        >
          <img
            :src="CosmoSecurity.safeImgUrl(st.imageUrl || st.url)"
            :alt="st.codepointHex"
            loading="lazy"
            class="w-full h-full object-contain"
          />
        </button>
      </div>
    </div>

    <div class="flex items-center gap-2 w-full">
      <div class="flex-1 flex items-center bg-(--sidebar-bg) border border-[#7E878E] rounded-xl px-3.5 h-[46px]">
        <input
          v-model="inputText"
          type="text"
          :disabled="Boolean(selectedSticker)"
          :placeholder="placeholderText"
          autocomplete="off"
          class="flex-1 min-w-0 h-full bg-transparent border-none outline-none text-(--text-color) text-sm"
          @keydown.enter.exact.prevent="sendMessage"
        />
        <button
          type="button"
          title="Sticker"
          class="w-8 h-8 rounded-md inline-flex items-center justify-center hover:bg-(--sidebar-hover) shrink-0 cursor-pointer"
          @click="toggleStickers"
        >
          <img src="/assets/sticker_choese.png" alt="S" class="w-[23px] h-[23px] object-contain" />
        </button>
      </div>

      <button
        type="button"
        :disabled="!canSend"
        :title="t('send')"
        class="w-11 h-11 rounded-full inline-flex items-center justify-center transition-colors shrink-0 cursor-pointer disabled:opacity-50"
        :class="canSend ? 'bg-[#6B3FA0] text-white' : 'bg-[#464E54] text-[#7A8187]'"
        @click="sendMessage"
      >
        <IconArrowUp :size="22" />
      </button>
    </div>
  </div>
</template>
