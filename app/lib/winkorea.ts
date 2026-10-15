import { PDFDocument, rgb, PDFFont, PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// WIN KOREA Jeju name tags: 90x120mm, four per A4, touching, cut lines on every edge.
export type Student = { eng: string; kor: string; team: number; leader: boolean };

export const perPage = 4;
// Pill colour by team: 1-4 yellow, 5-8 green, 9-12 purple.
export const colorOf = (team: number) => (team <= 4 ? 'yellow' : team <= 8 ? 'green' : 'purple');
export const COLORS = ['yellow', 'green', 'purple'] as const;

const MM = 72 / 25.4;
const A4 = { width: 210 * MM, height: 297 * MM };
const CARD = { width: 90 * MM, height: 120 * MM };
const GREEN = rgb(0.043, 0.263, 0.235); // the template's name colour

// Boxes on the card, in points from its top-left. The name boxes stop short of the divider line
// (y≈203) and the team pill, so English and Korean names can never overlap.
type Box = { x: number; y: number; w: number; h: number };
const ENG: Box = { x: 17, y: 161, w: 221, h: 39 };
const KOR: Box = { x: 17, y: 207, w: 221, h: 43 };
const PILL: Box = { x: 65, y: 253, w: 125, h: 35 };

/** Greedy word wrap; a word wider than the box (Korean, no spaces) is cut into equal parts. */
function wrap(font: PDFFont, text: string, size: number, width: number) {
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width;
  const lines: string[] = [];
  for (let word of text.split(/\s+/).filter(Boolean)) {
    if (!fits(word)) {
      const chars = [...word];
      let parts = chars;
      for (let n = 2; n <= chars.length; n++) {
        const k = Math.ceil(chars.length / n);
        parts = Array.from({ length: Math.ceil(chars.length / k) }, (_, i) => chars.slice(i * k, i * k + k).join(''));
        if (parts.every(fits)) break;
      }
      lines.push(...parts.slice(0, -1));
      word = parts[parts.length - 1];
    }
    if (lines.length && fits(`${lines[lines.length - 1]} ${word}`)) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** Biggest size (down from maxSize) at which the text fits the box in at most 3 lines, centred. */
function fitText(page: PDFPage, font: PDFFont, box: Box, text: string, maxSize: number, ox: number, top: number) {
  let size = maxSize;
  let lines = wrap(font, text, size, box.w);
  while (size > 6 && (lines.length > 3 || lines.length * size * 1.05 > box.h)) {
    size -= 0.5;
    lines = wrap(font, text, size, box.w);
  }
  const lh = size * 1.05;
  let base = box.y + (box.h - lines.length * lh) / 2 + lh / 2 + size * 0.36; // ~half the cap height below the line centre
  for (const line of lines) {
    const w = font.widthOfTextAtSize(line, size);
    page.drawText(line, { x: ox + box.x + (box.w - w) / 2, y: top - base, size, font, color: GREEN });
    base += lh;
  }
}

const starPath = (r: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const rr = i % 2 ? r * 0.4 : r;
    const a = (i * Math.PI) / 5;
    return `${i ? 'L' : 'M'}${(rr * Math.sin(a)).toFixed(2)} ${(-rr * Math.cos(a)).toFixed(2)}`;
  }).join(' ') + ' Z';

export async function buildWinkorea(
  templates: Record<(typeof COLORS)[number], ArrayBuffer>,
  fontBytes: ArrayBuffer,
  students: Student[],
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  const font = await out.embedFont(fontBytes); // ponytail: subset:true drops glyphs from Pretendard (pdf-lib bug); full font ≈ +2.6MB per PDF
  const tpl = Object.fromEntries(
    await Promise.all(
      COLORS.map(async (c) => {
        // templates are the original 95x122mm pages (vector, untouched apart from the placeholder text);
        // embed only the centred 90x120mm, trimming the edges without scaling
        const src = (await PDFDocument.load(templates[c])).getPage(0);
        const { x, y, width, height } = src.getMediaBox();
        const left = x + (width - CARD.width) / 2;
        const bottom = y + (height - CARD.height) / 2;
        return [c, await out.embedPage(src, { left, bottom, right: left + CARD.width, top: bottom + CARD.height })] as const;
      }),
    ),
  );

  const x0 = (A4.width - 2 * CARD.width) / 2;
  const y0 = (A4.height - 2 * CARD.height) / 2; // from the top
  let page: PDFPage | null = null;

  students.forEach((s, i) => {
    const slot = i % perPage;
    if (slot === 0) page = out.addPage([A4.width, A4.height]);
    const ox = x0 + (slot % 2) * CARD.width;
    const top = A4.height - y0 - Math.floor(slot / 2) * CARD.height; // PDF y of the card's top edge
    page!.drawPage(tpl[colorOf(s.team)], { x: ox, y: top - CARD.height, width: CARD.width, height: CARD.height });

    fitText(page!, font, ENG, s.eng.toUpperCase(), 26, ox, top);
    fitText(page!, font, KOR, s.kor, 27, ox, top);

    // TEAM 05: white letters with a black outline (ponytail: outline = the text drawn 8 times around, black)
    const label = `TEAM ${String(s.team).padStart(2, '0')}`;
    const size = 18;
    const lx = ox + PILL.x + (PILL.w - font.widthOfTextAtSize(label, size)) / 2; // same spot for leaders; the star just sits to the left
    const ly = top - (PILL.y + PILL.h - 10.5);
    for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]])
      page!.drawText(label, { x: lx + dx * 1.1, y: ly + dy * 1.1, size, font, color: rgb(0, 0, 0) });
    page!.drawText(label, { x: lx, y: ly, size, font, color: rgb(1, 1, 1) });

    if (s.leader)
      page!.drawSvgPath(starPath(13), {
        x: lx - 14,
        y: top - (PILL.y + PILL.h / 2 - 0.5),
        color: rgb(0.88, 0.07, 0.07),
        borderColor: rgb(1, 1, 1),
        borderWidth: 1.2,
      });
  });

  // cut lines along every card edge, edge to edge of the paper so a ruler lines up easily
  const line = { thickness: 0.4, color: rgb(0.4, 0.4, 0.4) };
  for (const p of out.getPages())
    for (let k = 0; k <= 2; k++) {
      const x = x0 + k * CARD.width;
      const y = A4.height - y0 - k * CARD.height;
      p.drawLine({ start: { x, y: 0 }, end: { x, y: A4.height }, ...line });
      p.drawLine({ start: { x: 0, y }, end: { x: A4.width, y }, ...line });
    }

  return out.save();
}
