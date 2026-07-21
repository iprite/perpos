import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canWriteBackstage, accError, orgIdFromQuery } from "../../_lib";
import { getPurchaseDocument } from "@/lib/accounting/purchase-documents";
import { postPurchaseDocumentToJournal } from "@/lib/accounting/purchase-journal";

const ROUTE = "/api/accounting/purchase-documents/[id]";
type Ctx = { params: Promise<{ id: string }> };

/** GET ?orgId= → เอกสารซื้อ + lines */
export async function GET(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const doc = await getPurchaseDocument(auth.rls, orgId, id);
    if (!doc) return accError("ไม่พบเอกสาร", 404);
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json(doc);
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}

/**
 * PATCH → แก้หัวเอกสาร (งวดภาษี / ยกเลิก / โน้ต / เครดิตภาษีซื้อได้ไหม)
 * + action="post" = สั่งลงบัญชี (idempotent — เอกสารที่ลงแล้วจะไม่เบิ้ล)
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth)) return accError("เฉพาะนักบัญชีเท่านั้นที่แก้เอกสารซื้อได้", 403);

  const admin = createAdminClient();
  const existing = await getPurchaseDocument(admin, orgId, id);
  if (!existing) return accError("ไม่พบเอกสาร", 404);

  await setAuditContext(req, auth.userId, orgId);

  // สั่งลงบัญชี
  if (body.action === "post") {
    const r = await postPurchaseDocumentToJournal(
      admin,
      orgId,
      existing,
      existing.lines ?? [],
      auth.userId,
    );
    if (!r.ok) {
      void recordMetric({ orgId, route: ROUTE, method: req.method, status: 400, t0 });
      return accError(r.error);
    }
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ journal_entry_id: r.journalEntryId, created: r.created });
  }

  const patch: Record<string, unknown> = {};
  if (body.tax_year !== undefined) patch.tax_year = Number(body.tax_year);
  if (body.tax_month !== undefined) {
    const m = Number(body.tax_month);
    if (!(m >= 1 && m <= 12)) return accError("งวดภาษี (เดือน) ไม่ถูกต้อง");
    patch.tax_month = m;
  }
  if (body.is_vat_claimable !== undefined) patch.is_vat_claimable = Boolean(body.is_vat_claimable);
  if (body.non_claimable_note !== undefined)
    patch.non_claimable_note = (body.non_claimable_note as string) || null;
  if (body.note !== undefined) patch.note = (body.note as string) || null;
  if (body.status !== undefined) {
    const s = String(body.status);
    if (!["draft", "recorded", "void"].includes(s)) return accError("สถานะไม่ถูกต้อง");
    patch.status = s;
  }

  if (Object.keys(patch).length === 0) return accError("ไม่มีข้อมูลที่จะแก้ไข");

  const { data, error } = await admin
    .from("acc_purchase_documents")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}

/**
 * DELETE ?orgId= → ลบได้เฉพาะเอกสารที่ยังไม่ลงบัญชี
 * ลงบัญชีแล้วให้ใช้ status=void แทน (หลักฐานภาษีต้องคงอยู่)
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth)) return accError("เฉพาะนักบัญชีเท่านั้นที่ลบเอกสารซื้อได้", 403);

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("acc_purchase_documents")
    .select("journal_entry_id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!doc) return accError("ไม่พบเอกสาร", 404);
  if ((doc as { journal_entry_id: string | null }).journal_entry_id) {
    return accError("เอกสารที่ลงบัญชีแล้วลบไม่ได้ — ให้ยกเลิก (void) แทน", 409);
  }

  await setAuditContext(req, auth.userId, orgId);
  const { error } = await admin
    .from("acc_purchase_documents")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json({ ok: true });
}
