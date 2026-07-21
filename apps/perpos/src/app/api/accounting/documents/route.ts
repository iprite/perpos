import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import {
  requireAccountingMember,
  canWriteFrontstage,
  accError,
  orgIdFromQuery,
  num,
  nextDocNumber,
  assertPeriodOpen,
} from "../_lib";
import {
  listDocuments,
  computeDocument,
  buildPartySnapshot,
  getDocument,
} from "@/lib/accounting/documents";
import { postSalesDocumentToJournal } from "@/lib/accounting/sales-journal";
import { isTaxDocument, requiresRefDocument, type AccDocType } from "@/lib/accounting/types";

const ROUTE = "/api/accounting/documents";
// ชนิดเอกสารที่ออกได้ (ตรงกับ CHECK ของ acc_documents.doc_type)
const VALID_DOC_TYPES: AccDocType[] = [
  "quotation",
  "invoice",
  "receipt",
  "tax_invoice",
  "receipt_tax_invoice",
  "credit_note",
  "debit_note",
  "billing_note",
  "delivery_note",
];
const VALID_WHT = [0, 1, 2, 3, 5, 10, 15];

/** GET ?orgId=&docType=&status=&from=&to= → เอกสารขาย (list) */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  try {
    const data = await listDocuments(auth.rls, orgId, {
      docType: p.get("docType") ?? undefined,
      status: p.get("status") ?? undefined,
      contactId: p.get("contactId") ?? undefined,
      from: p.get("from") ?? undefined,
      to: p.get("to") ?? undefined,
      limit: p.get("limit") ? Number(p.get("limit")) : undefined,
      offset: p.get("offset") ? Number(p.get("offset")) : undefined,
    });
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    // total/truncated = กัน UI คิดยอดรวมจากชุดที่ถูกตัด (PostgREST cap 1,000 แถว)
    return NextResponse.json({
      documents: data.rows,
      total: data.total,
      limit: data.limit,
      offset: data.offset,
      truncated: data.truncated,
    });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}

