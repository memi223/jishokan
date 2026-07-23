# Architecture v4: Two Modes — Kanji (KANJIDIC) and Goi (Jitendex)

## What changed from v3

v3 had one lookup flow: select text → deinflect → word lookup (Jitendex)
→ always enrich with a kanji breakdown (KANJIDIC) on the side. This
splits that into two independent, switchable modes:

- **Kanji mode** — selection is filtered down to its kanji characters
  only; each one is looked up directly in KANJIDIC. No deinflection, no
  word dictionary involved at all.
- **Goi mode** (語彙 — vocabulary) — same word-lookup flow v3 already
  had: deinflect → Jitendex → `DictionaryEntry`.

The two pipelines were already mostly independent under the hood (§3 in
v3 shows `KanjiService` was always-local and separate from
`DictionaryService`) — this mostly formalizes a split that already
existed internally, minus one simplification: Goi mode no longer runs
`KanjiService.lookupMany()` as an automatic side effect on every word
lookup. If you want a kanji breakdown for a word you just looked up,
switch to Kanji mode and reselect — one job per mode, not one card doing
two jobs at once. (Flagging this as a real behavior change, not burying
it — see §6 if you'd rather keep the inline breakdown in Goi mode too.)

The planned Google API provider from v3 §10 still applies here — it's a
Goi mode thing specifically. A word/translation API is a natural fit
alongside Jitendex in `ProviderRegistry`'s provider chain; there's no
obvious kanji-level version of "Google API provider" for Kanji mode to
plug into, so nothing about that plan changes, it just now has a clearer
home.

---

## 1. Mode Switching

```typescript
// models/LookupMode.ts
export type LookupMode = 'kanji' | 'goi';
```

Proposed default mechanism — native to MV3, no extra UI chrome needed:

- **`chrome.commands`** — a global keyboard shortcut (e.g. `Alt+Shift+K`)
  that flips the stored mode. Declared in the manifest, handled in the
  background worker.
- **Toolbar badge as the mode indicator** — `chrome.action.setBadgeText`
  showing `字` for Kanji mode / `語` for Goi mode. One glance tells you
  which mode you're in without opening anything.
- Current mode persists via `StorageService` (`chrome.storage.sync`,
  small single value) and is read by the content script on each
  selection — no need to round-trip through the background worker just
  to know which mode is active.

This is a default worth pushing back on if you'd rather have a click
target (toolbar icon click cycles modes, or a small toggle inside the
card itself) — the hotkey+badge combo is just the option that adds zero
new UI surface.

```json
// manifest.json additions
"commands": {
  "toggle-lookup-mode": {
    "suggested_key": { "default": "Alt+Shift+K" },
    "description": "Toggle between Kanji mode and Goi (vocabulary) mode"
  }
}
```

---

## 2. Kanji Mode — Selection Handling

"Capture all and only kanji" = filter the raw selection string down to
CJK ideographs before doing anything else:

```typescript
// utils/extractKanji.ts
const KANJI_RANGE = /[\u4E00-\u9FFF]/g;

export function extractKanji(text: string): string[] {
  const matches = text.match(KANJI_RANGE) ?? [];
  return [...new Set(matches)]; // unique, in order of first appearance
}
```

If a selection has no kanji at all (pure kana, romaji, punctuation), Kanji
mode has nothing to show — the card can render a lightweight empty state
rather than an error, since "no kanji in this selection" isn't a failure.

Only the main CJK Unified Ideographs block (`\u4E00`–`\u9FFF`) for now —
covers effectively all jōyō/jinmeiyō kanji. Extension A
(`\u3400`–`\u4DBF`, rare/historical kanji) is a one-line addition to the
regex later if it ever comes up; not worth the complexity now.

---

## 3. Updated Message Flow

**Kanji mode:**

```
User highlights 大きい猫 with Kanji mode active
        │
        ▼
Content Script — SelectionDetector
  extractKanji("大きい猫") → ["大", "猫"]
        │  KANJI_LOOKUP_REQUEST { characters: ["大", "猫"] }
        ▼
Background — kanjiModeHandler
        │
        ▼
KanjiService.lookupMany(["大", "猫"])  → IndexedDB (KANJIDIC store), no
        │                                 deinflection, no provider chain
        ▼
   KanjiLookupResult { characters: [KanjiInfo, KanjiInfo] }
        │  KANJI_LOOKUP_RESPONSE
        ▼
Content Script — Card renders one compact row per kanji: character,
  onyomi, kunyomi, hanViet, meanings, stroke count
```

**Goi mode** — unchanged from v3's message flow (deinflect → Jitendex →
`DictionaryEntry`), minus the `KanjiService.lookupMany()` enrichment step
at the end. Simpler than before, not just different.

---

## 4. Component Responsibilities (updated)

### `kanjiModeHandler` (background/, new — small, sits next to `lookupOrchestrator`)
- Thin: cache check → `extractKanji` (could also run in the content
  script, see note below) → `KanjiService.lookupMany` → respond. No
  provider fallback chain to manage, since KANJIDIC is the only kanji
  source.
- Whether `extractKanji` runs in the content script or the background
  worker is a minor call — content script is slightly more natural since
  it's pure string processing with no dependency on anything
  background-only, and it means the message payload is already just the
  characters that matter. Written that way above.

### `lookupOrchestrator` (Goi mode, background/)
- Same as v3, minus the `KanjiService.lookupMany()` call at the end.
  `DictionaryEntry.kanjiBreakdown` stops being populated here (see §6).

