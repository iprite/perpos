import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "../../../_lib/auth";
import { createAdminClient } from "../../../_lib/supabase";
import { sendLineMessages } from "@/lib/line/send-messages";
import { listOrders } from "@/lib/gov-procure/orders";
import { getSettings } from "@/lib/gov-procure/settings";
import { computeSummary } from "@/lib/gov-procure/summary";
import { buildReceivableAlertFlex } from "@/lib/gov-procure/line-cards";
import {
  listGovProcureOrgIds,
  getOrgSlug,
  getRecipientLineUserIds,
  pushToGovTargets,
  normalizeRecipientRoles,
} from "@/lib/gov-procure/notify";

/**
 * POST /api/gov-procure/notify/aging  (cron รายวัน 09:00 — T1 เงินค้างรับเกินกำหนด)
 *
 * loop org ที่เปิด module gov_procure + line_alert_enabled → หา order delivered ที่ aging>SLA.
 * ส่ง Flex ให้ owner+manager (line_recipients) ที่ผูก LINE แล้ว ผ่าน sendLineMessages (multicast).
 *
 * anti-spam (§5c T1): ส่งเฉพาะมี overdue · 1 การ์ด/org/วัน (cron รายวัน) ·
 * re-alert เมื่อชุด overdue เปลี่ยน (last_aging_alert_key) หรือครบทุก 3 วัน (last_aging_alert_at).
 * org-context: query orders ด้วย org_id ตรงเสมอ (ไม่พึ่ง active org ผู้รับ).
 */
const REALERT_MS = 3 * 24 * 60 * 60 * 1000; // 3 วัน

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const cronErr = requireCron(req);
  if (cronErr) return cronErr;

  const admin = createAdminClient();
  const now = new Date();
  let scanned = 0;
  let sent = 0;
  let skipped = 0;

  let orgIds: string[];
  try {
    orgIds = await listGovProcureOrgIds(admin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  for (const orgId of orgIds) {
    scanned++;
    try {
      const settings = await getSettings(admin, orgId);
      if (!settings.line_alert_enabled) {
        skipped++;
        continue;
      }

      const orders = await listOrders(admin, orgId);
      const summary = computeSummary(orders, settings.sla_threshold, now);
      const overdue = summary.receivables.filter((r) => r.overdue);
      if (overdue.length === 0) {
        skipped++;
        continue;
      }

      // signature ชุด overdue — เปลี่ยน = re-alert ทันที (งานใหม่ค้าง/งานเดิมได้รับแล้ว)
      const key = overdue
        .map((r) => r.order_id)
        .sort()
        .join(",");
      const last = settings.last_aging_alert_at ? new Date(settings.last_aging_alert_at) : null;
      const keyChanged = (settings.last_aging_alert_key ?? "") !== key;
      const stale = !last || now.getTime() - last.getTime() >= REALERT_MS;
      if (!keyChanged && !stale) {
        skipped++;
        continue;
      }

      const roles = normalizeRecipientRoles(settings.line_recipients);
      const to = await getRecipientLineUserIds(admin, orgId, roles);

      const slug = await getOrgSlug(admin, orgId);
      const flex = buildReceivableAlertFlex(overdue, settings.sla_threshold, slug);
      // ส่งเข้ากลุ่มที่ผูกไว้ + ผู้รับรายบุคคล — ไม่มีปลายทางเลย = ไม่ mark state (retry รอบหน้า)
      const ok = await pushToGovTargets(admin, orgId, to, [flex]);
      if (!ok) {
        skipped++;
        continue;
      }

      await admin
        .from("gov_procure_settings")
        .upsert(
          { org_id: orgId, last_aging_alert_at: now.toISOString(), last_aging_alert_key: key },
          { onConflict: "org_id" },
        );
      sent++;
    } catch (e) {
      // งาน 1 org พลาด ไม่ควรล้ม cron ทั้งรอบ
      console.error("[gov-procure] aging notify failed", orgId, e);
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, scanned, sent, skipped });
}
