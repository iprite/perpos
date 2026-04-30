import { parseEnglishDateToISO } from "@/utils/date";

export type TypeOption = { id: string; name: string; base_price: number; is_active: boolean };

export type ImportRow = {
  import_temp_id: string;
  employer_name: string;
  employer_address: string | null;
  employer_tax_id: string | null;
  employer_tel: string | null;
  employer_type: string | null;
  worker_count: number;
  worker_male: number | null;
  worker_female: number | null;
  worker_nation: string | null;
  worker_type: string | null;
  poa_request: string | null;
  representative_import_temp_id: string | null;
  payment_amount: number | null;
  payment_date: string | null;
  payment_file_url: string | null;
  payment_status_text: string | null;
};

export type ImportError = {
  rowIndex: number;
  field: keyof ImportRow;
  message: string;
};

function asText(v: string) {
  const t = String(v ?? "").trim();
  return t.length ? t : null;
}

function cleanUrl(v: string | null) {
  const t = String(v ?? "").trim();
  if (!t) return null;
  if (t.startsWith("//")) return `https:${t}`;
  return t;
}

function parseIntOrNull(v: string) {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseNumberOrNull(v: string) {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function mapCsvRecordToPoa(rec: Record<string, string>): ImportRow {
  const import_temp_id = String(rec["POA id"] ?? rec["poa id"] ?? rec["poa_id"] ?? "").trim();
  const employer_name = String(rec["employer name"] ?? "").trim();
  const worker_count = Math.max(0, Number(String(rec["amount"] ?? "0").trim() || 0));

  const payment_date_raw = asText(rec["payment date"] ?? "");
  const payment_date = payment_date_raw
    ? parseEnglishDateToISO(payment_date_raw) ?? (/^\d{4}-\d{2}-\d{2}$/.test(payment_date_raw) ? payment_date_raw : null)
    : null;

  return {
    import_temp_id,
    employer_name,
    employer_address: asText(rec["employer address"] ?? ""),
    employer_tax_id: asText(rec["employer id"] ?? ""),
    employer_tel: asText(rec["employer tel"] ?? ""),
    employer_type: asText(rec["employer_type"] ?? ""),
    worker_count: Number.isFinite(worker_count) ? Math.trunc(worker_count) : 0,
    worker_male: parseIntOrNull(rec["worker_male"] ?? ""),
    worker_female: parseIntOrNull(rec["worker_female"] ?? ""),
    worker_nation: asText(rec["worker_nation"] ?? ""),
    worker_type: asText(rec["worker_type"] ?? ""),
    poa_request: asText(rec["poa request"] ?? ""),
    representative_import_temp_id: asText(rec["rep id"] ?? ""),
    payment_amount: parseNumberOrNull(rec["payment amount"] ?? ""),
    payment_date,
    payment_file_url: cleanUrl(asText(rec["payment file"] ?? "")),
    payment_status_text: asText(rec["payment status"] ?? ""),
  };
}

export function validateImportRows(rows: ImportRow[]): ImportError[] {
  const errors: ImportError[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.import_temp_id) errors.push({ rowIndex: i + 2, field: "import_temp_id", message: "ต้องมี POA id" });
    if (!r.employer_name) errors.push({ rowIndex: i + 2, field: "employer_name", message: "ต้องมี employer name" });
    if (!Number.isFinite(r.worker_count) || r.worker_count < 0)
      errors.push({ rowIndex: i + 2, field: "worker_count", message: "จำนวนแรงงานไม่ถูกต้อง" });
  }
  return errors;
}

export function parseRequestedTypeNames(v: string | null) {
  const t = String(v ?? "").trim();
  if (!t) return [];
  const all = t
    .split(/[\n,;|]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return all.length ? [all[0]] : [];
}

export function deriveRequestStatus(paymentStatusText: string | null) {
  const t = String(paymentStatusText ?? "");
  return t.includes("ยืนยัน") ? "paid" : "submitted";
}

export function deriveItemPaymentStatus(paymentStatusText: string | null) {
  const t = String(paymentStatusText ?? "");
  return t.includes("ยืนยัน") ? "confirmed" : "unpaid";
}
