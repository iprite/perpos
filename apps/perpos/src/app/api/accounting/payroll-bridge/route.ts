import { NextRequest, NextResponse } from "next/server";
import { runPayrollBridge } from "@/lib/accounting/payroll-bridge";

/**
 * POST /api/accounting/payroll-bridge — fallback ของ in-process helper (สะพาน hrm→accounting).
 * ใช้เมื่อ in-process call ที่ hrm mark-paid ล้ม (retry ภายหลัง) หรือ replay.
 *
 * Auth = internal service-secret (x-worker-secret = WORKER_SECRET) — ไม่ใช่ user JWT
 * (เป็น endpoint ภายใน, idempotent ผ่าน partial unique payroll → ยิงซ้ำปลอดภัย).
 *
 * body: { orgId, runId, triggeredBy? }
 */
export async function POST(req: NextRequest) {
  const required = (process.env.WORKER_SECRET ?? "").trim();
  const provided = (req.headers.get("x-worker-secret") ?? "").trim();
  if (!required || provided !== required) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  const runId = String(body.runId ?? "");
  const triggeredBy = body.triggeredBy ? String(body.triggeredBy) : null;
  if (!orgId || !runId) {
    return NextResponse.json({ error: "missing orgId or runId" }, { status: 400 });
  }

  try {
    const result = await runPayrollBridge(orgId, runId, triggeredBy);
    if (!result.ok && result.reason === "error") {
      return NextResponse.json({ error: result.message ?? "bridge error" }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
