// background/db.js
//
// Thin promise wrapper over IndexedDB — the actual DictionaryProvider
// storage backend the architecture docs planned (LocalDictionaryStore),
// now that Jitendex's 279k terms made the KANJIDIC-style "fetch the
// whole JSON into a content-script Map" approach genuinely unworkable
// (68MB parsed per tab vs. KANJIDIC's 2MB).
//
// Three object stores: 'terms' (Jitendex, term -> candidate array),
// 'meta' (small key/value bookkeeping), and 'files' (uploaded PDFs —
// see importDictionaryData.js's counterpart for the reader feature).
//
// DB_VERSION bumped to 2 for the 'files' store — onupgradeneeded's
// per-store existence checks mean this runs safely whether someone's
// IndexedDB is fresh or already has 'terms'/'meta' from before.

const DB_NAME = 'jp-reading-helper';
const DB_VERSION = 2;
const TERMS_STORE = 'terms';
const META_STORE = 'meta';
const FILES_STORE = 'files';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TERMS_STORE)) {
        db.createObjectStore(TERMS_STORE, { keyPath: 'term' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getMeta(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
    req.onerror = () => reject(req.error);
  });
}

async function setMeta(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** termsObj: { [term]: DictionaryEntry[] } — one bulk transaction, not
 *  279k individual ones, so the one-time import doesn't crawl. */
async function putTermsBulk(termsObj) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TERMS_STORE, 'readwrite');
    const store = tx.objectStore(TERMS_STORE);
    for (const term in termsObj) {
      store.put({ term, entries: termsObj[term] });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Returns the candidate DictionaryEntry array for a term (already
 *  score-sorted by the normalizer), or [] if not found — "not found" is
 *  an expected, common outcome here, not an error. */
async function findTerm(text) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(TERMS_STORE, 'readonly').objectStore(TERMS_STORE).get(text);
    req.onsuccess = () => resolve(req.result ? req.result.entries : []);
    req.onerror = () => reject(req.error);
  });
}

/** data: ArrayBuffer (the raw file bytes) — how a popup-uploaded PDF
 *  reaches the reader tab, which runs in a completely separate context
 *  and can't just read a File object the popup already closed over. */
async function storeFile(id, filename, data) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, 'readwrite');
    tx.objectStore(FILES_STORE).put({ id, filename, data, storedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Returns { id, filename, data, storedAt } or undefined if the id is
 *  unknown (e.g. a stale reader tab URL from a previous session — no
 *  cleanup of old files happens yet, see README). */
async function getFile(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FILES_STORE, 'readonly').objectStore(FILES_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
