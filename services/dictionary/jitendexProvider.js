// services/dictionary/jitendexProvider.js
//
// Replaces fakeJpEnLookup.js — this is the real thing now. Sends a
// message to the background worker (background/messageRouter.js), which
// queries IndexedDB (background/db.js), populated once from the bundled
// dict/jitendex/normalized.json by background/importDictionaryData.js.
//
// Returns an array of candidate DictionaryEntry objects for the exact
// text given (already score-sorted — see scripts/normalize-jitendex.py).
// An empty array means "not in Jitendex", which is a normal outcome, not
// an error — the caller (selectionDetector.js) renders that as a soft
// empty state, same treatment as Kanji mode's "no kanji in this
// selection".
//
// No deinflection yet: 食べた won't resolve to 食べる here. That's the
// next seam to fill, not something this file works around.

function jitendexLookup(text) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'WORD_LOOKUP_REQUEST', text }, (response) => {
      if (chrome.runtime.lastError) {
        reject({ code: 'message_failed', message: chrome.runtime.lastError.message });
        return;
      }
      if (!response) {
        reject({ code: 'no_response', message: 'No response from the background worker.' });
        return;
      }
      if (response.error) {
        reject(response.error);
        return;
      }
      resolve(response.entries || []);
    });
  });
}
