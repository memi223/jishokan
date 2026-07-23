// services/kanji/kanjiIndex.js
//
// REAL data — KANJIDIC2, bundled in the extension at
// dict/kanjidic/normalized.json (see dict/README.md for provenance).
// Lazily fetched once per tab and cached in memory as a Map.
//
// This is what architecture v4 calls KanjiService, minus the IndexedDB
// step it'll eventually use — for now a plain in-memory Map is enough,
// since the whole normalized dataset is only ~2MB and a tab only needs
// to load it once. Swapping the storage backend later doesn't change
// kanjiLookup()'s signature, so nothing that calls it needs to change
// when that happens.

let kanjiIndexPromise = null;

function loadKanjiIndex() {
  if (!kanjiIndexPromise) {
    kanjiIndexPromise = fetch(chrome.runtime.getURL('dict/kanjidic/normalized.json'))
      .then((res) => res.json())
      .then((data) => new Map(data.characters.map((c) => [c.character, c])));
  }
  return kanjiIndexPromise;
}

function kanjiLookup(characters) {
  return loadKanjiIndex().then((index) =>
    characters.map((ch) => index.get(ch)).filter(Boolean),
  );
}
