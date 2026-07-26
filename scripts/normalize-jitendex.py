"""
scripts/normalize-jitendex.py

Offline build step, same role as normalize-kanjidic.py. Takes the raw
Yomitan-format Jitendex export (term_bank_*.json + index.json) and
reduces each entry to our DictionaryEntry shape.

The one thing this has to do that normalize-kanjidic.py didn't: Jitendex's
glossary is Yomitan's "structured-content" format — a nested tree of
{tag, data, content} nodes (div/span/ul/li/ruby/a...), not a plain string.
walk_structured_content() below extracts sense groups (part-of-speech +
glossary text) and the first example sentence pair it finds, dropping
everything else (furigana <ruby> markup, attribution links, styling).

Usage:
    python3 scripts/normalize-jitendex.py <dir-of-extracted-term_bank-files> dict/jitendex/normalized.json
"""

import json
import os
import re
import sys


def flatten_text(node):
    """Concatenate all plain-text leaves under a structured-content node,
    dropping furigana <rt> annotations (we show readings separately)."""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return ''.join(flatten_text(n) for n in node)
    if isinstance(node, dict):
        if node.get('tag') == 'rt':
            return ''  # furigana annotation — skip, we don't want it inline
        return flatten_text(node.get('content', ''))
    return ''


def flatten_glossary_items(node):
    """Like flatten_text, but a glossary <ul>'s content can be either one
    <li> dict or a LIST of sibling <li> dicts (multiple near-synonyms for
    one sense) — those need a separator, or "to live off" + "to subsist
    on" silently concatenates into one unreadable run-on string."""
    if isinstance(node, dict):
        return [flatten_text(node).strip()]
    if isinstance(node, list):
        return [flatten_text(item).strip() for item in node]
    return [flatten_text(node).strip()]


def find_nodes(node, content_type, results=None):
    """Recursively find all nodes whose data.content == content_type."""
    if results is None:
        results = []
    if isinstance(node, dict):
        if isinstance(node.get('data'), dict) and node['data'].get('content') == content_type:
            results.append(node)
        for v in node.get('content', []) if isinstance(node.get('content'), list) else [node.get('content')]:
            find_nodes(v, content_type, results)
    elif isinstance(node, list):
        for n in node:
            find_nodes(n, content_type, results)
    return results


def extract_senses_and_example(structured_content_root):
    senses = []
    for sense_div in find_nodes(structured_content_root, 'sense'):
        glossary_nodes = find_nodes(sense_div, 'glossary')
        gloss_items = []
        for gn in glossary_nodes:
            gloss_items.extend(flatten_glossary_items(gn.get('content')))
        gloss_text = '; '.join(item for item in gloss_items if item)
        if gloss_text:
            senses.append(gloss_text)

    example = None
    example_boxes = find_nodes(structured_content_root, 'example-sentence')
    if example_boxes:
        box = example_boxes[0]
        ja_nodes = find_nodes(box, 'example-sentence-a')
        en_nodes = find_nodes(box, 'example-sentence-b')
        ja_text = flatten_text(ja_nodes).strip() if ja_nodes else ''
        en_text = flatten_text(en_nodes).strip() if en_nodes else ''
        # Tatoeba sentence links leave a trailing footnote marker like
        # "[1]" on ~8.5% of translations — a citation reference number
        # that flattened into plain text along with everything else.
        en_text = re.sub(r'\[\d+\]\s*$', '', en_text).strip()
        if ja_text:
            example = {'japanese': ja_text, 'translation': en_text}

    return senses, example


# JMdict-style rule identifiers -> our ConjugationClass model
RULE_TO_CLASS = {
    'v1': 'ichidan',
    'v5k': 'godan', 'v5g': 'godan', 'v5s': 'godan', 'v5t': 'godan',
    'v5n': 'godan', 'v5b': 'godan', 'v5m': 'godan', 'v5r': 'godan',
    'v5u': 'godan', 'v5aru': 'godan',
    'vs': 'suru',
    'vk': 'kuru',
    'adj-i': 'i-adjective',
    'adj-na': 'na-adjective',
}


def rule_identifiers_to_word_type(rule_str):
    if not rule_str:
        return None
    rules = rule_str.split()
    first = rules[0]
    return {
        'label': first,  # raw JMdict tag as a placeholder label — a real
                          # human-readable label ("Ichidan verb") needs the
                          # tag_bank_1.json lookup table, not done in this pass
        'conjugationClass': RULE_TO_CLASS.get(first, 'other'),
        'rawTags': rules,
    }


def normalize_entry(raw):
    term, reading, _tags, rule_identifiers, score, glossary, _sequence, _term_tags = raw

    senses = []
    example = None
    for g in glossary:
        if isinstance(g, dict) and g.get('type') == 'structured-content':
            s, e = extract_senses_and_example(g.get('content'))
            senses.extend(s)
            if example is None:
                example = e
        elif isinstance(g, str) and g.strip():
            senses.append(g.strip())

    if not senses:
        return None  # nothing usable — skip (e.g. cross-reference-only entries)

    return {
        'originalText': term,
        'reading': reading or None,
        'wordType': rule_identifiers_to_word_type(rule_identifiers),
        'meanings': senses,
        'exampleSentences': [example] if example else [],
        'sourceProviderId': 'jitendex',
        'score': score,  # used to sort candidates for the same headword;
                          # dropped before shipping (see strip_score below)
    }


def main(term_bank_dir, output_path):
    by_term = {}
    files = sorted(f for f in os.listdir(term_bank_dir) if f.startswith('term_bank_'))
    for i, fname in enumerate(files):
        with open(os.path.join(term_bank_dir, fname), encoding='utf-8') as f:
            bank = json.load(f)
        for raw in bank:
            entry = normalize_entry(raw)
            if entry is None:
                continue
            term = entry['originalText']
            by_term.setdefault(term, []).append(entry)
        if (i + 1) % 50 == 0:
            print(f'  processed {i + 1}/{len(files)} files, {len(by_term)} unique terms so far')

    for term, entries in by_term.items():
        entries.sort(key=lambda e: e['score'], reverse=True)
        for e in entries:
            del e['score']

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({'source': 'jitendex', 'terms': by_term}, f, ensure_ascii=False, separators=(',', ':'))

    print(f'Wrote {len(by_term)} unique terms ({sum(len(v) for v in by_term.values())} entries) to {output_path}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f'Usage: {sys.argv[0]} <term_bank_dir> <output.json>')
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
