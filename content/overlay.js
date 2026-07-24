// content/overlay.js
//
// Shadow DOM mount, isolated from the host page's CSS, plus every render
// function for both modes. Depends on extractKanji (utils/extractKanji.js),
// currentMode/setMode (content/mode.js), and kanjiLookup
// (services/kanji/kanjiIndex.js) — must load after all three; see
// manifest.json's content_scripts order.

const STYLES = `
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
  .kanji-row { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
  .kanji-chip {
    box-sizing: border-box;
    font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
    width: 26px; height: 26px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 6px;
    background: rgba(178, 58, 46, 0.08);
    font-size: 15px;
    cursor: pointer;
    border: 1px solid transparent;
    color: inherit;
    padding: 0;
  }
  .kanji-chip:hover { background: rgba(178, 58, 46, 0.18); }
  .kanji-chip.active { border-color: #B23A2E; background: rgba(178, 58, 46, 0.18); }
  @media (prefers-color-scheme: dark) { .kanji-chip.active { border-color: #D1584A; } }
  .back-button {
    display: block;
    border: none;
    background: none;
    padding: 0 0 8px;
    margin: 0;
    font-family: -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN", sans-serif;
    font-size: 12px;
    color: #7A7368;
    cursor: pointer;
  }
  .back-button:hover { color: #B23A2E; }
  @media (prefers-color-scheme: dark) {
    .back-button { color: #A69C8C; }
    .back-button:hover { color: #D1584A; }
  }
  .loading, .error { color: #7A7368; }
  .error { color: #B23A2E; }
  @media (prefers-color-scheme: dark) { .loading { color: #A69C8C; } .error { color: #D1584A; } }
  .note { margin-top: 8px; font-size: 11px; color: #7A7368; font-style: italic; }
  @media (prefers-color-scheme: dark) { .note { color: #A69C8C; } }

  /* Kanji mode: list of characters instead of one headword */
  .kanji-entry + .kanji-entry { margin-top: 10px; padding-top: 10px; border-top: 1px solid #E4DCC8; }
  @media (prefers-color-scheme: dark) { .kanji-entry + .kanji-entry { border-color: #332C22; } }
  .kanji-entry-head { display: flex; align-items: baseline; gap: 10px; }
  .kanji-entry-char {
    font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
    font-size: 26px;
    font-weight: 600;
  }
  .kanji-entry-readings { font-size: 12px; color: #7A7368; }
  @media (prefers-color-scheme: dark) { .kanji-entry-readings { color: #A69C8C; } }
  .kanji-entry-meanings { font-size: 12px; margin-top: 2px; }
  .hanviet { color: #B23A2E; }
  @media (prefers-color-scheme: dark) { .hanviet { color: #D1584A; } }

  /* Mode indicator pill, fixed top-right of the viewport */
  .mode-pill {
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 2147483647;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(31, 27, 22, 0.55);
    color: #FAF7F0;
    font-family: -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN", sans-serif;
    font-size: 11px;
    opacity: 0.35;
    transition: opacity 150ms ease-out;
    pointer-events: none;
  }
  .mode-pill.pulse { opacity: 0.9; }
`;

let hostEl = null;
let shadowRoot = null;
let cardEl = null;

// lastGoiEntry: the most recently rendered Goi-mode entry — what "back"
// returns to. kanjiChipContext: the sibling kanji characters to show as
// a chip row while browsing Kanji mode, set when arriving via a Goi
// word's chip (or a sibling chip within that same context), cleared on
// any fresh, unrelated selection (see selectionDetector.js).
let lastGoiEntry = null;
let kanjiChipContext = null;

function ensureMounted() {
  if (hostEl) return;
  hostEl = document.createElement('div');
  hostEl.id = 'jp-reading-helper-host';
  document.documentElement.appendChild(hostEl);
  shadowRoot = hostEl.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadowRoot.appendChild(style);

  cardEl = document.createElement('div');
  cardEl.className = 'card';
  shadowRoot.appendChild(cardEl);

  modePillEl = document.createElement('div'); // shared binding from content/mode.js
  modePillEl.className = 'mode-pill';
  modePillEl.textContent = currentMode === 'kanji' ? '字 Kanji mode' : '語 Goi mode';
  shadowRoot.appendChild(modePillEl);

  // Clicking a kanji chip anywhere in the card (Goi mode's lightweight
  // links, or a sibling chip while already browsing Kanji mode) switches
  // to Kanji mode and looks that single character up. Clicking "back"
  // returns to the Goi entry that led here.
  cardEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="back-to-goi"]')) {
      if (lastGoiEntry) {
        setMode('goi');
        renderGoiEntry(lastGoiEntry);
      }
      return;
    }

    const chip = e.target.closest('[data-kanji-char]');
    if (!chip) return;
    const char = chip.getAttribute('data-kanji-char');

    // A chip straight off a Goi word establishes the sibling context;
    // a chip clicked while already browsing siblings keeps it as-is.
    if (chip.hasAttribute('data-from-goi') && lastGoiEntry) {
      kanjiChipContext = extractKanji(lastGoiEntry.dictionaryForm || lastGoiEntry.originalText);
    }

    setMode('kanji');
    renderLoading(char);
    kanjiLookup([char])
      .then((entries) => renderKanjiList(entries, { active: char, siblings: kanjiChipContext }))
      .catch((err) => renderError(char, err));
  });
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
// Render — idle / loading / success / error for both modes.
// ---------------------------------------------------------------------

