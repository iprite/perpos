import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "../../../_lib/auth";
import { createAdminClient } from "../../../_lib/supabase";
import { sendLineMessages } from "@/lib/line/send-messages";
import { listOrders } from "@/lib/gov-procure/orders";
import { getSettings } from "@/lib/gov-procure/settings";
import { computeSummary } from "@/lib/gov-procure/summary";
import { buildWeeklyPortfolioFlex } from "@/lib/gov-procure/line-cards";
import {
  listGovProcureOrgIds,
  getOrgSlug,
  getRecipientLineUserIds,
  pushToGovTargets,
  normalizeRecipientRoles,
  thaiDateLabel,
} from "@/lib/gov-procure/notify";
import type { GovProcureRole } from "@/lib/gov-procure/types";

/**
 * POST /api/gov-procure/notify/weekly  (cron จันทร์ 08:00 — T2 รายงานพอร์ตรายสัปดาห์)
 *
 * loop org ที่เปิด module + line_weekly_enabled + พอร์ตไม่ว่าง (>0 orders) → ส่ง Flex สรุปพอร์ต
 * ให้ owner (+manager ถ้า line_recipients มี manager). org-context: query ด้วย org_id ตรง.
 * กัน double-run: last_weekly_sent_at ภายใน 6 วัน → ข้าม.
 */
const WEEK_GUARD_MS = 6 * 24 * 60 * 60 * 1000;

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
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const weekLabel = `รอบสัปดาห์ · ${thaiDateLabel(now)}`;
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
      if (!settings.line_weekly_enabled) {
        skipped++;
        continue;
      }
      // idempotency กัน double-run ภายในสัปดาห์เดียว
      if (
        settings.last_weekly_sent_at &&
        now.getTime() - new Date(settings.last_weekly_sent_at).getTime() < WEEK_GUARD_MS
      ) {
        skipped++;
        continue;
      }

      const orders = await listOrders(admin, orgId);
      if (orders.length === 0) {
        skipped++;
        continue;
      }
      const summary = computeSummary(orders, settings.sla_threshold, now);
      const closedThisWeek = orders.filter(
        (o) => o.stage === "closed" && new Date(o.updated_at).getTime() >= weekAgo,
      ).length;

      // ผู้รับ T2 = owner เสมอ (+manager ถ้า toggle ใน line_recipients)
      const recipientRoles = normalizeRecipientRoles(settings.line_recipients);
      const roles: GovProcureRole[] = ["owner"];
      if (recipientRoles.includes("manager")) roles.push("manager");

      const to = await getRecipientLineUserIds(admin, orgId, roles);

      const slug = await getOrgSlug(admin, orgId);
      const flex = buildWeeklyPortfolioFlex({ summary, closedThisWeek, weekLabel });
      const ok = await pushToGovTargets(admin, orgId, to, [flex]);
      if (!ok) {
        skipped++;
        continue;
      }

      await admin
        .from("gov_procure_settings")
        .upsert(
          { org_id: orgId, last_weekly_sent_at: now.toISOString() },
          { onConflict: "org_id" },
        );
      sent++;
    } catch (e) {
      console.error("[gov-procure] weekly notify failed", orgId, e);
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, scanned, sent, skipped });
}
