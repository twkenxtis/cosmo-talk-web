<script setup>
import { IconX } from "@tabler/icons-vue";
import { useChatStore } from "../composables/useChatStore.js";
import { CosmoI18n } from "../services/i18n.js";

const { store, t, setLang, setTheme, setIncludeTimestamp, setCustomBg, showToast } = useChatStore();
const langs = CosmoI18n.getSupportedLangs();

function onUploadBg(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    try {
      setCustomBg(canvas.toDataURL("image/jpeg", 0.85));
    } catch (_) {
      showToast("圖片超出 localStorage 容量上限", "error");
    }
  };
  img.src = url;
  ev.target.value = "";
}
</script>

<template>
  <div
    v-if="store.settingsOpen"
    class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
    @click.self="store.settingsOpen = false"
  >
    <div class="w-full max-w-[340px] rounded-xl bg-(--sidebar-bg) border border-(--border-color) text-(--text-color) overflow-hidden shadow-2xl">
      <div class="flex items-center justify-between px-3.5 py-2.5 border-b border-(--border-color)">
        <span class="font-semibold text-base">{{ t("settings_title") }}</span>
        <button type="button" class="w-8 h-8 inline-flex items-center justify-center cursor-pointer" @click="store.settingsOpen = false">
          <IconX :size="18" />
        </button>
      </div>

      <div class="p-4 flex flex-col gap-3.5 text-sm">
        <div class="flex items-center justify-between gap-2">
          <span>{{ t("include_timestamp") }}</span>
          <div class="inline-flex gap-1.5">
            <button
              type="button"
              class="px-3 py-1 rounded-lg border border-(--border-color) cursor-pointer"
              :class="store.includeTimestamp ? 'bg-[#361892] text-white border-transparent' : 'bg-(--accent-btn)'"
              @click="setIncludeTimestamp(true)"
            >
              {{ t("yes") }}
            </button>
            <button
              type="button"
              class="px-3 py-1 rounded-lg border border-(--border-color) cursor-pointer"
              :class="!store.includeTimestamp ? 'bg-[#361892] text-white border-transparent' : 'bg-(--accent-btn)'"
              @click="setIncludeTimestamp(false)"
            >
              {{ t("no") }}
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between gap-2">
          <span>{{ t("language") }}</span>
          <select
            :value="store.lang"
            class="bg-(--bg-color) border border-(--border-color) rounded-lg px-2.5 py-1.5 text-xs outline-none cursor-pointer"
            @change="setLang($event.target.value)"
          >
            <option v-for="item in langs" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </div>

        <div class="flex items-center justify-between gap-2">
          <span>主題 / Theme</span>
          <select
            :value="store.theme"
            class="bg-(--bg-color) border border-(--border-color) rounded-lg px-2.5 py-1.5 text-xs outline-none cursor-pointer"
            @change="setTheme($event.target.value)"
          >
            <option value="dark">Dark (深色)</option>
            <option value="light">Light (淺色)</option>
            <option value="black">Black (純黑)</option>
            <option value="white">White (純白)</option>
          </select>
        </div>

        <div class="flex items-center gap-2 pt-1">
          <label class="flex-1 text-center py-2 rounded-lg bg-(--accent-btn) hover:bg-(--accent-btn-hover) border border-(--border-color) cursor-pointer">
            {{ t("upload_bg_btn") }}
            <input type="file" accept="image/png,image/webp,image/jpeg,image/gif" class="hidden" @change="onUploadBg" />
          </label>
          <button
            type="button"
            class="flex-1 py-2 rounded-lg bg-(--accent-btn) hover:bg-(--accent-btn-hover) border border-(--border-color) cursor-pointer"
            @click="setCustomBg('')"
          >
            {{ t("clear_bg_btn") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
