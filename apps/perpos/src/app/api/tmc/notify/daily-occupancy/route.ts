import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "../../../_lib/auth";
import { createAdminClient } from "../../../_lib/supabase";
import { sendLineMessages } from "@/lib/line/send-messages";
import { computeTmcDailyOccupancy, bangkokToday } from "@/lib/tmc/daily-occupancy";
import { buildTmcDailyOccupancyFlex } from "@/lib/tmc/line-cards";

/**
 * POST /api/tmc/notify/daily-occupancy  (cron ทุกวัน 20:00 น. เวลาไทย = 13:00 UTC)
 *
 * ปิดยอดห้องพักของวันนั้น → ส่ง Flex ให้ทีมผู้บริหาร TMC (รายคน, multicast)
 * org-context: query ด้วย org_id ตรงเสมอ (service-role) — ไม่พึ่ง active org ของผู้รับ
 *
 * query params (ทดสอบ): `?date=YYYY-MM-DD` ระบุวัน · `?dry=1` คืน payload โดยไม่ส่ง LINE
 */

const MODULE_KEY = "tmc";

/**
 * ผู้รับรายงาน — LINE user id ของทีมผู้บริหาร (คงที่ตามที่ตกลง)
 * override ได้ด้วย env `TMC_DAILY_REPORT_LINE_IDS` (คั่นด้วย comma)
 */
const DEFAULT_RECIPIENTS = [
  "U44e3bafd796a8c323969bf428a9260ac",
  "Udacb99dd58f40dcdde8306f153f349ae",
  "Ub87b7849a41552bd62da41241f0ec315",
  "Uc1178cc76d2cb9b19ce4de09eecdd663",
];

function recipients(): string[] {
  const raw = process.env.TMC_DAILY_REPORT_LINE_IDS ?? "";
  const fromEnv = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_RECIPIENTS;
}

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
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? bangkokToday();
  const dry = url.searchParams.get("dry") === "1";

  const { data: orgRows, error } = await admin
    .from("org_module_settings")
    .select("organization_id")
    .eq("module_key", MODULE_KEY)
    .eq("is_enabled", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const to = recipients();
  const results: { orgId: string; sent: boolean; error?: string }[] = [];
  let payload: unknown = null;

  for (const row of orgRows ?? []) {
    const orgId = (row as { organization_id: string }).organization_id;
    try {
      const data = await computeTmcDailyOccupancy(admin, orgId, date);
      // ไม่มีห้องเปิดขาย = org นี้ยังไม่ได้ตั้งค่าห้องพัก → ไม่ส่ง (กันการ์ดว่างเปล่า)
      if (data.rooms === 0) {
        results.push({ orgId, sent: false, error: "no_rentable_rooms" });
        continue;
      }
      const flex = buildTmcDailyOccupancyFlex(data);
      if (dry) {
        payload = { data, flex };
        results.push({ orgId, sent: false, error: "dry_run" });
        continue;
      }
      const res = await sendLineMessages({ to, messages: [flex] });
      results.push({ orgId, sent: res.ok, error: res.ok ? undefined : res.error });
    } catch (e) {
      console.error("[tmc] daily occupancy notify failed", orgId, e);
      results.push({ orgId, sent: false, error: (e as Error).message });
    }
  }

  return NextResponse.json({
    ok: true,
    date,
    recipients: to.length,
    results,
    ...(dry ? { payload } : {}),
  });
}
