/**
 * xlsx.ts — เขียนไฟล์ Excel (.xlsx) จริงฝั่งเบราว์เซอร์ โดยไม่พึ่ง dependency ภายนอก
 *
 * ทำไมไม่ใช้ CSV: ชื่อ/หมวดภาษาไทยกับ Excel บน Windows เพี้ยนง่าย และตัวเลขที่มี comma
 * จะกลายเป็นข้อความ · ไฟล์ .xlsx เก็บ "ตัวเลขเป็นตัวเลข / วันที่เป็นวันที่" ทำ pivot ต่อได้ทันที
 *
 * ทำไมเขียนเอง: .xlsx = ZIP ที่มี XML ไม่กี่ไฟล์ · ใช้ ZIP แบบ store (ไม่บีบอัด) จึงไม่ต้องมี
 * zip/deflate library — เลี่ยง bundle ที่ทำให้ build บน Vercel ชน OOM (ดู AGENTS.md §Deployment)
 */

export type XlsxColumn<T> = {
  header: string;
  /** ค่าที่จะลงเซลล์ — คืน string = ข้อความ, number = ตัวเลข, Date/"YYYY-MM-DD" ตาม type */
  value: (row: T) => string | number | null | undefined;
  type?: "text" | "number" | "date";
  /** ความกว้างคอลัมน์ (หน่วยตัวอักษร) */
  width?: number;
};

export type XlsxSheet<T> = {
  name: string;
  columns: XlsxColumn<T>[];
  rows: T[];
  /** แถวรวมท้ายตาราง — ค่าเป็น index คอลัมน์ → ค่าที่จะแสดง */
  totals?: Record<number, string | number>;
};

// ── XML helpers ──────────────────────────────────────────────────────────────
function esc(s: string) {
  return (
    s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      // ตัดอักขระควบคุมที่ XML ไม่รับ (Excel จะฟ้องไฟล์เสีย)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  );
}

function colName(i: number) {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** วันที่ → serial number ของ Excel (ฐาน 1899-12-30) */
function dateSerial(v: string | Date) {
  const d = typeof v === "string" ? new Date(v + (v.length === 10 ? "T00:00:00Z" : "")) : v;
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000);
}

// style index: 0=ปกติ 1=หัวตาราง 2=ตัวเลข 3=วันที่ 4=รวม(ตัวหนา) 5=รวม-ตัวเลข(ตัวหนา)
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><name val="Tahoma"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5F7FA"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FFCCD1D9"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="4" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXml(ref: string, v: string | number | null | undefined, type: string, style: number) {
  if (v == null || v === "") return `<c r="${ref}" s="${style}"/>`;
  if (type === "number") {
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
    if (!Number.isFinite(n)) return `<c r="${ref}" s="${style}"/>`;
    return `<c r="${ref}" s="${style}"><v>${n}</v></c>`;
  }
  if (type === "date") {
    const s = dateSerial(v as string);
    if (s == null) return `<c r="${ref}" s="${style}"/>`;
    return `<c r="${ref}" s="${style}"><v>${s}</v></c>`;
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

function sheetXml<T>(sheet: XlsxSheet<T>) {
  const cols = sheet.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`)
    .join("");

  const header = `<row r="1">${sheet.columns
    .map((c, i) => cellXml(`${colName(i)}1`, c.header, "text", 1))
    .join("")}</row>`;

  const body = sheet.rows
    .map((row, r) => {
      const cells = sheet.columns
        .map((c, i) => {
          const type = c.type ?? "text";
          const style = type === "number" ? 2 : type === "date" ? 3 : 0;
          return cellXml(`${colName(i)}${r + 2}`, c.value(row), type, style);
        })
        .join("");
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join("");

  let footer = "";
  if (sheet.totals) {
    const r = sheet.rows.length + 2;
    const cells = sheet.columns
      .map((c, i) => {
        const v = sheet.totals?.[i];
        const isNum = typeof v === "number";
        return cellXml(`${colName(i)}${r}`, v ?? "", isNum ? "number" : "text", isNum ? 5 : 4);
      })
      .join("");
    footer = `<row r="${r}">${cells}</row>`;
  }

  const lastCol = colName(sheet.columns.length - 1);
  const lastRow = sheet.rows.length + 1;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCol}${Math.max(lastRow, 1)}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${header}${body}${footer}</sheetData><autoFilter ref="A1:${lastCol}${Math.max(lastRow, 1)}"/></worksheet>`;
}

// ── ZIP (store, ไม่บีบอัด) ───────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** วันที่ในหัว ZIP — 1980-01-01 (ค่า 0 = วันที่ไม่ถูกต้อง เครื่องมือแตกไฟล์บางตัวฟ้อง) */
const DOS_DATE = (1 << 5) | 1;

function zipStore(files: { name: string; data: string }[]) {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const dataBytes = enc.encode(f.data);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const local = Uint8Array.from([
      0x50,
      0x4b,
      0x03,
      0x04,
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0),
    ]);
    parts.push(local, nameBytes, dataBytes);

    central.push(
      Uint8Array.from([
        0x50,
        0x4b,
        0x01,
        0x02,
        ...u16(20),
        ...u16(20),
        ...u16(0x0800),
        ...u16(0),
        ...u16(0),
        ...u16(DOS_DATE),
        ...u32(crc),
        ...u32(size),
        ...u32(size),
        ...u16(nameBytes.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset),
      ]),
      nameBytes,
    );
    offset += local.length + nameBytes.length + dataBytes.length;
  }

  const centralSize = central.reduce((s, b) => s + b.length, 0);
  const eocd = Uint8Array.from([
    0x50,
    0x4b,
    0x05,
    0x06,
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(centralSize),
    ...u32(offset),
    ...u16(0),
  ]);

  return new Blob([...parts, ...central, eocd], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ── Public API ───────────────────────────────────────────────────────────────
/** สร้างไฟล์ .xlsx (หลายชีตได้) แล้วสั่งดาวน์โหลด */
// eslint-disable-next-line
export function downloadXlsx(filename: string, sheets: XlsxSheet<any>[]) {
  const names = sheets.map((s, i) =>
    (s.name || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, "").slice(0, 31),
  );

  const files = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join(
          "",
        )}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
        .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join(
          "",
        )}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", data: STYLES_XML },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];

  const blob = zipStore(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** ชื่อไฟล์ลงท้ายด้วยวันที่ไทย เช่น "เงินสดย่อย-2026-08-12.xlsx" */
export function xlsxFilename(base: string) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${base}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.xlsx`;
}
