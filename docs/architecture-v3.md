# Architecture v3: Japanese Learning Chrome Extension — Local-Only Search

## What changed from v2

Mazii is removed, and the architecture is local-only for this build. This
is different from v2's "online-first with offline fallback" in a real
way: there's no `LookupStrategy`, no `ApiClient` in the current lookup
path, and no `host_permissions` entry right now — nothing about the
current implementation depends on the network.

That said, this isn't "never go online again." You mentioned adding a
Google API-based provider later, so the goal here is specifically: strip
out everything online *for now*, while keeping the one seam that made
Mazii pluggable in the first place — `DictionaryProvider` — general enough
that a future `GoogleApiProvider` slots in the same way `MaziiProvider`
did, without restructuring `DictionaryService` or the orchestrator again
when that day comes. §10 covers what specifically will need to come back
at that point.

What local-only costs today, to be direct about it: coverage is capped at
whatever's bundled with the extension, and improving it means shipping an
extension update, not a live server getting better over time. Once the
Google API provider exists, that particular limitation goes away for
whatever it covers — but that's a later decision, not this one.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CONTENT SCRIPT — selection capture, overlay rendering            │
├─────────────────────────────────────────────────────────────────┤
│  BACKGROUND SERVICE WORKER — orchestration                        │
│                                                                     │
│   Deinflector ──► DictionaryService ──► KanjiService (enrich)     │
│                         │                                          │
│                  ┌──────┴──────┐                                  │
│                  ▼             ▼                                  │
│           JitendexProvider  (future: JmdictProvider, etc.)        │
│           — all local, all backed by IndexedDB —                  │
├─────────────────────────────────────────────────────────────────┤
│  LOCAL DATA STORE — IndexedDB, populated once from dictionary     │
│  JSON bundled inside the extension package itself                 │
└─────────────────────────────────────────────────────────────────┘
```

No network layer sits anywhere in this diagram right now. `ApiClient`
(timeout, retry, CORS-aware fetch) isn't part of the current dictionary
path — it comes back specifically when the planned Google API provider
gets built (§10), scoped to that integration, not resurrected ahead of
time as general-purpose infrastructure.

---

## 2. Provider Model (replaces v2's LookupStrategy)

There's no online/offline mode setting anymore, because there's only one
mode. What still varies is *which local dictionaries are installed and in
what order they're tried* — this matters as soon as more than one word
dictionary is added (per your plan to bring in more later).

```typescript
// services/dictionary/ProviderRegistry.ts
export interface ProviderRegistry {
  getActiveProviders(): DictionaryProvider[];   // ordered, all local
  setProviderOrder(ids: string[]): Promise<void>;
}
```

Default order: Jitendex first (better-formatted, per architecture v2's
recommendation), falling back to a raw JMdict-based provider once/if one
is added. `DictionaryService` tries each in order and returns the first
hit — same pattern as v2's provider fallback, just with every entry in
the list being local now instead of one online + one offline.

---

## 3. Updated Message Flow

```
User highlights 食べた on a page
        │
        ▼
Content Script — SelectionDetector (debounced)
        │  LOOKUP_REQUEST { text: "食べた" }
        ▼
Background — LookupOrchestrator
        │
        ▼
CacheService.get("食べた") ── HIT ──► skip to response
        │ MISS
        ▼
Deinflector.deinflect("食べた")
  → candidates: [
      { dictionaryForm: "食べる", chain: ["past tense"], requiredClass: "ichidan" },
      { dictionaryForm: "食べた", chain: [], requiredClass: "noun" }
    ]
        │
        ▼
DictionaryService — for each candidate, try each local provider in order:
  JitendexProvider.lookup("食べる") → IndexedDB query (no network, no timeout)
        │
        ▼
   raw local entry → LocalEntryParser → DictionaryEntry
        │
        ▼
KanjiService.lookupMany(["食"]) → IndexedDB (KANJIDIC store)
        │
        ▼
   entry.kanjiBreakdown = [ { character: "食", ... } ]
        │
        ▼
CacheService.set("食べた", entry)   ← memory cache only really matters here;
        │                             IndexedDB is already fast enough that
        │                             the persistent cache tier is optional
        ▼
Content Script — Popup Card renders instantly, no loading-state flicker
  for anything beyond the deinflection/IndexedDB query itself
