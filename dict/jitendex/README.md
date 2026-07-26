See the "jitendex/" section in ../README.md (dict/README.md) — source,
how normalized.json is produced, and why it's loaded via a background
worker + IndexedDB instead of being fetched directly like kanjidic/.

normalized.json itself isn't in git (gitignored, ~65MB, regeneratable) —
if it's missing from this folder, regenerate it per those instructions
before loading the extension, or Jitendex lookups will come back empty.
