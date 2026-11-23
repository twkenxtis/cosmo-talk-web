import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
AUTH_PATH = BASE_DIR / "auth.json"

COSMO_ENDPOINT = "https://api.cosmo.fans"
COSMO_KEY = "aUkaF3wWVltAI1QYVmxsZXfTV6L7mPTxA5+MMkLV9DE="

PRIVY_ENDPOINT = "https://auth.privy.io"
PRIVY_APP_ID = "cm7tt02g000a96m8uislrblbe"
PRIVY_CLIENT = "@privy-io/js-sdk-core:0.60.7.0.1"
USER_AGENT = "okhttp/4.12.0"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
NO_SUBSCRIPTION_MSG = "沒有有效的Cosmo Talk訂閱!"

AES_SBOX = (
    0x63, 0x7C, 0x77, 0x7B, 0xF2, 0x6B, 0x6F, 0xC5, 0x30, 0x01, 0x67, 0x2B, 0xFE, 0xD7, 0xAB, 0x76,
    0xCA, 0x82, 0xC9, 0x7D, 0xFA, 0x59, 0x47, 0xF0, 0xAD, 0xD4, 0xA2, 0xAF, 0x9C, 0xA4, 0x72, 0xC0,
    0xB7, 0xFD, 0x93, 0x26, 0x36, 0x3F, 0xF7, 0xCC, 0x34, 0xA5, 0xE5, 0xF1, 0x71, 0xD8, 0x31, 0x15,
    0x04, 0xC7, 0x23, 0xC3, 0x18, 0x96, 0x05, 0x9A, 0x07, 0x12, 0x80, 0xE2, 0xEB, 0x27, 0xB2, 0x75,
    0x09, 0x83, 0x2C, 0x1A, 0x1B, 0x6E, 0x5A, 0xA0, 0x52, 0x3B, 0xD6, 0xB3, 0x29, 0xe3, 0x2F, 0x84,
    0x53, 0xD1, 0x00, 0xED, 0x20, 0xFC, 0xB1, 0x5B, 0x6A, 0xCB, 0xBE, 0x39, 0x4A, 0x4C, 0x58, 0xCF,
    0xD0, 0xEF, 0xAA, 0xFB, 0x43, 0x4D, 0x33, 0x85, 0x45, 0xF9, 0x02, 0x7F, 0x50, 0x3C, 0x9F, 0xA8,
    0x51, 0xA3, 0x40, 0x8F, 0x92, 0x9D, 0x38, 0xF5, 0xBC, 0xB6, 0xDA, 0x21, 0x10, 0xFF, 0xF3, 0xD2,
    0xCD, 0x0C, 0x13, 0xEC, 0x5F, 0x97, 0x44, 0x17, 0xC4, 0xA7, 0x7E, 0x3D, 0x64, 0x5D, 0x19, 0x73,
    0x60, 0x81, 0x4F, 0xDC, 0x22, 0x2A, 0x90, 0x88, 0x46, 0xEE, 0xB8, 0x14, 0xDE, 0x5E, 0x0B, 0xDB,
    0xE0, 0x32, 0x3A, 0x0A, 0x49, 0x06, 0x24, 0x5C, 0xC2, 0xD3, 0xAC, 0x62, 0x91, 0x95, 0xE4, 0x79,
    0xE7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
)
AES_RCON = (0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1B, 0x36)


def _xtime(a: int) -> int:
    return (((a << 1) ^ 0x1B) & 0xFF) if (a & 0x80) else ((a << 1) & 0xFF)


def _gmul(a: int, b: int) -> int:
    res = 0
    while b > 0:
        if b & 1:
            res ^= a
        a = _xtime(a)
        b >>= 1
    return res