```

One practical effect worth naming: without network latency, the loading
state your card already handles will rarely be visible at all — IndexedDB
lookups after import are on the order of a few milliseconds. It's still
correct to keep the state (import-in-progress on first run is the one
case it'll actually show), just don't expect to see it often.

---

## 4. Component Responsibilities (updated)

### DictionaryService / ProviderRegistry
- Same shape as v2, minus the online branch. Tries local providers in
  order, returns the first real hit.
- `LocalProvider` implementations (`JitendexProvider`, future
  `JmdictProvider`) all implement the same `DictionaryProvider` interface
  from v2 — that abstraction didn't need to change, only what's *behind*
  it did.

### KanjiService
- Unchanged from v2 — it was already always-local. Nothing here depended
  on Mazii in the first place.

### Deinflector
- Unchanged from v2 — rule-based, no bundled dictionary of its own,
  candidates validated against whichever local provider answers.

### What's removed for now (not permanently ruled out)
- `MaziiProvider` — gone; nothing Mazii-specific is worth keeping around
  for a different API later.
- `ApiClient`, `ApiRequestConfig`, `ApiError` (services/api/) — nothing in
  the current dictionary path makes an HTTP request, so this is dead
  weight today. It comes back, likely close to this same shape, once the
  Google API provider is actually being built (see §10) — not resurrected
  speculatively before then.
- `LookupStrategy` and its Options-page toggle — no online/offline choice
  to make when nothing's online. This one will likely need to come back
  in some form once there's a real online provider to order against local
  results, but its exact shape depends on how that provider behaves, so
  it's not worth guessing at now.
- `host_permissions` in the manifest — nothing to grant fetch access to
  yet. Adding the Google API provider later means adding exactly one
  origin here, not a broad permission.

### New: Dictionary Import (services/dictionary/local/)
- Runs once per install/update via `chrome.runtime.onInstalled`
  (`reason: 'install'` or `'update'` when the bundled data version
  changed): reads the bundled JSON files (already in the extension
  package — see §5) via `fetch(chrome.runtime.getURL('dict/...'))`, which
  is a read of the extension's *own* bundled resource, not a network
  request to anywhere external, and writes it into IndexedDB.
- Idempotent and versioned: `LocalDictionaryStore.getMeta()` records the
  imported data's version; import is skipped if it already matches what's
  bundled, so a normal extension reload doesn't redo the work.

---

## 5. Data Loading — Bundled, Not Downloaded

v2 planned to download the local dataset once, post-install, from a
remote release. Given `dict/kanjidic/normalized.json` is already sitting
in the repo at under 2 MB, and Jitendex's normalized output should land
in a similar range, the simpler and more honestly "local-only" approach
is to **bundle the normalized JSON files directly in the extension
package** and import them into IndexedDB on install:

```
src/
├── dict/                      # copied into the built extension as-is
│   ├── kanjidic/normalized.json
│   └── jitendex/normalized.json   (once its normalizer exists)
```

This means the extension needs **zero network permission of any kind** —
not even a one-time download. Everything it will ever look up is inside
the `.crx`/unpacked folder the moment it's installed. Updating the
dictionary data means shipping a new extension version with fresher
`dict/*/normalized.json` files, same as any other code change — there's
no separate "check for dictionary update" flow to build, which is a
whole feature v2 needed and this version doesn't.

If the bundled data ever gets large enough that shipping it in every
extension update feels wasteful (Jitendex's raw size before normalization
suggests this is plausible), a "download the dictionary as a separate,
user-triggered step" option is the natural next evolution — but that's a
deliberate future decision, not something the current architecture leaves
half-built. It would just mean the import step's `fetch()` target changes
from a bundled resource to a `host_permissions`-granted URL — a small,
localized change to one function.

---

## 6. Updated Data Model

`DictionaryEntry`, `KanjiInfo`, `WordType`, `ConjugationClass`,
`DeinflectionResult` are unchanged from v2 (KanjiInfo already reflects
the `jlptLevel` removal from your last change). The only real change:

```typescript
// models/DictionaryEntry.ts
export interface DictionaryEntry {
  originalText: string;
  dictionaryForm?: string;
  inflection?: DeinflectionResult;
  reading?: string;
  meanings: Meaning[];
  exampleSentences: ExampleSentence[];
  jlptLevel?: JlptLevel;
  pitchAccent?: PitchAccentInfo;
  wordType?: WordType;
  kanjiBreakdown?: KanjiInfo[];
  notes?: string;
  audioUrl?: string;
  sourceProviderId: 'jitendex' | 'jmdict';   // was: 'mazii' | 'local' | ...
}
```

`LookupStrategy` (the `'online-first' | 'offline-first' | 'offline-only'`
type from v2) is deleted, not deprecated — there's nothing left for it to
select between.

---

## 7. Updated Folder Structure

```
src/
├── background/
│   └── lookupOrchestrator.ts     # cache → deinflect → local provider(s) → kanji enrich
│
├── services/
│   ├── dictionary/
│   │   ├── DictionaryProvider.ts
│   │   ├── DictionaryService.ts
│   │   ├── ProviderRegistry.ts     # orders local providers, no strategy concept
│   │   ├── providers/
│   │   │   └── JitendexProvider.ts        # MaziiProvider deleted
│   │   └── local/
│   │       ├── LocalDictionaryStore.ts    # IndexedDB access
│   │       └── importDictionaryData.ts    # NEW — bundled JSON → IndexedDB, once
│   ├── morphology/                 # unchanged from v2
│   ├── kanji/                      # unchanged from v2
│   ├── parser/
│   │   ├── Parser.ts
│   │   └── LocalEntryParser.ts     # MaziiParser deleted
│   ├── cache/  storage/            # unchanged; api/ removed entirely
│
├── models/                         # unchanged except LookupStrategy.ts deleted
│
├── dict/                           # NEW — bundled dictionary JSON, ships in the package
│   ├── kanjidic/normalized.json
│   └── jitendex/normalized.json
│
├── content/  popup/  options/  utils/  styles/  assets/   # unchanged from v2
│
└── manifest.json
```

`options/` no longer needs a lookup-strategy toggle; the "dictionary data"
panel still makes sense (showing what's bundled, its version), it just
has nothing to "update now" against a remote source anymore.

---

## 8. Manifest (updated)

```json
{
  "manifest_version": 3,
  "name": "Japanese Reading Helper",
  "permissions": ["storage"],
  "background": { "service_worker": "background/index.js", "type": "module" },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/index.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["dict/*/normalized.json"],
      "matches": ["<all_urls>"]
    }
  ],
  "action": { "default_popup": "popup/index.html" },
  "options_page": "options/index.html"
}
```

No `host_permissions` at all. `web_accessible_resources` isn't actually
required just for the background worker to read its own bundled files via
`chrome.runtime.getURL()` — it's only needed if a page or content script
context needs direct access to those files. Left out unless something
downstream actually needs it; worth double-checking against MV3's docs
when you get to implementing the import step, since permission
requirements like this are exactly the kind of thing worth verifying
against current documentation rather than assumed.

---

## 9. Rationale Summary

| Decision | Why |
|---|---|
| Local-only, not local-first | Removing the online path removes an entire second code path (strategy, CORS/CSP handling, retry/timeout) rather than just deprioritizing it — genuinely simpler, not just simpler by default. |
| Dictionary data bundled in the package, not downloaded post-install | The data's already small enough (kanjidic ~2 MB, Jitendex likely similar order of magnitude once normalized) that a separate download step is unneeded complexity — bundling means zero network permissions anywhere in the manifest. |
| Provider abstraction kept even with only local providers | "More dictionaries later" was already the plan — `DictionaryProvider`/`ProviderRegistry` is exactly the seam that lets a second or third local word dictionary slot in without touching the orchestrator. |
| `ApiClient` removed for now, not left in as unused code | Dead code that "might be needed later" is still a maintenance cost in the meantime. Since there's now a concrete plan (Google API provider), it'll come back scoped to that integration specifically, informed by that API's actual timeout/retry/error needs — not rebuilt speculatively ahead of knowing what it's for. |
| Privacy as a side effect, not the primary driver | Worth naming honestly: local-only means no selected text ever leaves the device, which is a genuine privacy property — but the actual reason for this rewrite was reducing architectural surface area, and the privacy benefit is a bonus that falls out of it, not the reason it was chosen. |

---

## 10. Planned addition: a Google API provider

Not built now, but worth sketching so the current design doesn't paint
itself into a corner. When it happens, expect this shape:

- **New provider**: `services/dictionary/providers/GoogleApiProvider.ts`,
  implementing the same `DictionaryProvider` interface as
  `JitendexProvider` — `DictionaryService` and the orchestrator shouldn't
  need to change at all, that's the entire point of having kept the
  abstraction.
- **`ApiClient` returns**, scoped to this provider: timeout, retry,
  typed errors — reintroduced when there's an actual API (with actual
  rate limits, actual error shapes) to build it against, not before.
- **One new `host_permissions` entry**, for whatever Google API domain is
  actually used — not a broad grant.
- **Ordering question, deliberately left open for now**: whether the
  Google provider is tried before or after local ones (or only as a
  fallback when local has no hit) depends on what it's actually good at —
  likely translation-quality meanings vs. local's conjugation/kanji
  precision — worth deciding once you know which Google API specifically
  (Translate, or something else) and what it returns.
- **Privacy trade-off worth deciding explicitly at that point**: unlike
  local lookups, anything sent to a Google API leaves the device. Whether
  that's opt-in, or the default, or scoped to only when local has no
  match, is a real product decision — not one to default silently on
  when the time comes.
