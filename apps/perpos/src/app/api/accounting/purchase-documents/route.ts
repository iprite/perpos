import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canWriteBackstage, accError, orgIdFromQuery, num } from "../_lib";
import {
  listPurchaseDocuments,
  computePurchaseLines,
  buildPurchasePartySnapshot,
  getPurchaseDocument,
} from "@/lib/accounting/purchase-documents";
import { postPurchaseDocumentToJournal } from "@/lib/accounting/purchase-journal";
import { canClaimPurchaseVat, type AccPurchaseDocType } from "@/lib/accounting/types";

const ROUTE = "/api/accounting/purchase-documents";
const VALID_DOC_TYPES: AccPurchaseDocType[] = [
  "tax_invoice",
  "receipt_tax_invoice",
  "credit_note",
  "debit_note",
  "receipt",
  "abbreviated_tax_invoice",
];
const VALID_WHT = [0, 1, 2, 3, 5, 10, 15];

/** GET ?orgId=&docType=&status=&taxYear=&taxMonth=&from=&to=&claimableOnly= → ทะเบียนใบกำกับภาษีซื้อ */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  try {
    const data = await listPurchaseDocuments(auth.rls, orgId, {
      docType: p.get("docType") ?? undefined,
      status: p.get("status") ?? undefined,
      contactId: p.get("contactId") ?? undefined,
      taxYear: p.get("taxYear") ? Number(p.get("taxYear")) : undefined,
      taxMonth: p.get("taxMonth") ? Number(p.get("taxMonth")) : undefined,
      from: p.get("from") ?? undefined,
      to: p.get("to") ?? undefined,
      claimableOnly: p.get("claimableOnly") === "1",
    });
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ documents: data });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}

