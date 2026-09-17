'use client';

import { useEffect, useRef, useState } from 'react';
import { fillBulletin, type Fields } from './lib/fill';

const TEMPLATE = '/bulletin.pdf';

const LABELS: { key: keyof Fields; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'prayer', label: 'Special Prayer Name' },
  { key: 'offering', label: 'Offering Name' },
  { key: 'pastor', label: 'Pastor Name' },
];

const fmt = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return `${d.getFullYear()}. ${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
};

export default function Home() {
  const [day, setDay] = useState('');
  const [fields, setFields] = useState<Fields>({ date: '', offering: '', prayer: '', pastor: '' });
  const [url, setUrl] = useState(TEMPLATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const blob = useRef<string | null>(null);

  useEffect(() => () => { if (blob.current) URL.revokeObjectURL(blob.current); }, []);

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      const [pdf, latin, myanmar] = await Promise.all(
        [TEMPLATE, '/LibreBaskerville.ttf', '/NotoSansMyanmar.ttf'].map((u) =>
          fetch(u).then((r) => r.arrayBuffer()),
        ),
      );
      const out = await fillBulletin(pdf, latin, myanmar, { ...fields, date: fmt(day) });
      if (blob.current) URL.revokeObjectURL(blob.current);
      blob.current = URL.createObjectURL(new Blob([out as BlobPart], { type: 'application/pdf' }));
      setUrl(blob.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const edited = url !== TEMPLATE;

  return (
    <main>
      <h1>BMF Bulletin</h1>
      <div className="row">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <label>
            Date
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          {LABELS.slice(1).map(({ key, label }) => (
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
            <a className={`btn${edited ? '' : ' off'}`} href={url} download="BMF-bulletin.pdf">
              Download PDF
            </a>
          </div>
          {error && <p className="err">{error}</p>}
          <p className="hint">Empty fields keep the original placeholder text.</p>
        </form>
        <iframe src={url} title="bulletin preview" />
      </div>
    </main>
  );
}
