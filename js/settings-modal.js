const CosmoSettings = (() => {
  "use strict";

  const { nfc } = CosmoUtils;
  const STORAGE_KEY = "cosmo_talk_include_timestamp";

  const tr = (key, vars) =>
    typeof CosmoI18n !== "undefined" && typeof CosmoI18n.t === "function"
      ? CosmoI18n.t(key, vars)
      : nfc(String(key));

  let includeTimestamp = loadIncludeTimestamp();
  let backdropEl = null;
  let panelEl = null;

  function loadIncludeTimestamp() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return true;
      return raw === "true";
    } catch (_) {
      return true;
    }
  }

  function saveIncludeTimestamp(val) {
    includeTimestamp = Boolean(val);
    try {
      localStorage.setItem(STORAGE_KEY, String(includeTimestamp));
    } catch (_) {}
  }

  function getIncludeTimestamp() {
    return includeTimestamp;
  }

  function setIncludeTimestamp(val) {
    saveIncludeTimestamp(val);
    syncOptionButtons();
  }

  function refreshModalTexts() {
    if (!panelEl) return;

    const titleEl = panelEl.querySelector("#settings-modal-title");
    if (titleEl) titleEl.textContent = tr("settings_title");

    const closeBtn = panelEl.querySelector(".settings-close-btn");
    if (closeBtn) {
      closeBtn.title = tr("close");
      closeBtn.setAttribute("aria-label", tr("close"));
    }

    const tsLabelEl = panelEl.querySelector('[data-i18n-label="include_timestamp"]');
    if (tsLabelEl) tsLabelEl.textContent = tr("include_timestamp");

    const yesBtn = panelEl.querySelector('[data-ts-option="true"]');
    if (yesBtn) yesBtn.textContent = tr("yes");

    const noBtn = panelEl.querySelector('[data-ts-option="false"]');
    if (noBtn) noBtn.textContent = tr("no");

    const langLabelEl = panelEl.querySelector('[data-i18n-label="language"]');
    if (langLabelEl) langLabelEl.textContent = tr("language");

    const langSelect = panelEl.querySelector("#settings-lang-select");
    if (langSelect && typeof CosmoI18n !== "undefined") {
      langSelect.value = CosmoI18n.getLang();
    }
  }

  function syncOptionButtons() {
    if (!panelEl) return;
    const yesBtn = panelEl.querySelector('[data-ts-option="true"]');
    const noBtn = panelEl.querySelector('[data-ts-option="false"]');

    if (yesBtn) {
      yesBtn.classList.toggle("active", includeTimestamp === true);
      yesBtn.setAttribute("aria-pressed", String(includeTimestamp === true));
    }
    if (noBtn) {
      noBtn.classList.toggle("active", includeTimestamp === false);
      noBtn.setAttribute("aria-pressed", String(includeTimestamp === false));
    }
  }

  function ensureModalDom() {
    if (backdropEl && panelEl) return;

    backdropEl = document.createElement("div");
    backdropEl.id = "settings-modal-backdrop";
    backdropEl.className = "settings-modal-backdrop";
    backdropEl.style.display = "none";

    panelEl = document.createElement("div");
    panelEl.id = "settings-modal-panel";
    panelEl.className = "settings-modal-panel";
    panelEl.setAttribute("role", "dialog");
    panelEl.setAttribute("aria-modal", "true");
    panelEl.setAttribute("aria-labelledby", "settings-modal-title");

    const header = document.createElement("div");
    header.className = "settings-modal-header";

    const title = document.createElement("div");
    title.id = "settings-modal-title";
    title.className = "settings-modal-title";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "icon-btn settings-close-btn";
    CosmoSecurity.setIcon(closeBtn, "ti-x");
    closeBtn.onclick = () => close();

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "settings-modal-body";

    // 1. 是否包含時間：是 / 否
    const tsRow = document.createElement("div");
    tsRow.className = "settings-option-row";

    const tsLabel = document.createElement("div");
    tsLabel.className = "settings-option-label";
    tsLabel.dataset.i18nLabel = "include_timestamp";

    const btnGroup = document.createElement("div");
    btnGroup.className = "settings-segmented-group";

    const yesBtn = document.createElement("button");
    yesBtn.type = "button";
    yesBtn.className = "btn settings-choice-btn";
    yesBtn.dataset.tsOption = "true";
    yesBtn.onclick = () => setIncludeTimestamp(true);

    const noBtn = document.createElement("button");
    noBtn.type = "button";
    noBtn.className = "btn settings-choice-btn";
    noBtn.dataset.tsOption = "false";
    noBtn.onclick = () => setIncludeTimestamp(false);

    btnGroup.appendChild(yesBtn);
    btnGroup.appendChild(noBtn);
    tsRow.appendChild(tsLabel);
    tsRow.appendChild(btnGroup);

    // 2. 語言下拉選單（en, ja, ko, zh, zh-hk）
    const langRow = document.createElement("div");
    langRow.className = "settings-option-row";

    const langLabel = document.createElement("label");
    langLabel.className = "settings-option-label";
    langLabel.htmlFor = "settings-lang-select";
    langLabel.dataset.i18nLabel = "language";

    const langSelect = document.createElement("select");
    langSelect.id = "settings-lang-select";
    langSelect.className = "settings-lang-select";

    const langs =
      typeof CosmoI18n !== "undefined" && typeof CosmoI18n.getSupportedLangs === "function"
        ? CosmoI18n.getSupportedLangs()
        : [
          { value: "en", label: "English" },
          { value: "ja", label: "日本語" },
          { value: "ko", label: "한국어" },
          { value: "zh", label: "繁體中文（臺灣）" },
          { value: "zh-hk", label: "繁體中文（香港）" },
        ];

    for (const item of langs) {
      const opt = document.createElement("option");
      opt.value = item.value;
      opt.textContent = nfc(item.label);
      langSelect.appendChild(opt);
    }

    langSelect.onchange = () => {
      if (typeof CosmoI18n !== "undefined" && typeof CosmoI18n.setLang === "function") {
        CosmoI18n.setLang(langSelect.value);
      }
    };

    langRow.appendChild(langLabel);
    langRow.appendChild(langSelect);

    body.appendChild(tsRow);
    body.appendChild(langRow);

    panelEl.appendChild(header);
    panelEl.appendChild(body);
    backdropEl.appendChild(panelEl);

    backdropEl.addEventListener("click", (e) => {
      if (e.target === backdropEl) {
        close();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen()) {
        close();
      }
    });

    if (typeof CosmoI18n !== "undefined" && typeof CosmoI18n.onChange === "function") {
      CosmoI18n.onChange(() => {
        refreshModalTexts();
      });
    }

    document.body.appendChild(backdropEl);
    refreshModalTexts();
    syncOptionButtons();
  }

  function isOpen() {
    return Boolean(backdropEl && backdropEl.style.display !== "none");
  }

  function open() {
    ensureModalDom();
    refreshModalTexts();
    syncOptionButtons();
    backdropEl.style.display = "flex";
    document.dispatchEvent(new CustomEvent("cosmo:settings-opened"));
  }

  function close() {
    if (!backdropEl) return;
    backdropEl.style.display = "none";
  }

  function toggle() {
    if (isOpen()) {
      close();
    } else {
      open();
    }
  }

  return {
    getIncludeTimestamp,
    setIncludeTimestamp,
    open,
    close,
    toggle,
  };
})();

