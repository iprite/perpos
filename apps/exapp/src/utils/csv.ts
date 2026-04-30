export type CsvParseResult = {
  headers: string[];
  records: Record<string, string>[];
};

function stripBOM(s: string) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function parseCsv(text: string): CsvParseResult {
  const src = stripBOM(text);
  const rows: string[][] = [];

  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        continue;
      }
      cell += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (ch === "\r" && next === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const headerRow = rows[0] ?? [];
  const headers = headerRow.map((h) => h.trim());
  const records: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const line = rows[r];
    if (!line || line.every((x) => !String(x ?? "").trim())) continue;
    const rec: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] ?? `col_${c}`;
      rec[key] = (line[c] ?? "").trim();
    }
    records.push(rec);
  }

  return { headers, records };
}
