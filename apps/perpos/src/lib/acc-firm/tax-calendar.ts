/**
 * tax-calendar.ts — ปฏิทินภาษีข้าม client ของสำนักงานบัญชี (F1)
 *
 * แสดงสถานะการยื่นภาษีจริงจาก `acc_tax_filings` ของ client org ที่ engagement active.
 * Decision D1: แสดงเฉพาะ record จริง (ไม่ synthesize "ตกหล่น" — กัน over-flag non-VAT).
 *
 * Pattern เดียวกับ acc_firm เดิม: caller (route) เช็ค auth (requireModuleMember) ก่อน
 * แล้ว lib ใช้ admin client (service-role) อ่านข้าม client org — firm member ไม่ได้เป็น
 * สมาชิก client org จึงต้อง bypass RLS + กรอง acc_firm_clients active เป็น scope.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type TaxKind = "pp30" | "pnd1" | "pnd3" | "pnd53";
export type FilingStatus = "filed" | "ready" | "draft" | "missing";
/** derived → สีของ badge */
export type FilingState = "done" | "ready" | "overdue" | "pending";

export type TaxFilingRow = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  taxKind: TaxKind;
  periodYear: number;
  periodMonth: number;
  status: FilingStatus;
  dueDate: string; // YYYY-MM-DD
  filedAt: string | null;
  netPayable: number | null; // pp30
  whtTotal: number | null; // pnd*
  state: FilingState;
  /** ภายใน 7 วัน (near-due) — ใช้เน้น pending ที่ใกล้ครบกำหนด */
  nearDue: boolean;
};

export type TaxCalendarResponse = {
  rows: TaxFilingRow[];
  summary: { done: number; ready: number; overdue: number; pending: number };
  asOf: string;
};

/** จำนวนวันก่อนครบกำหนดที่ถือว่า "ใกล้ครบกำหนด" (near-due) */
const NEAR_DUE_DAYS = 7;

/**
 * derive สถานะที่ใช้แสดงผล (D1):
 *   - filed                         → done
 *   - ready                         → ready
 *   - draft && due_date < today     → overdue
 *   - draft && due_date >= today    → pending
 */
function deriveState(
  status: "draft" | "ready" | "filed",
  dueDate: string,
  today: string,
): FilingState {
  if (status === "filed") return "done";
  if (status === "ready") return "ready";
  // status === 'draft'
  return dueDate < today ? "overdue" : "pending";
}

/**
 * getTaxCalendar — ดึงสถานะการยื่นภาษีจริงข้าม client org ของ firm
 * @param firmOrgId  org ของสำนักงานบัญชี
 * @param db         admin Supabase client (service-role) — caller สร้าง+เช็ค auth แล้ว
 * @param year       กรองปี (default = ปีปัจจุบัน)
 */
export async function getTaxCalendar(
  firmOrgId: string,
  db: SupabaseClient,
  year?: number,
): Promise<TaxCalendarResponse> {
  const today = new Date().toISOString().slice(0, 10);
  const targetYear = year ?? new Date().getFullYear();

  // 1. active client orgs (scope)
  const { data: clients, error: cErr } = await db
    .from("acc_firm_clients")
    .select(
      `client_org_id,
       client_org:organizations!acc_firm_clients_client_org_id_fkey (id, name, slug)`,
    )
    .eq("firm_org_id", firmOrgId)
    .eq("status", "active");

  if (cErr) throw new Error(cErr.message);
  if (!clients?.length) {
    return { rows: [], summary: { done: 0, ready: 0, overdue: 0, pending: 0 }, asOf: today };
  }

  const orgMeta = new Map<string, { id: string; name: string; slug: string }>();
  for (const c of clients) {
    const o = c.client_org as unknown as { id: string; name: string; slug: string } | null;
    if (o?.id) orgMeta.set(o.id, o);
  }
  const clientOrgIds = Array.from(orgMeta.keys());
  if (!clientOrgIds.length) {
    return { rows: [], summary: { done: 0, ready: 0, overdue: 0, pending: 0 }, asOf: today };
  }

  // 2. filings ของปีที่เลือก ข้าม client
  const { data: filings, error: fErr } = await db
    .from("acc_tax_filings")
    .select(
      "org_id, tax_kind, period_year, period_month, status, due_date, filed_at, net_payable, wht_total",
    )
    .in("org_id", clientOrgIds)
    .eq("period_year", targetYear)
    .order("due_date", { ascending: true });

  if (fErr) throw new Error(fErr.message);

  // 3. map → TaxFilingRow + summary
  const summary = { done: 0, ready: 0, overdue: 0, pending: 0 };
  const nearDueCutoff = new Date(Date.now() + NEAR_DUE_DAYS * 86400_000).toISOString().slice(0, 10);

  const rows: TaxFilingRow[] = [];
  for (const f of filings ?? []) {
    const org = orgMeta.get(f.org_id as string);
    if (!org) continue;
    const status = f.status as "draft" | "ready" | "filed";
    const dueDate = String(f.due_date);
    const state = deriveState(status, dueDate, today);
    summary[state]++;
    rows.push({
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
      taxKind: f.tax_kind as TaxKind,
      periodYear: Number(f.period_year),
      periodMonth: Number(f.period_month),
      status: status as FilingStatus,
      dueDate,
      filedAt: (f.filed_at as string | null) ?? null,
      netPayable: f.net_payable != null ? Number(f.net_payable) : null,
      whtTotal: f.wht_total != null ? Number(f.wht_total) : null,
      state,
      nearDue: state === "pending" && dueDate <= nearDueCutoff,
    });
  }

  // จัดลำดับ: overdue ก่อน → pending(near-due) → pending → ready → done; ในกลุ่มเรียงตาม due
  const STATE_ORDER: Record<FilingState, number> = { overdue: 0, pending: 1, ready: 2, done: 3 };
  rows.sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      Number(b.nearDue) - Number(a.nearDue) ||
      a.dueDate.localeCompare(b.dueDate),
  );

  return { rows, summary, asOf: today };
}
