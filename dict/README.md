# dict/

Local dictionary data for the offline `LocalProvider` / `KanjiService`
described in architecture v2. Each subfolder is one source.

| Folder | Source | Role | Status |
|---|---|---|---|
| `kanjidic/` | KANJIDIC2 (via jmdict-simplified) | Kanji info — readings, meanings, stroke count, grade. **Always-local**, used regardless of which word provider answers a lookup. | ✅ set up |
| `jitendex/` | Jitendex | Word dictionary — meanings + verb/adjective (POS/conjugation) tags. | ✅ set up — but loaded very differently from kanjidic/, see below |

## kanjidic/

- **Source**: `kanjidic2-en-3.6.2+20260720135044.json.tgz`, downloaded from
  [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified)
  releases (JSON conversion of EDRDG's KANJIDIC2).
- `kanjidic2-en.json.tgz` — the raw source archive, kept as-is for
  reproducibility (~1.2 MB).
- `normalized.json` — the actual file the extension will import, produced
  by `scripts/normalize-kanjidic.py`. Reduced from KANJIDIC2's full
  cross-reference set (Nelson, Halpern, Heisig, Morohashi, etc. — dictionary
  indices we don't need) down to exactly the `KanjiInfo` shape: character,
  meanings, onyomi, kunyomi, strokeCount, grade, frequencyRank. 10,384
  characters, ~2.1 MB.
- **Bonus**: KANJIDIC2 already includes Hán-Việt readings per character
  (kept as `hanViet` in the normalized output) — no separate
  Vietnamese-specific kanji source needed for that part.
- **No `jlptLevel` field**: KANJIDIC2's own JLPT data uses the old
  pre-2010 4-level scale and was dropped entirely rather than kept under
  any name — `KanjiInfo` has no `jlptLevel` field. JLPT level lives only
  on the word-level `DictionaryEntry`, sourced from the word dictionary
  (Jitendex/JMdict), not from kanji data.
- **To regenerate** (e.g. after a newer release): download a fresh
  `kanjidic2-en-*.json.tgz` from jmdict-simplified releases, extract it,
  then:
  ```
  python3 scripts/normalize-kanjidic.py dict/kanjidic/kanjidic2-en-<version>.json dict/kanjidic/normalized.json
  ```

## jitendex/

Real, working — but with a real complication kanjidic/ didn't have:
normalized, it's **~65MB** (≈279,000 unique terms vs. kanjidic's ~10,000
characters), which made kanjidic/'s pattern — bundle the JSON, fetch it
directly in the content script, hold it in an in-memory Map — a genuinely
bad fit here: 65MB parsed synchronously per tab, duplicated across every
open tab, was never going to be "lightweight."

So this one loads differently, for real architectural reasons, not just
because it could:

- **Source**: a Yomitan-format export from jitendex.org (CC BY-SA 4.0),
  containing 217 `term_bank_*.json` files. Not committed here — tens of
  MB, and regeneratable. If you need it again: jitendex.org →
  Downloads → Yomitan format.
- **`scripts/normalize-jitendex.py`** unzips it and walks each entry's
  glossary, which — unlike kanjidic's flat JSON — is Yomitan's
  "structured-content" format: a nested tree of `{tag, data, content}`
  nodes (`div`/`span`/`ul`/`li`/`ruby`...). The script extracts each
  sense's part-of-speech + glossary text and the first example sentence
  pair, dropping furigana markup and JMdict/Tatoeba attribution links.
  `ruleIdentifiers` (`v1`, `adj-i`, etc.) maps straight onto
  `WordType`/`ConjugationClass` — same model kanjidic already used.
- **Candidates are sorted by Jitendex's own `score` field** before the
  score itself is dropped from the output — without this, headwords with
  multiple JMdict entries (like 学生, which has 3) could surface an
  obscure archaic reading before the common one, which is exactly what
  happened on the first run before this fix.
- **`dict/jitendex/normalized.json`** (gitignored — see `.gitignore`) is
  the output: `{ terms: { [headword]: DictionaryEntry[] } }`, score-sorted,
  ~65MB.
- **Loading**: `background/importDictionaryData.js` fetches this bundled
  file once, on install, and writes it into IndexedDB
  (`background/db.js`) — a one-time cost, not a per-tab one. Lookups go
  through `chrome.runtime.sendMessage` (`services/dictionary/jitendexProvider.js`
  on the content-script side, `background/messageRouter.js` on the
  other) rather than a direct fetch. This also means
  `dict/jitendex/normalized.json` does **not** need a
  `web_accessible_resources` entry in `manifest.json`, unlike
  `dict/kanjidic/normalized.json` — that restriction gates access from a
  foreign page's origin, and the background worker reading its own
  bundled file is same-origin regardless.
- **To regenerate**: place a fresh `jitendex-yomitan.zip` somewhere, then:
  ```
  unzip jitendex-yomitan.zip -d /tmp/jitendex-extracted
  python3 scripts/normalize-jitendex.py /tmp/jitendex-extracted dict/jitendex/normalized.json
  ```
- **Known gap**: `wordType.label` is currently the raw JMdict tag
  (`"v1"`, `"adj-i"`) rather than a human-readable label like "Ichidan
  verb" — that mapping needs `tag_bank_1.json`, not done in this pass.
- **Known gap**: no deinflection yet. 食べた won't resolve to 食べる.
  `jitendexLookup()` does an exact-text lookup only.

## Licensing — read before distributing

KANJIDIC2 and JMdict-family data are distributed by EDRDG under a license
requiring attribution; jmdict-simplified's JSON builds are CC BY-SA.
Jitendex is openly licensed but has its own terms (see their site). If
this repo ever goes public, add a visible credits section (options page
or main README) naming EDRDG, jmdict-simplified, and Jitendex — this
folder's data isn't yours to relicense.
