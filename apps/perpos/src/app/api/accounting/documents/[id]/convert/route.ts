import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { setAuditContext } from "../../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import {
  requireAccountingMember,
  canWriteFrontstage,
  accError,
  nextDocNumber,
} from "../../../_lib";

const ROUTE = "/api/accounting/documents/[id]/convert";
type Ctx = { params: Promise<{ id: string }> };

// chain ที่อนุญาต: quotation → invoice → receipt
const NEXT_TYPE: Record<string, { type: string; prefix: string }> = {
  quotation: { type: "invoice", prefix: "INV" },
  invoice: { type: "receipt", prefix: "RC" },
};

/**
 * POST → แปลงเอกสาร (quote→invoice→receipt). copy header+lines ไปเอกสารใหม่,
 * ตั้ง converted_from_id ชี้กลับ. เอกสารต้นทาง mark สถานะตามขั้น (sent/paid).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth.role)) return accError("ไม่มีสิทธิ์บันทึกข้อมูล", 403);

  const admin = createAdminClient();
  const { data: src } = await admin
    .from("acc_documents")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!src) return accError("ไม่พบเอกสารต้นทาง", 404);
  const doc = src as Record<string, unknown>;
  const srcType = String(doc.doc_type);
  const target = NEXT_TYPE[srcType];
  if (!target) return accError("เอกสารชนิดนี้แปลงต่อไม่ได้", 400);
  if (String(doc.status) === "void") return accError("เอกสารที่ยกเลิกแล้ว แปลงไม่ได้", 409);

  await setAuditContext(req, auth.userId, orgId);

  const issueDate = new Date().toISOString().slice(0, 10);
  const year = Number(issueDate.slice(0, 4));
  const newNumber = await nextDocNumber(admin, "acc_documents", orgId, target.prefix, year, {
    column: "doc_type",
    value: target.type,
  });

  const { data: newDoc, error: nErr } = await admin
    .from("acc_documents")
    .insert({
      org_id: orgId,
      doc_type: target.type,
      doc_number: newNumber,
      contact_id: doc.contact_id ?? null,
      issue_date: issueDate,
      due_date: target.type === "invoice" ? null : doc.due_date,
      status: "draft",
      vat_enabled: doc.vat_enabled,
      subtotal: doc.subtotal,
      vat_amount: doc.vat_amount,
      total: doc.total,
      wht_rate: doc.wht_rate,
      wht_amount: doc.wht_amount,
      converted_from_id: id,
      note: doc.note ?? null,
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (nErr) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(nErr.message, 500);
  }
  const newId = (newDoc as { id: string }).id;

  // copy lines
  const { data: srcLines } = await admin
    .from("acc_document_lines")
    .select("*")
    .eq("org_id", orgId)
    .eq("document_id", id)
    .order("sort_order", { ascending: true });
  const lineRows = (srcLines ?? []).map((l: Record<string, unknown>, i: number) => ({
    org_id: orgId,
    document_id: newId,
    item_name: l.item_name,
    description: l.description,
    qty: l.qty,
    unit_price: l.unit_price,
    discount: l.discount,
    discount_type: l.discount_type,
    amount: l.amount,
    sort_order: i,
    product_id: l.product_id ?? null,
    created_by: auth.userId,
  }));
  if (lineRows.length > 0) {
    const { error: lErr } = await admin.from("acc_document_lines").insert(lineRows);
    if (lErr) {
      await admin.from("acc_documents").delete().eq("id", newId).eq("org_id", orgId);
      void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
      return accError(lErr.message, 500);
    }
  }

  // mark ต้นทาง: quotation→accepted, invoice→paid
  const srcNewStatus = srcType === "quotation" ? "accepted" : "paid";
  await admin
    .from("acc_documents")
    .update({ status: srcNewStatus })
    .eq("id", id)
    .eq("org_id", orgId);

  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json(
    { id: newId, doc_number: newNumber, doc_type: target.type },
    { status: 201 },
  );
}
