// lib/gov-procure/catalog-parse.ts — parser ข้อความที่ผู้ใช้ paste จาก TOR/Excel → รายการสินค้า
// contract: specs/gov-procure-catalog.md §5.6 · .ui.md §3 (Dialog "วางรายการสินค้า")
//
// **pure function ล้วน — ไม่มี I/O / ไม่แตะ Supabase** (unit-testable)
// รูปแบบที่รองรับ: `ชื่อสินค้า<TAB|2+ ช่องว่าง>จำนวน<ช่องว่าง>หน่วย`
//   · คอลัมน์จำนวน/หน่วยจะอยู่แยกช่องหรือรวมช่องเดียว ("200 แพ็ค") ก็ได้
//   · เลขไทย (๐-๙) และคอมมาคั่นหลักพันใช้ได้
//   · บรรทัดที่แยกไม่ได้ **ไม่ถูกทิ้งเงียบ** — คืนใน `issues` ให้ผู้ใช้แก้ inline ก่อนยืนยัน

/** 1 บรรทัดที่แยกสำเร็จ */
export interface ParsedCatalogRow {
  /** ลำดับที่จะเขียนลง `seq_no` (เริ่มที่ `startSeq`, ต่อเนื่องเฉพาะแถวที่แยกได้) */
  seq_no: number;
  /** ชื่อสินค้า (จะถูกเก็บทั้ง `name_raw` และ `name`) */
  name: string;
  qty: number | null;
  unit: string | null;
  /** ข้อความดิบทั้งบรรทัด (ก่อนตัดเลขลำดับ) */
  raw: string;
  /** เลขบรรทัดในข้อความต้นฉบับ (เริ่มที่ 1) */
  lineNo: number;
}

/** บรรทัดที่แยกไม่ได้ — UI ต้องแสดงให้แก้ก่อนยืนยัน */
export interface ParseIssue {
  lineNo: number;
  raw: string;
  /** ข้อความไทยที่ผู้ใช้อ่านรู้เรื่อง */
  reason: string;
}

export interface ParseResult {
  rows: ParsedCatalogRow[];
  issues: ParseIssue[];
  /** จำนวนบรรทัดที่มีเนื้อหา (ไม่นับบรรทัดว่าง) */
  totalLines: number;
}

export interface ParseOpts {
  /** ลำดับเริ่มต้นของ `seq_no` (ต่อท้ายรายการเดิมได้) — default 1 */
  startSeq?: number;
}

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/** เลขไทย → เลขอารบิก (ท่าเดียวกับ `gov_procure_normalize_name()` ใน SQL) */
export function toArabicDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const idx = THAI_DIGITS.indexOf(ch);
    out += idx >= 0 ? String(idx) : ch;
  }
  return out;
}

/** แปลงข้อความจำนวน → number (รองรับคอมมา/เลขไทย) · แยกไม่ได้ = null */
export function parseQty(input: string): number | null {
  const cleaned = toArabicDigits(input).replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function resolveStartSeq(opts?: ParseOpts): number {
  const raw = Number(opts?.startSeq);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
}

/** ตัดเลขลำดับหน้าบรรทัด ("12. ", "12) ", "๑. ") ออก */
function stripLeadingIndex(line: string): string {
  return line.replace(/^\s*[0-9๐-๙]{1,3}\s*[.)]\s+/, "").trim();
}

