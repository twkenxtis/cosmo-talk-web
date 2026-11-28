<script setup>
import { ref } from "vue";
import {
  IconMenu2,
  IconSearch,
  IconLanguage,
  IconFileExport,
  IconCopy,
  IconCheck,
  IconTool,
  IconLogout,
  IconArrowUp,
  IconArrowDown,
  IconX,
} from "@tabler/icons-vue";
import { useChatStore } from "../composables/useChatStore.js";
import { CosmoUtils } from "../services/utils.js";

const emit = defineEmits(["search-step", "export-text", "copy-text"]);
const { store, activeMember, t, toggleTranslate, logout } = useChatStore();
const copied = ref(false);

function handleCopy() {
  emit("copy-text");
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 1500);
}
</script>

<template>
  <header class="sticky top-0 z-25 w-full max-w-[640px] lg:max-w-[780px] min-h-[57px] px-2 py-3 bg-(--bg-color) border-b border-(--border-color) flex items-center justify-between gap-2">
    <div class="flex items-center gap-2.5 min-w-0">
      <button
        type="button"
        :title="t('toggle_sidebar')"
        class="w-8 h-8 inline-flex lg:hidden items-center justify-center shrink-0 cursor-pointer"
        @click="store.sidebarOpen = !store.sidebarOpen"
      >
        <IconMenu2 :size="20" />
      </button>
      <h2 class="text-[15px] font-semibold truncate m-0">
        {{ activeMember ? CosmoUtils.memberLabel(activeMember) : "" }}
      </h2>
    </div>

    <div class="flex items-center gap-1 lg:gap-1.5 shrink-0">
      <button
        type="button"
        :title="t('search_member_placeholder')"
        class="w-8 h-8 inline-flex items-center justify-center cursor-pointer"
        :class="store.searchOpen ? 'text-(--purple-text)' : ''"
        @click="store.searchOpen = !store.searchOpen"
      >
        <IconSearch :size="19" />
      </button>

      <button
        type="button"
        title="Translate (ON/OFF)"
        class="w-8 h-8 inline-flex items-center justify-center cursor-pointer"
        :class="store.translateEnabled ? 'text-(--purple-text)' : ''"
        @click="toggleTranslate"
      >
        <IconLanguage :size="20" />
      </button>

      <button
        type="button"
        :title="t('export_text')"
        class="w-8 h-8 inline-flex items-center justify-center cursor-pointer"
        @click="$emit('export-text')"
      >
        <IconFileExport :size="19" />
      </button>

      <button
        type="button"
        :title="copied ? t('copied') : t('copy_artist_text')"
        class="w-8 h-8 inline-flex items-center justify-center cursor-pointer"
        @click="handleCopy"
      >
        <IconCheck v-if="copied" :size="19" class="text-emerald-400" />
        <IconCopy v-else :size="19" />
      </button>

      <button
        type="button"
        :title="t('settings')"
        class="w-8 h-8 inline-flex items-center justify-center cursor-pointer"
        @click="store.settingsOpen = true"
      >
        <IconTool :size="19" />
      </button>

      <button
        type="button"
        :title="t('logout')"
        class="w-8 h-8 inline-flex items-center justify-center cursor-pointer"
        @click="logout()"
      >
        <IconLogout :size="19" />
      </button>
    </div>
  </header>

  <div
    v-if="store.searchOpen"
    class="sticky top-[57px] z-24 w-full max-w-[640px] lg:max-w-[780px] px-2.5 py-1.5 bg-(--sidebar-bg) border-b border-(--border-color) flex items-center gap-1.5"
  >
    <input
      v-model="store.searchQuery"
      type="search"
      :placeholder="t('search_member_placeholder')"
      class="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-(--border-color) bg-(--bg-color) text-(--text-color) text-[13px] outline-none"
      @keydown.enter.prevent="$emit('search-step', $event.shiftKey ? -1 : 1)"
    />
    <button type="button" class="w-7 h-7 inline-flex items-center justify-center cursor-pointer" @click="$emit('search-step', -1)">
      <IconArrowUp :size="16" />
    </button>
    <button type="button" class="w-7 h-7 inline-flex items-center justify-center cursor-pointer" @click="$emit('search-step', 1)">
      <IconArrowDown :size="16" />
    </button>
    <button
      type="button"
      class="w-7 h-7 inline-flex items-center justify-center cursor-pointer"
      @click="store.searchOpen = false; store.searchQuery = ''"
    >
      <IconX :size="16" />
    </button>
  </div>
</template>
