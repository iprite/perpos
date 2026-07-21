import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import {
  requireAccountingMember,
  canWriteFrontstage,
  accError,
  orgIdFromQuery,
  num,
  assertPeriodOpen,
  canTransitionDocStatus,
  isIssuedDoc,
} from "../../_lib";
import { getDocument, computeDocument, buildPartySnapshot } from "@/lib/accounting/documents";
import { isTaxDocument, type AccDocType } from "@/lib/accounting/types";
import { postSalesDocumentToJournal } from "@/lib/accounting/sales-journal";

const ROUTE = "/api/accounting/documents/[id]";
const VALID_WHT = [0, 1, 2, 3, 5, 10, 15];
type Ctx = { params: Promise<{ id: string }> };

/** GET ?orgId= → เอกสาร + lines */
export async function GET(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const doc = await getDocument(auth.rls, orgId, id);
    if (!doc) return accError("ไม่พบเอกสาร", 404);
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json(doc);
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}

/** PATCH → แก้เอกสาร (lines = replace ทั้งชุดถ้าส่งมา). เอกสาร void แก้ไม่ได้. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth)) return accError("ไม่มีสิทธิ์แก้ไขข้อมูล", 403);

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("acc_documents")
    .select("status, vat_enabled, wht_rate, contact_id, issue_date, doc_type, deleted_at")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!existing) return accError("ไม่พบเอกสาร", 404);
  const ex = existing as {
    status: string;
    vat_enabled: boolean;
    wht_rate: number;
    contact_id: string | null;
    issue_date: string;
    doc_type: string;
    deleted_at: string | null;
  };
  if (ex.deleted_at) return accError("เอกสารนี้ถูกลบแล้ว แก้ไม่ได้", 409);
  if (ex.status === "void") return accError("เอกสารที่ยกเลิกแล้ว แก้ไม่ได้", 409);

  // งวดปิดแล้วห้ามแก้ — เดิมไม่เคยเช็ค (Phase 1.4) → แก้เอกสารย้อนงวดที่ปิดงบไปแล้วได้
  const exYear = Number(ex.issue_date.slice(0, 4));
  const exMonth = Number(ex.issue_date.slice(5, 7));
  const periodOk = await assertPeriodOpen(admin, orgId, exYear, exMonth);
  if (!periodOk.ok)
    return accError(
      `งวดบัญชี ${exYear}/${String(exMonth).padStart(2, "0")} ปิดแล้ว แก้เอกสารไม่ได้`,
      409,
    );

  // ใบกำกับภาษีที่ออกไปแล้ว = หลักฐานภาษี ห้ามแก้ยอด/วันที่/คู่ค้า
  // ผิดพลาดต้องออกใบลดหนี้/เพิ่มหนี้ หรือยกเลิกแล้วออกใหม่ (ม.86/10, 86/9)
  const isIssuedTaxDoc = isTaxDocument(ex.doc_type as AccDocType) && isIssuedDoc(ex.status);
  if (isIssuedTaxDoc) {
    const frozen = ["lines", "issue_date", "contact_id", "wht_rate"].filter(
      (k) => body[k] !== undefined,
    );
    if (frozen.length > 0) {
      return accError(
        "ใบกำกับภาษีที่ออกแล้ว แก้ยอด/วันที่/ผู้ซื้อไม่ได้ — ต้องออกใบลดหนี้/เพิ่มหนี้ หรือยกเลิกแล้วออกใหม่",
        409,
      );
    }
  }

  await setAuditContext(req, auth.userId, orgId);

  const headerPatch: Record<string, unknown> = {};
  if (body.contact_id !== undefined) {
    const newContactId = (body.contact_id as string) || null;
    headerPatch.contact_id = newContactId;
    // เปลี่ยนคู่ค้า = เปลี่ยน "ผู้ซื้อ" ของเอกสาร → ต้อง re-snapshot ม.86/4 ให้ตรงกัน
    // (ถ้าไม่ทำ เอกสารจะพิมพ์ชื่อ/ที่อยู่ผู้ซื้อรายเก่า ทั้งที่ผูกกับคู่ค้ารายใหม่)
    if (newContactId !== (ex.contact_id ?? null)) {
      const party = await buildPartySnapshot(admin, orgId, newContactId);
      headerPatch.buyer_name = party.buyer_name;
      headerPatch.buyer_address = party.buyer_address;
      headerPatch.buyer_tax_id = party.buyer_tax_id;
      headerPatch.buyer_branch = party.buyer_branch;
    }
  }
  if (body.issue_date !== undefined) {
    if (!String(body.issue_date)) return accError("กรุณาเลือกวันที่เอกสาร");
    headerPatch.issue_date = body.issue_date;
  }
  if (body.due_date !== undefined) headerPatch.due_date = (body.due_date as string) || null;
  if (body.status !== undefined) {
    const next = String(body.status);
    // เดิม PATCH ตั้งสถานะอะไรก็ได้ → ย้อน paid กลับ draft ได้ = หลักฐาน/ยอดภาษีเพี้ยน
    if (!canTransitionDocStatus(ex.status, next))
      return accError(`เปลี่ยนสถานะจาก "${ex.status}" เป็น "${next}" ไม่ได้`, 409);
    headerPatch.status = next;
  }
  if (body.note !== undefined) headerPatch.note = (body.note as string) || null;

  let whtRate = Number(ex.wht_rate);
  if (body.wht_rate !== undefined) {
    whtRate = num(body.wht_rate);
    if (!VALID_WHT.includes(whtRate)) return accError("อัตราภาษีหัก ณ ที่จ่ายไม่ถูกต้อง");
    headerPatch.wht_rate = whtRate;
  }

  // replace lines + recompute totals (vat_enabled = snapshot เดิม, ไม่เปลี่ยนตอนแก้)
  if (body.lines !== undefined) {
    if (!Array.isArray(body.lines) || body.lines.length === 0)
      return accError("กรุณาเพิ่มรายการอย่างน้อย 1 รายการ");
    const { data: settings } = await admin
      .from("acc_org_settings")
      .select("vat_rate")
      .eq("org_id", orgId)
      .maybeSingle();
    const vatRate = Number((settings as { vat_rate?: number } | null)?.vat_rate ?? 7);
    const computed = computeDocument(body.lines, ex.vat_enabled, vatRate, whtRate);

    await admin.from("acc_document_lines").delete().eq("document_id", id).eq("org_id", orgId);
    const lineRows = computed.lines.map((l, i) => ({
      org_id: orgId,
      document_id: id,
      item_name: l.item_name,
      description: l.description,
      qty: l.qty,
      unit_price: l.unit_price,
      discount: l.discount,
      discount_type: l.discount_type,
      amount: l.amount,
      sort_order: i,
      product_id: l.product_id,
      unit: l.unit, // ม.86/4 (5) — ถ้าไม่ carry มาด้วย การแก้เอกสารจะลบหน่วยนับทิ้งเงียบ ๆ
      created_by: auth.userId,
    }));
    const { error: lErr } = await admin.from("acc_document_lines").insert(lineRows);
    if (lErr) {
      void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
      return accError(lErr.message, 500);
    }
    headerPatch.subtotal = computed.subtotal;
    headerPatch.vat_amount = computed.vat_amount;
    headerPatch.total = computed.total;
    headerPatch.wht_amount = computed.wht_amount;
  }

  if (Object.keys(headerPatch).length > 0) {
    const { error } = await admin
      .from("acc_documents")
      .update(headerPatch)
      .eq("id", id)
      .eq("org_id", orgId);
    if (error) {
      void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
      return accError(error.message, 500);
    }
  }

  const updated = await getDocument(admin, orgId, id);

  // Phase 1.5 — เอกสารที่เพิ่งพ้นฉบับร่าง (draft → sent) = จุดรับรู้รายได้ → ลงบัญชีให้
  // idempotent: ใบที่ลงแล้วจะไม่ซ้ำ · ใบที่ไม่ใช่จุดรับรู้จะถูก skip
  let journalWarning: string | null = null;
  if (updated && ex.status === "draft" && headerPatch.status && headerPatch.status !== "draft") {
    const jr = await postSalesDocumentToJournal(
      admin,
      orgId,
      updated,
      updated.lines ?? [],
      auth.userId,
    );
    if (!("skipped" in jr) && !jr.ok) journalWarning = jr.error;
  }

  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json({ ...updated, journal_warning: journalWarning });
}

/** DELETE ?orgId= → ลบเอกสาร (lines CASCADE) */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth)) return accError("ไม่มีสิทธิ์ลบข้อมูล", 403);

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("acc_documents")
    .select("status, issue_date, doc_type, deleted_at")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!doc) return accError("ไม่พบเอกสาร", 404);
  const d = doc as {
    status: string;
    issue_date: string;
    doc_type: string;
    deleted_at: string | null;
  };
  if (d.deleted_at) return accError("เอกสารนี้ถูกลบไปแล้ว", 409);

  // งวดปิดแล้วห้ามลบ
  const y = Number(d.issue_date.slice(0, 4));
  const m = Number(d.issue_date.slice(5, 7));
  const periodOk = await assertPeriodOpen(admin, orgId, y, m);
  if (!periodOk.ok)
    return accError(`งวดบัญชี ${y}/${String(m).padStart(2, "0")} ปิดแล้ว ลบเอกสารไม่ได้`, 409);

  // ใบที่ถูกใบลดหนี้/เพิ่มหนี้อ้างอยู่ ห้ามหาย (หลักฐานภาษีต้องครบชุด)
  const { count: refCount } = await admin
    .from("acc_documents")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("ref_document_id", id);
  if ((refCount ?? 0) > 0)
    return accError("เอกสารนี้ถูกใบลดหนี้/ใบเพิ่มหนี้อ้างอิงอยู่ ลบไม่ได้", 409);

  await setAuditContext(req, auth.userId, orgId);

  // Phase 1.4: ลบจริงได้เฉพาะ "ฉบับร่างที่ยังไม่ออก" — ที่เหลือ soft delete
  // เอกสารที่ออกไปแล้วเป็นหลักฐานประกอบการลงบัญชี ต้องเก็บ 5 ปี (พ.ร.บ.การบัญชี ม.14)
  // ⚠️ soft delete ไม่ใช่การยกเลิกทางภาษี — ใบกำกับที่ออกผิดต้อง "void" หรือออกใบลดหนี้
  if (!isIssuedDoc(d.status)) {
    const { error } = await admin.from("acc_documents").delete().eq("id", id).eq("org_id", orgId);
    if (error) {
      void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
      return accError(error.message, 500);
    }
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ ok: true, mode: "hard_delete" });
  }

  if (isTaxDocument(d.doc_type as AccDocType) && d.status !== "void") {
    return accError("ใบกำกับภาษีที่ออกแล้ว ลบไม่ได้ — ต้องยกเลิก (void) หรือออกใบลดหนี้ก่อน", 409);
  }

  const { error } = await admin
    .from("acc_documents")
    .update({ deleted_at: new Date().toISOString(), deleted_by: auth.userId })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json({ ok: true, mode: "soft_delete" });
}
