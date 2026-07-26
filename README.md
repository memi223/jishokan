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

**Alt+K** cycles through all three (JP-EN → Kanji → JP-JP → JP-EN...). A
small pill in the top-right corner shows which mode is active (this is a
content-script stand-in for the real `chrome.commands` + toolbar badge
planned in the architecture doc — see below).

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

## File layout

```
utils/extractKanji.js → services/kanji/kanjiIndex.js
→ services/dictionary/jitendexProvider.js → services/dictionary/fakeJpJpLookup.js
→ content/mode.js → content/overlay.js → content/selectionDetector.js (entry point)

background/index.js → background/db.js → background/importDictionaryData.js
→ background/messageRouter.js
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
- Real `chrome.commands` + toolbar badge for mode switching (Alt+K here
  is a page-focused keydown listener, not a true global shortcut).
- `wordType.label` on Jitendex entries is the raw JMdict tag (`"v1"`),
  not a human-readable label — needs Jitendex's `tag_bank_1.json`, not
  done in this pass.
- Kanji mode migrated behind the background worker too (see above).

## Architecture docs

See `docs/architecture-v4.md` (and v1–v3 for how we got here) for the
full design this is one slice of.
