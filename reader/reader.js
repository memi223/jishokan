import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

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

async function renderPdf(base64Data, filename) {
  document.title = filename;

  // base64, not a raw ArrayBuffer — see utils/base64.js for why: Chrome's
  // extension messaging JSON-serializes, and a raw ArrayBuffer silently
  // becomes "{}" crossing chrome.runtime.sendMessage. Confirmed against
  // Chrome's own docs after a real user hit exactly that failure.
  const bytes = new Uint8Array(base64ToArrayBuffer(base64Data));
  console.log('[reader.js] decoded bytes, length:', bytes.length);

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
    console.log('[reader.js] received file record, data type:', typeof file.data, 'length:', file.data?.length);
    await renderPdf(file.data, file.filename);
  } catch (err) {
    statusEl.textContent = `Couldn't load this PDF: ${err.message}`;
  }
})();
