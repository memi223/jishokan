# Dev slice: three modes, two real, one still fake

**Kanji mode** — select text, it's filtered down to kanji characters
only, each one looked up in **real KANJIDIC2 data** (bundled directly in
the extension). Try selecting `大きい猫` — only 大 and 猫 get looked up.

**JP-EN mode** — select a word, see English meanings from **real
Jitendex data** — but loaded very differently from Kanji mode, see below.
Not deinflected yet: 食べた won't resolve to 食べる.

**JP-JP mode** — select a word, see a monolingual Japanese definition.
Still fake — no JP-JP dictionary source picked yet. The interesting part:
select text *inside* the definition itself and it chains into another
JP-JP lookup ("deep search") — same selection listener, no special
wiring for it, since Shadow DOM selections bubble normally.

**Alt+K** cycles through all three (JP-EN → Kanji → JP-JP → JP-EN...), or
click the toolbar icon for a small popup with mode buttons and live
dictionary status — both write to the same `chrome.storage.local` key, so
switching mode from either place instantly updates every open tab, not
just the current one. A small pill in the top-right corner of the page
shows which mode is active there. The one thing still not real: Alt+K
itself is a page-focused `keydown` listener, not Chrome's actual
`chrome.commands` global-shortcut API — see "What's deliberately not
here yet" below.

## Before you load this

`dict/jitendex/normalized.json` isn't in this repo/zip — it's ~65MB,
gitignored, and regeneratable. Without it, the background worker's
one-time import silently has nothing to import and JP-EN mode will come
back empty for everything. Get it via:

```
unzip jitendex-yomitan.zip -d /tmp/jitendex-extracted
python3 scripts/normalize-jitendex.py /tmp/jitendex-extracted dict/jitendex/normalized.json
```

(`jitendex-yomitan.zip` from jitendex.org → Downloads → Yomitan format —
see `dict/README.md` for the full pipeline.) Then reload the unpacked
extension so the background worker's `onInstalled` fires again.

## Try it

1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder
2. Default mode is **JP-EN**. Select `食べる`, `学生`, `大きい`, `猫`, or
   any other real word — this is genuine Jitendex data now, not a demo
   set. Select something not in any dictionary to see the soft "no
   entry" state (distinct from an actual error).
3. Press **Alt+K** twice to reach **JP-JP mode**. Select `学生` — its
   definition is 学校で勉強している人。大学生や高校生も学生と呼ぶ。 — then
   drag-select the `学生` inside that definition. It re-looks-up `学生`
   in place, without the card jumping to a new position.
4. Press **Alt+K** once more for **Kanji mode**. Select any text with
   kanji in it — pulled from `dict/kanjidic/normalized.json`.
5. In either JP-EN or JP-JP mode, the character chip(s) under a word are
   clickable — tapping one jumps into Kanji mode for that character, with
   a back button to return to whichever word mode you came from.
6. Click outside the card, or press Escape, to dismiss it.

## PDF reader

The toolbar popup has a file input now: pick a PDF, and it opens in a new
tab as plain web text — real DOM, not a rendered PDF page — so the exact
same highlighting/lookup machinery works on it immediately, in all three
modes. That's the whole feature: no new lookup logic, no new overlay
code, just getting book-length Japanese text into a form the existing
system already knows how to handle.

