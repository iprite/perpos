export type EmployerImportRow = {
  import_temp_id: string;
  name: string;
  tax_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
};

export type EmployerImportError = {
  rowIndex: number;
  field: keyof EmployerImportRow;
  reason: string;
};

function normalizeKey(k: string) {
  return String(k ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "");
}

function getAny(rec: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const direct = rec[key];
    if (typeof direct === "string") return direct;
  }

  const candidates = keys.map(normalizeKey);
  for (const k of Object.keys(rec)) {
    const nk = normalizeKey(k);
    if (!nk) continue;
    const idx = candidates.indexOf(nk);
    if (idx !== -1) return rec[k] ?? "";
  }

  for (const k of Object.keys(rec)) {
    const nk = normalizeKey(k);
    if (!nk) continue;
    if (candidates.some((c) => nk.includes(c) || c.includes(nk))) return rec[k] ?? "";
  }

  return "";
}

function asText(v: string) {
  const t = String(v ?? "").trim();
  return t.length ? t : null;
}

function isLikelyTaxIdValue(v: string) {
  const t = String(v ?? "").trim();
  return /^\d{13}$/.test(t);
}

function normalizeTaxId(v: string) {
  const digits = String(v ?? "")
    .trim()
    .replace(/[^0-9]/g, "");
  if (digits.length === 13) return digits;
  return null;
}

function detectEmployerIdByValue(rec: Record<string, string>) {
  for (const v of Object.values(rec)) {
    const t = String(v ?? "").trim();
    if (!t) continue;
    const compact = t
      .toUpperCase()
      .replace(/×/g, "X")
      .replace(/\s+/g, "")
      .replace(/[^A-Z0-9]/g, "");
    if (!compact) continue;
    if (/^\d{10,}X\d{10,}$/.test(compact)) return t;
  }
  return "";
}

function detectEmployerId(rec: Record<string, string>) {
  for (const k of Object.keys(rec)) {
    const nk = normalizeKey(k);
    if (!nk) continue;
    if (
      nk === "id" ||
      nk.includes("tax") ||
      nk.includes("vat") ||
      nk.includes("taxid") ||
      nk.includes("เลขภาษี") ||
      nk.includes("ภาษี") ||
      nk.includes("ผูเสียภาษี")
    ) {
      continue;
    }
    const looksLikeEmployer = nk.includes("employer") || nk.includes("employers") || nk.includes("customer") || nk.includes("ลูกค้า") || nk.includes("นายจ้าง");
    const looksLikeId = nk.includes("unique") || nk.includes("id") || nk.includes("code") || nk.includes("รหัส");
    if (looksLikeEmployer && looksLikeId) return rec[k] ?? "";
  }
  return "";
}

function detectName(rec: Record<string, string>) {
  for (const k of Object.keys(rec)) {
    const nk = normalizeKey(k);
    if (!nk) continue;
    if (
      nk === "name" ||
      nk === "nameth" ||
      nk.includes("name_th") ||
      nk.includes("companyname") ||
      nk.includes("employername") ||
      nk.includes("customername") ||
      nk.includes("ชื่อลูกค้า") ||
      nk.includes("ชื่อนายจ้าง") ||
      nk.includes("ชื่อไทย")
    ) {
      return rec[k] ?? "";
    }
  }
  return "";
}

export function mapCsvRecordToEmployer(rec: Record<string, string>): EmployerImportRow {
  const import_temp_id_raw =
    asText(
      getAny(rec, [
        "Employers (unique id)",
        "Employer (unique id)",
        "Employer Unique ID",
        "Employers Unique ID",
        "Unique ID",
        "Employer ID",
        "รหัสนายจ้าง",
        "รหัสลูกค้า",
      ]),
    ) ??
    asText(detectEmployerId(rec)) ??
    asText(detectEmployerIdByValue(rec)) ??
    "";

  const import_temp_id = isLikelyTaxIdValue(import_temp_id_raw) ? "" : import_temp_id_raw;

  const name =
    asText(
      getAny(rec, ["name_th", "name th", "Name_th", "Name TH", "Name", "Company Name", "Employer Name", "Customer Name", "ชื่อนายจ้าง", "ชื่อลูกค้า", "ชื่อไทย"]),
    ) ??
    asText(detectName(rec)) ??
    "";

  return {
    import_temp_id: String(import_temp_id ?? "").trim(),
    name: (() => {
      const n = String(name ?? "").trim();
      if (n) return n;
      return String(import_temp_id ?? "").trim();
    })(),
    tax_id:
      normalizeTaxId(getAny(rec, ["tax_id", "tax id", "Tax ID", "vat", "vat id", "เลขภาษี", "เลขประจำตัวผู้เสียภาษี", "id"])) ??
      (isLikelyTaxIdValue(getAny(rec, ["id"])) ? normalizeTaxId(getAny(rec, ["id"])) : null),
    contact_name: asText(getAny(rec, ["Contact", "Contact Name", "ผู้ติดต่อ"])),
    phone: asText(getAny(rec, ["Phone", "Tel", "โทรศัพท์"])),
    email: asText(getAny(rec, ["Email", "อีเมล"])),
  };
}

export function validateEmployerImportRows(rows: EmployerImportRow[], rowOffset = 2): EmployerImportError[] {
  const errs: EmployerImportError[] = [];
  rows.forEach((r, idx) => {
    if (!r.import_temp_id.trim()) errs.push({ rowIndex: idx + rowOffset, field: "import_temp_id", reason: "ต้องมี Unique ID ของนายจ้าง (Employers)" });
    if (!r.name.trim()) errs.push({ rowIndex: idx + rowOffset, field: "name", reason: "ต้องมีชื่อ (Name)" });
  });
  return errs;
}
