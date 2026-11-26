const CONFIG = {
  cosmoEndpoint: "https://api.cosmo.fans",
  cosmoKeyBase64: "aUkaF3wWVltAI1QYVmxsZXfTV6L7mPTxA5+MMkLV9DE=",
  privyEndpoint: "https://auth.privy.io",
  privyAppId: "cm7tt02g000a96m8uislrblbe",
  privyClient: "@privy-io/js-sdk-core:0.60.7.0.1",
  userAgent: "okhttp/4.12.0",
  noSubscriptionMsg: "沒有有效的Cosmo Talk訂閱!",
  keychainAccessTokenKey: "cosmo_access_token",
  keychainRefreshTokenKey: "cosmo_refresh_token",
  keychainLastEmailKey: "cosmo_last_email",
  copyAccessTokenToClipboard: true,
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function uuidV4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function privyHeaders() {
  return {
    "privy-app-id": CONFIG.privyAppId,
    "privy-client": CONFIG.privyClient,
    "privy-ca-id": uuidV4(),
    "Origin": CONFIG.privyEndpoint,
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": CONFIG.userAgent,
  };
}

function extractApiErrorMessage(rawText) {
  let parsed = null;
  try {
    parsed = JSON.parse(rawText);
  } catch (_) {
    parsed = null;
  }

  if (parsed && typeof parsed === "object") {
    const err = parsed.error;
    if (err && typeof err === "object") {
      if (err.code === "USER_NOT_FOUND") return CONFIG.noSubscriptionMsg;
      if (err.code && err.message) return `${err.code}: ${err.message}`;
      if (err.message) return String(err.message);
      if (err.code) return String(err.code);
    } else if (err !== undefined && err !== null) {
      const errStr = String(err);
      if (errStr.includes("USER_NOT_FOUND")) return CONFIG.noSubscriptionMsg;
      return errStr;
    }
  }

  if (String(rawText).includes("USER_NOT_FOUND")) {
    return CONFIG.noSubscriptionMsg;
  }
  return String(rawText);
}

async function httpPostJson(url, payload, headers) {
  const req = new Request(url);
  req.method = "POST";
  req.headers = headers;
  req.body = JSON.stringify(payload);
  req.timeoutInterval = 20;

  const rawText = await req.loadString();
  const status = req.response ? req.response.statusCode : 0;
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch (_) {
    data = null;
  }

  if (status < 200 || status >= 300) {
    const detail = extractApiErrorMessage(rawText || `(empty body, HTTP ${status})`);
    throw new Error(detail === CONFIG.noSubscriptionMsg ? CONFIG.noSubscriptionMsg : `HTTP ${status}: ${detail}`);
  }

  if (data === null) {
    throw new Error(`Invalid JSON response: ${rawText}`);
  }
  return data;
}

// --- Pure JS AES-128-CBC (FIPS-197) + PKCS#7 ---
const AES_SBOX = new Uint8Array([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
]);

const AES_RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function gmul(a, b) {
  let p = 0;
  let aa = a;
  let bb = b;
  for (let i = 0; i < 8; i++) {
    if ((bb & 1) !== 0) p ^= aa;
    const hi = aa & 0x80;
    aa = (aa << 1) & 0xff;
    if (hi !== 0) aa ^= 0x1b;
    bb >>= 1;
  }
  return p & 0xff;
}

function aes128KeyExpansion(keyBytes) {
  if (keyBytes.length !== 16) {
    throw new Error(`AES-128 key must be 16 bytes, got ${keyBytes.length}`);
  }
  const roundKeys = new Uint8Array(176);
  roundKeys.set(keyBytes, 0);

  let bytesGenerated = 16;
  let rconIteration = 1;
  const temp = new Uint8Array(4);

  while (bytesGenerated < 176) {
    for (let i = 0; i < 4; i++) {
      temp[i] = roundKeys[bytesGenerated - 4 + i];
    }
    if (bytesGenerated % 16 === 0) {
      const t0 = temp[0];
      temp[0] = AES_SBOX[temp[1]] ^ AES_RCON[rconIteration++];
      temp[1] = AES_SBOX[temp[2]];
      temp[2] = AES_SBOX[temp[3]];
      temp[3] = AES_SBOX[t0];
    }
    for (let i = 0; i < 4; i++) {
      roundKeys[bytesGenerated] = roundKeys[bytesGenerated - 16] ^ temp[i];
      bytesGenerated++;
    }
  }
  return roundKeys;
}

function addRoundKey(state, roundKeys, round) {
  const offset = round * 16;
  for (let i = 0; i < 16; i++) {
    state[i] ^= roundKeys[offset + i];
  }
}

function subBytes(state) {
  for (let i = 0; i < 16; i++) {
    state[i] = AES_SBOX[state[i]];
  }
}

function shiftRows(state) {
  const r1Tmp = state[1];
  state[1] = state[5];
  state[5] = state[9];
  state[9] = state[13];
  state[13] = r1Tmp;

  const r2Tmp0 = state[2];
  const r2Tmp1 = state[6];
  state[2] = state[10];
  state[6] = state[14];
  state[10] = r2Tmp0;
  state[14] = r2Tmp1;

  const r3Tmp = state[15];
  state[15] = state[11];
  state[11] = state[7];
  state[7] = state[3];
  state[3] = r3Tmp;
}

function mixColumns(state) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const s0 = state[i];
    const s1 = state[i + 1];
    const s2 = state[i + 2];
    const s3 = state[i + 3];

    state[i] = gmul(0x02, s0) ^ gmul(0x03, s1) ^ s2 ^ s3;
    state[i + 1] = s0 ^ gmul(0x02, s1) ^ gmul(0x03, s2) ^ s3;
    state[i + 2] = s0 ^ s1 ^ gmul(0x02, s2) ^ gmul(0x03, s3);
    state[i + 3] = gmul(0x03, s0) ^ s1 ^ s2 ^ gmul(0x02, s3);
  }
}