/**
 * POST → บันทึกใบกำกับภาษีซื้อ + lines (+ auto journal ถ้า postToLedger)
 * ยอดมาจากหน้าบิลจริง — server ไม่ recompute VAT ทับ แต่ตรวจว่า subtotal+vat = total
 */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  // ฝั่งซื้อ = งานหลังบ้านของสำนักงานบัญชี (ไม่ใช่หน้าบ้านลูกค้า)
  if (!canWriteBackstage(auth)) return accError("เฉพาะนักบัญชีเท่านั้นที่บันทึกเอกสารซื้อได้", 403);

  const docType = String(body.doc_type ?? "tax_invoice") as AccPurchaseDocType;
  if (!VALID_DOC_TYPES.includes(docType)) return accError("ชนิดเอกสารไม่ถูกต้อง");

  const docNumber = String(body.doc_number ?? "").trim();
  if (!docNumber) return accError("กรุณากรอกเลขที่ใบกำกับของผู้ขาย");

  const issueDate = String(body.issue_date ?? "");
  if (!issueDate) return accError("กรุณาเลือกวันที่บนเอกสาร");

  const contactId = (body.contact_id as string) || null;
  if (!contactId) return accError("กรุณาเลือกผู้ขาย");

  const whtRate = num(body.wht_rate);
  if (!VALID_WHT.includes(whtRate)) return accError("อัตราภาษีหัก ณ ที่จ่ายไม่ถูกต้อง");

  if (!Array.isArray(body.lines) || body.lines.length === 0)
    return accError("กรุณาเพิ่มรายการอย่างน้อย 1 รายการ");

  // งวดภาษี — default = เดือนของ issue_date · เลื่อนได้ตาม ม.82/3
  const taxYear = body.tax_year ? num(body.tax_year) : Number(issueDate.slice(0, 4));
  const taxMonth = body.tax_month ? num(body.tax_month) : Number(issueDate.slice(5, 7));
  if (!(taxMonth >= 1 && taxMonth <= 12)) return accError("งวดภาษี (เดือน) ไม่ถูกต้อง");

  const computed = computePurchaseLines(body.lines);
  const subtotal = body.subtotal !== undefined ? num(body.subtotal) : computed.subtotal;
  const vatAmount = num(body.vat_amount);
  const total = body.total !== undefined ? num(body.total) : subtotal + vatAmount;

  // ตรวจสมดุลกับหน้าบิล (ไม่ทับตัวเลข แต่ไม่ยอมให้ขัดกันเอง)
  if (Math.round((subtotal + vatAmount) * 100) !== Math.round(total * 100)) {
    return accError(
      `ยอดไม่สมดุล: มูลค่า ${subtotal} + VAT ${vatAmount} ≠ รวม ${total} — ตรวจตัวเลขบนบิลอีกครั้ง`,
    );
  }

  // เอกสารที่กฎหมายไม่ให้เครดิตภาษีซื้อ → บังคับ false ไม่ว่า client ส่งอะไรมา
  const requestedClaimable =
    body.is_vat_claimable === undefined ? true : Boolean(body.is_vat_claimable);
  const isVatClaimable = requestedClaimable && canClaimPurchaseVat(docType);

  const admin = createAdminClient();

  // ใบลด/เพิ่มหนี้จากผู้ขาย ต้องอ้างใบกำกับซื้อเดิม
  const refDocumentId =
    docType === "credit_note" || docType === "debit_note"
      ? (body.ref_document_id as string) || null
      : null;
  if ((docType === "credit_note" || docType === "debit_note") && refDocumentId) {
    const { data: ref } = await admin
      .from("acc_purchase_documents")
      .select("id")
      .eq("org_id", orgId)
      .eq("id", refDocumentId)
      .maybeSingle();
    if (!ref) return accError("ไม่พบใบกำกับภาษีซื้อที่อ้างอิง", 404);
  }

  const party = await buildPurchasePartySnapshot(admin, orgId, contactId, {
    seller_name: (body.seller_name as string) || undefined,
    seller_address: (body.seller_address as string) || undefined,
    seller_tax_id: (body.seller_tax_id as string) || undefined,
    seller_branch: (body.seller_branch as string) || undefined,
  });

  await setAuditContext(req, auth.userId, orgId);

  const { data: header, error: hErr } = await admin
    .from("acc_purchase_documents")
    .insert({
      org_id: orgId,
      doc_type: docType,
      doc_number: docNumber,
      contact_id: contactId,
      issue_date: issueDate,
      tax_year: taxYear,
      tax_month: taxMonth,
      ...party,
      vat_rate: body.vat_rate === undefined ? (vatAmount > 0 ? 7 : 0) : num(body.vat_rate),
      subtotal,
      vat_amount: vatAmount,
      total,
      wht_rate: whtRate,
      wht_amount: num(body.wht_amount),
      is_vat_claimable: isVatClaimable,
      non_claimable_note: (body.non_claimable_note as string) || null,
      status: (body.status as string) || "recorded",
      ref_document_id: refDocumentId,
      ocr_job_id: (body.ocr_job_id as string) || null,
      note: (body.note as string) || null,
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (hErr) {
    // unique(org, contact, doc_number) → คีย์บิลใบเดิมซ้ำ
    if (hErr.code === "23505") {
      void recordMetric({ orgId, route: ROUTE, method: req.method, status: 409, t0 });
      return accError(`ใบกำกับเลขที่ ${docNumber} ของผู้ขายรายนี้ถูกบันทึกไว้แล้ว`, 409);
    }
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(hErr.message, 500);
  }
  const docId = (header as { id: string }).id;

  const { error: lErr } = await admin.from("acc_purchase_document_lines").insert(
    computed.lines.map((l, i) => ({
      org_id: orgId,
      document_id: docId,
      item_name: l.item_name,
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      unit_price: l.unit_price,
      amount: l.amount,
      account_id: l.account_id,
      sort_order: i,
      created_by: auth.userId,
    })),
  );
  if (lErr) {
    await admin.from("acc_purchase_documents").delete().eq("id", docId).eq("org_id", orgId);
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(lErr.message, 500);
  }

  // auto journal (default = ลงเลย · ส่ง postToLedger=false เพื่อบันทึกอย่างเดียว)
  let journal: { id: string | null; error: string | null } = { id: null, error: null };
  if (body.postToLedger !== false) {
    const full = await getPurchaseDocument(admin, orgId, docId);
    if (full) {
      const r = await postPurchaseDocumentToJournal(
        admin,
        orgId,
        full,
        full.lines ?? [],
        auth.userId,
      );
      if (r.ok) journal = { id: r.journalEntryId, error: null };
      // ลงบัญชีไม่ผ่าน → เอกสารยังถูกบันทึกไว้ ให้ผู้ใช้แก้แล้วสั่งลงบัญชีใหม่ได้
      else journal = { id: null, error: r.error };
    }
  }

  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json(
    {
      id: docId,
      doc_number: docNumber,
      journal_entry_id: journal.id,
      journal_error: journal.error,
    },
    { status: 201 },
  );
}
