/**
 * GET   /api/acc-firm/vault/checklist?orgId=<firmOrgId>&periodId=<uuid>
 *         — รายการเอกสารที่ต้องมีของงวดนั้น + จำนวนไฟล์ที่แนบแล้ว
 * PATCH /api/acc-firm/vault/checklist?orgId=<firmOrgId>
 *         body: { checklistId, status, waivedReason? }  (status 'na' ต้องมีเหตุผล)
 */
import { NextRequest, NextResponse } from "next/server";
import { getChecklist } from "@/lib/acc-firm/vault/queries";
import { updateChecklistStatus, VaultError } from "@/lib/acc-firm/vault/documents";
import type { ChecklistStatus } from "@/lib/acc-firm/vault/types";
import { requireVault, vaultErrorResponse } from "../_lib";

const STATUSES: ChecklistStatus[] = ["missing", "received", "verified", "na"];

export async function GET(req: NextRequest) {
  const ctx = await requireVault(req);
  if (!ctx.ok) return ctx.res;

  const periodId = req.nextUrl.searchParams.get("periodId");
  if (!periodId) return NextResponse.json({ error: "missing periodId" }, { status: 400 });

  try {
    const items = await getChecklist(ctx.db, ctx.firmOrgId, periodId);
    return NextResponse.json({ items, canWrite: ctx.canWrite });
  } catch (e) {
    return vaultErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireVault(req, { write: true });
  if (!ctx.ok) return ctx.res;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const checklistId = typeof body?.checklistId === "string" ? body.checklistId : null;
  const status = body?.status as ChecklistStatus | undefined;

  if (!checklistId) return NextResponse.json({ error: "missing checklistId" }, { status: 400 });
  if (!status || !STATUSES.includes(status)) {
    return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    await updateChecklistStatus(ctx.db, {
      firmOrgId: ctx.firmOrgId,
      checklistId,
      status,
      waivedReason: typeof body?.waivedReason === "string" ? body.waivedReason : null,
      userId: ctx.userId,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return e instanceof VaultError ? vaultErrorResponse(e) : vaultErrorResponse(e);
  }
}