function aes128EncryptBlock(blockBytes, roundKeys) {
  const state = new Uint8Array(blockBytes);
  addRoundKey(state, roundKeys, 0);

  for (let round = 1; round <= 9; round++) {
    subBytes(state);
    shiftRows(state);
    mixColumns(state);
    addRoundKey(state, roundKeys, round);
  }

  subBytes(state);
  shiftRows(state);
  addRoundKey(state, roundKeys, 10);
  return state;
}

function pkcs7Pad(bytes, blockSize = 16) {
  const padLen = blockSize - (bytes.length % blockSize);
  const out = new Uint8Array(bytes.length + padLen);
  out.set(bytes, 0);
  out.fill(padLen, bytes.length);
  return out;
}

function randomIv16() {
  const iv = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    iv[i] = (Math.random() * 256) | 0;
  }
  return iv;
}

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes) {
  if (typeof btoa === "function") {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    const encoded = btoa(bin);
    if (typeof encoded === "string" && encoded.length > 0) return encoded;
  }

  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;

    out += B64_CHARS[(triple >> 18) & 0x3f];
    out += B64_CHARS[(triple >> 12) & 0x3f];
    out += hasB1 ? B64_CHARS[(triple >> 6) & 0x3f] : "=";
    out += hasB2 ? B64_CHARS[triple & 0x3f] : "=";
  }
  return out;
}

function base64ToBytes(b64) {
  const cleaned = String(b64 || "").replace(/[\s\r\n]+/g, "");
  if (!cleaned) {
    throw new Error("Base64 key is empty");
  }

  if (typeof atob === "function") {
    const bin = atob(cleaned);
    if (bin !== null && bin !== undefined && typeof bin.length === "number") {
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i) & 0xff;
      }
      return out;
    }
  }

  const normalized = cleaned.replace(/=+$/, "");
  const bytes = [];
  let acc = 0;
  let bits = 0;

  for (let i = 0; i < normalized.length; i++) {
    const val = B64_CHARS.indexOf(normalized[i]);
    if (val < 0) {
      throw new Error(`Invalid Base64 character at index ${i}`);
    }
    acc = (acc << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function encryptCosmoPayload(plaintext, keyBase64 = CONFIG.cosmoKeyBase64) {
  const keyBytes = base64ToBytes(keyBase64);
  const roundKeys = aes128KeyExpansion(keyBytes);
  const iv = randomIv16();

  const utf8Bytes = new TextEncoder().encode(plaintext);
  const padded = pkcs7Pad(utf8Bytes, 16);

  const ciphertext = new Uint8Array(padded.length);
  let prevBlock = iv;

  for (let offset = 0; offset < padded.length; offset += 16) {
    const xored = new Uint8Array(16);
    for (let j = 0; j < 16; j++) {
      xored[j] = padded[offset + j] ^ prevBlock[j];
    }
    const encBlock = aes128EncryptBlock(xored, roundKeys);
    ciphertext.set(encBlock, offset);
    prevBlock = encBlock;
  }

  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return bytesToBase64(combined);
}

async function postCosmoEncrypted(path, plaintextPayload) {
  const encrypted = encryptCosmoPayload(plaintextPayload, CONFIG.cosmoKeyBase64);
  const req = new Request(`${CONFIG.cosmoEndpoint}${path}`);
  req.method = "POST";
  req.headers = {
    "Content-Type": "text/plain",
    "x-cosmo-encrypted": "1",
    "User-Agent": CONFIG.userAgent,
  };
  req.data = Data.fromString(encrypted);
  req.timeoutInterval = 20;

  const rawText = await req.loadString();
  const status = req.response ? req.response.statusCode : 0;
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch (_) {
    data = null;
  }

  if (status < 200 || status >= 300) {
    const detail = extractApiErrorMessage(rawText || `(empty body, HTTP ${status})`);
    throw new Error(detail === CONFIG.noSubscriptionMsg ? CONFIG.noSubscriptionMsg : `HTTP ${status}: ${detail}`);
  }

  if (data === null) {
    throw new Error(`Invalid JSON response: ${rawText}`);
  }
  return data;
}

function extractCredentials(obj) {
  function find(node, camel, snake) {
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = find(item, camel, snake);
        if (found !== null && found !== undefined && found !== "") return found;
      }
      return null;
    }
    if (node && typeof node === "object") {
      if (node[camel]) return node[camel];
      if (node[snake]) return node[snake];
      for (const val of Object.values(node)) {
        const found = find(val, camel, snake);
        if (found !== null && found !== undefined && found !== "") return found;
      }
    }
    return null;
  }

  const accessToken = find(obj, "accessToken", "access_token");
  const refreshToken = find(obj, "refreshToken", "refresh_token");
  if (!accessToken || !refreshToken) {
    throw new Error("回應中找不到 accessToken / refreshToken");
  }
  return { accessToken: String(accessToken), refreshToken: String(refreshToken) };
}

