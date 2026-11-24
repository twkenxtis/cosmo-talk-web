const CosmoSettings = (() => {
  'use strict';

  const { nfc } = CosmoUtils;
  const STORAGE_KEY = 'cosmo_talk_include_timestamp';

  const tr = (key, vars) =>
    typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.t === 'function'
      ? CosmoI18n.t(key, vars)
      : nfc(String(key));

  let includeTimestamp = loadIncludeTimestamp();
  let backdropEl = null;
  let panelEl = null;

  function loadIncludeTimestamp() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return true;
      return raw === 'true';
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

    const titleEl = panelEl.querySelector('#settings-modal-title');
    if (titleEl) titleEl.textContent = tr('settings_title');

    const closeBtn = panelEl.querySelector('.settings-close-btn');
    if (closeBtn) {
      closeBtn.title = tr('close');
      closeBtn.setAttribute('aria-label', tr('close'));
    }

    const tsLabelEl = panelEl.querySelector('[data-i18n-label="include_timestamp"]');
    if (tsLabelEl) tsLabelEl.textContent = tr('include_timestamp');

    const yesBtn = panelEl.querySelector('[data-ts-option="true"]');
    if (yesBtn) yesBtn.textContent = tr('yes');

    const noBtn = panelEl.querySelector('[data-ts-option="false"]');
    if (noBtn) noBtn.textContent = tr('no');

    const langLabelEl = panelEl.querySelector('[data-i18n-label="language"]');
    if (langLabelEl) langLabelEl.textContent = tr('language');

    const langSelect = panelEl.querySelector('#settings-lang-select');
    if (langSelect && typeof CosmoI18n !== 'undefined') {
      langSelect.value = CosmoI18n.getLang();
    }
  }

  function syncOptionButtons() {
    if (!panelEl) return;
    const yesBtn = panelEl.querySelector('[data-ts-option="true"]');
    const noBtn = panelEl.querySelector('[data-ts-option="false"]');

    if (yesBtn) {
      yesBtn.classList.toggle('active', includeTimestamp === true);
      yesBtn.setAttribute('aria-pressed', String(includeTimestamp === true));
    }
    if (noBtn) {
      noBtn.classList.toggle('active', includeTimestamp === false);
      noBtn.setAttribute('aria-pressed', String(includeTimestamp === false));
    }
  }

  function ensureModalDom() {
    if (backdropEl && panelEl) return;

    backdropEl = document.createElement('div');
    backdropEl.id = 'settings-modal-backdrop';
    backdropEl.className = 'settings-modal-backdrop';
    backdropEl.style.display = 'none';

    panelEl = document.createElement('div');
    panelEl.id = 'settings-modal-panel';
    panelEl.className = 'settings-modal-panel';
    panelEl.setAttribute('role', 'dialog');
    panelEl.setAttribute('aria-modal', 'true');
    panelEl.setAttribute('aria-labelledby', 'settings-modal-title');

    const header = document.createElement('div');
    header.className = 'settings-modal-header';

    const title = document.createElement('div');
    title.id = 'settings-modal-title';
    title.className = 'settings-modal-title';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'icon-btn settings-close-btn';
    closeBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
    closeBtn.onclick = () => close();

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'settings-modal-body';

    // 1. 是否包含時間：是 / 否
    const tsRow = document.createElement('div');
    tsRow.className = 'settings-option-row';

    const tsLabel = document.createElement('div');
    tsLabel.className = 'settings-option-label';
    tsLabel.dataset.i18nLabel = 'include_timestamp';

    const btnGroup = document.createElement('div');
    btnGroup.className = 'settings-segmented-group';

    const yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'btn settings-choice-btn';
    yesBtn.dataset.tsOption = 'true';
    yesBtn.onclick = () => setIncludeTimestamp(true);

    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'btn settings-choice-btn';
    noBtn.dataset.tsOption = 'false';
    noBtn.onclick = () => setIncludeTimestamp(false);

    btnGroup.appendChild(yesBtn);
    btnGroup.appendChild(noBtn);
    tsRow.appendChild(tsLabel);
    tsRow.appendChild(btnGroup);

    // 2. 語言下拉選單（en, ja, ko, zh, zh-hk）
    const langRow = document.createElement('div');
    langRow.className = 'settings-option-row';

    const langLabel = document.createElement('label');
    langLabel.className = 'settings-option-label';
    langLabel.htmlFor = 'settings-lang-select';
    langLabel.dataset.i18nLabel = 'language';

    const langSelect = document.createElement('select');
    langSelect.id = 'settings-lang-select';
    langSelect.className = 'settings-lang-select';

    const langs =
      typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.getSupportedLangs === 'function'
        ? CosmoI18n.getSupportedLangs()
        : [
            { value: 'en', label: 'English' },
            { value: 'ja', label: '日本語' },
            { value: 'ko', label: '한국어' },
            { value: 'zh', label: '繁體中文（臺灣）' },
            { value: 'zh-hk', label: '繁體中文（香港）' },
          ];

    for (const item of langs) {
      const opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = nfc(item.label);
      langSelect.appendChild(opt);
    }

    langSelect.onchange = () => {
      if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.setLang === 'function') {
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

    backdropEl.addEventListener('click', (e) => {
      if (e.target === backdropEl) {
        close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) {
        close();
      }
    });

    if (typeof CosmoI18n !== 'undefined' && typeof CosmoI18n.onChange === 'function') {
      CosmoI18n.onChange(() => {
        refreshModalTexts();
      });
    }

    document.body.appendChild(backdropEl);
    refreshModalTexts();
    syncOptionButtons();
  }

  function isOpen() {
    return Boolean(backdropEl && backdropEl.style.display !== 'none');
  }

  function open() {
    ensureModalDom();
    refreshModalTexts();
    syncOptionButtons();
    backdropEl.style.display = 'flex';
  }

  function close() {
    if (!backdropEl) return;
    backdropEl.style.display = 'none';
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