/**
 * GET  /api/acc-firm/vault/custody?orgId=&clientId=   — ทะเบียนรับ-ส่งเอกสารของลูกค้ารายนั้น
 * POST /api/acc-firm/vault/custody?orgId=
 *        body: { clientId, direction:'in'|'out', method, itemSummary, itemCount?, handedBy?,
 *                signaturePath?, occurredAt?, note? }
 *        — ออกเลขที่ใบรับให้อัตโนมัติ (RCV-YYYY-0001 / RTN-YYYY-0001)
 *
 * ลายเซ็นลูกค้า: ฝั่งหน้าเว็บวาดบน canvas → อัปขึ้น bucket `acc_vault` ใต้ path ของลูกค้า
 * แล้วส่ง `signaturePath` มาที่นี่ (route นี้ไม่รับไฟล์ตรง)
 */
import { NextRequest, NextResponse } from "next/server";
import { listCustody } from "@/lib/acc-firm/vault/queries";
import { assertClientOfFirm, createCustodyEntry, VaultError } from "@/lib/acc-firm/vault/documents";
import type { CustodyDirection, CustodyMethod } from "@/lib/acc-firm/vault/types";
import { requireVault, vaultErrorResponse } from "../_lib";

const METHODS: CustodyMethod[] = ["in_person", "courier", "line", "email", "other"];

export async function GET(req: NextRequest) {
  const ctx = await requireVault(req);
  if (!ctx.ok) return ctx.res;

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "missing clientId" }, { status: 400 });

  try {
    await assertClientOfFirm(ctx.db, ctx.firmOrgId, clientId);
    const entries = await listCustody(ctx.db, ctx.firmOrgId, clientId);
    return NextResponse.json({ entries, canWrite: ctx.canWrite });
  } catch (e) {
    return vaultErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireVault(req, { write: true });
  if (!ctx.ok) return ctx.res;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const clientId = typeof body?.clientId === "string" ? body.clientId : null;
  const direction: CustodyDirection = body?.direction === "out" ? "out" : "in";
  const method = (body?.method as CustodyMethod) ?? "in_person";

  if (!clientId) return NextResponse.json({ error: "missing clientId" }, { status: 400 });
  if (!METHODS.includes(method)) {
    return NextResponse.json({ error: "ช่องทางรับ-ส่งไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    await assertClientOfFirm(ctx.db, ctx.firmOrgId, clientId);

    const signaturePath = typeof body?.signaturePath === "string" ? body.signaturePath : null;
    if (signaturePath && !signaturePath.startsWith(`${ctx.firmOrgId}/${clientId}/`)) {
      throw new VaultError("path ของลายเซ็นไม่ตรงกับลูกค้า/สำนักงาน", 400);
    }

    const created = await createCustodyEntry(ctx.db, {
      firmOrgId: ctx.firmOrgId,
      clientId,
      direction,
      method,
      itemSummary: typeof body?.itemSummary === "string" ? body.itemSummary : "",
      itemCount: typeof body?.itemCount === "number" ? body.itemCount : null,
      handedBy: typeof body?.handedBy === "string" ? body.handedBy : null,
      signaturePath,
      occurredAt: typeof body?.occurredAt === "string" ? body.occurredAt : null,
      note: typeof body?.note === "string" ? body.note : null,
      userId: ctx.userId,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return vaultErrorResponse(e);
  }
}
