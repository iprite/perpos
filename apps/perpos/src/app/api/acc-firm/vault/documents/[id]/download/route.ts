/**
 * POST /api/acc-firm/vault/documents/<id>/download?orgId=<firmOrgId>
 *   — คืน signed URL อายุ 60 วินาที **หลังเขียน access log แล้วเท่านั้น** (PDPA · spec §6/§9)
 *   เอกสารประเภทข้อมูลอ่อนไหว → เฉพาะ module role `owner`
 *
 * ใช้ POST ไม่ใช่ GET โดยตั้งใจ: การขอไฟล์เป็นเหตุการณ์ที่ถูกบันทึก ไม่ควรถูก prefetch/cache
 */
import { NextRequest, NextResponse } from "next/server";
import { createDownloadUrl } from "@/lib/acc-firm/vault/documents";
import { requestMeta, requireVault, vaultErrorResponse } from "../../../_lib";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireVault(req);
  if (!ctx.ok) return ctx.res;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  try {
    const meta = requestMeta(req);
    const result = await createDownloadUrl(ctx.db, {
      firmOrgId: ctx.firmOrgId,
      documentId: id,
      userId: ctx.userId,
      moduleRole: ctx.moduleRole,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return NextResponse.json(result);
  } catch (e) {
    return vaultErrorResponse(e);
  }
}