/** POST → สร้างเอกสาร + lines nested atomic (G1). vat_enabled snapshot จาก org settings */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth)) return accError("ไม่มีสิทธิ์บันทึกข้อมูล", 403);

  const docType = String(body.doc_type ?? "") as AccDocType;
  if (!VALID_DOC_TYPES.includes(docType)) return accError("ชนิดเอกสารไม่ถูกต้อง");
  const issueDate = String(body.issue_date ?? "");
  if (!issueDate) return accError("กรุณาเลือกวันที่เอกสาร");
  const whtRate = num(body.wht_rate);
  if (!VALID_WHT.includes(whtRate)) return accError("อัตราภาษีหัก ณ ที่จ่ายไม่ถูกต้อง");
  if (!Array.isArray(body.lines) || body.lines.length === 0)
    return accError("กรุณาเพิ่มรายการอย่างน้อย 1 รายการ");

  const admin = createAdminClient();

  // VAT snapshot จาก org settings (default false ถ้ายังไม่ seed)
  const { data: settings } = await admin
    .from("acc_org_settings")
    .select("is_vat_registered, vat_rate")
    .eq("org_id", orgId)
    .maybeSingle();
  const s = settings as { is_vat_registered?: boolean; vat_rate?: number } | null;
  const requestedVat = Boolean(body.vat_enabled);
  const vatEnabled = requestedVat && Boolean(s?.is_vat_registered); // จด VAT เท่านั้นจึงเปิดได้
  const vatRate = Number(s?.vat_rate ?? 7);

  const computed = computeDocument(body.lines, vatEnabled, vatRate, whtRate);

  // ใบลดหนี้/ใบเพิ่มหนี้ ต้องอ้างใบกำกับภาษีเดิม (ม.86/10 (3), ม.86/9 (3))
  // เอกสารชนิดอื่นไม่มีการอ้างอิงแบบนี้ → ทิ้งค่าที่ client ส่งมา (กันข้อมูลขยะ/อ้างมั่ว)
  const contactId = (body.contact_id as string) || null;
  let refDocumentId: string | null = null;
  if (requiresRefDocument(docType)) {
    refDocumentId = (body.ref_document_id as string) || null;
    if (!refDocumentId) return accError("ใบลดหนี้/ใบเพิ่มหนี้ ต้องอ้างอิงใบกำกับภาษีเดิม");
    const { data: refDoc } = await admin
      .from("acc_documents")
      .select("id, doc_type")
      .eq("org_id", orgId)
      .eq("id", refDocumentId)
      .maybeSingle();
    if (!refDoc) return accError("ไม่พบใบกำกับภาษีที่อ้างอิง", 404);
    // ต้องอ้าง "ใบกำกับภาษี" เท่านั้น — อ้างใบเสนอราคา/ใบแจ้งหนี้ไม่ได้ตามกฎหมาย
    const refType = (refDoc as { doc_type: string }).doc_type;
    if (refType !== "tax_invoice" && refType !== "receipt_tax_invoice")
      return accError("เอกสารที่อ้างอิงต้องเป็นใบกำกับภาษีเท่านั้น");
  }

  // snapshot ม.86/4 — freeze ผู้ขาย/ผู้ซื้อ ณ วันที่ออก (ห้าม join สดตอนพิมพ์)
  const party = await buildPartySnapshot(admin, orgId, contactId);

  // งวดปิดแล้วห้ามออกเอกสารลงงวดนั้น — เช็คก่อนจองเลข (จองแล้วเลขไม่คืน)
  const year = Number(issueDate.slice(0, 4));
  const month = Number(issueDate.slice(5, 7));
  const periodOk = await assertPeriodOpen(admin, orgId, year, month);
  if (!periodOk.ok)
    return accError(
      `งวดบัญชี ${year}/${String(month).padStart(2, "0")} ปิดแล้ว ออกเอกสารลงงวดนี้ไม่ได้`,
      409,
    );

  await setAuditContext(req, auth.userId, orgId);
  // เลขจาก sequence atomic + รหัสนำหน้าที่ org ตั้งไว้จริง (ไม่ hard-code แล้ว)
  const docNumber = await nextDocNumber(admin, orgId, docType, year);

  const { data: header, error: hErr } = await admin
    .from("acc_documents")
    .insert({
      org_id: orgId,
      doc_type: docType,
      doc_number: docNumber,
      contact_id: contactId,
      issue_date: issueDate,
      due_date: (body.due_date as string) || null,
      // ใบกำกับภาษี/ใบเสร็จ-ใบกำกับ/ใบลด-เพิ่มหนี้ = "ออก" ตั้งแต่ตอนสร้าง (ส่งให้ผู้ซื้อแล้ว)
      // จึงตั้งต้นเป็น sent ไม่ใช่ draft — ถ้าค้าง draft จะไม่ถูกนับใน ภ.พ.30
      // ทำให้ยื่นภาษีขาย "ขาด" (โดนเบี้ยปรับ) · ใบเสนอราคา/ใบวางบิล ฯลฯ ยังเป็น draft ตามเดิม
      status: (body.status as string) || (isTaxDocument(docType) ? "sent" : "draft"),
      vat_enabled: vatEnabled,
      subtotal: computed.subtotal,
      vat_amount: computed.vat_amount,
      total: computed.total,
      wht_rate: whtRate,
      wht_amount: computed.wht_amount,
      note: (body.note as string) || null,
      created_by: auth.userId,
      // ── ม.86/4 ──
      ...party,
      book_number: isTaxDocument(docType)
        ? ((body.book_number as string) || "").trim() || null
        : null,
      vat_rate: vatEnabled ? vatRate : 0,
      ref_document_id: refDocumentId,
      issued_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (hErr) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(hErr.message, 500);
  }
  const docId = (header as { id: string }).id;

  const lineRows = computed.lines.map((l, i) => ({
    org_id: orgId,
    document_id: docId,
    item_name: l.item_name,
    description: l.description,
    qty: l.qty,
    unit_price: l.unit_price,
    discount: l.discount,
    discount_type: l.discount_type,
    amount: l.amount,
    sort_order: i,
    product_id: l.product_id,
    unit: l.unit,
    created_by: auth.userId,
  }));
  const { error: lErr } = await admin.from("acc_document_lines").insert(lineRows);
  if (lErr) {
    await admin.from("acc_documents").delete().eq("id", docId).eq("org_id", orgId);
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(lErr.message, 500);
  }
  // Phase 1.5 — auto journal ฝั่งขาย (idempotent · skip เอกสารที่ไม่ใช่จุดรับรู้รายได้)
  // ล้มเหลวไม่ล้มการออกเอกสาร แต่ต้องบอกให้รู้ว่ายอดยังไม่เข้างบ
  let journalEntryId: string | null = null;
  let journalWarning: string | null = null;
  const full = await getDocument(admin, orgId, docId);
  if (full) {
    const jr = await postSalesDocumentToJournal(admin, orgId, full, full.lines ?? [], auth.userId);
    if ("skipped" in jr) journalEntryId = null;
    else if (jr.ok) journalEntryId = jr.journalEntryId;
    else journalWarning = jr.error;
  }

  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json(
    {
      id: docId,
      doc_number: docNumber,
      journal_entry_id: journalEntryId,
      journal_warning: journalWarning,
    },
    { status: 201 },
  );
}
