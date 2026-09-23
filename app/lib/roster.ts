import { readSheet } from 'read-excel-file/browser';
import { STAFF, type Person } from './namecards';

const NAME_HEADERS = ['name', '이름', '성명', '아이디'];
const TEAM_HEADERS = ['team', '팀', '조', '팀명', '팀번호'];

const norm = (v: unknown) => String(v ?? '').trim();
const STAFF_WORDS = /staff|스태프|스텝|스탭|간사/i;
const teamOf = (v: unknown) => {
  const raw = norm(v);
  if (STAFF_WORDS.test(raw)) return STAFF;
  const digits = raw.match(/\d+/);
  const n = digits ? Number(digits[0]) : NaN;
  return n >= 1 && n <= 7 ? n : null;
};

/** Reads an .xlsx roster into people plus the rows it could not use. */
export async function readRoster(file: File): Promise<{ people: Person[]; skipped: string[] }> {
  const rows = await readSheet(file); // the default export returns { sheet, data }[], not rows
  if (!rows.length) return { people: [], skipped: [] };

  const head = rows[0].map((c) => norm(c).toLowerCase());
  let nameCol = head.findIndex((h) => NAME_HEADERS.some((k) => h.includes(k)));
  let teamCol = head.findIndex((h) => TEAM_HEADERS.some((k) => h.includes(k)));
  const hasHeader = nameCol !== -1 || teamCol !== -1;
  if (nameCol === -1) nameCol = 0;
  if (teamCol === -1) teamCol = 1;

  const people: Person[] = [];
  const skipped: string[] = [];
  rows.slice(hasHeader ? 1 : 0).forEach((row, i) => {
    const name = norm(row[nameCol]);
    const team = teamOf(row[teamCol]);
    if (!name && team === null) return; // blank row
    if (!name || team === null) {
      skipped.push(`${i + (hasHeader ? 2 : 1)}행: ${name || '(이름 없음)'} / ${norm(row[teamCol]) || '(팀 없음)'}`);
      return;
    }
    people.push({ name, team });
  });
  return { people, skipped };
}
