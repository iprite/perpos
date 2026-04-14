export type CustomerOption = { id: string; name: string };

export type WorkerRow = {
  id: string;
  worker_id: string | null;
  full_name: string;
  customer_id: string | null;
  passport_no: string | null;
  passport_type: string | null;
  passport_expire_date: string | null;
  nationality: string | null;
  birth_date: string | null;
  os_sex: string | null;
  profile_pic_url: string | null;
  visa_exp_date: string | null;
  wp_number: string | null;
  wp_expire_date: string | null;
  wp_type: string | null;
  created_at?: string;
};

export type WorkerDocumentRow = {
  id: string;
  doc_type: string | null;
  expiry_date: string | null;
  storage_provider: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  created_at: string;
};

export const nationalityOptions = [
  { label: "เลือก", value: "" },
  { label: "เมียนมา", value: "เมียนมา" },
  { label: "กัมพูชา", value: "กัมพูชา" },
  { label: "ลาว", value: "ลาว" },
];

export function normalizeSexForTabs(value: string) {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!v) return "";
  if (v === "ชาย" || v === "male" || v === "m") return "ชาย";
  if (v === "หญิง" || v === "female" || v === "f") return "หญิง";
  return "";
}
