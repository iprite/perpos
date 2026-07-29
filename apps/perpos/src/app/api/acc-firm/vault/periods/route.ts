/**
 * GET  /api/acc-firm/vault/periods?orgId=<firmOrgId>&clientId=<uuid>
 *        — งวดทั้งหมดของลูกค้ารายนี้ (ใหม่สุดก่อน)
 * POST /api/acc-firm/vault/periods?orgId=<firmOrgId>
 *        body: { clientId, kind: 'month'|'year', year, month? }
 *        — เปิดงวด + กาง checklist จากแม่แบบ (idempotent — เรียกซ้ำไม่สร้างซ้ำ)
 */
import { NextRequest, NextResponse } from "next/server";
import { listPeriods } from "@/lib/acc-firm/vault/queries";
import { assertClientOfFirm, ensurePeriodWithChecklist } from "@/lib/acc-firm/vault/documents";
import { monthPeriodBounds } from "@/lib/acc-firm/vault/types";
import { requireVault, vaultErrorResponse } from "../_lib";

export async function GET(req: NextRequest) {
  const ctx = await requireVault(req);
  if (!ctx.ok) return ctx.res;

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "missing clientId" }, { status: 400 });

  try {
    await assertClientOfFirm(ctx.db, ctx.firmOrgId, clientId);
    return NextResponse.json({ periods: await listPeriods(ctx.db, ctx.firmOrgId, clientId) });
  } catch (e) {
    return vaultErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireVault(req, { write: true });
  if (!ctx.ok) return ctx.res;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const clientId = typeof body?.clientId === "string" ? body.clientId : null;
  const kind = body?.kind === "year" ? "year" : "month";
  const year = Number(body?.year);
  const month = Number(body?.month);

  if (!clientId) return NextResponse.json({ error: "missing clientId" }, { status: 400 });
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "ปีไม่ถูกต้อง" }, { status: 400 });
  }
  if (kind === "month" && (!Number.isInteger(month) || month < 1 || month > 12)) {
    return NextResponse.json({ error: "เดือนไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const client = await assertClientOfFirm(ctx.db, ctx.firmOrgId, clientId);

    const bounds =
      kind === "month"
        ? monthPeriodBounds(year, month)
        : (() => {
            // งวดปี = 12 เดือนที่จบที่วันสิ้นรอบบัญชีของลูกค้ารายนั้น
            const m = Number(client.fiscal_year_end_month ?? 12);
            const d = Number(client.fiscal_year_end_day ?? 31);
            const end = new Date(
              Date.UTC(year, m - 1, Math.min(d, new Date(Date.UTC(year, m, 0)).getUTCDate())),
            );
            const start = new Date(end);
            start.setUTCFullYear(start.getUTCFullYear() - 1);
            start.setUTCDate(start.getUTCDate() + 1);
            return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
          })();

    const result = await ensurePeriodWithChecklist(ctx.db, {
      firmOrgId: ctx.firmOrgId,
      clientId,
      kind,
      periodStart: bounds.start,
      periodEnd: bounds.end,
      fiscalYear: year,
      createdBy: ctx.userId,
    });

    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (e) {
    return vaultErrorResponse(e);
  }
}
