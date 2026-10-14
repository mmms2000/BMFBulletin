import readXlsxFile from 'read-excel-file/browser';
import type { Student } from './winkorea';

// Reads the WIN KOREA roster: 순번 | 팀 (Team1 or 1) | … | 한글명 | 영문명 | … | 비고 (조장)
const LEADER = ['조장', '팀장', 'leader', 'team leader', '리더'];
const norm = (v: unknown) => String(v ?? '').trim();
const isLeaderWord = (v: unknown) => LEADER.includes(norm(v).toLowerCase());

export type RosterSheet = { name: string; students: Student[]; skipped: string[] };

function parse(name: string, rows: unknown[][]): RosterSheet {
  const at = rows.findIndex((r) => r.some((c) => /한글|영문|kor|eng/i.test(norm(c)))); // header row, title rows above are fine
  const head = (rows[at] ?? []).map((c) => norm(c).toLowerCase());
  const col = (test: (h: string) => boolean) => head.findIndex(test);
  const kor = col((h) => /한글|kor|이름|성명/.test(h));
  const eng = col((h) => /영문|eng/.test(h));
  const team = col((h) => (/팀|team/.test(h) || h === '조') && !/장|leader/.test(h));
  const leaderCol = col((h) => LEADER.includes(h)); // a dedicated 조장 column marked v / o / ✓
  if (at === -1 || kor === -1 || eng === -1 || team === -1)
    throw new Error(`"${name}" 시트에서 한글명 / 영문명 / 팀 머리글을 찾지 못했습니다.`);

  const students: Student[] = [];
  const skipped: string[] = [];
  rows.slice(at + 1).forEach((row, i) => {
    const s = { kor: norm(row[kor]), eng: norm(row[eng]), team: Number(norm(row[team]).match(/\d+/)?.[0]) };
    if (!s.kor && !s.eng) return; // blank row
    if (!(s.team >= 1 && s.team <= 12)) {
      skipped.push(`${at + i + 2}행: ${s.kor || s.eng} / ${norm(row[team]) || '(팀 없음)'}`);
      return;
    }
    const leader = row.some(isLeaderWord) || (leaderCol !== -1 && norm(row[leaderCol]) !== '');
    students.push({ ...s, leader });
  });
  return { name, students, skipped };
}

/** Every sheet that has a roster on it (one per 차수 in the real file). */
export async function readWinkorea(file: File): Promise<RosterSheet[]> {
  const sheets = await readXlsxFile(file);
  const out: RosterSheet[] = [];
  let firstError: Error | null = null;
  for (const { sheet, data } of sheets) {
    try {
      out.push(parse(sheet, data as unknown[][]));
    } catch (e) {
      firstError ??= e as Error; // ponytail: sheets without a roster (notes, summaries) are just ignored
    }
  }
  if (!out.length) throw firstError ?? new Error('빈 파일입니다.');
  return out;
}
