/**
 * GET /api/acc-firm/tax-calendar?orgId=<firmOrgId>&year=<YYYY>
 *
 * ปฏิทินภาษีข้าม client (F1) — สถานะการยื่นจริงจาก acc_tax_filings ของ client org
 * ที่ engagement active. year optional (default = ปีปัจจุบัน).
 *
 * guard: requireModuleMember(req, firmOrgId, 'acc_firm') — read-only (viewer เปิดได้).
 * Uses admin client (service role): firm member ไม่ได้เป็นสมาชิกของทุก client org.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../_lib/module-auth";
import { createAdminClient } from "../../_lib/supabase";
import { getTaxCalendar } from "@/lib/acc-firm/tax-calendar";

export async function GET(req: NextRequest) {
  const firmOrgId = req.nextUrl.searchParams.get("orgId");
  if (!firmOrgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? Number(yearParam) : undefined;
  if (yearParam && (!Number.isInteger(year) || year! < 2000 || year! > 2100)) {
    return NextResponse.json({ error: "ปีไม่ถูกต้อง" }, { status: 400 });
  }

  const auth = await requireModuleMember(req, firmOrgId, "acc_firm");
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminClient();
    const result = await getTaxCalendar(firmOrgId, admin, year);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการดึงปฏิทินภาษี" },
      { status: 500 },
    );
  }
}
