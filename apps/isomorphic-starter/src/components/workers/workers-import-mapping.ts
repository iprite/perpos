import { parseEnglishDateToISO } from "@/utils/date";

export type ImportRow = {
  worker_id: string | null;
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
  visa_type: string | null;
  wp_expire_date: string | null;
  wp_issue_date: string | null;
  wp_number: string | null;
  wp_type: string | null;
};

export type ImportError = { rowIndex: number; field: string; reason: string };

export type ImportMappingRow = { field: keyof ImportRow; label: string; source: string | null };

function normalizeKey(k: string) {
  return String(k ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "");
}

function getAny(rec: Record<string, string>, names: string[]) {
  for (const name of names) {
    const direct = rec[name];
    if (typeof direct === "string") return direct;
  }

  const candidates = names.map(normalizeKey);
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

function pickAny(rec: Record<string, string>, names: string[]): { value: string; source: string | null } {
  for (const name of names) {
    const direct = rec[name];
    if (typeof direct === "string") return { value: direct, source: name };
  }

  const candidates = names.map(normalizeKey);
  for (const k of Object.keys(rec)) {
    const nk = normalizeKey(k);
    if (!nk) continue;
    const idx = candidates.indexOf(nk);
    if (idx !== -1) return { value: rec[k] ?? "", source: k };
  }

  for (const k of Object.keys(rec)) {
    const nk = normalizeKey(k);
    if (!nk) continue;
    if (candidates.some((c) => nk.includes(c) || c.includes(nk))) return { value: rec[k] ?? "", source: k };
  }

  return { value: "", source: null };
}

function asText(v: string) {
  const t = String(v ?? "").trim();
  return t.length ? t : null;
}

function detectEmployerKey(rec: Record<string, string>) {
  for (const k of Object.keys(rec)) {
    const nk = normalizeKey(k);
    if (!nk) continue;
    if (nk.includes("employer") || nk.includes("employers") || nk.includes("นายจ้าง") || nk.includes("ลูกค้า")) return rec[k] ?? "";
  }
  return "";
}

function detectEmployerKeyWithSource(rec: Record<string, string>): { value: string; source: string | null } {
  for (const k of Object.keys(rec)) {
    const nk = normalizeKey(k);
    if (!nk) continue;
    if (nk.includes("employer") || nk.includes("employers") || nk.includes("นายจ้าง") || nk.includes("ลูกค้า")) return { value: rec[k] ?? "", source: k };
  }
  return { value: "", source: null };
}

function cleanUrl(v: string) {
  const t = String(v ?? "").trim();
  if (!t) return null;
  if (t.startsWith("//")) return `https:${t}`;
  return t;
}

function normalizePassportType(v: string) {
  const t = String(v ?? "").trim().toUpperCase();
  if (t === "CI" || t === "PP") return t;
  return null;
}

export function explainWorkerImportMapping(rec: Record<string, string>): ImportMappingRow[] {
  const workerId = pickAny(rec, ["Alien Identification Number", "worker id", "Worker ID", "เลขประจำตัวแรงงาน"]);
  const fullName = pickAny(rec, ["Name", "ชื่อ-นามสกุล", "ชื่อ"]);
  const employer = pickAny(rec, ["Employer", "Employers", "Employers (unique id)", "Employer ID", "Employer (Map ID)", "employers", "นายจ้าง"]);
  const employerFallback = detectEmployerKeyWithSource(rec);
  const nationality = pickAny(rec, ["os nation", "nation", "สัญชาติ"]);
  const passportNo = pickAny(rec, ["passport no", "passport", "เลขพาสปอร์ต"]);
  const birth = pickAny(rec, ["birth", "birth date", "วันเกิด"]);
  const sex = pickAny(rec, ["os sex", "sex", "เพศ"]);
  const passportExpire = pickAny(rec, ["passport expire date", "passport exp date", "พาสปอร์ตหมดอายุ"]);
  const passportType = pickAny(rec, ["passport type", "ประเภทพาสปอร์ต"]);
  const profilePic = pickAny(rec, ["profile pic", "profile picture", "รูปโปรไฟล์"]);
  const visaExp = pickAny(rec, ["visa exp date", "วีซ่าหมดอายุ"]);
  const wpNo = pickAny(rec, ["wp number", "work permit no"]);
  const wpExp = pickAny(rec, ["wp expire date", "ใบอนุญาตทำงานหมดอายุ"]);
  const wpType = pickAny(rec, ["wp type", "ประเภทใบอนุญาตทำงาน"]);

  return [
    { field: "full_name", label: "ชื่อ-นามสกุล", source: fullName.source },
    { field: "employer_import_temp_id", label: "Employer (สำหรับ map)", source: employer.source ?? employerFallback.source },
    { field: "worker_id", label: "เลขประจำตัวแรงงาน", source: workerId.source },
    { field: "passport_no", label: "เลขพาสปอร์ต", source: passportNo.source },
    { field: "passport_type", label: "ประเภทพาสปอร์ต", source: passportType.source },
    { field: "nationality", label: "สัญชาติ", source: nationality.source },
    { field: "birth_date", label: "วันเกิด", source: birth.source },
    { field: "os_sex", label: "เพศ", source: sex.source },
    { field: "passport_expire_date", label: "พาสปอร์ตหมดอายุ", source: passportExpire.source },
    { field: "visa_exp_date", label: "วีซ่าหมดอายุ", source: visaExp.source },
    { field: "wp_number", label: "เลขใบอนุญาตทำงาน", source: wpNo.source },
    { field: "wp_expire_date", label: "ใบอนุญาตทำงานหมดอายุ", source: wpExp.source },
    { field: "wp_type", label: "ประเภทใบอนุญาตทำงาน", source: wpType.source },
    { field: "profile_pic_url", label: "รูปโปรไฟล์", source: profilePic.source },
  ];
}

export function mapCsvRecordToWorker(rec: Record<string, string>): ImportRow {
  return {
    worker_id:
      asText(getAny(rec, ["worker id", "Worker ID", "เลขประจำตัวแรงงาน"])) ??
      asText(getAny(rec, ["Alien Identification Number"])) ??
      null,
    full_name: String(getAny(rec, ["Name", "ชื่อ-นามสกุล", "ชื่อ"]) ?? "").trim(),
    employer_import_temp_id:
      asText(getAny(rec, ["Employer", "Employers", "Employers (unique id)", "Employer ID", "Employer (Map ID)", "employers", "นายจ้าง"])) ??
      asText(detectEmployerKey(rec)) ??
      null,
    nationality: asText(getAny(rec, ["os nation", "nation", "สัญชาติ"])) ?? null,
    passport_no: asText(getAny(rec, ["passport no", "passport", "เลขพาสปอร์ต"])) ?? null,
    alien_identification_number:
      asText(getAny(rec, ["Alien Identification Number"])) ??
      asText(getAny(rec, ["worker id", "Worker ID", "เลขประจำตัวแรงงาน"])) ??
      null,
    birth_date: parseEnglishDateToISO(getAny(rec, ["birth", "birth date", "วันเกิด"])),
    father_name_en: asText(getAny(rec, ["Father's name (English)"])) ?? null,
    os_passport_type: asText(getAny(rec, ["os passport type"])) ?? null,
    os_sex: asText(getAny(rec, ["os sex", "sex", "เพศ"])) ?? null,
    os_worker_type: asText(getAny(rec, ["os worker type"])) ?? null,
    os_wp_type: asText(getAny(rec, ["os wp type"])) ?? null,
    passport_expire_date: parseEnglishDateToISO(getAny(rec, ["passport expire date", "passport exp date", "พาสปอร์ตหมดอายุ"])),
    passport_issue_at: asText(getAny(rec, ["passport issue at"])) ?? null,
    passport_issue_country: asText(getAny(rec, ["passport issue country"])) ?? null,
    passport_issue_date: parseEnglishDateToISO(getAny(rec, ["passport issue date"])),
    passport_type: normalizePassportType(getAny(rec, ["passport type", "ประเภทพาสปอร์ต"])),
    profile_pic_url: cleanUrl(getAny(rec, ["profile pic", "profile picture", "รูปโปรไฟล์"])),
    visa_exp_date: parseEnglishDateToISO(getAny(rec, ["visa exp date", "วีซ่าหมดอายุ"])),
    visa_iss_date: parseEnglishDateToISO(getAny(rec, ["visa iss date"])),
    visa_issued_at: asText(getAny(rec, ["Visa Issued at"])) ?? null,
    visa_type: asText(getAny(rec, ["visa type"])) ?? null,
    wp_expire_date: parseEnglishDateToISO(getAny(rec, ["wp expire date", "ใบอนุญาตทำงานหมดอายุ"])),
    wp_issue_date: parseEnglishDateToISO(getAny(rec, ["wp issue date"])),
    wp_number: asText(getAny(rec, ["wp number", "work permit no"])) ?? null,
    wp_type: asText(getAny(rec, ["wp type", "ประเภทใบอนุญาตทำงาน"])) ?? null,
  };
}

export function validateImportRows(rows: ImportRow[], rowOffset = 2): ImportError[] {
  const errs: ImportError[] = [];
  rows.forEach((r, idx) => {
    if (!r.full_name.trim()) errs.push({ rowIndex: idx + rowOffset, field: "full_name", reason: "ต้องมีชื่อ (Name)" });
  });
  return errs;
}
