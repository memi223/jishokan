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

  return false;
});
