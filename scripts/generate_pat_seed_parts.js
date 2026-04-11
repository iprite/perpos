const fs = require("fs");
const path = require("path");

const csvPath = process.argv[2] ?? "export_All-PAT-Lists-modified_2026-03-29_09-38-01.csv";
const outDir = process.argv[3] ?? "supabase/migrations";
const rowsPerFile = Number(process.argv[4] ?? 1000);

const text = fs.readFileSync(csvPath, "utf8").trim();
const lines = text.split(/\r?\n/);
const header = lines[0].split(",").map((s) => s.replace(/^\"|\"$/g, ""));
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

function parse(line) {
  return line
    .split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/)
    .map((s) => s.replace(/^\"|\"$/g, ""));
}

function sqlStr(v) {
  if (v == null) return "NULL";
  const s = String(v).trim();
  if (!s) return "NULL";
  return `'${s.replace(/'/g, "''")}'`;
}

const required = ["p th", "p en", "a th", "a en", "t th", "t en", "post", "all_th", "all_en"];
for (const k of required) {
  if (!(k in idx)) {
    // eslint-disable-next-line no-console
    console.error("Missing column:", k);
    process.exit(1);
  }
}

const seen = new Set();
const rows = [];
for (let i = 1; i < lines.length; i++) {
  const r = parse(lines[i]);
  const provinceTh = r[idx["p th"]];
  const districtTh = r[idx["a th"]];
  const subdistrictTh = r[idx["t th"]];
  const postcode = r[idx.post];
  const key = [provinceTh, districtTh, subdistrictTh, postcode].join("|");
  if (seen.has(key)) continue;
  seen.add(key);

  rows.push({
    province_th: provinceTh,
    province_en: r[idx["p en"]],
    district_th: districtTh,
    district_en: r[idx["a en"]],
    subdistrict_th: subdistrictTh,
    subdistrict_en: r[idx["t en"]],
    postcode,
    all_th: r[idx.all_th],
    all_en: r[idx.all_en],
  });
}

fs.mkdirSync(outDir, { recursive: true });

const partCount = Math.ceil(rows.length / rowsPerFile);
for (let part = 0; part < partCount; part++) {
  const start = part * rowsPerFile;
  const batch = rows.slice(start, start + rowsPerFile);
  const name = `exapp_pat_seed_part_${String(part + 1).padStart(2, "0")}.sql`;
  const outPath = path.join(outDir, name);

  const out = [];
  out.push("BEGIN;");
  out.push("");
  out.push(
    "INSERT INTO public.pat (province_th, province_en, district_th, district_en, subdistrict_th, subdistrict_en, postcode, all_th, all_en)",
  );
  out.push("VALUES");
  for (let i = 0; i < batch.length; i++) {
    const r = batch[i];
    out.push(
      `  (${sqlStr(r.province_th)}, ${sqlStr(r.province_en)}, ${sqlStr(r.district_th)}, ${sqlStr(r.district_en)}, ${sqlStr(r.subdistrict_th)}, ${sqlStr(r.subdistrict_en)}, ${sqlStr(r.postcode)}, ${sqlStr(r.all_th)}, ${sqlStr(r.all_en)})${i === batch.length - 1 ? "" : ","}`,
    );
  }
  out.push("ON CONFLICT (province_th, district_th, subdistrict_th, postcode) DO UPDATE SET");
  out.push("  province_en = EXCLUDED.province_en,");
  out.push("  district_en = EXCLUDED.district_en,");
  out.push("  subdistrict_en = EXCLUDED.subdistrict_en,");
  out.push("  all_th = EXCLUDED.all_th,");
  out.push("  all_en = EXCLUDED.all_en;");
  out.push("");
  out.push("COMMIT;");
  out.push("");

  fs.writeFileSync(outPath, out.join("\n"));
}

// eslint-disable-next-line no-console
console.log(`Wrote ${rows.length} rows into ${partCount} files (${rowsPerFile}/file) under ${outDir}`);