### `KanjiService`
- Unchanged in implementation — it was already a clean, always-local,
  character-in/`KanjiInfo`-out service. It just has a direct caller now
  (`kanjiModeHandler`) instead of only being called as a side effect of
  word lookups.

### Content Script — Card rendering
- Needs a second render path: Kanji mode's card shows a **list** (1 to
  however many unique kanji were in the selection), not a single
  headword. Goi mode's card is unchanged (single word, meanings,
  example, badges) minus the kanji-chip row it had in v2/v3.

---

## 5. Updated Data Model

```typescript
// models/KanjiLookupResult.ts
export interface KanjiLookupResult {
  originalSelection: string;
  characters: KanjiInfo[];   // one per unique kanji, in order of appearance
}
```

```typescript
// models/Messages.ts (additions)
export enum MessageType {
  WORD_LOOKUP_REQUEST = 'WORD_LOOKUP_REQUEST',     // was LOOKUP_REQUEST
  WORD_LOOKUP_RESPONSE = 'WORD_LOOKUP_RESPONSE',   // was LOOKUP_RESPONSE
  KANJI_LOOKUP_REQUEST = 'KANJI_LOOKUP_REQUEST',
  KANJI_LOOKUP_RESPONSE = 'KANJI_LOOKUP_RESPONSE',
}
```

`DictionaryEntry` loses its `kanjiBreakdown?: KanjiInfo[]` field (see §6
for the alternative if you want to keep it). Everything else — `Meaning`,
`ExampleSentence`, `WordType`, `ConjugationClass`, `DeinflectionResult` —
unchanged from v3.

---

## 6. Resolved: Goi mode keeps a lightweight kanji link

Decision: **keep the lightweight version.** Goi mode's card shows small
tappable chips — one per unique kanji in the resolved word — that switch
to Kanji mode and look that character up, rather than carrying full
`KanjiInfo` data inline.

The nice part: this needs **no new field on `DictionaryEntry` at all**.
The chips are just `extractKanji(entry.dictionaryForm ?? entry.originalText)`
run at render time in the card component — the same utility Kanji mode
already uses to filter a selection down to its kanji. Goi mode's card
never touches `KanjiService` or KANJIDIC data directly; it only reuses
the character-extraction logic and hands off to Kanji mode on tap.
`DictionaryEntry` stays exactly as lean as dropping the field entirely
would have made it.

---

## 7. Folder Structure (updated)

```
src/
├── background/
│   ├── lookupOrchestrator.ts     # Goi mode: cache → deinflect → Jitendex
│   ├── kanjiModeHandler.ts       # NEW — Kanji mode: cache → KanjiService
│   └── modeState.ts              # NEW — reads/writes current LookupMode,
│                                  #        handles the chrome.commands listener
│
├── services/
│   ├── dictionary/                # Goi mode only now
│   │   ├── DictionaryProvider.ts
│   │   ├── DictionaryService.ts
│   │   ├── ProviderRegistry.ts
│   │   ├── providers/JitendexProvider.ts
│   │   └── local/  (LocalDictionaryStore.ts, importDictionaryData.ts)
│   ├── kanji/
│   │   └── KanjiService.ts        # unchanged, now has a direct caller
│   ├── morphology/                # unchanged, Goi mode only
│   ├── parser/  cache/  storage/  # unchanged
│
├── models/
│   ├── LookupMode.ts               # NEW
│   ├── KanjiLookupResult.ts        # NEW
│   ├── DictionaryEntry.ts          # kanjiBreakdown field removed
│   └── ...                         # unchanged otherwise
│
├── utils/
│   ├── extractKanji.ts             # NEW
│   └── ...                         # unchanged otherwise
│
├── content/
│   └── overlay/
│       ├── KanjiModeCard.(tsx|ts)  # NEW — list-of-kanji layout
│       └── GoiModeCard.(tsx|ts)    # was PopupCard.(tsx|ts)
│
├── dict/  popup/  options/  styles/  assets/   # unchanged from v3
│
└── manifest.json                   # + "commands" entry
```

---

## 8. Rationale Summary

| Decision | Why |
|---|---|
| Two modes instead of one card that always shows both | Kanji-level and word-level questions are genuinely different intents ("what does this character mean" vs "what does this word mean") — forcing them into one card either clutters the common case or hides the kanji detail behind clicks either way. |
| KANJIDIC for Kanji mode, not JMdict | JMdict doesn't have per-character on'yomi/kun'yomi/stroke-count/Hán-Việt data — that's KANJIDIC's whole job. Using JMdict here wouldn't just be suboptimal, it wouldn't work. |
| Kanji mode has no deinflection step | Deinflection only makes sense for words that conjugate; individual kanji characters don't. Keeping Kanji mode's pipeline free of a step it structurally can't use is what makes it simpler than Goi mode, not just different. |
| Mode switch via `chrome.commands` + badge, not a UI toggle | Zero new UI surface, native MV3 mechanism, and the badge means the current mode is always visible without opening anything — matches the "simple and lightweight" bar the rest of this project has been held to. |
| `kanjiBreakdown` dropped as a stored field, kanji chips computed at render time instead | Goi mode keeps the "jump to kanji detail" convenience without carrying `KanjiInfo` data it doesn't otherwise need — `extractKanji` is reused rather than duplicated, and `DictionaryEntry` stays exactly as small as the "drop it entirely" option would have made it. |
