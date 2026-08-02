Mozilla's PDF.js (https://github.com/mozilla/pdf.js), Apache-2.0
licensed.

Version: pdfjs-dist 6.2.108 (`npm view pdfjs-dist version` at the time
these files were copied).

Only what text extraction actually needs, not the full package
(~34.5MB unpacked upstream, most of it docs/examples/a full source map):

- `pdf.min.mjs` — the library itself (ES module)
- `pdf.worker.min.mjs` — runs PDF parsing off the main thread
- `cmaps/*.bcmap` — character maps PDF.js needs to correctly decode text
  in PDFs using non-standard CJK font encodings, which is common enough
  in real-world Japanese PDFs that skipping this would silently produce
  garbled or missing text for exactly the documents this feature is for.

To update: `npm view pdfjs-dist version` for the latest, then re-copy
these same three paths from a fresh `npm install pdfjs-dist@<version>`.
