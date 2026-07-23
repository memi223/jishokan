// utils/extractKanji.js
//
// Shared by both modes: Kanji mode uses it to filter a raw selection down
// to CJK characters; Goi mode uses it to compute which kanji chips to
// show on a resolved word, at render time (architecture v4 §6 — no
// separate field stored on the entry for this).
//
// No build step in this project yet, so this is a plain classic script,
// not an ES module. It's loaded first (see manifest.json's
// content_scripts order) and declares top-level bindings that later
// content script files in the same list can see, the same way multiple
// <script> tags on one page share a global scope. If this project grows
// enough that implicit shared-scope ordering gets hard to track, that's
// the signal to introduce real ES modules or a bundler — not before.

const KANJI_RANGE = /[\u4E00-\u9FFF]/g;

function extractKanji(text) {
  const matches = text.match(KANJI_RANGE) || [];
  return [...new Set(matches)]; // unique, in order of first appearance
}