/* --- 4-THEME SWITCHER & CUSTOM BACKGROUND UPLOADER --- */
(() => {
  if (typeof window === "undefined") return;
  if (window.__COSMO_SPLIT_SETTINGS_BG_INIT__) return;
  window.__COSMO_SPLIT_SETTINGS_BG_INIT__ = true;

  const THEME_KEY = "cosmo_ui_theme_mode";
  const VALID_THEMES = ["dark", "light", "black", "white"];
  const BG_STORAGE_KEY = "cosmo_adv_custom_bg_jpg85_v1";
  const LAYER_ID = "cosmo-custom-bg-layer";
  const IMG_ID = "cosmo-custom-bg-img";
  const FILE_INPUT_ID = "cosmo-adv-bg-file-input";
  const UPLOAD_BTN_ID = "cosmo-adv-bg-upload-btn";
  const CLEAR_BTN_ID = "cosmo-adv-bg-clear-btn";
  const BG_ROW_CLASS = "adv-bg-upload-row";
  const JPEG_QUALITY = 0.85;

  function notifyUser(msg) {
    if (typeof CosmoToast !== "undefined") {
      if (typeof CosmoToast.show === "function") return CosmoToast.show(msg, { type: "error" });
      if (typeof CosmoToast === "function") return CosmoToast(msg);
    }
    console.warn("[CosmoSettings]", msg);
  }

  function applyTheme(themeName) {
    const mode = VALID_THEMES.includes(themeName) ? themeName : "dark";
    document.documentElement.setAttribute("data-theme", mode);
    try {
      window.localStorage.setItem(THEME_KEY, mode);
    } catch (_) {}
    const sel = document.getElementById("cosmo-theme-select");
    if (sel && sel.value !== mode) sel.value = mode;
  }

  function injectThemeControl() {
    const modalBody =
      document.querySelector("#settings-modal-panel .settings-modal-body") ||
      document.querySelector("#settings-modal .settings-modal-body") ||
      document.querySelector(".settings-modal-body");
    if (!modalBody || document.getElementById("cosmo-theme-row")) return;

    const row = document.createElement("div");
    row.id = "cosmo-theme-row";
    row.className = "settings-option-row";

    const label = document.createElement("span");
    label.className = "settings-option-label";
    label.textContent = "主題 / Theme";

    const select = document.createElement("select");
    select.id = "cosmo-theme-select";
    select.className = "cosmo-theme-select";
    select.setAttribute("aria-label", "主題切換");

    [
      { value: "dark", text: "Dark (深色)" },
      { value: "light", text: "Light (淺色)" },
      { value: "black", text: "Black (純黑)" },
      { value: "white", text: "White (純白)" },
    ].forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.text;
      select.appendChild(o);
    });

    try {
      select.value = window.localStorage.getItem(THEME_KEY) || "dark";
    } catch (_) {}
    select.addEventListener("change", () => applyTheme(select.value));

    row.appendChild(label);
    row.appendChild(select);
    modalBody.appendChild(row);
  }

  function getTopbarHeightPx() {
    const topbar =
      document.querySelector("#topbar, .topbar, header.topbar, .chat-header, #chat-header") ||
      document.querySelector("header");
    if (topbar && topbar.offsetHeight > 0) return topbar.offsetHeight;
    const rawVar = getComputedStyle(document.documentElement).getPropertyValue("--topbar-h").trim();
    const parsed = parseFloat(rawVar);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 52;
  }

  function isLoginView() {
    if (document.body.classList.contains("is-login-view")) return true;
    const lp = document.getElementById("login-page");
    return Boolean(lp && getComputedStyle(lp).display !== "none");
  }

  function ensureBgLayer() {
    let layer = document.getElementById(LAYER_ID);
    if (!layer) {
      layer = document.createElement("div");
      layer.id = LAYER_ID;
      layer.setAttribute("aria-hidden", "true");
      document.body.appendChild(layer);
    }

    let img = document.getElementById(IMG_ID);
    if (!img) {
      img = document.createElement("img");
      img.id = IMG_ID;
      img.alt = "";
      layer.appendChild(img);
    }

    const h = `${getTopbarHeightPx()}px`;
    if (layer.style.top !== h) {
      layer.style.top = h;
      layer.style.height = `calc(100vh - ${h})`;
      layer.style.maxHeight = `calc(100dvh - ${h})`;
    }
    return { layer, img };
  }

  function applyBackgroundDataUrl(dataUrl) {
    const { layer, img } = ensureBgLayer();
    const valid = Boolean(dataUrl && dataUrl.startsWith("data:image/"));

    if (valid) {
      const safeSrc = CosmoSecurity.safeImgUrl(dataUrl);
      if (safeSrc) {
        if (img.src !== safeSrc) img.src = safeSrc;
        layer.classList.add("has-bg");
      } else {
        if (img.hasAttribute("src")) img.removeAttribute("src");
        layer.classList.remove("has-bg");
      }
    } else {
      if (img.hasAttribute("src")) img.removeAttribute("src");
      layer.classList.remove("has-bg");
    }

    if (!valid || !layer.classList.contains("has-bg") || isLoginView()) {
      document.body.classList.remove("cosmo-has-custom-bg");
      layer.style.display = "none";
    } else {
      document.body.classList.add("cosmo-has-custom-bg");
      layer.style.display = "flex";
    }
  }

  function decodeFileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  }

  async function convertFileToJpeg85DataUrl(file) {
    const img = await decodeFileToImage(file);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  }

  async function handleSelectedFile(file) {
    if (!file || !String(file.type || "").startsWith("image/")) return;
    try {
      const jpgDataUrl = await convertFileToJpeg85DataUrl(file);
      try {
        localStorage.setItem(BG_STORAGE_KEY, jpgDataUrl);
      } catch (_) {
        notifyUser("圖片轉檔後仍超出 localStorage 容量上限，請選擇較小張的圖片。");
        return;
      }
      applyBackgroundDataUrl(jpgDataUrl);
    } catch (_) {
      notifyUser("圖片轉檔失敗，請確認格式為 WEBP、PNG 或 JPEG。");
    }
  }

  function ensureFileInput() {
    let fileInput = document.getElementById(FILE_INPUT_ID);
    if (!fileInput) {
      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.id = FILE_INPUT_ID;
      fileInput.accept = "image/png,image/webp,image/jpeg,image/gif";
      fileInput.style.position = "fixed";
      fileInput.style.left = "-9999px";
      fileInput.style.opacity = "0";
      fileInput.style.pointerEvents = "none";
      fileInput.addEventListener("change", () => {
        const f = fileInput.files && fileInput.files[0];
        if (f) handleSelectedFile(f);
        fileInput.value = "";
      });
      document.body.appendChild(fileInput);
    }
    return fileInput;
  }

  function applyBgButtonLabels() {
    const uploadText =
      typeof CosmoI18n !== "undefined" && typeof CosmoI18n.t === "function"
        ? CosmoI18n.t("upload_bg_btn")
        : "上傳背景圖";
    const clearText =
      typeof CosmoI18n !== "undefined" && typeof CosmoI18n.t === "function"
        ? CosmoI18n.t("clear_bg_btn")
        : "移除背景";

    const upBtn = document.getElementById(UPLOAD_BTN_ID);
    if (upBtn && upBtn.textContent !== uploadText) {
      upBtn.textContent = uploadText;
      upBtn.setAttribute("aria-label", uploadText);
    }

    const clrBtn = document.getElementById(CLEAR_BTN_ID);
    if (clrBtn && clrBtn.textContent !== clearText) {
      clrBtn.textContent = clearText;
      clrBtn.setAttribute("aria-label", clearText);
    }
  }

  function mountBgControlsBelowThemeSelect() {
    const fileInput = ensureFileInput();
    const themeSelect = document.getElementById("cosmo-theme-select");
    if (!themeSelect) return;

    const rowContainer =
      themeSelect.closest(".settings-option-row, .setting-row, .settings-row, .adv-row, .field-row, .control-row, .form-row, .row, label") ||
      themeSelect.parentElement;
    if (!rowContainer || !rowContainer.parentElement) return;

    let row = document.querySelector(`.${BG_ROW_CLASS}`);
    if (!row) {
      row = document.createElement("div");
      row.className = BG_ROW_CLASS;
    }

    let uploadBtn = document.getElementById(UPLOAD_BTN_ID);
    if (!uploadBtn) {
      uploadBtn = document.createElement("button");
      uploadBtn.type = "button";
      uploadBtn.id = UPLOAD_BTN_ID;
      uploadBtn.className = "btn";
      uploadBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        ensureFileInput().click();
      });
    }

    let clearBtn = document.getElementById(CLEAR_BTN_ID);
    if (!clearBtn) {
      clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.id = CLEAR_BTN_ID;
      clearBtn.className = "btn";
      clearBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          localStorage.removeItem(BG_STORAGE_KEY);
        } catch (_) {}
        applyBackgroundDataUrl("");
      });
    }

    if (uploadBtn.parentElement !== row) row.appendChild(uploadBtn);
    if (clearBtn.parentElement !== row) row.appendChild(clearBtn);
    if (fileInput.parentElement !== document.body) document.body.appendChild(fileInput);

    if (rowContainer.nextElementSibling !== row) {
      rowContainer.insertAdjacentElement("afterend", row);
    }
    applyBgButtonLabels();
  }

  function syncSettingsAndBg() {
    injectThemeControl();
    mountBgControlsBelowThemeSelect();
    let saved = "";
    try {
      saved = localStorage.getItem(BG_STORAGE_KEY) || "";
    } catch (_) {}
    applyBackgroundDataUrl(saved);
  }

  try {
    applyTheme(window.localStorage.getItem(THEME_KEY) || "dark");
  } catch (_) {
    applyTheme("dark");
  }

  function init() {
    syncSettingsAndBg();
    window.addEventListener("resize", ensureBgLayer, { passive: true });
    document.addEventListener("cosmo:settings-opened", syncSettingsAndBg);

    if (typeof CosmoI18n !== "undefined" && typeof CosmoI18n.onChange === "function") {
      CosmoI18n.onChange(applyBgButtonLabels);
    }

    const bodyMo = new MutationObserver(() => {
      let saved = "";
      try {
        saved = localStorage.getItem(BG_STORAGE_KEY) || "";
      } catch (_) {}
      applyBackgroundDataUrl(saved);
    });
    if (document.body) {
      bodyMo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.CosmoReplyThemeSearch = window.CosmoReplyThemeSearch || { applyTheme };
})();
