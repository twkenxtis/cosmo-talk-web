<script setup>
import { IconX } from "@tabler/icons-vue";
import { useChatStore } from "../composables/useChatStore.js";
import { CosmoUtils } from "../services/utils.js";
import { CosmoSecurity } from "../services/security.js";

const { store, getMemberRingColor } = useChatStore();

function selectMember(mid) {
  store.activeMemberId = mid;
  store.sidebarOpen = false;
  window.scrollTo({ top: 0, behavior: "instant" });
}
</script>

<template>
  <div
    v-if="store.sidebarOpen"
    class="fixed inset-0 bg-black/55 z-30"
    @click="store.sidebarOpen = false"
  />

  <aside
    class="fixed left-0 top-0 h-dvh w-[260px] bg-(--sidebar-bg) border-r border-(--border-color) z-35 flex flex-col transition-transform duration-200"
    :class="store.sidebarOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'"
  >
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-(--border-color) shrink-0">
      <span class="text-xs text-(--text-muted)">Members ({{ store.members.length }})</span>
      <button
        type="button"
        class="w-8 h-8 inline-flex items-center justify-center text-(--text-color) cursor-pointer"
        @click="store.sidebarOpen = false"
      >
        <IconX :size="18" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-1.5 py-2 flex flex-col gap-1">
      <button
        v-for="m in store.members"
        :key="m.artistMemberId"
        type="button"
        class="flex items-center gap-2.5 w-full min-h-[44px] px-2.5 py-2 rounded-[10px] text-left text-[13px] transition-colors cursor-pointer"
        :class="String(m.artistMemberId) === String(store.activeMemberId)
          ? 'bg-(--sidebar-active) text-(--purple-text) font-semibold'
          : 'hover:bg-(--sidebar-hover) text-(--text-color)'"
        @click="selectMember(m.artistMemberId)"
      >
        <img
          v-if="m.profileImageUrl"
          :src="CosmoSecurity.safeImgUrl(m.profileImageUrl)"
          :alt="CosmoUtils.memberLabel(m)"
          loading="lazy"
          class="w-8 h-8 rounded-full object-cover shrink-0 bg-[#333]"
          :style="{ border: `2.5px solid ${getMemberRingColor(m)}` }"
        />
        <span class="truncate">{{ CosmoUtils.memberLabel(m) }}</span>
      </button>
    </div>
  </aside>
</template>
