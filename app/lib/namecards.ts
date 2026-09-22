import { PDFDocument, rgb, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export type Person = { name: string; team: number };

export const TEAMS = [1, 2, 3, 4, 5, 6, 7];

const MM = 72 / 25.4;
const A4 = { width: 210 * MM, height: 297 * MM };
const CARD = { width: 95 * MM, height: 122 * MM };
const GRID = { cols: 2, rows: 2 };

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
  const sizeFor = (font: PDFFont) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = (font as any).embedder.font;
    return (NAME.capHeight * f.unitsPerEm) / (f.capHeight || f.ascent);
  };

  // one embedded XObject per team, reused by every card of that team
  const pages = new Map<number, Awaited<ReturnType<typeof out.embedPdf>>[number]>();
  for (const [team, bytes] of templates) {
    const [embedded] = await out.embedPdf(bytes);
    pages.set(team, embedded);
  }

  const marginX = (A4.width - GRID.cols * CARD.width) / 2;
  const marginY = (A4.height - GRID.rows * CARD.height) / 2;

  let page = null as ReturnType<typeof out.addPage> | null;
  people.forEach((person, i) => {
    const slot = i % perPage;
    if (slot === 0) page = out.addPage([A4.width, A4.height]);
    const col = slot % GRID.cols;
    const row = Math.floor(slot / GRID.cols);
    const x = marginX + col * CARD.width + (CARD.width - TPL.width) / 2;
    const y = A4.height - marginY - (row + 1) * CARD.height + (CARD.height - TPL.height) / 2;

    page!.drawPage(pages.get(person.team)!, { x, y, width: TPL.width, height: TPL.height });
    page!.drawRectangle({
      x: marginX + col * CARD.width,
      y: A4.height - marginY - (row + 1) * CARD.height,
      width: CARD.width,
      height: CARD.height,
      borderColor: rgb(0.75, 0.75, 0.75),
      borderWidth: 0.25, // cut guide
    });

    page!.drawRectangle({
      x,
      y: y + TPL.height - NAME.coverBottom,
      width: TPL.width,
      height: NAME.coverBottom - NAME.coverTop,
      color: rgb(1, 1, 1),
    });

    const font = MYANMAR.test(person.name) ? myanmar : latin;
    let size = sizeFor(font);
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

  return out.save();
}
