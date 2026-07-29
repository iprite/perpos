/**
 * line-reminders.ts — งานอัตโนมัติที่ส่งเข้ากลุ่ม LINE ของลูกค้า (acc_firm)
 *
 * เรียกจาก scheduler tier t60 (วันละหลายรอบก็ปลอดภัย — dedup ต่อ "แบบภาษี × จุดเตือน")
 * เตือนล่วงหน้า T-7 / T-3 / T-1 และวันครบกำหนด สำหรับแบบภาษีที่ยังไม่ยื่น
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildUpdateFlex, notifyClientGroup, TAX_LABEL } from "./line-group";

/** จุดเตือน (จำนวนวันก่อนครบกำหนด) */
const REMIND_DAYS = [7, 3, 1, 0] as const;

/** วันที่ตามเวลาไทย (YYYY-MM-DD) */
function bangkokToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    dateStyle: "short",
  }).format(now);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export type TaxDueSweepResult = { checked: number; sent: number };

/**
 * เตือนกำหนดยื่นภาษีเข้ากลุ่มลูกค้า — best-effort, ไม่ throw
 * @param admin service-role client (อ่านข้าม org ของลูกค้า)
 */
export async function sweepClientTaxDueReminders(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<TaxDueSweepResult> {
  const today = bangkokToday(now);
  const horizon = addDays(today, Math.max(...REMIND_DAYS));

  // 1) กลุ่มที่ผูกแล้วและเปิดหัวข้อ "ใกล้ครบกำหนดยื่นภาษี"
  const { data: groups } = await admin
    .from("acc_firm_client_line_groups")
    .select("service_client_id")
    .eq("status", "linked")
    .eq("notify_tax_due", true);

  const clientIds = ((groups ?? []) as { service_client_id: string }[]).map(
    (g) => g.service_client_id,
  );
  if (!clientIds.length) return { checked: 0, sent: 0 };

  // 2) map org ของลูกค้า → ลูกค้าในทะเบียน (เฉพาะรายที่เชื่อม org แล้ว)
  const { data: clients } = await admin
    .from("acc_firm_service_clients")
    .select("id, company_name, client_org_id")
    .in("id", clientIds)
    .not("client_org_id", "is", null);

  const byOrg = new Map<string, { id: string; company_name: string }>();
  for (const c of (clients ?? []) as {
    id: string;
    company_name: string;
    client_org_id: string;
  }[]) {
    byOrg.set(c.client_org_id, { id: c.id, company_name: c.company_name });
  }
  if (!byOrg.size) return { checked: 0, sent: 0 };

  // 3) แบบภาษีที่ยังไม่ยื่นและครบกำหนดภายในกรอบเตือน
  const { data: filings } = await admin
    .from("acc_tax_filings")
    .select("id, org_id, tax_kind, period_year, period_month, status, due_date")
    .in("org_id", Array.from(byOrg.keys()))
    .in("status", ["draft", "ready"])
    .gte("due_date", today)
    .lte("due_date", horizon);

  const rows = (filings ?? []) as {
    id: string;
    org_id: string;
    tax_kind: string;
    period_year: number;
    period_month: number;
    status: string;
    due_date: string;
  }[];

  let sent = 0;
  for (const f of rows) {
    const left = daysBetween(today, f.due_date);
    if (!REMIND_DAYS.includes(left as (typeof REMIND_DAYS)[number])) continue;

    const client = byOrg.get(f.org_id);
    if (!client) continue;

    const label = TAX_LABEL[f.tax_kind] ?? f.tax_kind;
    const when = left === 0 ? "ครบกำหนดวันนี้" : `อีก ${left} วัน`;

    const res = await notifyClientGroup(admin, {
      serviceClientId: client.id,
      event: "tax_due",
      summary: `เตือน ${label} งวด ${f.period_month}/${f.period_year} — ${when}`,
      dedupKey: `tax_due:${f.id}:${left}`,
      messages: [
        buildUpdateFlex({
          title: left === 0 ? "⏰ ครบกำหนดยื่นภาษีวันนี้" : "📅 ใกล้ครบกำหนดยื่นภาษี",
          companyName: client.company_name,
          highlight: `${label} งวด ${f.period_month}/${f.period_year} — ${when}`,
          highlightTone: left <= 1 ? "warning" : "info",
          lines: [
            `กำหนดยื่น: ${f.due_date}`,
            f.status === "ready"
              ? "สถานะ: จัดทำเสร็จแล้ว รอยื่น"
              : "สถานะ: กำลังจัดทำ — หากมีเอกสารเพิ่ม ส่งเข้ามาได้เลย",
          ],
          footnote: "ข้อความอัตโนมัติจากระบบสำนักงานบัญชี",
        }),
      ],
    });
    if (res.sent) sent++;
  }

  return { checked: rows.length, sent };
}
