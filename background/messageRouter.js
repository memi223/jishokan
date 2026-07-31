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
// tab). The ArrayBuffer travels through chrome.runtime's structured-clone
// messaging directly — no base64 round trip needed, unlike some older
// messaging APIs that were JSON-only.

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
    const fileId = generateFileId();
    storeFile(fileId, message.filename, message.data)
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
      .then((file) => sendResponse({ type: 'FILE_RESPONSE', file: file || null }))
      .catch((err) => sendResponse({
        type: 'FILE_RESPONSE',
        file: null,
        error: { code: 'get_file_failed', message: err.message || String(err) },
      }));
    return true;
  }

  return false;
});
