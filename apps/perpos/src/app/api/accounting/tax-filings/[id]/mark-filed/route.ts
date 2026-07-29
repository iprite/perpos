import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { setAuditContext } from "../../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canWriteBackstage, accError } from "../../../_lib";
import {
  buildUpdateFlex,
  companyNameByOrg,
  notifyClientGroupByOrg,
  TAX_LABEL,
} from "@/lib/acc-firm/line-group";

const ROUTE = "/api/accounting/tax-filings/[id]/mark-filed";
type Ctx = { params: Promise<{ id: string }> };

/** POST → ทำเครื่องหมายว่ายื่นแล้ว (accountant). filed → immutable. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth)) return accError("เฉพาะนักบัญชีเท่านั้นที่จัดการภาษีได้", 403);

  const admin = createAdminClient();
  const { data: filing } = await admin
    .from("acc_tax_filings")
    .select("status")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!filing) return accError("ไม่พบแบบภาษี", 404);
  if ((filing as { status: string }).status === "filed") return accError("แบบภาษีนี้ยื่นแล้ว", 409);

  await setAuditContext(req, auth.userId, orgId);
  const { data, error } = await admin
    .from("acc_tax_filings")
    .update({ status: "filed", filed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  // แจ้งกลุ่ม LINE ของลูกค้า (ถ้า org นี้เป็นลูกค้าของสำนักงานบัญชีที่ผูกกลุ่มไว้)
  const f = data as { tax_kind: string; period_year: number; period_month: number };
  await notifyClientGroupByOrg(admin, orgId, {
    event: "tax_filed",
    summary: `ยื่น ${TAX_LABEL[f.tax_kind] ?? f.tax_kind} งวด ${f.period_month}/${f.period_year}`,
    dedupKey: `tax_filed:${id}`,
    messages: [
      buildUpdateFlex({
        title: "✅ ยื่นภาษีให้แล้ว",
        companyName: await companyNameByOrg(admin, orgId),
        highlight: `${TAX_LABEL[f.tax_kind] ?? f.tax_kind} งวด ${f.period_month}/${f.period_year}`,
        highlightTone: "success",
        footnote: "เอกสารยืนยันการยื่นเก็บไว้ในคลังเอกสารของบริษัท",
      }),
    ],
  });

  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}
