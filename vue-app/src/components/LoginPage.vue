<script setup>
import { ref } from "vue";
import { IconLanguage, IconClipboard } from "@tabler/icons-vue";
import { useChatStore } from "../composables/useChatStore.js";
import { CosmoI18n } from "../services/i18n.js";

const { store, t, setLang, loginWithInput, loadDemoSession } = useChatStore();
const rawJwt = ref("");
const langs = CosmoI18n.getSupportedLangs();

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text?.trim()) rawJwt.value = text.trim();
  } catch (_) {}
}

function submitLogin() {
  loginWithInput(rawJwt.value);
}
</script>

<template>
  <section class="min-h-screen w-full flex items-center justify-center px-5 bg-(--bg-color) text-(--text-color)">
    <div class="w-full max-w-[380px] flex flex-col gap-3.5">
      <div class="flex items-center justify-between gap-2.5">
        <h1 class="text-xl font-semibold m-0">COSMO LOGIN - Cosmo Talk Web</h1>
        <div class="inline-flex items-center gap-1.5 shrink-0">
          <IconLanguage :size="18" class="text-(--text-muted)" />
          <select
            :value="store.lang"
            aria-label="Language"
            class="bg-(--accent-btn) border border-(--border-color) rounded-lg px-2 py-1 text-xs text-(--text-color) outline-none cursor-pointer"
            @change="setLang($event.target.value)"
          >
            <option v-for="item in langs" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </div>
      </div>

      <p class="text-sm text-(--text-muted) whitespace-pre-line -mt-1 mb-1">
        {{ t("login_subtitle") }}
      </p>

      <div class="flex flex-col gap-2.5">
        <textarea
          v-model="rawJwt"
          rows="2"
          autocomplete="off"
          spellcheck="false"
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
          class="w-full min-h-[44px] max-h-[160px] bg-(--sidebar-bg) border border-(--border-color) focus:border-(--purple-text) text-(--text-color) px-3 py-2.5 text-xs leading-relaxed outline-none resize-y break-all"
          @keydown.ctrl.enter.prevent="submitLogin"
          @keydown.meta.enter.prevent="submitLogin"
        />

        <div class="flex items-stretch gap-2 w-full">
          <button
            type="button"
            class="flex-1 min-w-0 rounded-[10px] bg-[#5c378c] hover:bg-[#6d42a6] border border-[#7749b3] text-white px-3 py-2 text-[15px] cursor-pointer"
            @click="submitLogin"
          >
            {{ t("login_btn") }}
          </button>
          <button
            type="button"
            title="Paste JWT"
            aria-label="Paste JWT"
            class="w-[42px] h-[42px] shrink-0 inline-flex items-center justify-center bg-[#9576BE] hover:brightness-110 text-white cursor-pointer"
            @click="pasteFromClipboard"
          >
            <IconClipboard :size="18" />
          </button>
        </div>

        <a
          href="https://github.com/twkenxtis/cosmo-talk-web/blob/main/README.md#L19"
          target="_blank"
          rel="noopener noreferrer"
          class="w-full rounded-[10px] border border-(--border-color) text-(--purple-text) hover:bg-(--sidebar-hover) px-3 py-2 text-[15px] inline-flex items-center justify-center no-underline"
        >
          {{ t("jwt_guide_btn") }}
        </a>

        <a
          href="https://script.google.com/macros/s/AKfycby4CuBXmASIPl8uVfmZtW-u6a2atvfDqlBQ-Tu4ZnN6WIp4Db7eA8Sl3f9iN1_98wUFZQ/exec"
          target="_blank"
          rel="noopener noreferrer"
          class="w-full rounded-[10px] bg-[#9576be] hover:bg-[#7f5fb0] border border-[#6d42a6] text-white px-3 py-2 text-[15px] inline-flex items-center justify-center no-underline"
        >
          {{ t("gasLoginMethod") }}
        </a>

        <hr class="border-(--border-color) my-1" />

        <button
          type="button"
          class="w-full rounded-[10px] bg-(--accent-btn) hover:bg-(--accent-btn-hover) border border-(--border-color) text-(--text-color) px-3 py-2 text-[15px] cursor-pointer"
          @click="loadDemoSession"
        >
          Try DEMO
        </button>
      </div>

      <div v-if="store.loginStatus" class="text-base text-(--purple-text) break-words whitespace-pre-wrap">
        {{ store.loginStatus }}
      </div>
    </div>
  </section>
</template>
