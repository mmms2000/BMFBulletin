import { PDFDocument, rgb, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export type Fields = { date: string; offering: string; prayer: string; pastor: string };

// Boxes measured from the source PDF (page 2, top-left origin, pts).
// size = calibrated against the original placeholder text widths.
const SLOTS = [
  { key: 'date', top: 63.36, bottom: 75.86, size: 10.65 },
  { key: 'prayer', top: 215.41, bottom: 227.14, size: 6.9 },
  { key: 'offering', top: 265.42, bottom: 277.11, size: 6.9 },
  { key: 'pastor', top: 309.26, bottom: 320.99, size: 6.9 },
] as const;

const COL = { x: 40, width: 179, center: 129.5 };
const INK = rgb(45 / 255, 59 / 255, 92 / 255);
const MYANMAR = /[က-႟ꩠ-ꩿ]/;
const MYANMAR_SCALE = 1.4; // Noto Sans Myanmar runs small next to Libre Baskerville

export async function fillBulletin(
  template: ArrayBuffer,
  latinFont: ArrayBuffer,
  myanmarFont: ArrayBuffer,
  fields: Fields,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(template);
  pdf.registerFontkit(fontkit);
  const latin = await pdf.embedFont(latinFont, { subset: true });
  const myanmar = await pdf.embedFont(myanmarFont, { subset: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = (latin as any).embedder.font;
  const ascRatio = m.ascent / (m.ascent - m.descent);

  const page = pdf.getPages()[1];
  const H = page.getHeight();

  for (const slot of SLOTS) {
    const text = fields[slot.key].trim();
    if (!text) continue; // leave the placeholder alone
    const h = slot.bottom - slot.top;
    const font: PDFFont = MYANMAR.test(text) ? myanmar : latin;
    let size = MYANMAR.test(text) ? slot.size * MYANMAR_SCALE : slot.size;
    let width = font.widthOfTextAtSize(text, size);
    if (width > COL.width) {
      size *= COL.width / width; // ponytail: shrink to fit, no wrapping
      width = COL.width;
    }
    page.drawRectangle({
      x: COL.x,
      y: H - slot.bottom - 2,
      width: COL.width,
      height: h + 4,
      color: rgb(1, 1, 1),
    });
    page.drawText(text, {
      x: COL.center - width / 2,
      y: H - (slot.top + ascRatio * h),
      size,
      font,
      color: INK,
    });
  }
  return pdf.save();
}
