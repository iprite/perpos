/**
 * GET  /api/acc-firm/vault/documents?orgId=&clientId=[&periodId=][&categoryId=]
 *        — รายการเอกสารของลูกค้า (ไม่รวมที่ทำลายแล้ว)
 * POST /api/acc-firm/vault/documents?orgId=
 *        โหมด 1 (ขอที่อัปโหลด): { intent:'upload-url', clientId, categoryId, fiscalYear, fileName, sizeBytes? }
 *        โหมด 2 (บันทึกหลังอัป):  { intent:'register', clientId, categoryId, periodId?, title, storagePath, sha256, ... }
 *
 * ไฟล์วิ่งตรงจาก browser → storage ด้วย signed upload URL (ไม่ผ่าน route นี้) เพื่อไม่กิน memory ของ Vercel
 */
import { NextRequest, NextResponse } from "next/server";
import { listDocuments } from "@/lib/acc-firm/vault/queries";
import {
  assertClientOfFirm,
  createUploadUrl,
  registerDocument,
  VaultError,
} from "@/lib/acc-firm/vault/documents";
import type { DocumentClassification, DocumentSource } from "@/lib/acc-firm/vault/types";
import { requireVault, vaultErrorResponse } from "../_lib";

export async function GET(req: NextRequest) {
  const ctx = await requireVault(req);
  if (!ctx.ok) return ctx.res;

  const sp = req.nextUrl.searchParams;
  const clientId = sp.get("clientId");
  if (!clientId) return NextResponse.json({ error: "missing clientId" }, { status: 400 });

  try {
    await assertClientOfFirm(ctx.db, ctx.firmOrgId, clientId);
    const documents = await listDocuments(ctx.db, ctx.firmOrgId, {
      clientId,
      periodId: sp.get("periodId") ?? undefined,
      categoryId: sp.get("categoryId") ?? undefined,
    });
    return NextResponse.json({ documents, canWrite: ctx.canWrite, moduleRole: ctx.moduleRole });
  } catch (e) {
    return vaultErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireVault(req, { write: true });
  if (!ctx.ok) return ctx.res;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const intent = body?.intent === "register" ? "register" : "upload-url";
  const clientId = typeof body?.clientId === "string" ? body.clientId : null;
  const categoryId = typeof body?.categoryId === "string" ? body.categoryId : null;

  if (!clientId || !categoryId) {
    return NextResponse.json({ error: "missing clientId หรือ categoryId" }, { status: 400 });
  }

  try {
    await assertClientOfFirm(ctx.db, ctx.firmOrgId, clientId);

    const { data: category } = await ctx.db
      .from("acc_firm_vault_categories")
      .select("id, code")
      .eq("id", categoryId)
      .maybeSingle();
    if (!category) throw new VaultError("ไม่พบประเภทเอกสาร", 404);

    if (intent === "upload-url") {
      const fileName = typeof body?.fileName === "string" ? body.fileName : "";
      const fiscalYear = Number(body?.fiscalYear);
      if (!fileName) throw new VaultError("ระบุชื่อไฟล์", 400);
      if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
        throw new VaultError("ปีบัญชีไม่ถูกต้อง", 400);
      }
      const result = await createUploadUrl(ctx.db, {
        firmOrgId: ctx.firmOrgId,
        clientId,
        fiscalYear,
        categoryCode: category.code as string,
        fileName,
        sizeBytes: typeof body?.sizeBytes === "number" ? body.sizeBytes : undefined,
      });
      return NextResponse.json(result);
    }

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const storagePath = typeof body?.storagePath === "string" ? body.storagePath : "";
    const sha256 = typeof body?.sha256 === "string" ? body.sha256 : "";
    if (!title) throw new VaultError("ระบุชื่อเอกสาร", 400);
    if (!storagePath || !sha256) throw new VaultError("ข้อมูลไฟล์ไม่ครบ", 400);
    if (!/^[0-9a-f]{64}$/i.test(sha256)) throw new VaultError("ค่า sha256 ไม่ถูกต้อง", 400);

    const created = await registerDocument(ctx.db, {
      firmOrgId: ctx.firmOrgId,
      clientId,
      periodId: typeof body?.periodId === "string" ? body.periodId : null,
      categoryId,
      title,
      storagePath,
      sha256,
      mimeType: typeof body?.mimeType === "string" ? body.mimeType : null,
      sizeBytes: typeof body?.sizeBytes === "number" ? body.sizeBytes : null,
      docDate: typeof body?.docDate === "string" ? body.docDate : null,
      amount: typeof body?.amount === "number" ? body.amount : null,
      counterparty: typeof body?.counterparty === "string" ? body.counterparty : null,
      classification:
        typeof body?.classification === "string"
          ? (body.classification as DocumentClassification)
          : undefined,
      source: typeof body?.source === "string" ? (body.source as DocumentSource) : "web",
      uploadedBy: ctx.userId,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return vaultErrorResponse(e);
  }
}
