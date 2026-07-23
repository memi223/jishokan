# Dev slice: two modes, one real, one still fake

**Kanji mode** — select text, it's filtered down to kanji characters
only, each one looked up in **real KANJIDIC2 data** (bundled in the
extension, no network). Try selecting `大きい猫` — only 大 and 猫 get
looked up.

**Goi mode** (語彙, vocabulary) — select a word, see word-level info.
Still `fakeLookup()` — Jitendex isn't wired up yet.

**Alt+K** toggles between them. A small pill in the top-right corner
shows which mode is active (this is a content-script stand-in for the
real `chrome.commands` + toolbar badge planned in the architecture doc —
see below).

## Try it

1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder
2. Default mode is **Goi**. Select `食べる`, `大きい`, `猫`, or `学生` for
   real demo entries; anything else shows the generic fallback card;
   select the word `error` to see the error state.
3. Press **Alt+K** to switch to **Kanji mode**. Select any text with
   kanji in it — this one's real, pulled straight from
   `dict/kanjidic/normalized.json`. Try characters you didn't already
   see, like `食` from 食べる, or something unrelated like `新聞`.
4. In Goi mode, the small character chip(s) under a word's meanings are
   clickable — tapping one jumps into Kanji mode and looks that
   character up directly, without needing Alt+K.
5. Click outside the card, or press Escape, to dismiss it.

## File layout

No bundler yet — six plain `<script>`-style files, loaded in dependency
order straight from `manifest.json`'s `content_scripts.js` array, sharing
one global scope the same way multiple `<script>` tags on a page do:

```
utils/extractKanji.js               → services/kanji/kanjiIndex.js
→ services/dictionary/fakeGoiLookup.js → content/mode.js
→ content/overlay.js → content/selectionDetector.js (entry point, loads last)
```

`services/dictionary/fakeGoiLookup.js` is the one file in here that's
explicitly temporary — it gets deleted, not refactored, once Jitendex is
normalized and there's a real `DictionaryProvider` to call instead.
Folders that don't have real code yet (`background/`, a real
`services/dictionary/providers/`, anything TypeScript) don't exist in the
repo — they show up when there's something to put in them, not before.

## One trade-off worth knowing about

`manifest.json` now declares `dict/kanjidic/normalized.json` as a
**web-accessible resource**, which is the only way a content script (not
just an extension page) can `fetch()` a bundled file — confirmed against
Chrome's current docs, not assumed. The real cost: this also makes that
file fetchable by scripts on any page you visit, which is a minor
fingerprinting surface (a site could detect this extension is installed).
For a personal local dictionary, low stakes — but if this ever moves to
a background worker doing the lookup instead (per the architecture doc's
original plan), that requirement goes away entirely, since a background
worker can read its own bundled files without `web_accessible_resources`
at all.

## What's deliberately not here yet

- Goi mode's real dictionary (Jitendex) — `fakeLookup()` is still the
  seam where a real message to a background worker replaces the
  `setTimeout`.
- Background service worker / message passing for either mode. Kanji
  mode fetches its bundled JSON directly in the content script for now —
  simplest thing that works, not the final architecture.
- Real `chrome.commands` + toolbar badge for mode switching (Alt+K here
  is a page-focused keydown listener, not a true global shortcut).
- Deinflection (食べた won't resolve to 食べる in Goi mode yet).

## Architecture docs

See `docs/architecture-v4.md` (and v1–v3 for how we got here) for the
full design this is one slice of.