/** แยกคอลัมน์ด้วย TAB ก่อน ถ้าไม่มีค่อยใช้ช่องว่าง 2 ตัวขึ้นไป */
export function splitColumns(line: string): string[] {
  const source = line.replace(/ /g, " ");
  const parts = source.includes("\t") ? source.split("\t") : source.split(/ {2,}/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** ดึง "จำนวน + หน่วย" จากท้ายข้อความ (เช่น "200 แพ็ค" / "12ด้าม") */
function extractTrailingQtyUnit(
  text: string,
): { name: string; qty: number; unit: string | null } | null {
  const m = /^(.*?[^\s])\s+([0-9๐-๙][0-9๐-๙,.]*)\s*([^\s0-9๐-๙]{1,20})?$/.exec(text.trim());
  if (!m) return null;
  const qty = parseQty(m[2]);
  if (qty === null) return null;
  const name = m[1].trim();
  if (!name) return null;
  return { name, qty, unit: m[3] ? m[3].trim() : null };
}

/** แยกช่อง "จำนวน[+หน่วย]" ที่อยู่คอลัมน์เดียวกัน */
function splitQtyUnitCell(cell: string): { qty: number | null; unit: string | null } {
  const trimmed = cell.trim();
  const direct = parseQty(trimmed);
  if (direct !== null) return { qty: direct, unit: null };

  const m = /^([0-9๐-๙][0-9๐-๙,.]*)\s*(.*)$/.exec(trimmed);
  if (!m) return { qty: null, unit: trimmed || null };
  return { qty: parseQty(m[1]), unit: m[2].trim() || null };
}

function parseLine(
  raw: string,
  lineNo: number,
): { row: Omit<ParsedCatalogRow, "seq_no"> } | { issue: ParseIssue } {
  const line = stripLeadingIndex(raw);
  if (!line) return { issue: { lineNo, raw, reason: "บรรทัดว่าง" } };

  const cols = splitColumns(line);

  // ≥3 คอลัมน์ → ชื่อ | จำนวน | หน่วย (คอลัมน์เกินถือเป็นหมายเหตุ ต่อท้ายหน่วยไม่ได้ → ทิ้ง)
  if (cols.length >= 3) {
    const name = cols[0];
    const qty = parseQty(cols[1]);
    const unit = cols[2] || null;
    if (!name) return { issue: { lineNo, raw, reason: "ไม่พบชื่อสินค้า" } };
    if (qty === null)
      return {
        issue: { lineNo, raw, reason: `จำนวนไม่ใช่ตัวเลข: "${cols[1]}"` },
      };
    return { row: { name, qty, unit, raw, lineNo } };
  }

  // 2 คอลัมน์ → ชื่อ | "จำนวน หน่วย"
  if (cols.length === 2) {
    const name = cols[0];
    const { qty, unit } = splitQtyUnitCell(cols[1]);
    if (!name) return { issue: { lineNo, raw, reason: "ไม่พบชื่อสินค้า" } };
    if (qty === null)
      return {
        issue: { lineNo, raw, reason: `อ่านจำนวนไม่ออก: "${cols[1]}"` },
      };
    return { row: { name, qty, unit, raw, lineNo } };
  }

  // 1 คอลัมน์ → ลองอ่าน "จำนวน + หน่วย" ที่ท้ายบรรทัด
  const trailing = extractTrailingQtyUnit(cols[0] ?? line);
  if (trailing) {
    return {
      row: { name: trailing.name, qty: trailing.qty, unit: trailing.unit, raw, lineNo },
    };
  }

  return {
    issue: {
      lineNo,
      raw,
      reason: "ไม่พบจำนวน/หน่วย — ใส่รูปแบบ “ชื่อสินค้า  จำนวน  หน่วย”",
    },
  };
}

/**
 * แยกข้อความที่ผู้ใช้ paste → รายการสินค้า + บรรทัดที่แยกไม่ได้
 * (ไม่โยน error ทุกกรณี — ความผิดพลาดคืนเป็น `issues`)
 */
export function parseCatalogPaste(text: string, opts?: ParseOpts): ParseResult {
  const startSeq = resolveStartSeq(opts);

  const rows: ParsedCatalogRow[] = [];
  const issues: ParseIssue[] = [];
  let totalLines = 0;
  let seq = startSeq;

  const lines = String(text ?? "").split(/\r\n|\r|\n/);
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const raw = rawLine.trim();
    if (!raw) return; // บรรทัดว่าง = ข้ามเงียบ (ไม่ใช่ความผิดพลาด)
    totalLines += 1;

    const result = parseLine(raw, lineNo);
    if ("issue" in result) {
      issues.push(result.issue);
      return;
    }
    rows.push({ seq_no: seq, ...result.row });
    seq += 1;
  });

  return { rows, issues, totalLines };
}

/** แยกบรรทัด CSV (คอมมา + รองรับเครื่องหมายคำพูดแบบง่าย) */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuote = !inQuote;
      continue;
    }
    if (ch === "," && !inQuote) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out.filter((c) => c.length > 0);
}

/**
 * แยก CSV → รายการสินค้า (คอลัมน์ตามลำดับ: ชื่อ, จำนวน, หน่วย)
 * แถวหัวตาราง (คอลัมน์จำนวนไม่ใช่ตัวเลข ในบรรทัดแรก) ถูกข้ามให้อัตโนมัติ
 */
export function parseCatalogCsv(text: string, opts?: ParseOpts): ParseResult {
  const startSeq = resolveStartSeq(opts);

  const rows: ParsedCatalogRow[] = [];
  const issues: ParseIssue[] = [];
  let totalLines = 0;
  let seq = startSeq;

  const lines = String(text ?? "").split(/\r\n|\r|\n/);
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const raw = rawLine.trim();
    if (!raw) return;

    const cols = splitCsvLine(raw);
    const name = cols[0] ?? "";
    const { qty, unit } = cols.length >= 2 ? splitQtyUnitCell(cols[1]) : { qty: null, unit: null };

    // บรรทัดแรกที่จำนวนไม่ใช่ตัวเลข = header → ข้ามเงียบ
    if (totalLines === 0 && qty === null && cols.length >= 2) return;
    totalLines += 1;

    if (!name) {
      issues.push({ lineNo, raw, reason: "ไม่พบชื่อสินค้า" });
      return;
    }
    if (qty === null) {
      issues.push({ lineNo, raw, reason: "อ่านจำนวนไม่ออก" });
      return;
    }

    rows.push({
      seq_no: seq,
      name,
      qty,
      unit: cols[2]?.trim() || unit,
      raw,
      lineNo,
    });
    seq += 1;
  });

  return { rows, issues, totalLines };
}
