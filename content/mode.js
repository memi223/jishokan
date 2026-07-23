// content/mode.js
//
// Mode state — in-memory only for now (resets on page reload). A real
// chrome.commands + background badge, per architecture v4 §1, is the
// planned upgrade; the Alt+K listener in selectionDetector.js here is a
// content-script-only stand-in that gets the same UX without needing a
// background worker yet.
//
// modePillEl is declared here but created in overlay.js's ensureMounted()
// (it lives in the Shadow DOM overlay.js owns) — overlay.js assigns to
// this same shared binding rather than declaring its own, since both
// files need to agree on one pill element.

let currentMode = 'goi'; // 'kanji' | 'goi'
let modePillEl = null;

function setMode(mode) {
  currentMode = mode;
  if (modePillEl) {
    modePillEl.textContent = mode === 'kanji' ? '字 Kanji mode' : '語 Goi mode';
    modePillEl.classList.add('pulse');
    setTimeout(() => modePillEl && modePillEl.classList.remove('pulse'), 600);
  }
}
