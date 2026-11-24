const CosmoI18n = (() => {
  'use strict';

  const { nfc } = CosmoUtils;
  const STORAGE_KEY = 'cosmo_talk_lang';

  const SUPPORTED_LANGS = [
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
    { value: 'zht', label: '繁體中文' },
    { value: 'zhc', label: '簡體中文' },
  ];

  const MESSAGES = {
    en: {
      settings_title: 'Export & Copy Settings',
      close: 'Close',
      include_timestamp: 'Include timestamp',
      language: 'Language',
      yes: 'Yes',
      no: 'No',

      login_prompt: 'Enter JWT Access Token or Refresh Token',
      login_btn: 'Save & Enter Chat',
      jwt_guide_btn: 'How to get JWT?',
      login_loading_failed: 'Failed to load existing credentials: {reason}',
      login_retry: 'Please enter again',
      no_channels_logout: 'No available channels for this account; logged out and cleared cache.',
      logged_out_cleared: 'Logged out and cleared credentials & cache in IndexedDB',
      expired_jwt: 'JWT has expired. Please obtain a new JWT.',

      sync_prune_cache: 'Pruning expired cache...',
      sync_fetch_channels: 'Fetching channel list...',
      sync_read_cache: 'Reading local cache...',
      sync_channels_progress: 'Syncing channels ({done}/{total})',
      sync_prepare_records: 'Preparing chat messages...',
      sync_prepare: 'Preparing sync',
      sync_rendering: 'Rendering chat...',
      sync_done: 'Done',
      sync_no_channels: 'No channels available',

      export_text: 'Export Plain Text',
      copy_artist_text: 'Copy Artist Plain Text',
      copied: 'Copied',
      copy_failed: 'Copy failed',
      settings: 'Settings',
      logout: 'Logout',
      toggle_sidebar: 'Toggle sidebar',
      no_channel_data: 'No channel data available',
      replied_by: '{name} replied',

      composer_placeholder: 'Can send {count} more messages',
      sticker_selected_placeholder: 'Sticker selected; press send ({count} left)',
      send: 'Send',
      stickers: 'Stickers',
      remove_sticker: 'Remove sticker',
      no_stickers: 'No stickers available',
      sticker_picker_hint: 'Stickers ({count} total, tap then press ↑ to send)',
      loading_stickers: 'Loading stickers...',
      stickers_load_failed: 'Failed to load stickers',
      stickers_load_error: 'Error loading stickers',
      request_failed: 'Request failed (HTTP {status})',
    },

    ja: {
      settings_title: '書き出し・コピー設定',
      close: '閉じる',
      include_timestamp: 'タイムスタンプを含める',
      language: '言語',
      yes: 'はい',
      no: 'いいえ',

      login_prompt: 'JWT Access Token または Refresh Token を入力してください',
      login_btn: '保存してチャットへ',
      jwt_guide_btn: 'JWTの取得方法',
      login_loading_failed: '既存認証情報の読み込みに失敗しました：{reason}',
      login_retry: '再入力してください',
      no_channels_logout: '利用可能なチャンネルがないため、自動ログアウトしてキャッシュを削除しました',
      logged_out_cleared: 'ログアウトし、IndexedDB の認証情報とキャッシュを削除しました',
      expired_jwt: 'JWT の有効期限が切れています。新しい JWT を取得してください',

      sync_prune_cache: '期限切れキャッシュを整理中...',
      sync_fetch_channels: 'チャンネル一覧を取得中...',
      sync_read_cache: 'ローカルキャッシュを読み込み中...',
      sync_channels_progress: 'チャンネル同期中 ({done}/{total})',
      sync_prepare_records: 'チャット履歴を整理中...',
      sync_prepare: '同期準備中',
      sync_rendering: 'チャット画面を描画中...',
      sync_done: '完了',
      sync_no_channels: '利用可能なチャンネルなし',

      export_text: 'プレーンテキスト書き出し',
      copy_artist_text: 'Artist プレーンテキストをコピー',
      copied: 'コピーしました',
      copy_failed: 'コピー失敗',
      settings: '設定',
      logout: 'ログアウト',
      toggle_sidebar: 'サイドバー切替',
      no_channel_data: '利用可能なチャンネルデータがありません',
      replied_by: '{name} さんが返信',

      composer_placeholder: 'あと {count} 回送信できます',
      sticker_selected_placeholder: 'スタンプ選択中：送信を押してください（残り {count} 回）',
      send: '送信',
      stickers: 'スタンプ',
      remove_sticker: 'スタンプを削除',
      no_stickers: '利用可能なスタンプがありません',
      sticker_picker_hint: 'スタンプ（全 {count} 個、選択後に ↑ で送信）',
      loading_stickers: 'スタンプを読み込み中...',
      stickers_load_failed: 'スタンプの読み込みに失敗しました',
      stickers_load_error: 'スタンプ読み込み中にエラーが発生しました',
      request_failed: 'リクエスト失敗 (HTTP {status})',
    },

    ko: {
      settings_title: '내보내기 및 복사 설정',
      close: '닫기',
      include_timestamp: '시간 포함 여부',
      language: '언어',
      yes: '예',
      no: '아니요',

      login_prompt: 'JWT Access Token 또는 Refresh Token을 입력하세요',
      login_btn: '저장 후 채팅 입장',
      jwt_guide_btn: 'JWT 발급 방법',
      login_loading_failed: '기존 인증 정보 불러오기 실패: {reason}',
      login_retry: '다시 입력해 주세요',
      no_channels_logout: '사용 가능한 채널이 없어 자동 로그아웃 및 캐시 삭제를 완료했습니다',
      logged_out_cleared: '로그아웃하고 IndexedDB의 인증 정보와 캐시를 삭제했습니다',
      expired_jwt: 'JWT가 만료되었습니다. 새 JWT를 발급받아 주세요',

      sync_prune_cache: '만료된 캐시 정리 중...',
      sync_fetch_channels: '채널 목록 불러오는 중...',
      sync_read_cache: '로컬 캐시 읽는 중...',
      sync_channels_progress: '채널 동기화 중 ({done}/{total})',
      sync_prepare_records: '채팅 기록 정리 중...',
      sync_prepare: '동기화 준비 중',
      sync_rendering: '채팅 화면 렌더링 중...',
      sync_done: '완료',
      sync_no_channels: '사용 가능한 채널 없음',

      export_text: '일반 텍스트 내보내기',
      copy_artist_text: 'Artist 일반 텍스트 복사',
      copied: '복사됨',
      copy_failed: '복사 실패',
      settings: '설정',
      logout: '로그아웃',
      toggle_sidebar: '사이드바 전환',
      no_channel_data: '사용 가능한 채널 데이터가 없습니다',
      replied_by: '{name} 님의 답장',

      composer_placeholder: '{count}회 메시지 전송 가능',
      sticker_selected_placeholder: '스티커 선택됨, 전송을 누르세요 ({count}회 남음)',
      send: '전송',
      stickers: '스티커',
      remove_sticker: '스티커 제거',
      no_stickers: '사용 가능한 스티커가 없습니다',
      sticker_picker_hint: '스티커 (총 {count}개, 선택 후 ↑ 눌러 전송)',
      loading_stickers: '스티커 불러오는 중...',
      stickers_load_failed: '스티커 불러오기 실패',
      stickers_load_error: '스티커 불러오기 중 오류 발생',
      request_failed: '요청 실패 (HTTP {status})',
    },
    zhc: {
      settings_title: '导出与复制设置',
      close: '关闭',
      include_timestamp: '是否包含时间',
      language: '语言',
      yes: '是',
      no: '否',

      login_prompt: '请输入 JWT Access Token 或 Refresh Token',
      login_btn: '保存并进入聊天',
      jwt_guide_btn: '如何获取 JWT？',
      login_loading_failed: '既有凭证加载失败：{reason}',
      login_retry: '请重新输入',
      no_channels_logout: '当前账号没有可用频道，已自动登出并清除缓存',
      logged_out_cleared: '已登出并清除 IndexedDB 中的凭证与缓存',
      expired_jwt: 'JWT已过期 请重新获取新JWT',

      sync_prune_cache: '清理过期缓存...',
      sync_fetch_channels: '获取频道列表...',
      sync_read_cache: '读取本地缓存...',
      sync_channels_progress: '同步频道数据 ({done}/{total})',
      sync_prepare_records: '整理聊天记录...',
      sync_prepare: '准备同步',
      sync_rendering: '渲染聊天室...',
      sync_done: '完成',
      sync_no_channels: '无可用频道',

      export_text: '导出纯文本',
      copy_artist_text: '复制 Artist 纯文本',
      copied: '已复制',
      copy_failed: '复制失败',
      settings: '设置',
      logout: '登出',
      toggle_sidebar: '切换侧边栏',
      no_channel_data: '没有可用的频道数据',
      replied_by: '{name} 回复了',

      composer_placeholder: '可发送 {count} 次消息',
      sticker_selected_placeholder: '已选择贴图，按发送发送（可发送 {count} 次消息）',
      send: '发送',
      stickers: '贴图',
      remove_sticker: '移除贴图',
      no_stickers: '没有可用的贴图',
      sticker_picker_hint: '贴图（共 {count} 个，点选后按 ↑ 发送）',
      loading_stickers: '加载贴图中...',
      stickers_load_failed: '贴图加载失败',
      stickers_load_error: '贴图加载发生错误',
      request_failed: '请求失败 (HTTP {status})',
    },
    'zht': {
      settings_title: '匯出與複製設定',
      close: '關閉',
      include_timestamp: '是否包含時間',
      language: '語言',
      yes: '是',
      no: '否',

      login_prompt: '請輸入 JWT Access Token 或 Refresh Token',
      login_btn: '儲存並進入聊天',
      jwt_guide_btn: '如何取得 JWT？',
      login_loading_failed: '既有憑證載入失敗：{reason}',
      login_retry: '請重新輸入',
      no_channels_logout: '目前帳號沒有可用頻道，已自動登出並清除快取',
      logged_out_cleared: '已登出並清除 IndexedDB 中的憑證與快取',
      expired_jwt: 'JWT 已經過期，請重新取得新的 JWT',

      sync_prune_cache: '清理過期快取...',
      sync_fetch_channels: '取得頻道清單...',
      sync_read_cache: '讀取本機快取...',
      sync_channels_progress: '同步頻道資料 ({done}/{total})',
      sync_prepare_records: '整理聊天紀錄...',
      sync_prepare: '準備同步',
      sync_rendering: '渲染聊天室...',
      sync_done: '完成',
      sync_no_channels: '沒有可用頻道',

      export_text: '匯出純文字',
      copy_artist_text: '複製 Artist 純文字',
      copied: '已複製',
      copy_failed: '複製失敗',
      settings: '設定',
      logout: '登出',
      toggle_sidebar: '切換側邊欄',
      no_channel_data: '沒有可用的頻道資料',
      replied_by: '{name} 回覆了',

      composer_placeholder: '可發送 {count} 次訊息',
      sticker_selected_placeholder: '已選擇貼圖，按傳送發送（可發送 {count} 次訊息）',
      send: '傳送',
      stickers: '貼圖',
      remove_sticker: '移除貼圖',
      no_stickers: '沒有可用的貼圖',
      sticker_picker_hint: '貼圖（共 {count} 個，點選後按 ↑ 發送）',
      loading_stickers: '載入貼圖中...',
      stickers_load_failed: '貼圖載入失敗',
      stickers_load_error: '貼圖載入發生錯誤',
      request_failed: '請求失敗 (HTTP {status})',
    },
  };

  function normalizeLang(raw) {
      const val = String(raw || '').trim().toLowerCase();
      if (val === 'en' || val.startsWith('en-')) return 'en';
      if (val === 'ja' || val.startsWith('ja-')) return 'ja';
      if (val === 'ko' || val.startsWith('ko-')) return 'ko';
      if (
        val === 'zhc' ||
        val === 'zh-cn' ||
        val === 'zh-sg' ||
        val === 'zh-hans' ||
        val === 'cn'
      ) {
        return 'zhc';
      }
      if (
        val === 'zht' ||
        val === 'zh' ||
        val === 'zh-tw' ||
        val === 'zh-hk' ||
        val === 'zh-mo' ||
        val === 'zh-hant' ||
        val === 'tw' ||
        val === 'hk'
      ) {
        return 'zht';
      }
      return 'zht';
    }

  function loadInitialLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return normalizeLang(saved);
    } catch (_) {
    }
    return normalizeLang(navigator.language || 'zh');
  }

  let currentLang = loadInitialLang();
  const listeners = new Set();

  function getLang() {
    return currentLang;
  }

  function getSupportedLangs() {
    return SUPPORTED_LANGS.slice();
  }

  function t(key, vars = null) {
    const dict = MESSAGES[currentLang] || MESSAGES.zh;
    let template = dict[key] ?? MESSAGES.zh[key] ?? String(key);

    if (vars && typeof vars === 'object') {
      for (const [k, v] of Object.entries(vars)) {
        template = template.replaceAll(`{${k}}`, String(v ?? ''));
      }
    }
    return nfc(template);
  }

  function applyDomI18n(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;

    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });

    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });

    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key));
    });

    root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (key) el.setAttribute('aria-label', t(key));
    });
  }

  function setLang(nextLang) {
    const normalized = normalizeLang(nextLang);
    currentLang = normalized;
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch (_) {
    }
    document.documentElement.setAttribute('lang', normalized);
    applyDomI18n(document);
    for (const fn of listeners) {
      try {
        fn(normalized);
      } catch (err) {
        console.debug('i18n listener error:', err);
      }
    }
  }

  function onChange(fn) {
    if (typeof fn === 'function') {
      listeners.add(fn);
    }
    return () => listeners.delete(fn);
  }

  document.documentElement.setAttribute('lang', currentLang);

  return {
    getLang,
    setLang,
    t,
    getSupportedLangs,
    applyDomI18n,
    onChange,
  };
})();