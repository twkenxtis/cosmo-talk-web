import { reactive, computed } from "vue";
import { CosmoUtils } from "../services/utils.js";
import { CosmoStorage } from "../services/storage.js";
import { CosmoAuth } from "../services/auth.js";
import { CosmoSync } from "../services/sync.js";
import { CosmoI18n } from "../services/i18n.js";

const MEMBER_COLORS = {
  SeoYeon: "#22AEFF", HyeRin: "#9200FF", JiWoo: "#FFF800", ChaeYeon: "#98F21D",
  YooYeon: "#DB0C74", SooMin: "#FC83A4", NaKyoung: "#6799A0", YuBin: "#FFE3E2",
  Kaede: "#FFC935", DaHyun: "#FF9AD6", Kotone: "#FFDE00", YeonJi: "#5974FF",
  Nien: "#FF953F", SoHyun: "#1222B5", Xinyu: "#D51313", Mayu: "#FE8E76",
  Lynn: "#AC62B7", JooBin: "#B7F54C", HaYeon: "#52D9BB", ShiOn: "#FF428A",
  ChaeWon: "#C7A3E0", Sullin: "#7BBA8D", SeoAh: "#CFF3FF", JiYeon: "#FFAB62",
  tripleS: "#333333",
};

const store = reactive({
  view: "loading",
  loadingPercent: 0,
  loadingLabel: "",
  loginStatus: "",
  isDemo: false,
  lang: CosmoI18n.getLang(),
  theme: localStorage.getItem("cosmo_ui_theme_mode") || "dark",
  includeTimestamp: localStorage.getItem("cosmo_talk_include_timestamp") !== "false",
  customBgDataUrl: localStorage.getItem("cosmo_adv_custom_bg_jpg85_v1") || "",
  sidebarOpen: false,
  settingsOpen: false,
  searchOpen: false,
  searchQuery: "",
  translateEnabled: false,
  translationsMap: {},
  members: [],
  activeMemberId: null,
  scrollToBottomTick: 0,
  toast: { visible: false, message: "", type: "error" },
});

let pollTimer = null;
let toastTimer = null;

// 背景翻譯佇列與 404 記憶快取
const inFlightTranslations = new Set();
const missingTranslations = new Set();
const member404Streak = new Map();
const pendingTranslateQueue = [];
let translateWorkerRunning = false;

