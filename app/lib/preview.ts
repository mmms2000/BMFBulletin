type Crop = { x: number; y: number; width: number; height: number };

let current: { cancel: () => void } | null = null;

/** Draws one PDF page into a canvas, scaled to the canvas's container width. */
export async function renderToCanvas(
  bytes: ArrayBuffer,
  el: HTMLCanvasElement,
  pageNumber: number,
  crop?: Crop,
) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await doc.getPage(pageNumber);
  const box = crop ?? { x: 0, y: 0, ...page.getViewport({ scale: 1 }) };
  const scale =
    (el.parentElement!.clientWidth / box.width) * Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale, offsetX: -box.x * scale, offsetY: -box.y * scale });
  el.width = box.width * scale;
  el.height = box.height * scale;
  el.style.width = '100%';

  current?.cancel(); // a second render on the same canvas throws
  const job = page.render({ canvas: el, canvasContext: el.getContext('2d')!, viewport });
  current = job;
  await job.promise.catch((e) => {
    if (e?.name !== 'RenderingCancelledException') throw e;
  });
}
