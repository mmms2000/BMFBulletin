# BMF Bulletin

Next.js page that overlays Date / Special Prayer Name / Offering Name / Pastor Name
onto `public/bulletin.pdf` in the browser (pdf-lib) and downloads the result.

```bash
npm run dev
```

Replace the template: drop a new file at `public/bulletin.pdf`. If its layout changes,
update the box coordinates in `app/lib/fill.ts` (page 2, top-left origin, points —
`pdftotext -bbox` gives them).

Fonts in `public/`: Libre Baskerville (Latin, matches the template) and Noto Sans
Myanmar. Korean input would render blank — add a Korean font to `fill.ts` if needed.
