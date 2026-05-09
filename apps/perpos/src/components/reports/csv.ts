export function toCsv(rows: Array<Record<string, any>>) {
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    if (s.includes(",") || s.includes("\n") || s.includes('"')) return '"' + s.replaceAll('"', '""') + '"';
    return s;
  };
  const lines = [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))];
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

