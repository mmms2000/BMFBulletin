'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { buildNamecards, perPage, STAFF, teamLabel, TEAMS, type Person } from '../lib/namecards';
import { readRoster } from '../lib/roster';
import { renderToCanvas } from '../lib/preview';

const templateUrl = (team: number) =>
  team === STAFF ? '/namecards/Staff.pdf' : `/namecards/T${team}.pdf`;

export default function Namecard() {
  const [people, setPeople] = useState<Person[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [href, setHref] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const blob = useRef<string | null>(null);

  useEffect(() => {
    // show an empty template until a roster is loaded
    fetch(templateUrl(1))
      .then((r) => r.arrayBuffer())
      .then((b) => canvas.current && renderToCanvas(b, canvas.current, 1))
      .catch(() => {});
    return () => {
      if (blob.current) URL.revokeObjectURL(blob.current);
    };
  }, []);

  const upload = async (file: File) => {
    setError('');
    setHref('');
    try {
      const { people, skipped } = await readRoster(file);
      setPeople(people);
      setSkipped(skipped);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const generate = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const used = [...new Set(people.map((p) => p.team))];
      const templates = new Map<number, ArrayBuffer>();
      await Promise.all(
        used.map(async (team) => {
          templates.set(team, await fetch(templateUrl(team)).then((r) => r.arrayBuffer()));
        }),
      );
      const [latin, myanmar] = await Promise.all(
        ['/Barlow-Bold.ttf', '/NotoSansMyanmar.ttf'].map((u) =>
          fetch(u).then((r) => r.arrayBuffer()),
        ),
      );
      const out = await buildNamecards(templates, latin, myanmar, people);
      const bytes = out.slice().buffer as ArrayBuffer;
      if (blob.current) URL.revokeObjectURL(blob.current);
      blob.current = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      setHref(blob.current);
      if (canvas.current) await renderToCanvas(bytes.slice(0), canvas.current, 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [people]);

  const counts = TEAMS.map((t) => people.filter((p) => p.team === t).length);

  return (
    <main>
      <h1>
        Namecards <Link href="/">← Bulletin</Link>
      </h1>
      <div className="row">
        <form onSubmit={(e) => e.preventDefault()}>
          <label>
            명단 (.xlsx) — 이름 / 팀
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>

          {people.length > 0 && (
            <p className="hint">
              {people.length}명 · A4 {Math.ceil(people.length / perPage)}장 (한 장에 {perPage}개)
              <br />
              {TEAMS.map((t, i) => (counts[i] ? `${teamLabel(t)} ${counts[i]}명` : null))
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          <div className="actions">
            <button type="button" onClick={generate} disabled={busy || !people.length}>
              {busy ? '만드는 중…' : '만들기'}
            </button>
            <a
              className={`btn${href ? '' : ' off'}`}
              href={href || undefined}
              download="BMF-namecards.pdf"
            >
              Download PDF
            </a>
          </div>

          {error && <p className="err">{error}</p>}
          {skipped.length > 0 && (
            <p className="err">
              건너뛴 행 {skipped.length}개
              <br />
              {skipped.slice(0, 5).join(' / ')}
              {skipped.length > 5 && ' …'}
            </p>
          )}
          <p className="hint">
            첫 줄이 머리글(이름/팀)이면 알아서 찾고, 없으면 1열=이름 2열=팀으로 읽습니다. 팀은
            1–7, 그리고 Staff(스태프)를 쓸 수 있습니다.
          </p>
        </form>
        <div className="preview">
          <canvas ref={canvas} />
        </div>
      </div>
    </main>
  );
}
