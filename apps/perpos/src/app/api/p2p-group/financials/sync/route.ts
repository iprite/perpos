import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { guard, p2pgError } from "../../_lib";
import { SKIP_REASON_LABEL, syncFinancialsFromAccounting } from "@/lib/p2p-group/accounting-sync";

/**
 * POST ?orgId=  body { period: "YYYY-MM-01" }
 * ดึงตัวเลขจากระบบบัญชีของบริษัทที่ผูก org ไว้ → เขียนลง p2pg_financials (source='accounting')
 * ไม่ทับแถวที่กรอกเอง/ปิดงวดแล้ว · คืนสรุปว่าดึงได้กี่บริษัท ข้ามกี่บริษัทเพราะอะไร
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as { period?: string };
  const period = body.period ?? "";
  if (!/^\d{4}-\d{2}-01$/.test(period))
    return p2pgError("ต้องระบุงวดเป็นวันที่ 1 ของเดือน (YYYY-MM-01)", 400);

  const admin = createAdminClient();
  await setAuditContext(req, g.auth.userId, g.auth.orgId);

  try {
    const result = await syncFinancialsFromAccounting(
      admin,
      g.auth.orgId,
      period,
      g.auth.userId,
    );
    return NextResponse.json({
      ...result,
      skipped: result.skipped.map((s) => ({ ...s, reasonLabel: SKIP_REASON_LABEL[s.reason] })),
    });
  } catch (e) {
    return p2pgError(e instanceof Error ? e.message : "ดึงข้อมูลไม่สำเร็จ", 500);
  }
}
