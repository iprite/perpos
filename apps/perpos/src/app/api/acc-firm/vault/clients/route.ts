/**
 * GET /api/acc-firm/vault/clients?orgId=<firmOrgId>&includeInactive=1
 *   — ทะเบียนลูกค้าของคลัง + ตัวเลข "ขาดเอกสารกี่รายการ / เลยกำหนดกี่รายการ"
 *   read-only → viewer เปิดได้
 */
import { NextRequest, NextResponse } from "next/server";
import { listCategories, listClientSummaries } from "@/lib/acc-firm/vault/queries";
import { requireVault, vaultErrorResponse } from "../_lib";

export async function GET(req: NextRequest) {
  const ctx = await requireVault(req);
  if (!ctx.ok) return ctx.res;

  try {
    const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "1";
    const [clients, categories] = await Promise.all([
      listClientSummaries(ctx.db, ctx.firmOrgId, { includeInactive }),
      listCategories(ctx.db),
    ]);
    return NextResponse.json({ clients, categories, canWrite: ctx.canWrite });
  } catch (e) {
    return vaultErrorResponse(e);
  }
}
