// content/selectionDetector.js
//
// Entry point — wires together everything loaded before it (see
// manifest.json's content_scripts order: utils/extractKanji.js,
// services/kanji/kanjiIndex.js, services/dictionary/fakeGoiLookup.js,
// content/mode.js, content/overlay.js, then this file last).
//
// mouseup is enough for a first pass: it fires once, right when the
// user releases after dragging a selection.

let lastText = '';

function onMouseUp() {
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : '';

  if (!text) {
    hideCard();
    lastText = '';
    return;
  }
  if (text === lastText) return;
  lastText = text;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  ensureMounted();
  positionCard(rect);
  show();

  if (currentMode === 'kanji') {
    const characters = extractKanji(text);
    if (!characters.length) {
      renderKanjiEmpty(text);
      return;
    }
    renderLoading(text);
    kanjiLookup(characters).then(
      (entries) => { if (lastText === text) renderKanjiList(entries); },
      (error) => { if (lastText === text) renderError(text, error); },
    );
  } else {
    renderLoading(text);
    fakeLookup(text).then(
      (entry) => { if (lastText === text) renderGoiEntry(entry); },
      (error) => { if (lastText === text) renderError(text, error); },
    );
  }
}

function onMouseDown(event) {
  if (hostEl && !event.composedPath().includes(hostEl)) {
    hideCard();
    lastText = '';
  }
}

document.addEventListener('mouseup', onMouseUp);
document.addEventListener('mousedown', onMouseDown);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideCard();
    lastText = '';
    return;
  }
  // Alt+K toggles mode. Content-script-only stand-in for the
  // chrome.commands + background badge planned in architecture v4 §1.
  if (e.altKey && e.key.toLowerCase() === 'k') {
    setMode(currentMode === 'kanji' ? 'goi' : 'kanji');
  }
});
