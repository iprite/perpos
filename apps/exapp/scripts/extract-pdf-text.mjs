import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

process.stdout.on('error', () => process.exit(0));

const inputPath = process.argv[2];
const query = process.argv[3] ? String(process.argv[3]) : '';
if (!inputPath) {
  console.error('Usage: node scripts/extract-pdf-text.mjs <path-to-pdf>');
  process.exit(1);
}

const abs = path.resolve(process.cwd(), inputPath);
const data = new Uint8Array(fs.readFileSync(abs));

const doc = await pdfjs.getDocument({ data }).promise;
console.log('pages', doc.numPages);

for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.0 });
  const text = await page.getTextContent();
  const items = text.items
    .map((it) => ({ str: String(it.str ?? '').trim(), transform: it.transform }))
    .filter((it) => it.str.length)
    .filter((it) => (query ? it.str.includes(query) : true));

  console.log(`\n--- page ${pageNumber} items ${items.length} viewport ${viewport.width}x${viewport.height} ---`);
  for (const it of items) {
    const [a, b, c, d, e, f] = it.transform;
    console.log(JSON.stringify({ str: it.str, a, b, c, d, e, f }));
  }
}
