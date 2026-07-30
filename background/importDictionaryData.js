// background/importDictionaryData.js
//
// Runs once (not on every lookup): reads the bundled
// dict/jitendex/normalized.json — via chrome.runtime.getURL(), same-origin
// from the background worker's own context, so unlike content scripts
// this does NOT need a web_accessible_resources entry (that restriction
// gates access from a foreign page's origin, not the extension's own
// background context reading its own bundled files) — and writes it into
// IndexedDB via db.js.

const JITENDEX_DATA_URL = 'dict/jitendex/normalized.json';

// Bumped by hand whenever normalize-jitendex.py's output shape changes,
// so a stale IndexedDB from an older extension version gets re-imported
// rather than silently kept. Not derived from Jitendex's own revision
// date (dropped during normalization) — see dict/README.md if that ever
// needs to change to track upstream Jitendex updates instead.
const IMPORT_FORMAT_VERSION = 1;

async function ensureJitendexImported() {
  const existing = await getMeta('jitendex-import-version');
  if (existing === IMPORT_FORMAT_VERSION) return;

  console.log('[jp-reading-helper] Importing Jitendex into IndexedDB…');
  const res = await fetch(chrome.runtime.getURL(JITENDEX_DATA_URL));
  const data = await res.json();
  await putTermsBulk(data.terms);
  const termCount = Object.keys(data.terms).length;
  await setMeta('jitendex-term-count', termCount); // read back by the
                                                     // popup's status view —
                                                     // O(1), not a live scan
  await setMeta('jitendex-import-version', IMPORT_FORMAT_VERSION);
  console.log(`[jp-reading-helper] Imported ${termCount} Jitendex terms.`);
}

chrome.runtime.onInstalled.addListener(() => {
  ensureJitendexImported().catch((err) => console.error('[jp-reading-helper] Jitendex import failed:', err));
});

// Also attempt on every service-worker startup, not just onInstalled —
// MV3 workers get killed and restarted, and if one happened to die
// mid-import, onInstalled won't fire again on its own. Cheap no-op once
// the stored version already matches.
ensureJitendexImported().catch((err) => console.error('[jp-reading-helper] Jitendex import failed:', err));