export function useChatStore() {
  const activeMember = computed(() =>
    store.members.find((m) => String(m.artistMemberId) === String(store.activeMemberId)) || null
  );

  function t(key, vars) {
    void store.lang;
    return CosmoI18n.t(key, vars);
  }

  function setLang(nextLang) {
    CosmoI18n.setLang(nextLang);
    store.lang = CosmoI18n.getLang();
  }

  function setTheme(nextTheme) {
    const valid = ["dark", "light", "black", "white"].includes(nextTheme) ? nextTheme : "dark";
    store.theme = valid;
    document.documentElement.setAttribute("data-theme", valid);
    localStorage.setItem("cosmo_ui_theme_mode", valid);
  }

  function setIncludeTimestamp(val) {
    store.includeTimestamp = Boolean(val);
    localStorage.setItem("cosmo_talk_include_timestamp", String(store.includeTimestamp));
  }

  function setCustomBg(dataUrl) {
    store.customBgDataUrl = dataUrl || "";
    if (dataUrl) {
      localStorage.setItem("cosmo_adv_custom_bg_jpg85_v1", dataUrl);
    } else {
      localStorage.removeItem("cosmo_adv_custom_bg_jpg85_v1");
    }
  }

  function showToast(message, type = "error", duration = 3500) {
    if (!message) return;
    store.toast = { visible: true, message: CosmoUtils.nfc(String(message)), type };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      store.toast.visible = false;
    }, duration);
  }

  function getMemberRingColor(member) {
    const orig = String(member?.originalName || "").trim();
    if (MEMBER_COLORS[orig]) return MEMBER_COLORS[orig];
    const low = orig.toLowerCase();
    for (const [k, v] of Object.entries(MEMBER_COLORS)) {
      if (low.includes(k.toLowerCase())) return v;
    }
    return "var(--avatar-outline)";
  }

  async function processTranslateQueue() {
    if (translateWorkerRunning) return;
    translateWorkerRunning = true;
    try {
      while (pendingTranslateQueue.length > 0) {
        if (store.isDemo) {
          pendingTranslateQueue.length = 0;
          break;
        }
        const batch = pendingTranslateQueue.splice(0, 3);
        await Promise.all(
          batch.map(async ({ mid, sid }) => {
            const key = `${mid}:${sid}`;
            if (store.translationsMap[key] || missingTranslations.has(key)) return;
            if ((member404Streak.get(mid) || 0) > 5) return;
            inFlightTranslations.add(key);
            try {
              const url = `${CosmoAuth.API_BASE}/bff/v3/channels/messages/${encodeURIComponent(mid)}/${encodeURIComponent(sid)}/translated-contents`;
              const resp = await CosmoAuth.authorizedFetch(url, { headers: { Accept: "application/json" } });
              if (resp.ok) {
                const json = await resp.json();
                member404Streak.set(mid, 0);
                if (json?.translatedContent) {
                  store.translationsMap[key] = json.translatedContent;
                }
              } else if (resp.status === 404) {
                missingTranslations.add(key);
                member404Streak.set(mid, (member404Streak.get(mid) || 0) + 1);
              }
            } catch (_) {
              // 靜默忽略單筆網路錯誤
            } finally {
              inFlightTranslations.delete(key);
            }
          })
        );
      }
    } finally {
      translateWorkerRunning = false;
    }
  }

  function queueTranslations(memberId, sourceIds, prioritize = false) {
    if (store.isDemo || !memberId || !Array.isArray(sourceIds)) return;
    const mid = String(memberId);
    if ((member404Streak.get(mid) || 0) > 5) return;

    const toAdd = [];
    for (const rawSid of sourceIds) {
      const sid = String(rawSid || "").trim();
      if (!sid) continue;
      const key = `${mid}:${sid}`;
      if (store.translationsMap[key] || missingTranslations.has(key) || inFlightTranslations.has(key)) continue;
      if (pendingTranslateQueue.some((item) => item.mid === mid && item.sid === sid)) continue;
      toAdd.push({ mid, sid });
    }

    if (toAdd.length === 0) return;
    if (prioritize) {
      pendingTranslateQueue.unshift(...toAdd);
    } else {
      pendingTranslateQueue.push(...toAdd);
    }
    void processTranslateQueue();
  }

  function prefetchMemberTranslations(member, limit = 25) {
    if (store.isDemo || !member) return;
    const mid = String(member.artistMemberId);
    const records = Array.isArray(member.records) ? member.records : [];
    const sids = records
      .map((r) => r?.message || r)
      .filter((m) => m?.senderType === "artistMember" && !CosmoUtils.isEmpty(m?.content) && m?.sourceId)
      .slice(-limit)
      .reverse()
      .map((m) => String(m.sourceId));
    queueTranslations(mid, sids, false);
  }

  async function loadDemoSession() {
    store.isDemo = true;
    store.view = "loading";
    store.loadingPercent = 30;
    store.loadingLabel = t("sync_fetch_channels");

    function parseDemoEvents(rawText) {
      const text = String(rawText || "").trim();
      if (!text) return [];
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.messages)) return parsed.messages;
        return [parsed];
      } catch (_) {}

      const items = [];
      let depth = 0;
      let start = -1;
      let inString = false;
      let escaped = false;

      for (let idx = 0; idx < text.length; idx++) {
        const ch = text[idx];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch.charCodeAt(0) === 92) {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === "{") {
          if (depth === 0) start = idx;
          depth += 1;
        } else if (ch === "}") {
          depth -= 1;
          if (depth === 0 && start !== -1) {
            items.push(JSON.parse(text.slice(start, idx + 1)));
            start = -1;
          }
        }
      }
      if (items.length > 0) return items;

      return text
        .replace(/\r/g, "")
        .split(String.fromCharCode(10))
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }

    async function readDemoJson(url, label, mode = "json") {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${label} HTTP ${r.status}`);
      const txt = (await r.text()).trim();
      if (!txt) return mode === "events" ? { messages: [] } : {};
      if (mode === "events") return { messages: parseDemoEvents(txt) };
      try {
        return JSON.parse(txt);
      } catch (err) {
        throw new Error(`${label}: ${err.message}`, { cause: err });
      }
    }

    try {
      const [chRes, lastRes, transRes] = await Promise.all([
        readDemoJson("demo/artistId.json", "artistId.json", "json"),
        readDemoJson("demo/last.json", "last.json", "events"),
        readDemoJson("demo/demo_translate.json", "demo_translate.json", "json").catch(() => ({ translations: {} })),
      ]);

      store.loadingPercent = 75;

      const rawChannels = Array.isArray(chRes)
        ? chRes
        : Array.isArray(chRes?.channels)
          ? chRes.channels
          : Array.isArray(chRes?.data?.channels)
            ? chRes.data.channels
            : Object.values(chRes?.channels || chRes || {}).filter((v) => v && typeof v === "object" && v.artistMemberId);

      const rawEvents = Array.isArray(lastRes)
        ? lastRes
        : Array.isArray(lastRes?.messages)
          ? lastRes.messages
          : Array.isArray(lastRes?.records)
            ? lastRes.records
            : Array.isArray(lastRes?.data?.messages)
              ? lastRes.data.messages
              : [];

      const fallbackChannels = rawChannels.length > 0 ? rawChannels : [{ artistMemberId: "demo", artistMemberName: "DEMO", originalName: "DEMO" }];

      store.members = fallbackChannels.map((ch) => ({
        artistMemberId: ch.artistMemberId,
        artistMemberName: ch.artistMemberName || ch.originalName || String(ch.artistMemberId),
        originalName: ch.originalName || "",
        profileImageUrl: ch.profileImageUrl || "",
        lastMessageId: ch.lastMessageId || "",
        records: rawEvents.map((ev, idx) => {
          const msg = ev?.message ? { ...ev.message } : { ...ev };
          msg.artistMemberId = ch.artistMemberId;
          const sid = String(msg.sourceId || msg.id || idx + 1);
          const trHit = transRes?.translations?.[sid];
          if (trHit?.translatedContent) {
            store.translationsMap[`${ch.artistMemberId}:${sid}`] = trHit.translatedContent;
          }
          return ev?.message ? { ...ev, message: msg } : { message: msg };
        }),
      }));

      store.activeMemberId = store.members[0].artistMemberId;
      store.loadingPercent = 100;
      store.view = "chat";
    } catch (err) {
      store.view = "login";
      store.loginStatus = err?.message || "DEMO failed";
    }
  }

  async function syncProdSession(showOverlay = true) {
    store.isDemo = false;
    if (showOverlay) {
      store.view = "loading";
      store.loadingPercent = 5;
      store.loadingLabel = t("sync_prepare");
    }

    const results = await CosmoSync.syncAllChannels({
      onCachedReady: (cached) => {
        if (cached?.length) {
          store.members = cached;
          if (!store.activeMemberId) store.activeMemberId = cached[0].artistMemberId;
          prefetchMemberTranslations(activeMember.value || cached[0], 25);
        }
      },
      onProgress: (pct, label) => {
        store.loadingPercent = pct;
        store.loadingLabel = label;
      },
    });

    if (!results || results.length === 0) {
      await logout(t("no_channels_logout"));
      return;
    }

    store.members = results;
    if (!store.activeMemberId || !results.some((m) => String(m.artistMemberId) === String(store.activeMemberId))) {
      store.activeMemberId = results[0].artistMemberId;
    }
    store.view = "chat";
    // 預先背景 fetch 當前成員最新訊息翻譯
    prefetchMemberTranslations(activeMember.value || results[0], 25);
    startPolling();
  }

  async function loginWithInput(rawInput) {
    const parsed = CosmoAuth.parseLoginInput(rawInput);
    if (!parsed.accessToken && !parsed.refreshToken) {
      store.loginStatus = t("login_prompt");
      return;
    }
    try {
      await CosmoStorage.clearNdjsonCache().catch(() => {});
      await CosmoStorage.saveTokens(parsed);
      if (!parsed.accessToken && parsed.refreshToken) {
        await CosmoAuth.ensureFreshTokens({ force: true });
      }
      store.loginStatus = "";
      await syncProdSession(true);
    } catch (err) {
      store.view = "login";
      store.loginStatus = err?.message || t("expired_jwt");
    }
  }

  async function refreshActiveMember() {
    if (store.isDemo || !store.activeMemberId) return;
    const updated = await CosmoSync.syncMemberNow(store.activeMemberId);
    if (!updated) return;
    const idx = store.members.findIndex((m) => String(m.artistMemberId) === String(store.activeMemberId));
    if (idx >= 0) store.members[idx] = updated;
    prefetchMemberTranslations(updated, 15);
  }

  async function toggleTranslate() {
    store.translateEnabled = !store.translateEnabled;
    if (store.translateEnabled && !store.isDemo && activeMember.value) {
      prefetchMemberTranslations(activeMember.value, 30);
    }
  }

  function startPolling() {
    if (pollTimer || store.isDemo) return;
    pollTimer = setInterval(async () => {
      if (document.hidden || store.view !== "chat" || store.isDemo) return;
      try {
        const updated = await CosmoSync.syncAllChannels();
        if (Array.isArray(updated) && updated.length > 0) {
          store.members = updated;
          if (activeMember.value) {
            prefetchMemberTranslations(activeMember.value, 10);
          }
        }
      } catch (_) {}
    }, 10000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function logout(msg = "") {
    stopPolling();
    pendingTranslateQueue.length = 0;
    store.isDemo = false;
    store.members = [];
    store.activeMemberId = null;
    store.searchOpen = false;
    store.searchQuery = "";
    await CosmoStorage.clearTokens().catch(() => {});
    await CosmoStorage.clearNdjsonCache().catch(() => {});
    const url = new URL(window.location.href);
    if (url.searchParams.has("demo")) {
      url.searchParams.delete("demo");
      window.history.replaceState(null, "", url.toString());
    }
    store.view = "login";
    store.loginStatus = msg || t("logged_out_cleared");
  }

  async function initApp() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1" || params.get("demo") === "true") {
      await loadDemoSession();
      return;
    }
    const tokens = await CosmoStorage.getTokens().catch(() => ({ accessToken: "", refreshToken: "" }));
    if (!tokens.accessToken && !tokens.refreshToken) {
      store.view = "login";
      store.loginStatus = t("login_prompt");
      return;
    }
    try {
      await syncProdSession(true);
    } catch (err) {
      store.view = "login";
      store.loginStatus = t("login_loading_failed", { reason: err?.message || t("login_retry") });
    }
  }

  async function forceFullRefresh({ scrollBottom = true } = {}) {
    if (store.isDemo) {
      await loadDemoSession();
      if (scrollBottom) store.scrollToBottomTick += 1;
      return store.members;
    }

    const updated = await CosmoSync.syncAllChannels();
    if (Array.isArray(updated) && updated.length > 0) {
      store.members = updated;
      if (!store.activeMemberId || !updated.some((m) => String(m.artistMemberId) === String(store.activeMemberId))) {
        store.activeMemberId = updated[0].artistMemberId;
      }
      if (activeMember.value) {
        prefetchMemberTranslations(activeMember.value, 15);
      }
    }

    if (scrollBottom) {
      store.scrollToBottomTick += 1;
    }
    return store.members;
  }

  return {
    store,
    activeMember,
    t,
    setLang,
    setTheme,
    setIncludeTimestamp,
    setCustomBg,
    showToast,
    getMemberRingColor,
    queueTranslations,
    prefetchMemberTranslations,
    loadDemoSession,
    loginWithInput,
    refreshActiveMember,
    toggleTranslate,
    logout,
    initApp,
    forceFullRefresh,
  };
}