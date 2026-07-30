// content/mode.js
//
// Three modes: JP-JP (monolingual, "deep search" is the point of this
// one), JP-EN (Jitendex), and Kanji (KANJIDIC).
//
// Mode is now shared state, backed by chrome.storage.local — not just a
// per-tab variable. This matters now that the toolbar popup exists:
// clicking a mode button there needs to actually reach whichever tab
// you're looking at, and switching mode in one tab shouldn't silently
// have no effect anywhere else. setMode() writes to storage; the
// chrome.storage.onChanged listener at the bottom is what makes every
// open tab (and the popup, if it's open) pick up a change made anywhere
// else — including the popup's own writes.
//
// modePillEl is declared here but created in overlay.js's ensureMounted()
// (it lives in the Shadow DOM overlay.js owns) — overlay.js assigns to
// this same shared binding rather than declaring its own, since both
// files need to agree on one pill element.

const MODES = ['jp-jp', 'jp-en', 'kanji'];
const MODE_LABELS = {
  'jp-jp': '日 JP-JP mode',
  'jp-en': '語 JP-EN mode',
  'kanji': '字 Kanji mode',
};

let currentMode = 'jp-en'; // default until storage read completes, below
let modePillEl = null;

/** persist=false is used by the storage-change listener itself, so
 *  reacting to an external change doesn't immediately write that same
 *  value straight back to storage. */
function setMode(mode, persist = true) {
  if (mode === currentMode) return; // no-op — also what actually prevents
                                     // a write/onChanged/write loop, not persist alone
  currentMode = mode;
  if (modePillEl) {
    modePillEl.textContent = MODE_LABELS[mode];
    modePillEl.classList.add('pulse');
    setTimeout(() => modePillEl && modePillEl.classList.remove('pulse'), 600);
  }
  if (persist) {
    chrome.storage.local.set({ currentMode: mode });
  }
}

function cycleMode() {
  const next = MODES[(MODES.indexOf(currentMode) + 1) % MODES.length];
  setMode(next);
}

// Restore whatever mode was last set (in this tab, another tab, or the
// popup) instead of always starting at the 'jp-en' default.
chrome.storage.local.get('currentMode', (result) => {
  if (result.currentMode && result.currentMode !== currentMode) {
    setMode(result.currentMode, false); // already persisted — don't re-write it
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.currentMode) {
    setMode(changes.currentMode.newValue, false);
  }
});