function renderLoading(text) {
  cardEl.innerHTML = `<div class="loading">Looking up "${escapeHtml(text)}"…</div>`;
}

function renderError(text, error) {
  cardEl.innerHTML = `<div class="error">Couldn't look up "${escapeHtml(text)}" — ${escapeHtml((error && error.message) || 'unknown error')}</div>`;
}

function renderKanjiEmpty(text) {
  cardEl.innerHTML = `<div class="loading">No kanji found in "${escapeHtml(text)}".</div>`;
}

function kanjiChipsRow(characters, options) {
  if (!characters.length) return '';
  const fromGoi = options && options.fromGoi;
  const activeChar = options && options.active;
  return `<div class="kanji-row">${characters
    .map((ch) => {
      const classes = ['kanji-chip', ch === activeChar ? 'active' : ''].filter(Boolean).join(' ');
      const fromGoiAttr = fromGoi ? 'data-from-goi="true"' : '';
      return `<button class="${classes}" data-kanji-char="${escapeHtml(ch)}" ${fromGoiAttr} title="Look up ${escapeHtml(ch)} in Kanji mode">${escapeHtml(ch)}</button>`;
    })
    .join('')}</div>`;
}

/** Goi mode: one word. */
function renderGoiEntry(entry) {
  lastGoiEntry = entry; // what a later "back" button in Kanji mode returns to

  const badges = [
    entry.jlptLevel ? `<span class="badge jlpt">${escapeHtml(entry.jlptLevel)}</span>` : '',
    entry.wordType ? `<span class="badge">${escapeHtml(entry.wordType.label)}</span>` : '',
  ].join('');

  const meanings = (entry.meanings || []).map((m) => `<li>${escapeHtml(m)}</li>`).join('');

  const example = entry.exampleSentences && entry.exampleSentences[0]
    ? `<div class="example">
         <div class="jp">${escapeHtml(entry.exampleSentences[0].japanese)}</div>
         <div class="en">${escapeHtml(entry.exampleSentences[0].translation || '')}</div>
       </div>`
    : '';

  // Lightweight kanji links — computed here, not stored on the entry
  // (architecture v4 §6). Click one to jump into Kanji mode for it.
  const kanjiChips = kanjiChipsRow(extractKanji(entry.dictionaryForm || entry.originalText), { fromGoi: true });

  const note = entry.isDemoData && !DEMO_ENTRIES[entry.originalText]
    ? `<div class="note">demo data — Jitendex not connected yet</div>`
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
    ${kanjiChips}
    ${note}
  `;
}

/** Kanji mode: one or more characters, each its own compact entry. Real KANJIDIC2 data.
 *  context (optional): { active: string, siblings: string[] | null } — when
 *  present and lastGoiEntry is set, shows a "back to <word>" button and a
 *  chip row for jumping between the other kanji from that same word.
 */
function renderKanjiList(entries, context) {
  if (!entries.length) {
    cardEl.innerHTML = `<div class="loading">No data found for that kanji.</div>`;
    return;
  }

  const ctx = context || {};
  const backButton = ctx.siblings && lastGoiEntry
    ? `<button class="back-button" data-action="back-to-goi">← back to ${escapeHtml(lastGoiEntry.originalText)}</button>`
    : '';
  const siblingRow = ctx.siblings && ctx.siblings.length > 1
    ? kanjiChipsRow(ctx.siblings, { active: ctx.active })
    : '';

  const entriesHtml = entries
    .map((k) => {
      const readings = [k.onyomi.join('、'), k.kunyomi.join('、')].filter(Boolean).join('  ·  ');
      const hanViet = k.hanViet && k.hanViet.length
        ? `<span class="hanviet"> — ${escapeHtml(k.hanViet.join(', '))}</span>`
        : '';
      const meta = [
        k.strokeCount ? `${k.strokeCount} strokes` : '',
        k.grade ? `grade ${k.grade}` : '',
      ].filter(Boolean).join(' · ');
      return `
        <div class="kanji-entry">
          <div class="kanji-entry-head">
            <span class="kanji-entry-char">${escapeHtml(k.character)}</span>
            <span class="kanji-entry-readings">${escapeHtml(readings)}${hanViet}</span>
          </div>
          <div class="kanji-entry-meanings">${escapeHtml(k.meanings.join(', '))}</div>
          ${meta ? `<div class="note">${escapeHtml(meta)}</div>` : ''}
        </div>
      `;
    })
    .join('');

  cardEl.innerHTML = `${backButton}${siblingRow}${entriesHtml}`;
}
