import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

process.stdout.on('error', () => process.exit(0));

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/extract-pdf-lines.mjs <path-to-pdf>');
  process.exit(1);
}

const abs = path.resolve(process.cwd(), inputPath);
const data = new Uint8Array(fs.readFileSync(abs));
const doc = await pdfjs.getDocument({ data }).promise;

function groupLines(items) {
  const lines = new Map();
  for (const it of items) {
    const str = String(it.str ?? '').replace(/\s+/g, ' ');
    if (!str.trim()) continue;
    const [a, b, c, d, e, f] = it.transform;
    const yKey = Math.round(f);
    if (!lines.has(yKey)) lines.set(yKey, []);
    lines.get(yKey).push({ str, x: e, y: f });
  }
  const sortedY = Array.from(lines.keys()).sort((a, b) => b - a);
  return sortedY.map((y) => {
    const parts = lines.get(y).sort((p1, p2) => p1.x - p2.x);
    const text = parts.map((p) => p.str).join('');
    return { y, text };
  });
}

console.log('pages', doc.numPages);

for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.0 });
  const text = await page.getTextContent();
  const lines = groupLines(text.items);
  console.log(`\n--- page ${pageNumber} viewport ${viewport.width}x${viewport.height} lines ${lines.length} ---`);
  for (const l of lines) {
    const t = l.text.trim();
    if (!t) continue;
    console.log(`${String(l.y).padStart(4)} ${t}`);
  }
}

