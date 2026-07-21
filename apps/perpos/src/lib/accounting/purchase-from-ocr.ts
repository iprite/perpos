/**
 * purchase-from-ocr.ts — สะพาน OCR (บิลที่ถอดแล้ว) → ทะเบียนใบกำกับภาษีซื้อ
 *
 * เดิม: approve OCR → สร้าง acc_journal_entries ตรง ๆ (source='ai') แล้วจบ
 *       ตัวเอกสารไม่ถูกเก็บ → ภาษีซื้อใน ภ.พ.30 ต้องกรอกมือ
 * ใหม่: approve OCR → สร้าง journal เหมือนเดิม + บันทึกใบกำกับภาษีซื้อผูกกับ journal นั้น
 *
 * ⚠️ ไม่เรียก postPurchaseDocumentToJournal ที่นี่ — journal ถูกสร้างโดย approve route แล้ว
 *    (คนเป็นผู้เลือกบัญชี/แก้ยอดก่อนอนุมัติ = human-in-the-loop) ถ้าสร้างอีกจะได้ 2 entry
 *
 * idempotent ต่อ ocr_job_id: approve ซ้ำ = อัปเดตใบเดิม ไม่สร้างใหม่
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccPurchaseDocType } from "./types";
import { canClaimPurchaseVat } from "./types";

/** ชนิดเอกสารที่ Gemini ตอบกลับ → doc_type ของทะเบียนซื้อ */
function mapDocType(raw: unknown): AccPurchaseDocType {
  const t = String(raw ?? "").toLowerCase();
  if (t.includes("credit")) return "credit_note";
  if (t.includes("debit")) return "debit_note";
  if (t.includes("abbrev")) return "abbreviated_tax_invoice";
  if (t === "receipt_tax_invoice" || (t.includes("receipt") && t.includes("tax")))
    return "receipt_tax_invoice";
  if (t === "tax_invoice" || t.includes("tax_invoice")) return "tax_invoice";
  if (t.includes("receipt")) return "receipt";
  return "tax_invoice";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

interface OcrExtracted {
  vendor?: { name?: string; tax_id?: string; address?: string; branch?: string };
  document?: { number?: string; date?: string };
  amounts?: {
    subtotal?: number;
    vat_rate?: number;
    vat_amount?: number;
    grand_total?: number;
    withholding_tax_rate?: number | null;
    withholding_tax_amount?: number | null;
  };
  items?: { description?: string; qty?: number; unit_price?: number; amount?: number }[];
  document_type?: string;
}

/**
 * หา (หรือสร้าง) คู่ค้าฝั่งผู้ขายจากข้อมูลบนบิล — match เลขผู้เสียภาษีก่อน แล้วค่อยชื่อ
 * คืน null ถ้าบิลไม่มีทั้งเลขผู้เสียภาษีและชื่อ (เอกสารกำกวมเกินกว่าจะผูกคู่ค้า)
 */
async function resolveVendorContact(
  admin: SupabaseClient,
  orgId: string,
  vendor: OcrExtracted["vendor"],
): Promise<string | null> {
  const name = (vendor?.name ?? "").trim();
  const taxId = (vendor?.tax_id ?? "").trim();
  if (!name && !taxId) return null;

  if (taxId) {
    const { data } = await admin
      .from("acc_contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("tax_id", taxId)
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }
  if (name) {
    const { data } = await admin
      .from("acc_contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("name", name)
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }

  const { data: created } = await admin
    .from("acc_contacts")
    .insert({
      org_id: orgId,
      kind: "vendor",
      name: name || `ผู้ขาย ${taxId}`,
      tax_id: taxId || null,
      branch: (vendor?.branch ?? "").trim() || null,
      address: (vendor?.address ?? "").trim() || null,
    })
    .select("id")
    .maybeSingle();
  return (created as { id: string } | null)?.id ?? null;
}

export type PurchaseFromOcrResult =
  | { ok: true; purchaseDocumentId: string; created: boolean }
  | { ok: false; error: string };

/**
 * สร้าง/อัปเดตใบกำกับภาษีซื้อจาก OCR job ที่ถูกอนุมัติแล้ว
 * @param journalEntryId journal ที่ approve route สร้างไว้ (ผูกเข้ากับเอกสาร ไม่สร้างใหม่)
 */
export async function upsertPurchaseDocumentFromOcr(
  admin: SupabaseClient,
  orgId: string,
  job: { id: string; extracted_json: unknown },
  journalEntryId: string | null,
  userId: string | null,
): Promise<PurchaseFromOcrResult> {
  const ext = (job.extracted_json ?? {}) as OcrExtracted;

  const docNumber = (ext.document?.number ?? "").trim();
  const issueDate = (ext.document?.date ?? "").trim();
  if (!docNumber) return { ok: false, error: "บิลไม่มีเลขที่เอกสาร — บันทึกทะเบียนซื้อไม่ได้" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate))
    return { ok: false, error: "บิลไม่มีวันที่ที่อ่านได้ — บันทึกทะเบียนซื้อไม่ได้" };

  const docType = mapDocType(ext.document_type);
  const subtotal = round2(num(ext.amounts?.subtotal));
  const vatAmount = round2(num(ext.amounts?.vat_amount));
  const grand = round2(num(ext.amounts?.grand_total));
  // เชื่อ grand_total บนบิลเป็นหลัก ถ้าไม่มีค่อยคำนวณเอง
  const total = grand > 0 ? grand : round2(subtotal + vatAmount);
  const whtAmount = round2(num(ext.amounts?.withholding_tax_amount));
  const whtRate = round2(num(ext.amounts?.withholding_tax_rate));

  // ยอดบนบิลไม่สมดุล = OCR อ่านพลาด → ไม่บันทึกทะเบียน (กันข้อมูลภาษีเพี้ยน)
  if (Math.round((subtotal + vatAmount) * 100) !== Math.round(total * 100)) {
    return {
      ok: false,
      error: `ยอดบนบิลไม่สมดุล (${subtotal} + ${vatAmount} ≠ ${total}) — ตรวจแล้วบันทึกทะเบียนซื้อเองอีกครั้ง`,
    };
  }

  const contactId = await resolveVendorContact(admin, orgId, ext.vendor);

  const { data: settings } = await admin
    .from("acc_org_settings")
    .select("org_name, address, tax_id, branch")
    .eq("org_id", orgId)
    .maybeSingle();
  const buyer = (settings ?? {}) as {
    org_name?: string | null;
    address?: string | null;
    tax_id?: string | null;
    branch?: string | null;
  };

  const payload = {
    org_id: orgId,
    doc_type: docType,
    doc_number: docNumber,
    contact_id: contactId,
    issue_date: issueDate,
    tax_year: Number(issueDate.slice(0, 4)),
    tax_month: Number(issueDate.slice(5, 7)),
    // ผู้ขาย = ค่าที่อ่านจากบิลจริง (ไม่ใช่ master — บิลคือหลักฐาน)
    seller_name: (ext.vendor?.name ?? "").trim() || null,
    seller_address: (ext.vendor?.address ?? "").trim() || null,
    seller_tax_id: (ext.vendor?.tax_id ?? "").trim() || null,
    seller_branch: (ext.vendor?.branch ?? "").trim() || null,
    buyer_name: buyer.org_name ?? null,
    buyer_address: buyer.address ?? null,
    buyer_tax_id: buyer.tax_id ?? null,
    buyer_branch: buyer.branch ?? null,
    vat_rate: ext.amounts?.vat_rate ?? (vatAmount > 0 ? 7 : 0),
    subtotal,
    vat_amount: vatAmount,
    total,
    wht_rate: whtRate,
    wht_amount: whtAmount,
    is_vat_claimable: canClaimPurchaseVat(docType) && vatAmount > 0,
    status: "recorded" as const,
    journal_entry_id: journalEntryId,
    ocr_job_id: job.id,
    created_by: userId,
  };

  // idempotent ต่อ ocr_job_id — approve ซ้ำ = อัปเดตใบเดิม
  const { data: existing } = await admin
    .from("acc_purchase_documents")
    .select("id")
    .eq("org_id", orgId)
    .eq("ocr_job_id", job.id)
    .maybeSingle();

  let docId: string;
  if (existing) {
    docId = (existing as { id: string }).id;
    const { error } = await admin
      .from("acc_purchase_documents")
      .update(payload)
      .eq("id", docId)
      .eq("org_id", orgId);
    if (error) return { ok: false, error: error.message };
    await admin.from("acc_purchase_document_lines").delete().eq("document_id", docId);
  } else {
    const { data: created, error } = await admin
      .from("acc_purchase_documents")
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      // unique(org, ผู้ขาย, เลขที่) → บิลใบนี้เคยบันทึกไว้แล้วจากช่องทางอื่น
      if (error.code === "23505") {
        return {
          ok: false,
          error: `ใบกำกับเลขที่ ${docNumber} ของผู้ขายรายนี้มีในทะเบียนซื้อแล้ว`,
        };
      }
      return { ok: false, error: error.message };
    }
    docId = (created as { id: string }).id;
  }

  const items = Array.isArray(ext.items) ? ext.items : [];
  const lines = (items.length > 0 ? items : [{ description: docNumber, amount: subtotal }]).map(
    (it, i) => ({
      org_id: orgId,
      document_id: docId,
      item_name: (it.description ?? "").trim() || "รายการจากบิล",
      description: "",
      qty: round2(num(it.qty)) || 1,
      unit: null,
      unit_price: round2(num(it.unit_price)),
      amount: round2(num(it.amount)),
      account_id: null, // บัญชีถูกเลือกตอน approve journal แล้ว
      sort_order: i,
      created_by: userId,
    }),
  );
  const { error: lErr } = await admin.from("acc_purchase_document_lines").insert(lines);
  if (lErr) return { ok: false, error: lErr.message };

  return { ok: true, purchaseDocumentId: docId, created: !existing };
}
