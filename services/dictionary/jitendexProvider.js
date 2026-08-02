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
