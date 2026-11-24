const COSMO_ENDPOINT = "https://api.cosmo.fans";
const COSMO_KEY_B64 = "aUkaF3wWVltAI1QYVmxsZXfTV6L7mPTxA5+MMkLV9DE=";

const PRIVY_ENDPOINT = "https://auth.privy.io";
const PRIVY_APP_ID = "cm7tt02g000a96m8uislrblbe";
const PRIVY_CLIENT = "@privy-io/js-sdk-core:0.60.7.0.1";
const USER_AGENT = "okhttp/4.12.0";
const NO_SUBSCRIPTION_MSG = "沒有有效的Cosmo Talk訂閱!";

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Cosmo RefreshToken 取得工具")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function generateUuid_() {
  return Utilities.getUuid();
}

function validateEmail_(email) {
  const cleaned = String(email || "").trim();
  const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (!re.test(cleaned)) {
    throw new Error("Email 格式不正確，請重新確認。");
  }
  return cleaned;
}

function validateOtp_(code) {
  const cleaned = String(code || "").trim();
  if (!/^[A-Za-z0-9]{1,6}$/.test(cleaned)) {
    throw new Error("OTP 驗證碼需為 1 到 6 位英數字。");
  }
  return cleaned;
}

function parseApiError_(statusCode, rawText) {
  let detail = rawText;
  try {
    const parsed = JSON.parse(rawText);
    if (parsed && typeof parsed === "object") {
      const err = parsed.error;
      if (err && typeof err === "object") {
        if (err.code === "USER_NOT_FOUND") return NO_SUBSCRIPTION_MSG;
        if (err.code && err.message) detail = `${err.code}: ${err.message}`;
        else if (err.message) detail = String(err.message);
        else if (err.code) detail = String(err.code);
      } else if (err != null && String(err).indexOf("USER_NOT_FOUND") !== -1) {
        return NO_SUBSCRIPTION_MSG;
      }
    }
  } catch (_) {}

  if (String(rawText).indexOf("USER_NOT_FOUND") !== -1) {
    return NO_SUBSCRIPTION_MSG;
  }
  return `HTTP ${statusCode}: ${detail}`;
}

function httpPostJson_(url, payloadObj, extraHeaders) {
  const headers = Object.assign(
    {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": USER_AGENT,
    },
    extraHeaders || {}
  );

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    headers: headers,
    payload: JSON.stringify(payloadObj),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  const text = res.getContentText("UTF-8");
  if (code < 200 || code >= 300) {
    const msg = parseApiError_(code, text);
    if (msg === NO_SUBSCRIPTION_MSG) {
      throw new Error(NO_SUBSCRIPTION_MSG);
    }
    throw new Error(msg);
  }
  return JSON.parse(text);
}

function httpPostEncrypted_(url, encryptedB64) {
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "text/plain",
      "x-cosmo-encrypted": "1",
      "User-Agent": USER_AGENT,
    },
    payload: encryptedB64,
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  const text = res.getContentText("UTF-8");
  if (code < 200 || code >= 300) {
    const msg = parseApiError_(code, text);
    if (msg === NO_SUBSCRIPTION_MSG) {
      throw new Error(NO_SUBSCRIPTION_MSG);
    }
    throw new Error(msg);
  }
  return JSON.parse(text);
}

function extractRefreshToken_(obj) {
  function walk(node) {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const found = walk(node[i]);
        if (found) return found;
      }
      return null;
    }
    if (node && typeof node === "object") {
      if (node.refreshToken) return String(node.refreshToken);
      if (node.refresh_token) return String(node.refresh_token);
      const keys = Object.keys(node);
      for (let i = 0; i < keys.length; i++) {
        const found = walk(node[keys[i]]);
        if (found) return found;
      }
    }
    return null;
  }

  const rt = walk(obj);
  if (!rt) {
    throw new Error("登入回應中找不到 refreshToken。");
  }
  return rt;
}

const AES_SBOX = [
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
];

const AES_RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function xtime_(a) {
  return (a & 0x80) ? (((a << 1) ^ 0x1b) & 0xff) : ((a << 1) & 0xff);
}

function gmul_(a, b) {
  let res = 0;
  let x = a & 0xff;
  let y = b & 0xff;
  while (y > 0) {
    if (y & 1) res ^= x;
    x = xtime_(x);
    y >>= 1;
  }
  return res & 0xff;
}

function keyExpansion_(keyBytes) {
  const nk = keyBytes.length / 4;
  if (nk !== 4 && nk !== 6 && nk !== 8) {
    throw new Error(`不支援的 AES 金鑰長度: ${keyBytes.length} bytes`);
  }
  const nr = nk + 6;
  const nb = 4;
  const totalWords = nb * (nr + 1);
  const w = [];

  for (let i = 0; i < nk; i++) {
    w.push([keyBytes[4 * i], keyBytes[4 * i + 1], keyBytes[4 * i + 2], keyBytes[4 * i + 3]]);
  }

  for (let i = nk; i < totalWords; i++) {
    let temp = w[i - 1].slice();
    if (i % nk === 0) {
      temp = [
        AES_SBOX[temp[1]],
        AES_SBOX[temp[2]],
        AES_SBOX[temp[3]],
        AES_SBOX[temp[0]],
      ];
      temp[0] ^= AES_RCON[i / nk];
    } else if (nk > 6 && i % nk === 4) {
      temp = temp.map((b) => AES_SBOX[b]);
    }
    const prev = w[i - nk];
    w.push([
      prev[0] ^ temp[0],
      prev[1] ^ temp[1],
      prev[2] ^ temp[2],
      prev[3] ^ temp[3],
    ]);
  }

  const roundKeys = [];
  for (let r = 0; r <= nr; r++) {
    const rk = new Array(16);
    for (let c = 0; c < 4; c++) {
      for (let row = 0; row < 4; row++) {
        rk[c * 4 + row] = w[r * 4 + c][row];
      }
    }
    roundKeys.push(rk);
  }
  return { roundKeys: roundKeys, nr: nr };
}

