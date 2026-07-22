// content.js
//
// First vertical slice. On purpose, this file does three things and
// nothing else:
//   1. Detect when the user finishes highlighting text (SelectionDetector)
//   2. Mount a small card in a Shadow DOM root near the selection (Overlay)
//   3. Render idle/loading/success/error states from a FAKE lookup
//
// No background worker, no network, no real dictionary. Those slot in
// later by replacing fakeLookup() with a chrome.runtime message — nothing
// else in this file should need to change when that happens.

(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // 1. Fake dictionary — stand-in for the future DictionaryService.
  //    A handful of real entries so the UI has something to show, plus a
  //    generic fallback so ANY selection demonstrates the full card.
  // ---------------------------------------------------------------------

  const DEMO_ENTRIES = {
    '食べる': {
      reading: 'たべる',
      wordType: { label: 'Ichidan verb', conjugationClass: 'ichidan' },
      jlptLevel: 'N5',
      meanings: ['to eat'],
      exampleSentences: [{ japanese: '朝ごはんを食べる。', translation: 'I eat breakfast.' }],
      kanjiBreakdown: [{ character: '食', meanings: ['eat', 'food'], onyomi: ['ショク'], kunyomi: ['た.べる'] }],
    },
    '大きい': {
      reading: 'おおきい',
      wordType: { label: 'i-adjective', conjugationClass: 'i-adjective' },
      jlptLevel: 'N5',
      meanings: ['big', 'large'],
      exampleSentences: [{ japanese: '大きい犬ですね。', translation: "That's a big dog." }],
      kanjiBreakdown: [{ character: '大', meanings: ['big', 'large'], onyomi: ['ダイ', 'タイ'], kunyomi: ['おお.きい'] }],
    },
    '猫': {
      reading: 'ねこ',
      wordType: { label: 'Noun', conjugationClass: 'noun' },
      jlptLevel: 'N5',
      meanings: ['cat'],
      exampleSentences: [{ japanese: '猫が好きです。', translation: 'I like cats.' }],
      kanjiBreakdown: [{ character: '猫', meanings: ['cat'], onyomi: ['ビョウ'], kunyomi: ['ねこ'] }],
    },
    '学生': {
      reading: 'がくせい',
      wordType: { label: 'Noun', conjugationClass: 'noun' },
      jlptLevel: 'N5',
      meanings: ['student'],
      exampleSentences: [{ japanese: '彼は学生です。', translation: 'He is a student.' }],
      kanjiBreakdown: [
        { character: '学', meanings: ['study', 'learning'], onyomi: ['ガク'], kunyomi: ['まな.ぶ'] },
        { character: '生', meanings: ['life', 'birth'], onyomi: ['セイ'], kunyomi: ['い.きる'] },
      ],
    },
  };

  /**
   * Stand-in for services/dictionary/DictionaryService.lookup().
   * Simulates network latency and returns a normalized-shape entry.
   * Selecting the literal word "error" demonstrates the error state.
   */
  function fakeLookup(text) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (text === 'error') {
          reject({ code: 'demo_error', message: 'Simulated lookup failure.' });
          return;
        }
        const known = DEMO_ENTRIES[text];
        resolve({
          originalText: text,
          reading: known ? known.reading : undefined,
          wordType: known ? known.wordType : undefined,
          jlptLevel: known ? known.jlptLevel : undefined,
          meanings: known ? known.meanings : [`(demo data — "${text}" isn't in the sample set yet)`],
          exampleSentences: known ? known.exampleSentences : [],
          kanjiBreakdown: known ? known.kanjiBreakdown : [],
          isDemoData: true,
        });
      }, 350); // pretend this is a network/IndexedDB round trip
    });
  }

  // ---------------------------------------------------------------------
  // 2. Overlay — Shadow DOM mount, isolated from the host page's CSS.
  // ---------------------------------------------------------------------

  const CARD_STYLES = `
    :host { all: initial; }
    .card {
      position: fixed;
      z-index: 2147483647;
      width: 300px;
      box-sizing: border-box;
      padding: 14px 16px;
      border-radius: 10px;
      border: 1px solid #E4DCC8;
      background: #FAF7F0;
      color: #1F1B16;
      box-shadow: 0 8px 24px rgba(31, 27, 22, 0.16), 0 1px 2px rgba(31, 27, 22, 0.08);
      font-family: -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN", sans-serif;
      font-size: 13px;
      line-height: 1.5;
      opacity: 0;
      transform: translateY(-4px);
      transition: opacity 120ms ease-out, transform 120ms ease-out;
    }
    .card.visible { opacity: 1; transform: translateY(0); }
    @media (prefers-color-scheme: dark) {
      .card {
        border-color: #332C22;
        background: #17140F;
        color: #EDE6D6;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      }
    }
    .head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
    .accent-bar { width: 3px; align-self: stretch; background: #B23A2E; border-radius: 2px; flex-shrink: 0; }
    .headword {
      font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
      font-size: 20px;
      font-weight: 600;
    }
    .reading { color: #7A7368; font-size: 13px; }
    @media (prefers-color-scheme: dark) { .reading { color: #A69C8C; } }
    .badges { display: flex; gap: 6px; margin: 6px 0; flex-wrap: wrap; }
    .badge {
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 999px;
      border: 1px solid #E4DCC8;
      color: #7A7368;
    }
    .badge.jlpt { border-color: #B23A2E; color: #B23A2E; }
    @media (prefers-color-scheme: dark) {
      .badge { border-color: #332C22; color: #A69C8C; }
      .badge.jlpt { border-color: #D1584A; color: #D1584A; }
    }
    .meanings { margin: 8px 0 0; padding-left: 18px; }
    .meanings li { margin-bottom: 2px; }
    .example { margin-top: 8px; padding-top: 8px; border-top: 1px solid #E4DCC8; }
    @media (prefers-color-scheme: dark) { .example { border-color: #332C22; } }
    .example .jp { font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif; }
    .example .en { color: #7A7368; font-size: 12px; }
    @media (prefers-color-scheme: dark) { .example .en { color: #A69C8C; } }
    .kanji-row { display: flex; gap: 6px; margin-top: 10px; }
    .kanji-chip {
      font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
      width: 26px; height: 26px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 6px;
      background: rgba(178, 58, 46, 0.08);
      font-size: 15px;
    }
    .loading, .error { color: #7A7368; }
    .error { color: #B23A2E; }
    @media (prefers-color-scheme: dark) { .loading { color: #A69C8C; } .error { color: #D1584A; } }
    .note { margin-top: 8px; font-size: 11px; color: #7A7368; font-style: italic; }
    @media (prefers-color-scheme: dark) { .note { color: #A69C8C; } }
  `;

  let hostEl = null;
  let shadowRoot = null;
  let cardEl = null;

  function ensureMounted() {
    if (hostEl) return;
    hostEl = document.createElement('div');
    hostEl.id = 'jp-reading-helper-host';
    document.documentElement.appendChild(hostEl);
    shadowRoot = hostEl.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CARD_STYLES;
    shadowRoot.appendChild(style);
    cardEl = document.createElement('div');
    cardEl.className = 'card';
    shadowRoot.appendChild(cardEl);
  }

  function positionCard(rect) {
    const margin = 8;
    const top = Math.min(rect.bottom + margin, window.innerHeight - 20);
    const left = Math.min(Math.max(rect.left, margin), window.innerWidth - 320);
    cardEl.style.top = `${top}px`;
    cardEl.style.left = `${left}px`;
  }

  function show() {
    requestAnimationFrame(() => cardEl.classList.add('visible'));
  }

  function hideCard() {
    if (!cardEl) return;
    cardEl.classList.remove('visible');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------------------------------------------------------------------
  // 3. Render — idle / loading / success / error, matching LookupState.
  // ---------------------------------------------------------------------

  function renderLoading(text) {
    cardEl.innerHTML = `<div class="loading">Looking up "${escapeHtml(text)}"…</div>`;
  }

  function renderError(text, error) {
    cardEl.innerHTML = `<div class="error">Couldn't look up "${escapeHtml(text)}" — ${escapeHtml(error.message || 'unknown error')}</div>`;
  }

  function renderEntry(entry) {
    const badges = [
      entry.jlptLevel ? `<span class="badge jlpt">${escapeHtml(entry.jlptLevel)}</span>` : '',
      entry.wordType ? `<span class="badge">${escapeHtml(entry.wordType.label)}</span>` : '',
    ].join('');

    const meanings = (entry.meanings || [])
      .map((m) => `<li>${escapeHtml(m)}</li>`)
      .join('');

    const example = entry.exampleSentences && entry.exampleSentences[0]
      ? `<div class="example">
           <div class="jp">${escapeHtml(entry.exampleSentences[0].japanese)}</div>
           <div class="en">${escapeHtml(entry.exampleSentences[0].translation || '')}</div>
         </div>`
      : '';

    const kanjiRow = entry.kanjiBreakdown && entry.kanjiBreakdown.length
      ? `<div class="kanji-row">${entry.kanjiBreakdown
          .map((k) => `<div class="kanji-chip" title="${escapeHtml((k.meanings || []).join(', '))}">${escapeHtml(k.character)}</div>`)
          .join('')}</div>`
      : '';

    const note = entry.isDemoData && !DEMO_ENTRIES[entry.originalText]
      ? `<div class="note">demo data — dictionary not connected yet</div>`
      : '';

    cardEl.innerHTML = `
      <div class="head">
        <div class="accent-bar"></div>
        <div>
          <span class="headword">${escapeHtml(entry.originalText)}</span>
          ${entry.reading ? `<span class="reading">${escapeHtml(entry.reading)}</span>` : ''}
        </div>
      </div>
      ${badges ? `<div class="badges">${badges}</div>` : ''}
      <ul class="meanings">${meanings}</ul>
      ${example}
      ${kanjiRow}
      ${note}
    `;
  }

  // ---------------------------------------------------------------------
  // 4. SelectionDetector — mouseup is enough for a first pass: it fires
  //    once, right when the user releases after dragging a selection.
  // ---------------------------------------------------------------------

  let lastText = '';

  function onMouseUp() {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';

    if (!text) {
      hideCard();
      lastText = '';
      return;
    }
    if (text === lastText) return; // same selection, don't re-fire
    lastText = text;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    ensureMounted();
    positionCard(rect);
    renderLoading(text);
    show();

    fakeLookup(text).then(
      (entry) => {
        if (lastText !== text) return; // selection moved on while we "loaded"
        renderEntry(entry);
      },
      (error) => {
        if (lastText !== text) return;
        renderError(text, error);
      },
    );
  }

  function onMouseDown(event) {
    // Dismiss when clicking outside the card (but not when starting a
    // new selection drag inside the page, which onMouseUp handles).
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
    }
  });
})();
