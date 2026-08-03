let lastText = '';

function onMouseUp() {
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : '';

  if (!text || text.length > 16 && currentMode !== 'kanji' || text.length > 128) { // 16 is enough for a japanese word
    hideCard();
    lastText = '';
    return;
  }
  if (text === lastText) return;
  lastText = text;

  const range = selection.getRangeAt(0);

  const selectionInsideCard = cardEl && cardEl.contains(range.commonAncestorContainer);

  ensureMounted();
  if (!selectionInsideCard) {
    positionCard(range.getBoundingClientRect());
  }
  show();

  if (currentMode === 'kanji') {
    const characters = extractKanji(text);
    if (!characters.length) {
      renderKanjiEmpty(text);
      return;
    }
    kanjiChipContext = null;
    renderLoading(text);
    kanjiLookup(characters).then(
      (entries) => { if (lastText === text) renderKanjiList(entries); },
      (error) => { if (lastText === text) renderError(text, error); },
    );
  } else if (currentMode === 'jp-jp') {
    renderLoading(text);
    fakeJpJpLookup(text).then(
      (entry) => { if (lastText === text) renderJpJpEntry(entry); },
      (error) => { if (lastText === text) renderError(text, error); },
    );
  } else {
    renderLoading(text);
    jitendexLookup(text).then(
      (entries) => {
        if (lastText !== text) return;
        if (!entries.length) { renderNoResults(text); return; }
        renderJpEnEntry(entries[0]); // highest-scored candidate; see normalize-jitendex.py
      },
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

  if (e.altKey && e.key.toLowerCase() === 'k') {
    cycleMode();
  }
});
