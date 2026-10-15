'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { buildWinkorea, COLORS, perPage } from '../lib/winkorea';
import { readWinkorea, type RosterSheet } from '../lib/winkoreaRoster';
import { renderToCanvas } from '../lib/preview';

const get = (u: string) => fetch(u).then((r) => r.arrayBuffer());

export default function Winkorea() {
  const [sheets, setSheets] = useState<RosterSheet[]>([]);
  const [pick, setPick] = useState(0);
  const [href, setHref] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const blob = useRef<string | null>(null);

  useEffect(() => {
    get('/winkorea/yellow.pdf')
      .then((b) => canvas.current && renderToCanvas(b, canvas.current, 1))
      .catch(() => {});
    return () => {
      if (blob.current) URL.revokeObjectURL(blob.current);
    };
  }, []);

  const sheet = sheets[pick];
  const students = sheet?.students ?? [];

  const upload = async (file: File) => {
    setError('');
    setHref('');
    setPick(0);
    try {
      setSheets(await readWinkorea(file));
    } catch (e) {
      setSheets([]);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const [font, ...tpl] = await Promise.all([
        get('/winkorea/Pretendard-ExtraBold.ttf'),
        ...COLORS.map((c) => get(`/winkorea/${c}.pdf`)),
      ]);
      const templates = Object.fromEntries(COLORS.map((c, i) => [c, tpl[i]])) as Record<(typeof COLORS)[number], ArrayBuffer>;
      const bytes = (await buildWinkorea(templates, font, students)).slice().buffer as ArrayBuffer;
      if (blob.current) URL.revokeObjectURL(blob.current);
      blob.current = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      setHref(blob.current);
      if (canvas.current) await renderToCanvas(bytes.slice(0), canvas.current, 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const teams = new Map<number, number>();
  students.forEach((s) => teams.set(s.team, (teams.get(s.team) ?? 0) + 1));
  const leaders = students.filter((s) => s.leader).length;

  return (
    <main>
      <h1>
        WIN KOREA 명찰 <Link href="/">← Bulletin</Link>
      </h1>
      <div className="row">
        <form onSubmit={(e) => e.preventDefault()}>
          <label>
            명단 (.xlsx) — 팀 / 한글명 / 영문명 / 비고(조장)
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>

          {sheets.length > 1 && (
            <label>
              시트
              <select
                value={pick}
                onChange={(e) => {
                  setPick(Number(e.target.value));
                  setHref('');
                }}
              >
                {sheets.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name} ({s.students.length}명)
                  </option>
                ))}
              </select>
            </label>
          )}

          {students.length > 0 && (
            <p className="hint">
              {students.length}명 · 조장 {leaders}명 · A4 {Math.ceil(students.length / perPage)}장 (한 장에 {perPage}개)
              <br />
              {[...teams]
                .sort((a, b) => a[0] - b[0])
                .map(([t, n]) => `T${t} ${n}명`)
                .join(' · ')}
            </p>
          )}

          <div className="actions">
            <button type="button" onClick={generate} disabled={busy || !students.length}>
              {busy ? '만드는 중…' : '만들기'}
            </button>
            <a
              className={`btn${href ? '' : ' off'}`}
              href={href || undefined}
              download={`WINKOREA-명찰${sheet ? `-${sheet.name}` : ''}.pdf`}
            >
              Download PDF
            </a>
          </div>

          {error && <p className="err">{error}</p>}
          {sheet && sheet.skipped.length > 0 && (
            <p className="err">
              건너뛴 행 {sheet.skipped.length}개 (팀이 1–12가 아님)
              <br />
              {sheet.skipped.slice(0, 5).join(' / ')}
              {sheet.skipped.length > 5 && ' …'}
            </p>
          )}
          <p className="hint">
            머리글에서 팀·한글명·영문명 열을 찾습니다. 팀은 Team1 또는 1. 아무 칸에나 &apos;조장&apos;이
            있으면 빨간 별이 붙습니다. 팀 1–4 노랑 · 5–8 초록 · 9–12 보라. 95×122mm(원본 크기), A4에 4장.
          </p>
        </form>
        <div className="preview">
          <canvas ref={canvas} />
        </div>
      </div>
    </main>
  );
}
