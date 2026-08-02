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

  // "Deep search": a selection made INSIDE our own card (e.g. dragging
  // across a word in a JP-JP definition) bubbles up to this same
  // document-level listener via the shadow DOM's normal event flow — no
  // special wiring needed for that part. What DOES need a check: don't
  // reposition the card off a rect that's already inside itself, or it
  // visually "jumps" mid-chain instead of staying anchored while you
  // drill in.
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
    // A fresh manual selection isn't tied to whatever word (if any) was
    // last shown — drop that context so no stale "back" button or
    // sibling row from an unrelated word shows up here. A selection made
    // inside the card itself (browsing sibling chips' own text, say)
    // still counts as "fresh" for this purpose — only a chip click sets
    // this, per overlay.js.
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
  // Alt+K cycles JP-JP -> JP-EN -> Kanji -> JP-JP. Content-script-only
  // stand-in for the chrome.commands + background badge planned in
  // architecture v4 §1.
  if (e.altKey && e.key.toLowerCase() === 'k') {
    cycleMode();
  }
});