def _key_expansion(key: bytes) -> tuple[list[list[int]], int]:
    nk = len(key) // 4
    if nk not in (4, 6, 8):
        raise ValueError(f"Unsupported AES key length: {len(key)} bytes")
    nr = nk + 6
    nb = 4
    total_words = nb * (nr + 1)
    w = [[0, 0, 0, 0] for _ in range(total_words)]

    for i in range(nk):
        w[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]

    for i in range(nk, total_words):
        temp = w[i - 1][:]
        if i % nk == 0:
            temp = [AES_SBOX[temp[1]], AES_SBOX[temp[2]], AES_SBOX[temp[3]], AES_SBOX[temp[0]]]
            temp[0] ^= AES_RCON[i // nk]
        elif nk > 6 and i % nk == 4:
            temp = [AES_SBOX[b] for b in temp]
        w[i] = [w[i - nk][j] ^ temp[j] for j in range(4)]

    round_keys = []
    for r in range(nr + 1):
        rk = [0] * 16
        for c in range(4):
            for row in range(4):
                rk[c * 4 + row] = w[r * 4 + c][row]
        round_keys.append(rk)
    return round_keys, nr


def _encrypt_block(block: bytes, round_keys: list[list[int]], nr: int) -> bytes:
    state = list(block)
    for i in range(16):
        state[i] ^= round_keys[0][i]

    for rnd in range(1, nr):
        state = [AES_SBOX[b] for b in state]
        state[1], state[5], state[9], state[13] = state[5], state[9], state[13], state[1]
        state[2], state[6], state[10], state[14] = state[10], state[14], state[2], state[6]
        state[3], state[7], state[11], state[15] = state[15], state[3], state[7], state[11]
        for c in range(4):
            i = c * 4
            s0, s1, s2, s3 = state[i], state[i + 1], state[i + 2], state[i + 3]
            state[i] = _gmul(2, s0) ^ _gmul(3, s1) ^ s2 ^ s3
            state[i + 1] = s0 ^ _gmul(2, s1) ^ _gmul(3, s2) ^ s3
            state[i + 2] = s0 ^ s1 ^ _gmul(2, s2) ^ _gmul(3, s3)
            state[i + 3] = _gmul(3, s0) ^ s1 ^ s2 ^ _gmul(2, s3)
        for i in range(16):
            state[i] ^= round_keys[rnd][i]

    state = [AES_SBOX[b] for b in state]
    state[1], state[5], state[9], state[13] = state[5], state[9], state[13], state[1]
    state[2], state[6], state[10], state[14] = state[10], state[14], state[2], state[6]
    state[3], state[7], state[11], state[15] = state[15], state[3], state[7], state[11]
    for i in range(16):
        state[i] ^= round_keys[nr][i]

    return bytes(state)


def aes_cbc_encrypt(plaintext: str, key_base64: str = COSMO_KEY) -> str:
    key = base64.b64decode(key_base64)
    round_keys, nr = _key_expansion(key)
    iv = os.urandom(16)
    raw = plaintext.encode("utf-8")
    pad_len = 16 - (len(raw) % 16)
    padded = raw + bytes([pad_len] * pad_len)

    out = bytearray(iv)
    prev = iv
    for offset in range(0, len(padded), 16):
        blk = padded[offset : offset + 16]
        xored = bytes(blk[j] ^ prev[j] for j in range(16))
        enc_blk = _encrypt_block(xored, round_keys, nr)
        out.extend(enc_blk)
        prev = enc_blk

    return base64.b64encode(bytes(out)).decode("utf-8")


def _privy_headers() -> dict:
    return {
        "privy-app-id": PRIVY_APP_ID,
        "privy-client": PRIVY_CLIENT,
        "privy-ca-id": str(uuid.uuid4()),
        "Origin": PRIVY_ENDPOINT,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }


def _extract_api_error_message(raw_body: str) -> str:
    try:
        parsed = json.loads(raw_body)
    except json.JSONDecodeError:
        return raw_body
    if isinstance(parsed, dict):
        err = parsed.get("error")
        if isinstance(err, dict):
            if err.get("code") == "USER_NOT_FOUND":
                return NO_SUBSCRIPTION_MSG
            if err.get("code") and err.get("message"):
                return f"{err['code']}: {err['message']}"
            if err.get("message"):
                return str(err["message"])
            if err.get("code"):
                return str(err["code"])
        elif err is not None and "USER_NOT_FOUND" in str(err):
            return NO_SUBSCRIPTION_MSG
    if "USER_NOT_FOUND" in raw_body:
        return NO_SUBSCRIPTION_MSG
    return raw_body


def _http_post_bytes(url: str, data: bytes, headers: dict) -> dict:
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        detail = _extract_api_error_message(body)
        if detail == NO_SUBSCRIPTION_MSG:
            raise RuntimeError(NO_SUBSCRIPTION_MSG) from None
        raise RuntimeError(f"HTTP {e.code}: {detail}") from None


def extract_credentials(obj) -> dict:
    def find(node, camel, snake):
        if isinstance(node, dict):
            if node.get(camel):
                return node[camel]
            if node.get(snake):
                return node[snake]
            for v in node.values():
                found = find(v, camel, snake)
                if found is not None:
                    return found
        elif isinstance(node, list):
            for v in node:
                found = find(v, camel, snake)
                if found is not None:
                    return found
        return None

    access = find(obj, "accessToken", "access_token")
    refresh_token = find(obj, "refreshToken", "refresh_token")
    if not access or not refresh_token:
        raise ValueError("could not find accessToken/refreshToken in response")
    return {"accessToken": access, "refreshToken": refresh_token}


def send_otp(email: str) -> None:
    email = email.strip()
    if not EMAIL_RE.match(email):
        raise ValueError(f"Invalid email format: {email}")
    _http_post_bytes(
        f"{PRIVY_ENDPOINT}/api/v1/passwordless/init",
        json.dumps({"email": email}).encode("utf-8"),
        _privy_headers(),
    )


def verify_otp_and_login(email: str, code: str, auth_path: Path = AUTH_PATH) -> dict:
    email = email.strip()
    code = code.strip()
    if not EMAIL_RE.match(email):
        raise ValueError(f"Invalid email format: {email}")
    if not code or len(code) > 6:
        raise ValueError("OTP code must be 1 to 6 characters")

    privy_resp = _http_post_bytes(
        f"{PRIVY_ENDPOINT}/api/v1/passwordless/authenticate",
        json.dumps({"email": email, "code": code, "mode": "login-or-sign-up"}).encode("utf-8"),
        _privy_headers(),
    )
    privy_token = privy_resp.get("token") or privy_resp.get("privy_access_token")
    if not privy_token:
        raise RuntimeError("Privy did not return an access token")

    encrypted = aes_cbc_encrypt(json.dumps({"token": privy_token}), COSMO_KEY)
    account = _http_post_bytes(
        f"{COSMO_ENDPOINT}/bff/v3/users/login-by-privy",
        encrypted.encode("utf-8"),
        {
            "Content-Type": "text/plain",
            "x-cosmo-encrypted": "1",
            "User-Agent": USER_AGENT,
        },
    )

    creds = extract_credentials(account)
    auth_path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(auth_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(json.dumps(creds, indent=2, ensure_ascii=False) + "\n")
    return account


def _prompt(label: str) -> str:
    print(label, end="", file=sys.stderr, flush=True)
    return input().strip()


def _resolve_email_arg() -> str:
    if len(sys.argv) >= 3 and sys.argv[1] in ("-e", "--email"):
        return sys.argv[2].strip()
    if len(sys.argv) >= 2 and sys.argv[1] not in ("-h", "--help"):
        return sys.argv[1].strip()
    return _prompt("email: ")


def main() -> None:
    email = _resolve_email_arg()
    try:
        send_otp(email)
    except Exception as e:
        print(f"Error requesting code: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"登入驗證碼已發送至: {email}", file=sys.stderr)
    code = _prompt("輸入六位數 OTP Code: ")

    try:
        account = verify_otp_and_login(email, code, AUTH_PATH)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"saved tokens to {AUTH_PATH}", file=sys.stderr)
    print("=========================================")
    print("請勿公開發布或洩漏下列JWT Token並妥善保管此參數!")
    print("=========================================")
    print("\n")
    print(account.get("credentials").get("refreshToken"))
    print("\n")


if __name__ == "__main__":
    main()