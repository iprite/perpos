import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import {
  requireHrmMember,
  canWriteHrm,
  canApprovePayroll,
  hrmError,
  orgIdFromQuery,
} from "../../_lib";
import { getRun } from "@/lib/hrm/payroll";
import type { RunStatus } from "@/lib/hrm/types";
import { runPayrollBridge } from "@/lib/accounting/payroll-bridge";

const ROUTE = "/api/hrm/payroll/[id]";

type Ctx = { params: Promise<{ id: string }> };

/** การเปลี่ยนสถานะที่อนุญาต (state machine) */
const ALLOWED_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "draft", "cancelled"],
  approved: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

/** สถานะที่ต้องเป็น owner เท่านั้นจึงทำได้ (อนุมัติ/จ่าย) */
const OWNER_ONLY: RunStatus[] = ["approved", "paid"];

/** GET ?orgId= → รอบ + สลิปทั้งหมด */
export async function GET(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return hrmError("missing orgId");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const { run, payslips } = await getRun(auth.rls, orgId, id);
    if (!run) return hrmError("ไม่พบรอบเงินเดือน", 404);
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ run, payslips });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError((e as Error).message, 500);
  }
}

/** PATCH → เปลี่ยนสถานะรอบ (body: orgId, status). approve/paid = owner เท่านั้น */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  const nextStatus = String(body.status ?? "") as RunStatus;
  if (!orgId) return hrmError("missing orgId");
  if (
    !ALLOWED_TRANSITIONS[nextStatus] &&
    !OWNER_ONLY.includes(nextStatus) &&
    nextStatus !== "cancelled"
  ) {
    return hrmError("สถานะไม่ถูกต้อง");
  }

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteHrm(auth.role)) return hrmError("ไม่มีสิทธิ์", 403);

  // สิทธิ์อนุมัติ/จ่าย = owner เท่านั้น
  if (OWNER_ONLY.includes(nextStatus) && !canApprovePayroll(auth.role)) {
    return hrmError("เฉพาะเจ้าของ/ผู้ดูแล (owner) เท่านั้นที่อนุมัติหรือจ่ายเงินเดือนได้", 403);
  }

  const admin = createAdminClient();
  const { data: current, error: curErr } = await admin
    .from("hrm_payroll_runs")
    .select("status")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (curErr) return hrmError(curErr.message, 500);
  if (!current) return hrmError("ไม่พบรอบเงินเดือน", 404);

  const curStatus = (current as { status: RunStatus }).status;
  if (!ALLOWED_TRANSITIONS[curStatus]?.includes(nextStatus)) {
    return hrmError(`ไม่สามารถเปลี่ยนสถานะจาก "${curStatus}" เป็น "${nextStatus}" ได้`, 409);
  }

  await setAuditContext(req, auth.userId, orgId);
  const { data, error } = await admin
    .from("hrm_payroll_runs")
    .update({ status: nextStatus })
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError(error.message, 500);
  }

  // สะพาน hrm → accounting: เมื่อ mark-paid สำเร็จ → auto-post เงินเดือนเข้าบัญชี (in-process).
  // no-op เงียบถ้า org ไม่เปิด module accounting · wrap try/catch — bridge fail ไม่ทำ hrm 500
  // (log + ปล่อยให้ retry ภายหลังผ่าน fallback endpoint /api/accounting/payroll-bridge).
  if (nextStatus === "paid") {
    try {
      const result = await runPayrollBridge(orgId, id, auth.userId);
      if (!result.ok && result.reason !== "module_disabled" && result.reason !== "already_posted") {
        console.error("[payroll-bridge] failed", {
          orgId,
          runId: id,
          reason: result.reason,
          message: result.message,
        });
      }
    } catch (e) {
      console.error("[payroll-bridge] threw", { orgId, runId: id, error: (e as Error).message });
    }
  }

  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}
