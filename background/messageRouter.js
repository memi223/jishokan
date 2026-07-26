// background/messageRouter.js
//
// The content-script side (services/dictionary/jitendexProvider.js) sends
// { type: 'WORD_LOOKUP_REQUEST', text }; this answers with
// { type: 'WORD_LOOKUP_RESPONSE', entries }. entries is the score-sorted
// candidate array from db.js's findTerm — empty array means "not found",
// which the content script renders as a soft empty state, not an error.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'WORD_LOOKUP_REQUEST') return false;

  findTerm(message.text)
    .then((entries) => sendResponse({ type: 'WORD_LOOKUP_RESPONSE', entries }))
    .catch((err) => sendResponse({
      type: 'WORD_LOOKUP_RESPONSE',
      entries: [],
      error: { code: 'lookup_failed', message: err.message || String(err) },
    }));

  return true; // keep the message channel open — findTerm() is async
});
