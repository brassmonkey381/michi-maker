/**
 * Encrypted-at-rest offline cache for the gated catalog (DATA-PROTECTION-PLAN.md — "encrypted-at-
 * rest offline cache"). Web-only; guarded by the same runtime checks as the gated path itself
 * (IndexedDB + Web Crypto). Every operation fails SOFT — a blocked IndexedDB (private mode), a
 * lost device key, or a corrupt record degrades to a cache miss, never an exception the caller
 * must handle.
 *
 * What we persist, and what we deliberately DON'T:
 *  - the raw `catalog.enc` bytes (already AES-256-GCM ciphertext — safe at rest), and
 *  - the catalog's AES key, itself ENCRYPTED under a device-local, NON-EXTRACTABLE wrapping key
 *    that lives in IndexedDB (script can use it to unwrap but can never read its raw bytes).
 *  - NEVER the decrypted catalog JSON. Plaintext only ever exists in memory.
 *
 * The record is keyed by the publish `version`. Online, a version match lets the caller skip the
 * ~1.3 MB re-download; offline, the caller unwraps the key here and decrypts the cached blob —
 * true offline without the short-TTL server key. A new publish (new version) invalidates it.
 */

const DB_NAME = 'tcgscan-catalog';
const DB_VERSION = 1;
const STORE = 'kv';
const WRAP_KEY_ID = 'deviceKey'; // non-extractable AES-GCM key — the "device secret"
const CATALOG_ID = 'catalog';

// `Uint8Array<ArrayBuffer>` (not the default `<ArrayBufferLike>`) is what Web Crypto's BufferSource
// requires since TS 5.7 — every byte array here flows into crypto.subtle, so pin the buffer kind.
interface CatalogRecord {
  version: string;
  enc: Uint8Array<ArrayBuffer>; // catalog.enc: 12-byte IV || AES-256-GCM ciphertext
  wrappedKey: Uint8Array<ArrayBuffer>; // the catalog AES key, AES-GCM-encrypted under the device key
  wrapIv: Uint8Array<ArrayBuffer>; // IV used to wrap the key above
}

/** The catalog blob + its unwrapped raw AES key, ready to decrypt. */
export interface CachedCatalog {
  version: string;
  enc: Uint8Array<ArrayBuffer>;
  key: Uint8Array<ArrayBuffer>;
}

function supported(): boolean {
  return (
    typeof indexedDB !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    !!crypto.subtle &&
    typeof crypto.getRandomValues === 'function'
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('idb blocked'));
  });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbSet(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * The device wrapping key: a non-extractable AES-GCM key generated once and kept in IndexedDB.
 * Retrieved as a CryptoKey (structured-cloned), it stays non-extractable — the raw bytes never
 * become reachable from script, which is what makes the wrapped catalog key "sealed to the device".
 */
async function getDeviceKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>(db, WRAP_KEY_ID);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  await idbSet(db, WRAP_KEY_ID, key);
  return key;
}

/** Persist the encrypted blob + the catalog key (wrapped under the device key), keyed by version. */
export async function writeCatalogCache(
  version: string,
  enc: Uint8Array<ArrayBuffer>,
  keyBytes: Uint8Array<ArrayBuffer>,
): Promise<void> {
  if (!supported()) return;
  try {
    const db = await openDb();
    const deviceKey = await getDeviceKey(db);
    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, deviceKey, keyBytes);
    const record: CatalogRecord = {
      version,
      enc,
      wrappedKey: new Uint8Array(wrapped),
      wrapIv,
    };
    await idbSet(db, CATALOG_ID, record);
    db.close();
  } catch {
    // Cache is a best-effort optimization — a write failure just means no offline copy this run.
  }
}

/** Read the cached blob and unwrap its key. Returns null on any miss / failure (treat as no cache). */
export async function readCatalogCache(): Promise<CachedCatalog | null> {
  if (!supported()) return null;
  try {
    const db = await openDb();
    const [record, deviceKey] = await Promise.all([
      idbGet<CatalogRecord>(db, CATALOG_ID),
      idbGet<CryptoKey>(db, WRAP_KEY_ID),
    ]);
    if (!record || !deviceKey) {
      db.close();
      return null;
    }
    const keyBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: record.wrapIv },
      deviceKey,
      record.wrappedKey,
    );
    db.close();
    return { version: record.version, enc: record.enc, key: new Uint8Array(keyBuf) };
  } catch {
    return null;
  }
}

/** Drop the cached catalog (keeps the device key). Best-effort. */
export async function clearCatalogCache(): Promise<void> {
  if (!supported()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(CATALOG_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}
