# Dev slice: three modes, one real, two still fake

**Kanji mode** — select text, it's filtered down to kanji characters
only, each one looked up in **real KANJIDIC2 data** (bundled in the
extension, no network). Try selecting `大きい猫` — only 大 and 猫 get
looked up.

**JP-EN mode** — select a word, see English meanings. Still fake data —
Jitendex isn't wired up yet.

**JP-JP mode** — select a word, see a monolingual Japanese definition.
Also fake — no JP-JP dictionary source picked yet. The interesting part:
select text *inside* the definition itself and it chains into another
JP-JP lookup ("deep search") — same selection listener, no special
wiring for it, since Shadow DOM selections bubble normally.

**Alt+K** cycles through all three (JP-EN → Kanji → JP-JP → JP-EN...). A
small pill in the top-right corner shows which mode is active (this is a
content-script stand-in for the real `chrome.commands` + toolbar badge
planned in the architecture doc — see below).

## Try it

1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder
2. Default mode is **JP-EN**. Select `食べる`, `大きい`, `猫`, or `学生`
   for real demo entries; anything else shows the generic fallback card;
   select the word `error` to see the error state.
3. Press **Alt+K** twice to reach **JP-JP mode**. Select `学生` — its
   definition is 学校で勉強している人。大学生や高校生も学生と呼ぶ。 — then
   drag-select the `学生` inside that definition. It re-looks-up `学生`
   in place, without the card jumping to a new position.
4. Press **Alt+K** once more for **Kanji mode**. Select any text with
   kanji in it — this one's real, pulled from `dict/kanjidic/normalized.json`.
5. In either JP-EN or JP-JP mode, the character chip(s) under a word are
   clickable — tapping one jumps into Kanji mode for that character, with
   a back button to return to whichever word mode you came from.
6. Click outside the card, or press Escape, to dismiss it.

## File layout

No bundler yet — seven plain `<script>`-style files, loaded in
dependency order straight from `manifest.json`'s `content_scripts.js`
array, sharing one global scope the same way multiple `<script>` tags on
a page do:

```
utils/extractKanji.js → services/kanji/kanjiIndex.js
→ services/dictionary/fakeJpEnLookup.js → services/dictionary/fakeJpJpLookup.js
→ content/mode.js → content/overlay.js → content/selectionDetector.js (entry point, loads last)
```

The two `services/dictionary/fake*.js` files are explicitly temporary —
each gets deleted, not refactored, once its real dictionary is wired up
(Jitendex for JP-EN; a JP-JP source hasn't been picked yet). They're
named `fakeJpEnLookup`/`fakeJpJpLookup`, not both `fakeLookup` — since
there's no bundler, both files share one global scope, and two same-named
functions would silently overwrite one instead of erroring. Folders that
don't have real code yet (`background/`, a real
`services/dictionary/providers/`, anything TypeScript) don't exist in the
repo — they show up when there's something to put in them, not before.

## Two trade-offs worth knowing about

**Web-accessible resources.** `manifest.json` declares
`dict/kanjidic/normalized.json` as a **web-accessible resource**, the
only way a content script (not just an extension page) can `fetch()` a
bundled file — confirmed against Chrome's current docs, not assumed. The
cost: this also makes that file fetchable by scripts on any page you
visit, a minor fingerprinting surface. Goes away entirely once this moves
behind a background worker, which can read its own bundled files without
this declaration at all.

**Deep search's positioning guard.** `selectionDetector.js` skips
repositioning the card when a new selection's `commonAncestorContainer`
is inside `cardEl` itself — otherwise chaining a lookup from inside a
definition would make the card jump to wherever that inner text happens
to sit, rather than staying anchored. Verified in a simulation, not yet
tried in a real browser — worth confirming `window.getSelection()`
faithfully reports open-shadow-root selections the way Chromium is
expected to before trusting this further.

## What's deliberately not here yet

- JP-EN's real dictionary (Jitendex) and JP-JP's (source not chosen).
  `fakeJpEnLookup()`/`fakeJpJpLookup()` are the seams where real messages
  to a background worker replace the `setTimeout`s.
- Background service worker / message passing for any mode. Kanji mode
  fetches its bundled JSON directly in the content script for now —
  simplest thing that works, not the final architecture.
- Real `chrome.commands` + toolbar badge for mode switching (Alt+K here
  is a page-focused keydown listener, not a true global shortcut).
- Deinflection (食べた won't resolve to 食べる in JP-EN/JP-JP yet).

## Architecture docs

See `docs/architecture-v4.md` (and v1–v3 for how we got here) for the
full design this is one slice of.
