// popup/popup.js
//
// Runs as an extension page, not a content script — chrome.storage and
// chrome.runtime.sendMessage work directly here, no injection/isolation
// concerns like content/mode.js has to deal with.
//
// Writing to chrome.storage.local.currentMode is the entire mechanism:
// every open tab's content script has a chrome.storage.onChanged
// listener (content/mode.js) that picks this up and calls its own
// setMode() — this file doesn't talk to tabs directly at all.

const buttons = document.querySelectorAll('.mode-btn');

function setActiveButton(mode) {
  buttons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

chrome.storage.local.get('currentMode', (result) => {
  setActiveButton(result.currentMode || 'jp-en'); // same default as content/mode.js
});

buttons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    setActiveButton(mode); // optimistic — don't wait on the storage round trip
    chrome.storage.local.set({ currentMode: mode });
  });
});

const statusEl = document.getElementById('status');
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
  if (chrome.runtime.lastError || !response) {
    statusEl.textContent = 'Dictionary status unavailable.';
    return;
  }
  const jitendexLine = response.jitendex.imported
    ? `Jitendex: ${response.jitendex.termCount.toLocaleString()} terms`
    : 'Jitendex: not imported yet';
  // KANJIDIC isn't queried live — Kanji mode never goes through the
  // background worker (still a direct content-script fetch), so there's
  // no IndexedDB count to ask for. Static, not an oversight.
  statusEl.innerHTML = `<div>${jitendexLine}</div><div>KANJIDIC: bundled, ~10,384 characters</div>`;
});
