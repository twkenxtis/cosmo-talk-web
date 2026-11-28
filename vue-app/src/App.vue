<script setup>
import { ref, onMounted } from "vue";
import { useChatStore } from "./composables/useChatStore.js";
import { CosmoUtils } from "./services/utils.js";
import LoginPage from "./components/LoginPage.vue";
import MemberSidebar from "./components/MemberSidebar.vue";
import ChatHeader from "./components/ChatHeader.vue";
import ChatMessageList from "./components/ChatMessageList.vue";
import ChatComposer from "./components/ChatComposer.vue";
import SettingsModal from "./components/SettingsModal.vue";

const { store, activeMember, t, showToast, initApp } = useChatStore();
const msgListRef = ref(null);

function handleExportText() {
  const member = activeMember.value;
  if (!member || !msgListRef.value) return;
  const text = msgListRef.value.buildExportPlainText();
  const safeName = CosmoUtils.nfc(
    String(member.originalName || member.artistMemberName || member.artistMemberId).replace(/[\\/:*?"<>|]/g, "_")
  );
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}_chat.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleCopyText() {
  if (!msgListRef.value) return;
  const text = msgListRef.value.buildExportPlainText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    showToast(t("copy_failed"), "error");
  }
}

onMounted(() => {
  initApp();
});
</script>

<template>
  <div
    v-if="store.view === 'loading'"
    class="fixed inset-0 z-50 bg-(--bg-color) text-(--text-color) flex flex-col items-center justify-center gap-3"
  >
    <div class="text-sm text-(--purple-text)">
      {{ store.loadingPercent }}%<template v-if="store.loadingLabel"> · {{ store.loadingLabel }}</template>
    </div>
    <div class="w-10 h-10 rounded-full border-4 border-white/15 border-t-(--purple-text) animate-spin" />
  </div>

  <LoginPage v-else-if="store.view === 'login'" />

  <section v-else class="min-h-screen w-full bg-(--bg-color) text-(--text-color) flex flex-col items-center">
    <div
      v-if="store.customBgDataUrl"
      aria-hidden="true"
      class="fixed top-[57px] inset-x-0 bottom-0 z-0 pointer-events-none flex items-center justify-center overflow-hidden"
    >
      <img :src="store.customBgDataUrl" alt="" class="h-full w-auto max-w-full object-contain" />
    </div>

    <MemberSidebar />
    <ChatHeader
      @search-step="(delta) => msgListRef?.stepSearch(delta)"
      @export-text="handleExportText"
      @copy-text="handleCopyText"
    />
    <ChatMessageList ref="msgListRef" />
    <ChatComposer />
    <SettingsModal />
  </section>

  <div
    v-if="store.toast.visible"
    role="status"
    class="fixed left-1/2 bottom-24 -translate-x-1/2 z-50 max-w-[90vw] px-4 py-2.5 rounded-[10px] border text-xs shadow-xl"
    :class="store.toast.type === 'error'
      ? 'bg-[#351b22] border-[#8f3548] text-[#ffdce3]'
      : 'bg-[#26262e] border-[#3c3c47] text-(--text-color)'"
  >
    {{ store.toast.message }}
  </div>
</template>
