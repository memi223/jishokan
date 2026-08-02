let kanjiIndexPromise = null;

function loadKanjiIndex() {
  if (!kanjiIndexPromise) {
    kanjiIndexPromise = fetch(chrome.runtime.getURL('dict/kanjidic/kanjidic-normalized.json'))
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
