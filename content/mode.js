// content/mode.js
//
// Three modes now: JP-JP (monolingual, "deep search" is the point of
// this one), JP-EN (Jitendex — was called "Goi mode" before the split),
// and Kanji (KANJIDIC). In-memory only for now (resets on page reload).
// A real chrome.commands + background badge, per architecture v4 §1, is
// the planned upgrade; the Alt+K listener in selectionDetector.js here
// is a content-script-only stand-in that gets the same UX without
// needing a background worker yet.
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

let currentMode = 'jp-en'; // default — most people want translation first
let modePillEl = null;

function setMode(mode) {
  currentMode = mode;
  if (modePillEl) {
    modePillEl.textContent = MODE_LABELS[mode];
    modePillEl.classList.add('pulse');
    setTimeout(() => modePillEl && modePillEl.classList.remove('pulse'), 600);
  }
}

function cycleMode() {
  const next = MODES[(MODES.indexOf(currentMode) + 1) % MODES.length];
  setMode(next);
}
