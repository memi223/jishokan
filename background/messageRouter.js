// background/messageRouter.js
//
// The content-script side (services/dictionary/jitendexProvider.js) sends
// { type: 'WORD_LOOKUP_REQUEST', text }; this answers with
// { type: 'WORD_LOOKUP_RESPONSE', entries }. entries is the score-sorted
// candidate array from db.js's findTerm — empty array means "not found",
// which the content script renders as a soft empty state, not an error.
//
// The popup sends { type: 'GET_STATUS' } to show real Jitendex numbers —
// KANJIDIC's count isn't tracked here since Kanji mode never goes through
// the background worker at all (still a direct content-script fetch), so
// that line in the popup is a static note, not a live query. Real
// asymmetry, not an oversight — see README's "Why JP-EN loads
// differently" section.
//
// STORE_FILE / GET_FILE move an uploaded PDF's raw bytes from the popup
// (where the file input lives) to the reader tab (a completely separate
// execution context that can't just hold a reference to the popup's File
// object — the popup closes the moment chrome.tabs.create() opens the new
// tab). The bytes travel as base64 strings (see utils/base64.js), not a
// raw ArrayBuffer directly — Chrome's extension messaging uses JSON
// serialization for chrome.runtime.sendMessage, not structured clone like
// other browsers, and JSON.stringify(anArrayBuffer) silently produces
// "{}". Confirmed against Chrome's own docs after a real user hit exactly
// that failure, not assumed up front.

function generateFileId() {
  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return false;

  if (message.type === 'WORD_LOOKUP_REQUEST') {
    findTerm(message.text)
      .then((entries) => sendResponse({ type: 'WORD_LOOKUP_RESPONSE', entries }))
      .catch((err) => sendResponse({
        type: 'WORD_LOOKUP_RESPONSE',
        entries: [],
        error: { code: 'lookup_failed', message: err.message || String(err) },
      }));
    return true; // keep the message channel open — findTerm() is async
  }

  if (message.type === 'GET_STATUS') {
    Promise.all([getMeta('jitendex-term-count'), getMeta('jitendex-import-version')])
      .then(([termCount, importVersion]) => sendResponse({
        type: 'STATUS_RESPONSE',
        jitendex: { termCount: termCount || 0, imported: importVersion !== undefined },
      }))
      .catch((err) => sendResponse({
        type: 'STATUS_RESPONSE',
        jitendex: { termCount: 0, imported: false },
        error: { code: 'status_failed', message: err.message || String(err) },
      }));
    return true;
  }

  if (message.type === 'STORE_FILE') {
    console.log('[messageRouter.js] STORE_FILE received data (base64 string now):', typeof message.data, 'length:', message.data?.length);
    const fileId = generateFileId();
    // message.data arrives as a base64 string (see utils/base64.js) — decode
    // back to a real ArrayBuffer before it goes into IndexedDB, which
    // stores ArrayBuffer natively and correctly on its own.
    const arrayBuffer = base64ToArrayBuffer(message.data);
    storeFile(fileId, message.filename, arrayBuffer)
      .then(() => sendResponse({ type: 'FILE_STORED', fileId }))
      .catch((err) => sendResponse({
        type: 'FILE_STORED',
        fileId: null,
        error: { code: 'store_failed', message: err.message || String(err) },
      }));
    return true;
  }

  if (message.type === 'GET_FILE') {
    getFile(message.fileId)
      .then((file) => {
        if (!file) {
          sendResponse({ type: 'FILE_RESPONSE', file: null });
          return;
        }
        console.log('[messageRouter.js] GET_FILE retrieved from IndexedDB, data constructor:', file.data?.constructor?.name, 'byteLength:', file.data?.byteLength);
        // Encode back to base64 for the trip back across sendMessage — the
        // real ArrayBuffer from IndexedDB would otherwise arrive as {} on
        // the reader side, same bug as the STORE_FILE direction.
        sendResponse({
          type: 'FILE_RESPONSE',
          file: { id: file.id, filename: file.filename, data: arrayBufferToBase64(file.data), storedAt: file.storedAt },
        });
      })
      .catch((err) => sendResponse({
        type: 'FILE_RESPONSE',
        file: null,
        error: { code: 'get_file_failed', message: err.message || String(err) },
      }));
    return true;
  }

  return false;
});