How the file actually gets from the popup (where you pick it) to the
reader tab (a completely separate page that doesn't exist yet at the
moment you pick the file): the popup reads it as an `ArrayBuffer`,
base64-encodes it (`utils/base64.js`), and sends it to the background
worker (`STORE_FILE`), which decodes it back to a real `ArrayBuffer` and
puts it in IndexedDB, handing back an id; the popup opens
`reader/index.html?fileId=<id>`, and the reader page asks the background
worker for that same file back (`GET_FILE`, base64-encoded again for the
return trip). The base64 step isn't decoration — **a real user hit this
exactly**: Chrome's extension messaging serializes with JSON, not
structured clone like other browsers
(confirmed against Chrome's own current docs), and `JSON.stringify(anArrayBuffer)`
is silently `"{}"`. First version of this feature sent the raw
`ArrayBuffer` and broke exactly that way in practice. Fixed and
re-verified through a test that actually simulates Chrome's real
JSON-round-trip behavior (my first version of this test didn't, which is
exactly why it didn't catch the bug before a real person hit it) —
reproduces the original failure on a raw `ArrayBuffer`, then confirms the
base64 fix survives the identical boundary byte-for-byte.

Text extraction is [PDF.js](https://github.com/mozilla/pdf.js)
(Apache-2.0), vendored directly in `vendor/pdfjs/` — not from npm/a CDN,
just the three pieces text extraction actually needs (~3.3MB total, see
`vendor/pdfjs/README.md`): the library, its worker, and the CJK character
maps real Japanese PDFs often need to decode text correctly at all.

**What's still unverified, honestly:** whether the PDF.js worker loads
via `chrome.runtime.getURL()` without needing a `web_accessible_resources`
entry (expected, same same-origin reasoning already confirmed for the
background worker's own resource access — just not yet observed for a
`Worker` specifically), and whether real Japanese PDF text extracts
cleanly once the data actually reaches PDF.js now. Next real test: try
the same PDF again.

**Known gap**: no separator between text items within a page, since
Japanese doesn't use spaces between words — but that also means no line
or paragraph breaks yet either; each page currently renders as one
continuous block. Also no cleanup of old uploaded files from IndexedDB —
they accumulate.

## File layout

```
utils/extractKanji.js → services/kanji/kanjiIndex.js
→ services/dictionary/jitendexProvider.js → services/dictionary/fakeJpJpLookup.js
→ content/mode.js → content/overlay.js → content/selectionDetector.js (entry point)

background/index.js → background/db.js → background/importDictionaryData.js
→ background/messageRouter.js

popup/index.html + popup/popup.js — independent extension page, opened by
manifest.json's action.default_popup, not part of either load chain above

reader/index.html — loads the SAME utils/services/content scripts above,
then reader/reader.js (an ES module, the one exception to "no bundler,
classic scripts everywhere" — isolated to this one page, needed because
vendor/pdfjs/pdf.min.mjs is itself an ES module)
```

Two loading strategies, on purpose, not by accident — see "Why JP-EN
loads differently" below. `services/dictionary/fakeJpJpLookup.js` is
still explicitly temporary; it gets deleted, not refactored, once a
JP-JP source is picked. Folders that don't have real code yet (a real
`services/dictionary/providers/` for whichever JP-JP source shows up,
anything TypeScript) don't exist in the repo — they show up when there's
something to put in them.

## Why JP-EN loads differently than Kanji mode

Kanji mode fetches its bundled JSON directly in the content script — fine
at KANJIDIC's ~2MB. Jitendex normalizes to **~65MB** (≈279,000 unique
terms vs. ~10,000 kanji characters) — parsing that synchronously per tab,
duplicated across every open tab, was never going to be "lightweight." So
JP-EN mode uses the architecture the docs always planned for eventually:
`background/importDictionaryData.js` fetches the bundled file **once**,
on install, and writes it into **IndexedDB**; lookups go through
`chrome.runtime.sendMessage` to the background worker instead of a direct
fetch. One real, concrete benefit that falls out of this: unlike
`dict/kanjidic/normalized.json`, `dict/jitendex/normalized.json` does
**not** need a `web_accessible_resources` manifest entry — that
restriction gates access from a foreign page's origin, and the background
worker reading its own bundled file is same-origin regardless of that
declaration.

## Two other trade-offs worth knowing about

**Web-accessible resources (Kanji mode only, now).** `manifest.json`
still declares `dict/kanjidic/normalized.json` as web-accessible, since
Kanji mode still fetches it directly from the content script — meaning
that file is fetchable by scripts on any page you visit, a minor
fingerprinting surface. Migrating Kanji mode behind the background worker
too (like JP-EN now) would remove this, but it's real working code today
and hasn't been touched — flagging it as a reasonable next cleanup, not
doing it unprompted.

**Deep search's positioning guard.** `selectionDetector.js` skips
repositioning the card when a new selection's `commonAncestorContainer`
is inside `cardEl` itself — otherwise chaining a lookup from inside a
definition would make the card jump to wherever that inner text happens
to sit. Verified in a simulation, not yet tried in a real browser — worth
confirming `window.getSelection()` faithfully reports open-shadow-root
selections the way Chromium is expected to.

## What's deliberately not here yet

- JP-JP's real dictionary — source not picked. `fakeJpJpLookup()` is the
  seam where a real message to the background worker replaces the
  `setTimeout`, same pattern JP-EN just went through.
- Deinflection (食べた won't resolve to 食べる in JP-EN/JP-JP yet).
- Real `chrome.commands` global shortcut for mode switching (Alt+K here
  is still a page-focused `keydown` listener — mode *state* is now
  properly shared via `chrome.storage`, but the key-capture mechanism
  itself isn't Chrome's actual global-shortcut API yet, so it still only
  works while a page has focus).
- `wordType.label` on Jitendex entries is the raw JMdict tag (`"v1"`),
  not a human-readable label — needs Jitendex's `tag_bank_1.json`, not
  done in this pass.
- Kanji mode migrated behind the background worker too (see above).

## Architecture docs

See `docs/architecture-v4.md` (and v1–v3 for how we got here) for the
full design this is one slice of.
