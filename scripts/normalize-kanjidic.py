"""
scripts/normalize-kanjidic.py

Offline build step (not part of the extension runtime — see the "Local
Dictionary Data Pipeline" section of architecture v2). Takes the raw
kanjidic2-en JSON from jmdict-simplified and reduces it to exactly the
shape our KanjiInfo model needs, dropping everything else (cross-references
to two dozen paper dictionaries we'll never use, codepoints, radicals, etc).

Usage:
    python3 scripts/normalize-kanjidic.py dict/kanjidic/kanjidic2-en-3.6.2.json dict/kanjidic/normalized.json

Note: KANJIDIC2's own jlptLevel field uses the OLD 4-level JLPT scale from
before the 2010 revision and hasn't been updated since — it's dropped
entirely here rather than kept under any name. KanjiInfo has no jlptLevel
field; JLPT level lives only on the word-level DictionaryEntry, sourced
from the word dictionary (Jitendex/JMdict), not from kanji data.
"""

import json
import sys


def normalize(raw):
    characters = []
    for c in raw["characters"]:
        rm = c.get("readingMeaning") or {}
        onyomi, kunyomi, han_viet, meanings = [], [], [], []

        for group in rm.get("groups", []):
            for r in group.get("readings", []):
                if r["type"] == "ja_on":
                    onyomi.append(r["value"])
                elif r["type"] == "ja_kun":
                    kunyomi.append(r["value"])
                elif r["type"] == "vietnam":
                    # KANJIDIC2 already includes Hán-Việt readings —
                    # a nice freebie given the Vietnamese-facing UI.
                    han_viet.append(r["value"])
            for m in group.get("meanings", []):
                if m["lang"] == "en":
                    meanings.append(m["value"])

        misc = c.get("misc", {})
        stroke_counts = misc.get("strokeCounts") or []

        entry = {
            "character": c["literal"],
            "meanings": meanings,
            "onyomi": onyomi,
            "kunyomi": kunyomi,
            "strokeCount": stroke_counts[0] if stroke_counts else None,
            "grade": misc.get("grade"),
            "frequencyRank": misc.get("frequency"),
        }
        if han_viet:
            entry["hanViet"] = han_viet
        characters.append(entry)

    return {
        "source": "kanjidic2 (via jmdict-simplified)",
        "version": raw.get("version"),
        "characterCount": len(characters),
        "characters": characters,
    }


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.json> <output.json>")
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        raw = json.load(f)

    result = normalize(raw)

    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote {result['characterCount']} kanji entries to {sys.argv[2]}")
