// background/db.js
//
// Thin promise wrapper over IndexedDB — the actual DictionaryProvider
// storage backend the architecture docs planned (LocalDictionaryStore),
// now that Jitendex's 279k terms made the KANJIDIC-style "fetch the
// whole JSON into a content-script Map" approach genuinely unworkable
// (68MB parsed per tab vs. KANJIDIC's 2MB).
//
// Two object stores: 'terms' (term -> array of DictionaryEntry-shaped
// candidates, already sorted by score) and 'meta' (small key/value
// bookkeeping — currently just the imported data's format version).

const DB_NAME = 'jp-reading-helper';
const DB_VERSION = 1;
const TERMS_STORE = 'terms';
const META_STORE = 'meta';

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
