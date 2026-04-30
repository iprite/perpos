export type PoaRequestRow = {
  id: string;
  display_id: string | null;
  import_temp_id: string | null;
  poa_request_type_id: string | null;
  poa_request_types?: { id: string; name: string; base_price: number } | null;
  poa_request_type_name?: string | null;
  created_at?: string | null;
  representative_profile_id: string | null;
  representative_rep_code?: string | null;
  representative_name?: string | null;
  representative_company_name?: string | null;
  representative_prefix?: string | null;
  representative_first_name?: string | null;
  representative_last_name?: string | null;
  representative_id_card_no?: string | null;
  representative_address?: string | null;
  employer_name: string | null;
  employer_address: string | null;
  employer_tax_id: string | null;
  employer_tel: string | null;
  employer_type: string | null;
  worker_count: number;
  worker_male: number | null;
  worker_female: number | null;
  worker_nation: string | null;
  worker_type: string | null;
  status: string;
  payment_amount: number | null;
  payment_date: string | null;
  payment_file_url: string | null;
  payment_status_text: string | null;
  profiles?: { email: string | null }[] | null;
};

export type PoaRequestItemRow = {
  id: string;
  poa_request_type_id: string;
  unit_price_per_worker: number;
  worker_count: number;
  total_price: number;
  payment_status: string;
  poa_request_types?: { id: string; name: string; base_price: number } | null;
};

export type PoaItemPaymentRow = {
  id: string;
  poa_request_item_id: string;
  amount: number;
  paid_date: string | null;
  reference_no: string | null;
  slip_object_path: string | null;
  status: string;
  created_at: string;
};

export type PoaDocumentRow = { id: string; pdf_object_path: string; version: number; created_at: string };

export function poaStatusLabel(s: string) {
  if (s === "draft") return "ร่าง";
  if (s === "submitted") return "รอชำระ";
  if (s === "paid") return "ชำระแล้ว";
  if (s === "completed") return "สร้าง PDF แล้ว";
  if (s === "need_info") return "ขอข้อมูลเพิ่ม";
  if (s === "rejected") return "ปฏิเสธ";
  if (s === "cancelled") return "ยกเลิก";
  if (s === "issued") return "ออกหนังสือแล้ว";
  return s;
}

export function poaSumTotal(items: PoaRequestItemRow[]) {
  return items.reduce((acc, x) => acc + Number(x.total_price ?? 0), 0);
}
