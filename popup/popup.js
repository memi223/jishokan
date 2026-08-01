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

// --- PDF upload -> reader tab ---
//
// The file's bytes go to the background worker (STORE_FILE), not
// straight to a new tab — chrome.tabs.create() only takes a URL, there's
// no way to hand a File object to a tab that doesn't exist yet, and this
// popup closes the instant the new tab opens anyway. The reader tab asks
// the background worker for the same file back by the id this returns.

const fileInput = document.getElementById('file-input');
const uploadStatusEl = document.getElementById('upload-status');

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;

  uploadStatusEl.textContent = 'Reading file…';
  let data;
  try {
    data = await file.arrayBuffer();
  } catch (err) {
    uploadStatusEl.textContent = `Couldn't read the file: ${err.message}`;
    return;
  }
  console.log('[popup.js] about to send data:', data, 'constructor:', data?.constructor?.name, 'byteLength:', data?.byteLength);

  uploadStatusEl.textContent = 'Opening reader…';
  chrome.runtime.sendMessage({ type: 'STORE_FILE', filename: file.name, data }, (response) => {
    if (chrome.runtime.lastError || !response || !response.fileId) {
      const reason = (response && response.error && response.error.message) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'unknown error';
      uploadStatusEl.textContent = `Couldn't open reader: ${reason}`;
      return;
    }
    chrome.tabs.create({ url: chrome.runtime.getURL(`reader/index.html?fileId=${response.fileId}`) });
    window.close(); // this popup's job is done — the reader tab takes over
  });
});
