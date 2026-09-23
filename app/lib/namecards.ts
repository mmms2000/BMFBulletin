import { PDFDocument, rgb, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export type Person = { name: string; team: number; role?: string };

export const STAFF = 0;
export const teamLabel = (team: number) => (team === STAFF ? 'Staff' : `T${team}`);

const MM = 72 / 25.4;
const A4 = { width: 210 * MM, height: 297 * MM };
const CARD = { width: 95 * MM, height: 122 * MM };
const GRID = { cols: 2, rows: 2 };
const GAP = 6 * MM; // breathing room between cards, and room for the scissors

// The template page is 269.28 x 345.6pt, drawn at its own size inside the card cell.
const TPL = { width: 269.28, height: 345.6 };

// The NAME line on the template, measured from the top of the page in points.
const NAME = {
  baseline: 235.92,
  capHeight: 18.96, // of the original, matched by scaling whatever font we use
  maxWidth: 237,
  coverTop: 192,
  coverBottom: 248,
};

// The "Team n" line, same measurement. The Staff template carries "Team 1", so the role replaces it.
const SUB = { baseline: 259.66, capHeight: 8.86, coverTop: 244, coverBottom: 266 };

const MYANMAR = /[က-႟ꩠ-ꩿ]/;

export const perPage = GRID.cols * GRID.rows;

export async function buildNamecards(
  templates: Map<number, ArrayBuffer>,
  latinFont: ArrayBuffer,
  myanmarFont: ArrayBuffer,
  people: Person[],
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  const latin = await out.embedFont(latinFont, { subset: true });
  const myanmar = await out.embedFont(myanmarFont, { subset: true });
  const sizeFor = (font: PDFFont, capHeight: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = (font as any).embedder.font;
    return (capHeight * f.unitsPerEm) / (f.capHeight || f.ascent);
  };

  // one embedded XObject per team, reused by every card of that team
  const pages = new Map<number, Awaited<ReturnType<typeof out.embedPdf>>[number]>();
  for (const [team, bytes] of templates) {
    const [embedded] = await out.embedPdf(bytes);
    pages.set(team, embedded);
  }

  const marginX = (A4.width - GRID.cols * CARD.width - (GRID.cols - 1) * GAP) / 2;
  const marginY = (A4.height - GRID.rows * CARD.height - (GRID.rows - 1) * GAP) / 2;

  // ponytail: one dotted line down the middle of each gutter, never across a card
  const cutLines = (p: ReturnType<typeof out.addPage>) => {
    const line = { thickness: 0.4, color: rgb(0.6, 0.6, 0.6), dashArray: [2, 2] };
    for (let c = 1; c < GRID.cols; c++) {
      const x = marginX + c * CARD.width + (c - 0.5) * GAP;
      p.drawLine({ start: { x, y: 0 }, end: { x, y: A4.height }, ...line });
    }
    for (let r = 1; r < GRID.rows; r++) {
      const y = A4.height - marginY - r * CARD.height - (r - 0.5) * GAP;
      p.drawLine({ start: { x: 0, y }, end: { x: A4.width, y }, ...line });
    }
  };

  let page = null as ReturnType<typeof out.addPage> | null;
  people.forEach((person, i) => {
    const slot = i % perPage;
    if (slot === 0) {
      page = out.addPage([A4.width, A4.height]);
    }
    const col = slot % GRID.cols;
    const row = Math.floor(slot / GRID.cols);
    const cx = marginX + col * (CARD.width + GAP);
    const cy = A4.height - marginY - row * (CARD.height + GAP) - CARD.height;
    const x = cx + (CARD.width - TPL.width) / 2;
    const y = cy + (CARD.height - TPL.height) / 2;

    page!.drawPage(pages.get(person.team)!, { x, y, width: TPL.width, height: TPL.height });
    page!.drawRectangle({
      x,
      y: y + TPL.height - NAME.coverBottom,
      width: TPL.width,
      height: NAME.coverBottom - NAME.coverTop,
      color: rgb(1, 1, 1),
    });

    if (person.team === STAFF) {
      page!.drawRectangle({
        x,
        y: y + TPL.height - SUB.coverBottom,
        width: TPL.width,
        height: SUB.coverBottom - SUB.coverTop,
        color: rgb(1, 1, 1),
      });
      const role = person.role || 'Staff';
      const size = sizeFor(latin, SUB.capHeight);
      const w = latin.widthOfTextAtSize(role, size);
      page!.drawText(role, {
        x: x + (TPL.width - w) / 2,
        y: y + TPL.height - SUB.baseline,
        size,
        font: latin,
        color: rgb(0, 0, 0),
      });
    }

    const font = MYANMAR.test(person.name) ? myanmar : latin;
    let size = sizeFor(font, NAME.capHeight);
    let width = font.widthOfTextAtSize(person.name, size);
    if (width > NAME.maxWidth) {
      size *= NAME.maxWidth / width;
      width = NAME.maxWidth;
    }
    page!.drawText(person.name, {
      x: x + (TPL.width - width) / 2,
      y: y + TPL.height - NAME.baseline,
      size,
      font,
      color: rgb(0, 0, 0),
    });
  });

  out.getPages().forEach(cutLines);

  return out.save();
}