async function promptEmail(initialValue = "") {
  const alert = new Alert();
  alert.title = "COSMO Email 登入";
  alert.message = "請輸入 Email 接收 Privy 驗證碼";
  const tf = alert.addTextField("name@example.com", initialValue);
  if (typeof tf.setKeyboardType === "function") {
    tf.setKeyboardType("email-address");
  }
  alert.addAction("寄送驗證碼");
  alert.addCancelAction("取消");

  const idx = await alert.presentAlert();
  if (idx === -1) return null;
  return (alert.textFieldValue(0) || "").trim();
}

async function promptOtp(email) {
  const alert = new Alert();
  alert.title = "輸入 OTP 驗證碼";
  alert.message = `驗證碼已寄送至 ${email}`;
  const tf = alert.addTextField("6 位數驗證碼", "");
  if (typeof tf.setKeyboardType === "function") {
    tf.setKeyboardType("number-pad");
  }
  alert.addAction("驗證並取得 Token");
  alert.addCancelAction("取消");

  const idx = await alert.presentAlert();
  if (idx === -1) return null;
  return (alert.textFieldValue(0) || "").trim();
}

async function showNotice(title, message) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("確定");
  await alert.presentAlert();
}

async function sendOtp(email) {
  const cleanEmail = String(email || "").trim();
  if (!EMAIL_RE.test(cleanEmail)) {
    throw new Error(`Invalid email format: ${cleanEmail}`);
  }
  await httpPostJson(
    `${CONFIG.privyEndpoint}/api/v1/passwordless/init`,
    { email: cleanEmail },
    privyHeaders(),
  );
}

async function verifyOtpAndLogin(email, code) {
  const cleanEmail = String(email || "").trim();
  const cleanCode = String(code || "").trim();
  if (!EMAIL_RE.test(cleanEmail)) {
    throw new Error(`Invalid email format: ${cleanEmail}`);
  }
  if (!cleanCode) {
    throw new Error("OTP code is required");
  }
  if (cleanCode.length > 6) {
    throw new Error("OTP code must be at most 6 digits");
  }

  const privyResp = await httpPostJson(
    `${CONFIG.privyEndpoint}/api/v1/passwordless/authenticate`,
    { email: cleanEmail, code: cleanCode, mode: "login-or-sign-up" },
    privyHeaders(),
  );

  const privyToken = privyResp?.token || privyResp?.privy_access_token;
  if (!privyToken) {
    throw new Error("Privy did not return an access token");
  }

  const account = await postCosmoEncrypted(
    "/bff/v3/users/login-by-privy",
    JSON.stringify({ token: privyToken }),
  );

  const creds = extractCredentials(account);
  Keychain.set(CONFIG.keychainAccessTokenKey, creds.accessToken);
  Keychain.set(CONFIG.keychainRefreshTokenKey, creds.refreshToken);

  return { creds, account };
}

async function main() {
  try {
    const lastEmail = Keychain.contains(CONFIG.keychainLastEmailKey)
      ? Keychain.get(CONFIG.keychainLastEmailKey)
      : "";

    const email = await promptEmail(lastEmail);
    if (!email) {
      Script.complete("cancelled");
      return;
    }

    await sendOtp(email);
    Keychain.set(CONFIG.keychainLastEmailKey, email);

    const code = await promptOtp(email);
    if (!code) {
      Script.complete("cancelled");
      return;
    }

    const { creds } = await verifyOtpAndLogin(email, code);

    if (CONFIG.copyAccessTokenToClipboard) {
      Pasteboard.copy(creds.accessToken);
    }

    Script.setShortcutOutput(creds.accessToken);
    await showNotice(
      "登入成功",
      CONFIG.copyAccessTokenToClipboard
        ? "已取得 accessToken 與 refreshToken 並存入 Keychain，accessToken 已複製到剪貼簿。"
        : "已取得 accessToken 與 refreshToken 並存入 Keychain。",
    );
    Script.complete(creds.accessToken);
  } catch (err) {
    await showNotice("登入失敗", err?.message || String(err));
    Script.complete();
  }
}

await main();
