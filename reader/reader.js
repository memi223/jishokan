// reader/reader.js
//
// ES module (see index.html) — imports PDF.js directly, unlike every
// other script in this project. Everything below this file's own logic
// (mode switching, lookups, the overlay card) is untouched; it's already
// loaded as plain scripts by index.html before this runs, and just works
// on whatever text ends up in #content, the same as it works on any
// other page's DOM.

import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

// chrome.runtime.getURL() always produces a fully-qualified
// chrome-extension://<id>/... URL, which is what sidesteps the relative-
// path pitfalls that account for most "PDF.js worker won't load" issues
// people hit in other setups (wrong bundler-relative paths, CDN URLs
// blocked by CSP). Since this runs in an extension page's own origin —
// same bucket as the background worker, not a content script — this
// shouldn't need a web_accessible_resources entry either, per the same
// reasoning verified for background/importDictionaryData.js. Flagging
// it as expected-but-not-yet-observed-in-a-real-browser, consistent with
// how every other same-origin-access claim in this project has been
// noted until actually confirmed by loading the extension for real.
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdfjs/pdf.worker.min.mjs');

const statusEl = document.getElementById('status');
const contentEl = document.getElementById('content');

function getFileId() {
  return new URLSearchParams(location.search).get('fileId');
}

function requestFile(fileId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'GET_FILE', fileId }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || !response.file) {
        reject(new Error('File not found — this reader tab\u2019s link may be stale.'));
        return;
      }
      resolve(response.file);
    });
  });
}

async function renderPdf(data, filename) {
  document.title = filename;

  // The exact assumption flagged as unverified when this was first built:
  // that an ArrayBuffer survives popup -> background -> IndexedDB -> reader
  // through real chrome.runtime messaging the same way it did in an
  // in-process test mock. It didn't, for at least one real user — this
  // turns PDF.js's generic internal error into a diagnostic that says
  // exactly what arrived instead, rather than reproducing that same
  // opaque failure a second time.
  console.log('[reader.js] received data:', data, 'constructor:', data?.constructor?.name, 'byteLength:', data?.byteLength);

  let bytes;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    throw new Error(
      `Expected the PDF's bytes as an ArrayBuffer, got ${data?.constructor?.name ?? typeof data} instead. ` +
      `This means the binary data didn't survive the popup \u2192 background \u2192 IndexedDB \u2192 reader hand-off intact ` +
      `\u2014 check the browser console for the logged value above.`,
    );
  }

  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    cMapUrl: chrome.runtime.getURL('vendor/pdfjs/cmaps/'),
    cMapPacked: true,
  });
  const pdf = await loadingTask.promise;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    statusEl.textContent = `${filename} — extracting page ${pageNum} of ${pdf.numPages}…`;

    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    // No separator between items: correct default for Japanese, which
    // doesn't use spaces between words, unlike English PDF extraction
    // where you'd typically need to infer spacing from item positions.
    // Known gap: doesn't yet distinguish line breaks within a page from
    // one continuous run — every page renders as a single paragraph for
    // this first pass.
    const pageText = textContent.items.map((item) => item.str).join('');

    const pageEl = document.createElement('div');
    pageEl.className = 'pdf-page';
    const pageNumEl = document.createElement('div');
    pageNumEl.className = 'page-number';
    pageNumEl.textContent = `Page ${pageNum}`;
    const p = document.createElement('p');
    p.textContent = pageText;
    pageEl.appendChild(pageNumEl);
    pageEl.appendChild(p);
    contentEl.appendChild(pageEl);
  }

  statusEl.textContent = `${filename} — ${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}, loaded.`;
}

(async () => {
  const fileId = getFileId();
  if (!fileId) {
    statusEl.textContent = 'No file specified — open this page from the extension popup.';
    return;
  }
  try {
    const file = await requestFile(fileId);
    console.log('[reader.js] received file record:', file, 'data type:', file.data?.constructor?.name);
    await renderPdf(file.data, file.filename);
  } catch (err) {
    statusEl.textContent = `Couldn't load this PDF: ${err.message}`;
  }
})();
