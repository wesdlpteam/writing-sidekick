// PDF -> one canvas per page, drawn in the browser by Mozilla's pdf.js (kept in js/vendor/pdfjs and
// loaded only when a PDF is picked). Each canvas then gets the same clean-up as a photo, so a
// scanned PDF and a photo of the page reach the AI in the same shape. Nothing leaves the iPad here.

const VENDOR = new URL("./vendor/pdfjs/", import.meta.url).href;

export function isPdf(file) {
  return file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");
}

// Zoom that draws a page so its longer edge is about targetEdge pixels.
export function pdfRenderScale(width, height, targetEdge) {
  const longest = Math.max(width, height);
  return longest > 0 ? targetEdge / longest : 1;
}

let pdfjsReady = null;
function loadPdfjs() {
  pdfjsReady ??= import(`${VENDOR}pdf.min.mjs`).then(
    (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `${VENDOR}pdf.worker.min.mjs`;
      return pdfjs;
    },
    (error) => {
      pdfjsReady = null; // a dropped connection should not break every later PDF
      throw error;
    },
  );
  return pdfjsReady;
}

// The first maxPages pages as canvases, plus how many pages the PDF has in all.
export async function pdfPageCanvases(file, { maxPages, targetEdge }) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), wasmUrl: `${VENDOR}wasm/` });
  try {
    const doc = await task.promise;
    const canvases = [];
    for (let n = 1; n <= Math.min(maxPages, doc.numPages); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 }); // includes the page's own rotation
      const viewport = page.getViewport({ scale: pdfRenderScale(base.width, base.height, targetEdge) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      await page.render({ canvas, canvasContext: ctx, viewport, background: "#ffffff" }).promise;
      page.cleanup();
      canvases.push(canvas);
    }
    return { canvases, totalPages: doc.numPages };
  } finally {
    task.destroy(); // frees the worker's copy of the PDF
  }
}
