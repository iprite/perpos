export type CustomerRel = { name: string } | { name: string }[] | null;

export type OrderRel =
  | {
      display_id: string | null;
      customers?: CustomerRel;
    }
  | {
      display_id: string | null;
      customers?: CustomerRel;
    }[]
  | null;

export type ServiceRel =
  | {
      name: string | null;
      service_group_code: "mou" | "registration" | "general" | null;
    }
  | {
      name: string | null;
      service_group_code: "mou" | "registration" | "general" | null;
    }[]
  | null;

export type ServiceJobRow = {
  id: string;
  order_id: string;
  created_at: string;
  ops_status: "not_started" | "in_progress" | "done";
  ops_started_at: string | null;
  ops_completed_at: string | null;
  ops_note: string | null;
  orders?: OrderRel;
  services?: ServiceRel;
};

export function customerNameFromRel(rel: CustomerRel): string {
  if (!rel) return "-";
  if (Array.isArray(rel)) return String(rel[0]?.name ?? "-") || "-";
  return String((rel as any)?.name ?? "-") || "-";
}

export function serviceGroupLabel(code: string | null | undefined): "MOU" | "General" {
  return code === "mou" ? "MOU" : "General";
}

export function statusLabel(s: ServiceJobRow["ops_status"]): string {
  if (s === "not_started") return "ยังไม่เริ่ม";
  if (s === "in_progress") return "กำลังดำเนินการ";
  return "เสร็จสิ้น";
}

export function statusBadgeClass(s: ServiceJobRow["ops_status"]): string {
  if (s === "done") return "border-green-200 bg-green-50 text-green-700";
  if (s === "in_progress") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

export function durationLabel(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "-";
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : new Date();
  const ms = Math.max(0, end.getTime() - start.getTime());
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days} วัน`;
  if (hours >= 1) return `${hours} ชม.`;
  return `${Math.max(0, mins)} นาที`;
}

export function dateTH(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}
