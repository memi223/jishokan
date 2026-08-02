## Try it

1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder
2. Default mode is **JP-EN**. Select `食べる`, `学生`, `大きい`, `猫`, or
   any other real word — this is genuine Jitendex data now, not a demo
   set. Select something not in any dictionary to see the soft "no
   entry" state (distinct from an actual error).
3. Use Alt + K to cycle 3 three modes (still missing one).
5. In either JP-EN or JP-JP mode, the character chip(s) under a word are
   clickable — tapping one jumps into Kanji mode for that character, with
   a back button to return to whichever word mode you came from.
6. Click outside the card, or press Escape, to dismiss it.

## Dict regeneration: see in dict/README.md

## PDF reader

The toolbar popup has a file input now: pick a PDF, and it opens in a new
tab as plain web text — DOM — so the exact
same highlighting/lookup machinery works on it!.

Text extraction is [PDF.js](https://github.com/mozilla/pdf.js)
(Apache-2.0), vendored directly in `vendor/pdfjs/` — not from npm/a CDN,
just the three pieces text extraction actually needs (~3.3MB total, see
`vendor/pdfjs/README.md`): the library, its worker, and the CJK character
maps real Japanese PDFs often need to decode text correctly at all.

Text format (been working on this): no separator between text items within a page, since
Japanese doesn't use spaces between words — but that also means no line
or paragraph breaks yet either; each page currently renders as one
continuous block. Also no cleanup of old uploaded files from IndexedDB —
they accumulate.

## What's deliberately not here yet

- JP-JP's real dictionary — source not picked. `fakeJpJpLookup()` is the
  seam where a real message to the background worker replaces the
  `setTimeout`, same pattern JP-EN just went through.
- Deinflection (食べた won't resolve to 食べる in JP-EN/JP-JP yet).