function encryptBlock_(block, roundKeys, nr) {
  let state = block.slice();
  for (let i = 0; i < 16; i++) state[i] ^= roundKeys[0][i];

  for (let rnd = 1; rnd < nr; rnd++) {
    state = state.map((b) => AES_SBOX[b]);
    [state[1], state[5], state[9], state[13]] = [state[5], state[9], state[13], state[1]];
    [state[2], state[6], state[10], state[14]] = [state[10], state[14], state[2], state[6]];
    [state[3], state[7], state[11], state[15]] = [state[15], state[3], state[7], state[11]];

    for (let c = 0; c < 4; c++) {
      const i = c * 4;
      const s0 = state[i], s1 = state[i + 1], s2 = state[i + 2], s3 = state[i + 3];
      state[i]     = gmul_(2, s0) ^ gmul_(3, s1) ^ s2 ^ s3;
      state[i + 1] = s0 ^ gmul_(2, s1) ^ gmul_(3, s2) ^ s3;
      state[i + 2] = s0 ^ s1 ^ gmul_(2, s2) ^ gmul_(3, s3);
      state[i + 3] = gmul_(3, s0) ^ s1 ^ s2 ^ gmul_(2, s3);
    }

    for (let i = 0; i < 16; i++) state[i] ^= roundKeys[rnd][i];
  }

  state = state.map((b) => AES_SBOX[b]);
  [state[1], state[5], state[9], state[13]] = [state[5], state[9], state[13], state[1]];
  [state[2], state[6], state[10], state[14]] = [state[10], state[14], state[2], state[6]];
  [state[3], state[7], state[11], state[15]] = [state[15], state[3], state[7], state[11]];

  for (let i = 0; i < 16; i++) state[i] ^= roundKeys[nr][i];
  return state;
}

function aesCbcEncrypt_(plaintext, keyBase64) {
  const keyBytes = Utilities.base64Decode(keyBase64).map((b) => (b + 256) % 256);
  const { roundKeys, nr } = keyExpansion_(keyBytes);

  const iv = [];
  for (let i = 0; i < 16; i++) {
    iv.push(Math.floor(Math.random() * 256));
  }

  const rawBytes = Utilities.newBlob(plaintext, "UTF-8").getBytes().map((b) => (b + 256) % 256);
  const padLen = 16 - (rawBytes.length % 16);
  const padded = rawBytes.concat(new Array(padLen).fill(padLen));

  const out = iv.slice();
  let prev = iv.slice();

  for (let offset = 0; offset < padded.length; offset += 16) {
    const xored = new Array(16);
    for (let j = 0; j < 16; j++) {
      xored[j] = padded[offset + j] ^ prev[j];
    }
    const encBlk = encryptBlock_(xored, roundKeys, nr);
    for (let j = 0; j < 16; j++) {
      out.push(encBlk[j]);
    }
    prev = encBlk;
  }

  const signedBytes = out.map((b) => (b >= 128 ? b - 256 : b));
  return Utilities.base64Encode(signedBytes);
}

function sendOtpCode(email) {
  try {
    const validEmail = validateEmail_(email);
    httpPostJson_(
      `${PRIVY_ENDPOINT}/api/v1/passwordless/init`,
      { email: validEmail },
      {
        "privy-app-id": PRIVY_APP_ID,
        "privy-client": PRIVY_CLIENT,
        "privy-ca-id": generateUuid_(),
        "Origin": PRIVY_ENDPOINT,
      }
    );
    return { ok: true, email: validEmail };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

function verifyOtpAndGetRefreshToken(email, code) {
  try {
    const validEmail = validateEmail_(email);
    const validCode = validateOtp_(code);

    const privyResp = httpPostJson_(
      `${PRIVY_ENDPOINT}/api/v1/passwordless/authenticate`,
      {
        email: validEmail,
        code: validCode,
        mode: "login-or-sign-up",
      },
      {
        "privy-app-id": PRIVY_APP_ID,
        "privy-client": PRIVY_CLIENT,
        "privy-ca-id": generateUuid_(),
        "Origin": PRIVY_ENDPOINT,
      }
    );

    const privyToken = privyResp && (privyResp.token || privyResp.privy_access_token);
    if (!privyToken) {
      throw new Error("Privy 未回傳 access token。");
    }

    const encryptedPayload = aesCbcEncrypt_(
      JSON.stringify({ token: privyToken }),
      COSMO_KEY_B64
    );

    const accountResp = httpPostEncrypted_(
      `${COSMO_ENDPOINT}/bff/v3/users/login-by-privy`,
      encryptedPayload
    );

    const refreshToken = extractRefreshToken_(accountResp);
    return {
      ok: true,
      refreshToken: refreshToken,
    };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}