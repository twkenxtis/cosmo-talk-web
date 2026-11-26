const CosmoToast = (() => {
  "use strict";

  const { nfc } = CosmoUtils;
  let toastTimer = null;

  const tr = (key, vars) =>
    typeof CosmoI18n !== "undefined" && typeof CosmoI18n.t === "function"
      ? CosmoI18n.t(key, vars)
      : nfc(String(key));

  function ensureToastElement() {
    let el = document.getElementById("cosmo-toast");
    if (el) return el;

    el = document.createElement("div");
    el.id = "cosmo-toast";
    el.className = "cosmo-toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
    return el;
  }

  function show(message, { type = "error", duration = 3500 } = {}) {
    const text = nfc(String(message ?? "")).trim();
    if (!text) return;

    const el = ensureToastElement();
    el.textContent = text;
    el.className = `cosmo-toast cosmo-toast--${type} show`;

    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
    }, duration);
  }

  function extractApiErrorMessage(rawText, status) {
    const trimmed = String(rawText ?? "").trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        const errMsg = parsed?.error?.message;
        if (typeof errMsg === "string" && errMsg.trim()) {
          return nfc(errMsg.trim());
        }
      } catch (_) {}
      return nfc(trimmed);
    }
    return tr("request_failed", { status });
  }

  return {
    show,
    extractApiErrorMessage,
  };
})();
