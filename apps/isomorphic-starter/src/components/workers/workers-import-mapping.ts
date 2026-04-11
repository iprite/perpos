import { parseEnglishDateToISO } from "@/utils/date";

export type ImportRow = {
  full_name: string;
  employer_import_temp_id: string | null;
  passport_no: string | null;
  nationality: string | null;
  alien_identification_number: string | null;
  birth_date: string | null;
  father_name_en: string | null;
  os_passport_type: string | null;
  os_sex: string | null;
  os_worker_type: string | null;
  os_wp_type: string | null;
  passport_expire_date: string | null;
  passport_issue_at: string | null;
  passport_issue_country: string | null;
  passport_issue_date: string | null;
  passport_type: string | null;
  profile_pic_url: string | null;
  visa_exp_date: string | null;
  visa_iss_date: string | null;
  visa_issued_at: string | null;
  visa_number: string | null;
  visa_type: string | null;
  wp_expire_date: string | null;
  wp_issue_date: string | null;
  wp_number: string | null;
  wp_type: string | null;
};

export type ImportError = { rowIndex: number; field: string; reason: string };

function get(rec: Record<string, string>, name: string) {
  const direct = rec[name];
  if (typeof direct === "string") return direct;
  const lower = name.toLowerCase();
  for (const k of Object.keys(rec)) {
    if (k.trim().toLowerCase() === lower) return rec[k] ?? "";
  }
  return "";
}

function asText(v: string) {
  const t = String(v ?? "").trim();
  return t.length ? t : null;
}

function cleanUrl(v: string) {
  const t = String(v ?? "").trim();
  if (!t) return null;
  if (t.startsWith("//")) return `https:${t}`;
  return t;
}

export function mapCsvRecordToWorker(rec: Record<string, string>): ImportRow {
  return {
    full_name: String(get(rec, "Name") ?? "").trim(),
    employer_import_temp_id: asText(get(rec, "Employer")),
    nationality: asText(get(rec, "os nation")) ?? asText(get(rec, "nation")),
    passport_no: asText(get(rec, "passport no")),
    alien_identification_number: asText(get(rec, "Alien Identification Number")),
    birth_date: parseEnglishDateToISO(get(rec, "birth")),
    father_name_en: asText(get(rec, "Father's name (English)")),
    os_passport_type: asText(get(rec, "os passport type")),
    os_sex: asText(get(rec, "os sex")),
    os_worker_type: asText(get(rec, "os worker type")),
    os_wp_type: asText(get(rec, "os wp type")),
    passport_expire_date: parseEnglishDateToISO(get(rec, "passport expire date")),
    passport_issue_at: asText(get(rec, "passport issue at")),
    passport_issue_country: asText(get(rec, "passport issue country")),
    passport_issue_date: parseEnglishDateToISO(get(rec, "passport issue date")),
    passport_type: asText(get(rec, "passport type")),
    profile_pic_url: cleanUrl(get(rec, "profile pic")),
    visa_exp_date: parseEnglishDateToISO(get(rec, "visa exp date")),
    visa_iss_date: parseEnglishDateToISO(get(rec, "visa iss date")),
    visa_issued_at: asText(get(rec, "Visa Issued at")),
    visa_number: asText(get(rec, "Visa number")),
    visa_type: asText(get(rec, "visa type")),
    wp_expire_date: parseEnglishDateToISO(get(rec, "wp expire date")),
    wp_issue_date: parseEnglishDateToISO(get(rec, "wp issue date")),
    wp_number: asText(get(rec, "wp number")),
    wp_type: asText(get(rec, "wp type")),
  };
}

export function validateImportRows(rows: ImportRow[], rowOffset = 2): ImportError[] {
  const errs: ImportError[] = [];
  rows.forEach((r, idx) => {
    if (!r.full_name.trim()) errs.push({ rowIndex: idx + rowOffset, field: "full_name", reason: "ต้องมีชื่อ (Name)" });
  });
  return errs;
}
