'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fillBulletin, type Fields } from './lib/fill';

const TEMPLATE = '/bulletin.pdf';
const PAGE = 2; // the order-of-service page, the only one with editable fields
const CROP = { x: 0, y: 0, width: 256, height: 540 }; // its left panel, in PDF points

const TEXT_FIELDS: { key: keyof Fields; label: string }[] = [
  { key: 'prayer', label: 'Special Prayer Name' },
  { key: 'offering', label: 'Offering Name' },
  { key: 'pastor', label: 'Pastor Name' },
];

const DEFAULTS: Fields = {
  date: '',
  prayer: 'Sayama Thapi',
  offering: '',
  pastor: 'Rev Tin Aung Shwe',
};

// today if it is Sunday, otherwise the coming Sunday
const nextSunday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmt = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return `${d.getFullYear()}. ${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
};

export default function Home() {
  const [day, setDay] = useState('');
  const [fields, setFields] = useState<Fields>(DEFAULTS);
  const [href, setHref] = useState(TEMPLATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const blob = useRef<string | null>(null);
  const task = useRef<{ cancel: () => void } | null>(null);

  // ponytail: iframe PDF viewers are unreliable on mobile, so page 2 is drawn to a canvas
  const preview = useCallback(async (bytes: ArrayBuffer) => {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await doc.getPage(PAGE);
    const el = canvas.current;
    if (!el) return;
    const scale =
      (el.parentElement!.clientWidth / CROP.width) * Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({
      scale,
      offsetX: -CROP.x * scale,
      offsetY: -CROP.y * scale,
    });
    el.width = CROP.width * scale;
    el.height = CROP.height * scale;
    el.style.width = '100%';
    task.current?.cancel(); // a second render on the same canvas throws
    const job = page.render({ canvas: el, canvasContext: el.getContext('2d')!, viewport });
    task.current = job;
    await job.promise.catch((e) => {
      if (e?.name !== 'RenderingCancelledException') throw e;
    });
  }, []);

  const build = useCallback(
    async (apply: boolean) => {
      setBusy(true);
      setError('');
      try {
        const [pdf, latin, myanmar] = await Promise.all(
          [TEMPLATE, '/LibreBaskerville.ttf', '/NotoSansMyanmar.ttf'].map((u) =>
            fetch(u).then((r) => r.arrayBuffer()),
          ),
        );
        if (!apply) {
          await preview(pdf);
          return;
        }
        const out = await fillBulletin(pdf, latin, myanmar, { ...fields, date: fmt(day) });
        const bytes = out.slice().buffer as ArrayBuffer;
        if (blob.current) URL.revokeObjectURL(blob.current);
        blob.current = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        setHref(blob.current);
        await preview(bytes.slice(0));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [day, fields, preview],
  );

  useEffect(() => {
    setDay(nextSunday()); // client-side so the prerendered HTML does not go stale
    build(false);
    return () => {
      if (blob.current) URL.revokeObjectURL(blob.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main>
      <h1>BMF Bulletin</h1>
      <div className="row">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            build(true);
          }}
        >
          <label>
            Date
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          {TEXT_FIELDS.map(({ key, label }) => (
            <label key={key}>
              {label}
              <input
                value={fields[key]}
                onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
                placeholder={label}
              />
            </label>
          ))}
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Applying…' : 'Apply'}
            </button>
            <a
              className={`btn${href === TEMPLATE ? ' off' : ''}`}
              href={href}
              download="BMF-bulletin.pdf"
            >
              Download PDF
            </a>
          </div>
          {error && <p className="err">{error}</p>}
          <p className="hint">Empty fields keep the original placeholder text.</p>
        </form>
        <div className="preview">
          <canvas ref={canvas} />
        </div>
      </div>
    </main>
  );
}
