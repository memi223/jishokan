# dict/

Local dictionary data for the offline `LocalProvider` / `KanjiService`
described in architecture v2. Each subfolder is one source.

| Folder | Source | Role | Status |
|---|---|---|---|
| `kanjidic/` | KANJIDIC2 (via jmdict-simplified) | Kanji info — readings, meanings, stroke count, grade. **Always-local**, used regardless of which word provider answers a lookup. | ✅ set up |
| `jitendex/` | Jitendex | Word dictionary — meanings + verb/adjective (POS/conjugation) tags. | ⏳ needs a manual download (see below) |

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

Jitendex stopped publishing dictionary files as GitHub release assets
(their releases page now only has the auto-generated source code archive,
which is not the dictionary itself). It's distributed from their own site
instead:

1. Go to https://jitendex.org/pages/downloads.html
2. Download the **Yomitan** format zip (not MDict — Yomitan's format is a
   zip of plain JSON files, much easier to write a normalizer for than
   MDict's binary format)
3. Place it at `dict/jitendex/jitendex-yomitan.zip` (gitignored for now,
   since it's tens of MB — see below)

Next step once you have it: a `scripts/normalize-jitendex.py` that unzips
it and reads its `term_bank_*.json` files (Yomitan's per-entry format:
`[term, reading, tags, ruleTags, score, glossary, sequence, termTags]`
per entry) into our `DictionaryEntry`/`WordType` shape — happy to write
that once the file's actually in the folder, since I can't reach
jitendex.org to fetch it myself from here.

## Licensing — read before distributing

KANJIDIC2 and JMdict-family data are distributed by EDRDG under a license
requiring attribution; jmdict-simplified's JSON builds are CC BY-SA.
Jitendex is openly licensed but has its own terms (see their site). If
this repo ever goes public, add a visible credits section (options page
or main README) naming EDRDG, jmdict-simplified, and Jitendex — this
folder's data isn't yours to relicense.
