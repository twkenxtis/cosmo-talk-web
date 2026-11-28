import { CosmoSecurity } from "./security.js";

const CosmoStorage = (() => {

  const DB_NAME = "cosmo_static_db";
  const DB_VERSION = 2;
  const SESSION_STORE = "session";
  const NDJSON_STORE = "ndjson_cache";
  const JWT_KEY = "access_token";
  const REFRESH_TOKEN_KEY = "refresh_token";
  const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 天

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          db.createObjectStore(SESSION_STORE);
        }
        if (!db.objectStoreNames.contains(NDJSON_STORE)) {
          const store = db.createObjectStore(NDJSON_STORE, { keyPath: "cacheKey" });
          store.createIndex("by_updatedAt", "updatedAt", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function makeNdjsonKey(artistId, artistMemberId) {
    return `${String(artistId)}:${String(artistMemberId)}`;
  }

  async function saveTokens({ accessToken = "", refreshToken = "" } = {}) {
    const db = await openDb();
    const cleanAccess = (typeof CosmoSecurity !== "undefined" ? CosmoSecurity.cleanJwt(accessToken) : String(accessToken || "").trim());
    if (accessToken && !cleanAccess) throw new Error("Invalid JWT format");
    const cleanRefresh = (typeof CosmoSecurity !== "undefined" ? CosmoSecurity.cleanToken(refreshToken) : String(refreshToken || "").trim());
    if (refreshToken && !cleanRefresh) throw new Error("Invalid refresh token format");

    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, "readwrite");
      const store = tx.objectStore(SESSION_STORE);

      if (cleanAccess) {
        store.put(cleanAccess, JWT_KEY);
      } else {
        store.delete(JWT_KEY);
      }

      if (cleanRefresh) {
        store.put(cleanRefresh, REFRESH_TOKEN_KEY);
      } else {
        store.delete(REFRESH_TOKEN_KEY);
      }

      tx.oncomplete = () => resolve({ accessToken: cleanAccess, refreshToken: cleanRefresh });
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getTokens() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, "readonly");
      const store = tx.objectStore(SESSION_STORE);
      const accessReq = store.get(JWT_KEY);
      const refreshReq = store.get(REFRESH_TOKEN_KEY);

      let accessToken = "";
      let refreshToken = "";

      accessReq.onsuccess = () => {
        accessToken = String(accessReq.result || "").trim();
      };
      refreshReq.onsuccess = () => {
        refreshToken = String(refreshReq.result || "").trim();
      };

      tx.oncomplete = () => resolve({ accessToken, refreshToken });
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearTokens() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, "readwrite");
      const store = tx.objectStore(SESSION_STORE);
      store.delete(JWT_KEY);
      store.delete(REFRESH_TOKEN_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function saveJwt(token) {
    const existing = await getTokens();
    await saveTokens({
      accessToken: String(token || "").trim(),
      refreshToken: existing.refreshToken,
    });
  }

  async function getJwt() {
    const { accessToken } = await getTokens();
    return accessToken;
  }

  async function clearJwt() {
    await clearTokens();
  }

  async function getNdjsonCache(artistId, artistMemberId) {
    const db = await openDb();
    const cacheKey = makeNdjsonKey(artistId, artistMemberId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(NDJSON_STORE, "readonly");
      const req = tx.objectStore(NDJSON_STORE).get(cacheKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveNdjsonCache(artistId, artistMemberId, records, lastCursor = "0") {
    const db = await openDb();
    const cacheKey = makeNdjsonKey(artistId, artistMemberId);
    const payload = {
      cacheKey,
      artistId: String(artistId),
      artistMemberId: String(artistMemberId),
      records: Array.isArray(records) ? records : [],
      lastCursor: String(lastCursor ?? "0"),
      updatedAt: Date.now(),
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(NDJSON_STORE, "readwrite");
      tx.objectStore(NDJSON_STORE).put(payload);
      tx.oncomplete = () => resolve(payload);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearNdjsonCache() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(NDJSON_STORE, "readwrite");
      tx.objectStore(NDJSON_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function pruneExpiredNdjsonCache(maxAgeMs = DEFAULT_TTL_MS) {
    const db = await openDb();
    const cutoff = Date.now() - maxAgeMs;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(NDJSON_STORE, "readwrite");
      const store = tx.objectStore(NDJSON_STORE);
      const idx = store.index("by_updatedAt");
      const range = IDBKeyRange.upperBound(cutoff);
      const req = idx.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    saveTokens,
    getTokens,
    clearTokens,
    saveJwt,
    getJwt,
    clearJwt,
    getNdjsonCache,
    saveNdjsonCache,
    clearNdjsonCache,
    pruneExpiredNdjsonCache,
  };
})();

export { CosmoStorage };
