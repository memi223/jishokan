# Dev slice: selection card with fake data

What this is: a content script that watches for text selection and shows a
card with dictionary-shaped info — no real dictionary, no background
worker, no network calls. Everything is one file (`content.js`) on purpose.

## Try it

1. `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this folder
4. Go to any page and select one of these to see real demo data:
   `食べる`, `大きい`, `猫`, `学生`
5. Select any other text (Japanese or not) to see the generic fallback
   card, or select the literal word `error` to see the error state.
6. Click outside the card, or press Escape, to dismiss it.

## What's deliberately not here yet

- Real dictionary (Mazii or local JMdict) — `fakeLookup()` is the seam
  where a `chrome.runtime.sendMessage(...)` call replaces the `setTimeout`
  later, without touching anything else in the file.
- Background service worker / message passing.
- Deinflection (食べた won't resolve to 食べる yet).
- Kanji click-through, dark mode toggle (dark mode does follow the OS
  setting already, via `prefers-color-scheme`).

## Next slice, when you're ready

Split `content.js` into `content/selectionDetector.js` +
`content/overlay/` and add `background/` + `services/dictionary/` per the
architecture doc — swap `fakeLookup()` for a real message to the
background worker, which is the only line that needs to change in this
file.
