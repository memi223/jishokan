// utils/base64.js
//
// Chrome's extension messaging (chrome.runtime.sendMessage) uses JSON
// serialization, not the structured clone algorithm other browsers use
// for the same API — confirmed against Chrome's own current docs, not
// assumed (developer.chrome.com/docs/extensions/develop/concepts/messaging).
// JSON.stringify(someArrayBuffer) produces "{}", since ArrayBuffer has no
// enumerable own properties — exactly the empty-object bug this project
// hit shipping a PDF's bytes through STORE_FILE/GET_FILE.
//
// Scope: this is ONLY needed at points that actually cross
// chrome.runtime.sendMessage. IndexedDB storage (background/db.js) is
// native structured clone within a single context and was never the
// problem — ArrayBuffer goes in and out of IndexedDB untouched.
//
// chunkSize avoids "Maximum call stack size exceeded" from
// String.fromCharCode.apply(null, hugeArray) on large files.

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
