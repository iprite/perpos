export type CustomerRel =
  | {
      name: string;
      tax_id?: string | null;
      address?: string | null;
      contact_name?: string | null;
      phone?: string | null;
    }
  | {
      name: string;
      tax_id?: string | null;
      address?: string | null;
      contact_name?: string | null;
      phone?: string | null;
    }[]
  | null;
export type ServiceRel = { name: string } | { name: string }[] | null;

export type OrderRow = {
  id: string;
  display_id: string | null;
  status: string;
  total: number;
  paid_amount: number;
  remaining_amount: number;
  created_at: string;
  source_quote_id?: string | null;
  customers?: CustomerRel;
  closed_at?: string | null;
};

export type OrderItemRow = {
  id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  ops_status: "not_started" | "in_progress" | "done";
  ops_started_at: string | null;
  ops_completed_at: string | null;
  ops_note?: string | null;
  services?: ServiceRel;
};

export type PaymentRow = {
  id: string;
  installment_no: number;
  amount: number;
  slip_url: string | null;
  slip_storage_provider?: string | null;
  slip_storage_bucket?: string | null;
  slip_storage_path?: string | null;
  slip_file_name?: string | null;
  created_at: string;
  confirmed_at: string | null;
};

export type EventRow = {
  id: string;
  event_type: string;
  message: string;
  created_at: string;
  created_by_profile_id?: string | null;
  created_by_email?: string | null;
};

export function asMoney(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function customerNameFromRel(rel: CustomerRel) {
  if (!rel) return "-";
  if (Array.isArray(rel)) return rel[0]?.name ?? "-";
  return rel.name ?? "-";
}

export function serviceNameFromRel(rel: ServiceRel) {
  if (!rel) return "-";
  if (Array.isArray(rel)) return rel[0]?.name ?? "-";
  return rel.name ?? "-";
}

export function statusLabel(status: string) {
  if (status === "draft") return "เสนอราคา";
  if (status === "in_progress") return "กำลังดำเนินการ";
  if (status === "billed_first_installment") return "วางบิลงวดแรกแล้ว";
  if (status === "paid_first_installment") return "ชำระงวดแรกแล้ว";
  if (status === "completed") return "เสร็จสิ้น";
  if (status === "cancelled") return "ยกเลิก";
  return status || "-";
}

export function formatDateTime(s: string | null | undefined) {
  if (!s) return "-";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
