/**
 * sales-journal.ts — สะพานเอกสารขาย → สมุดรายวัน (Phase 1.5)
 *
 * เดิม: ออกใบกำกับภาษีแล้วยอดขาย/ลูกหนี้ "ไม่เข้างบเลย" ต้องคีย์สมุดรายวันซ้ำมือ
 * ใหม่: ใบที่เป็นจุดรับรู้รายได้ → สร้าง journal ให้อัตโนมัติ (source='document')
 *
 * รูปแบบ (ขายเชื่อ, จด VAT):
 *   Dr  ลูกหนี้การค้า 1100                 = total − wht
 *   Dr  ภาษีเงินได้ถูกหัก ณ ที่จ่าย 1160    = wht_amount   [ลูกค้าหักเรา = สินทรัพย์]
 *       Cr  รายได้ 4100/4200               = subtotal (แยกตามชนิดสินค้า/บริการ)
 *       Cr  ภาษีขาย 2150                   = vat_amount
 *
 * ใบเสร็จรับเงิน/ใบกำกับภาษี = รับเงินแล้ว → Dr เงินสด 1010 แทนลูกหนี้
 * ใบลดหนี้ (ม.86/10) = กลับข้างทุกบรรทัด · ใบเพิ่มหนี้ (ม.86/9) = ปกติ
 *
 * ⚠️ กันรายได้เบิ้ล 2 ชั้น — สำคัญที่สุดของไฟล์นี้:
 *   1. เลือกลงเฉพาะ "จุดรับรู้รายได้จุดเดียว" ต่อดีล (ดู shouldPostSalesJournal)
 *   2. เอกสารที่ convert มาจากใบที่ลงบัญชีแล้ว จะไม่ลงซ้ำ
 *      (ใบกำกับภาษี → ใบเสร็จรับเงิน: รายได้รับรู้ตอนออกใบกำกับไปแล้ว)
 *   3. idempotent ต่อ document id + partial unique index ที่ DB
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccDocument, AccDocumentLine } from "./types";

const ACC_CASH = "1010";
const ACC_RECEIVABLE = "1100";
const ACC_WHT_PREPAID = "1160"; // ภาษีเงินได้ถูกหัก ณ ที่จ่าย (ลูกค้าหักเรา)
const ACC_OUTPUT_VAT = "2150";
const ACC_REVENUE_GOODS = "4100";
const ACC_REVENUE_SERVICE = "4200";

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type SalesJournalResult =
  | { ok: true; journalEntryId: string; created: boolean }
  | { ok: false; error: string }
  | { ok: true; skipped: true; reason: string };

/**
 * เอกสารใบนี้เป็น "จุดรับรู้รายได้" ที่ต้องลงบัญชีหรือไม่
 *
 * จด VAT   → ใบกำกับภาษี / ใบเสร็จ-ใบกำกับ / ใบลด-เพิ่มหนี้ (ใบกำกับคือจุดความรับผิด VAT)
 *            ใบแจ้งหนี้/ใบเสร็จธรรมดาไม่ลง — เป็นเอกสารประกอบ ไม่ใช่จุดรับรู้
 * ไม่จด VAT → ใบแจ้งหนี้ / ใบเสร็จรับเงิน (ออกใบกำกับภาษีไม่ได้อยู่แล้ว)
 * ไม่ลงเลย  → ใบเสนอราคา / ใบวางบิล / ใบส่งของ (ยังไม่เกิดรายได้)
 */
export function shouldPostSalesJournal(docType: string, orgIsVatRegistered: boolean): boolean {
  if (orgIsVatRegistered) {
    return ["tax_invoice", "receipt_tax_invoice", "credit_note", "debit_note"].includes(docType);
  }
  return ["invoice", "receipt"].includes(docType);
}

/** ใบเสร็จ-ใบกำกับ = รับเงินทันที → เดบิตเงินสดแทนลูกหนี้ */
function debitAccountCode(docType: string): string {
  return docType === "receipt_tax_invoice" || docType === "receipt" ? ACC_CASH : ACC_RECEIVABLE;
}

interface JournalLineDraft {
  account_id: string;
  debit: number;
  credit: number;
  line_note: string | null;
}

function generateEntryNumber(entryDate: string): string {
  const datePart = entryDate.replace(/-/g, "").slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SAL-${datePart}-${rand}`;
}

/**
 * สร้าง journal จากเอกสารขาย 1 ใบ (idempotent)
 * คืน skipped ถ้าเอกสารชนิดนี้ไม่ใช่จุดรับรู้รายได้ หรือรับรู้ไปแล้วจากใบต้นทาง
 */
export async function postSalesDocumentToJournal(
  admin: SupabaseClient,
  orgId: string,
  doc: AccDocument,
  lines: AccDocumentLine[],
  userId: string | null,
): Promise<SalesJournalResult> {
  if (doc.status === "void") return { ok: true, skipped: true, reason: "เอกสารถูกยกเลิก" };
  if (doc.status === "draft")
    return { ok: true, skipped: true, reason: "ฉบับร่างยังไม่ออก — ยังไม่รับรู้รายได้" };

  const { data: settings } = await admin
    .from("acc_org_settings")
    .select("is_vat_registered")
    .eq("org_id", orgId)
    .maybeSingle();
  const vatRegistered = Boolean(
    (settings as { is_vat_registered?: boolean } | null)?.is_vat_registered,
  );

  if (!shouldPostSalesJournal(doc.doc_type, vatRegistered))
    return { ok: true, skipped: true, reason: "เอกสารชนิดนี้ไม่ใช่จุดรับรู้รายได้" };

  // 1) idempotency — ใบนี้ลงไปแล้ว
  const { data: existing } = await admin
    .from("acc_journal_entries")
    .select("id")
    .eq("org_id", orgId)
    .eq("source", "document")
    .eq("source_ref_id", doc.id)
    .maybeSingle();
  if (existing)
    return { ok: true, journalEntryId: (existing as { id: string }).id, created: false };

  // 2) กันเบิ้ล: ใบนี้ convert มาจากใบที่ลงบัญชีไปแล้ว (ใบกำกับ → ใบเสร็จ)
  if (doc.converted_from_id) {
    const { data: parentJe } = await admin
      .from("acc_journal_entries")
      .select("id")
      .eq("org_id", orgId)
      .eq("source", "document")
      .eq("source_ref_id", doc.converted_from_id)
      .maybeSingle();
    if (parentJe)
      return { ok: true, skipped: true, reason: "รายได้ถูกรับรู้จากเอกสารต้นทางไปแล้ว" };
  }

  // 3) งวดต้องเปิด
  const year = Number(doc.issue_date.slice(0, 4));
  const month = Number(doc.issue_date.slice(5, 7));
  const { data: period } = await admin
    .from("acc_periods")
    .select("id, status")
    .eq("org_id", orgId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  const p = period as { id: string; status: string } | null;
  if (p && p.status === "closed")
    return {
      ok: false,
      error: `งวดบัญชี ${year}/${String(month).padStart(2, "0")} ปิดแล้ว ลงบัญชีไม่ได้`,
    };

  // 4) resolve ผังบัญชี
  const wanted = [
    ACC_CASH,
    ACC_RECEIVABLE,
    ACC_WHT_PREPAID,
    ACC_OUTPUT_VAT,
    ACC_REVENUE_GOODS,
    ACC_REVENUE_SERVICE,
  ];
  const { data: accs } = await admin
    .from("acc_accounts")
    .select("id, code")
    .eq("org_id", orgId)
    .in("code", wanted);
  const byCode = new Map(
    (accs ?? []).map((a) => [(a as { code: string }).code, (a as { id: string }).id]),
  );

  const drCode = debitAccountCode(doc.doc_type);
  const drId = byCode.get(drCode);
  const revGoodsId = byCode.get(ACC_REVENUE_GOODS);
  if (!drId) return { ok: false, error: `ผังบัญชีไม่มีรหัส ${drCode}` };
  if (!revGoodsId) return { ok: false, error: `ผังบัญชีไม่มีรหัส ${ACC_REVENUE_GOODS} (รายได้)` };

  const subtotal = round2(Number(doc.subtotal) || 0);
  const vatAmount = round2(Number(doc.vat_amount) || 0);
  const total = round2(Number(doc.total) || 0);
  const whtAmount = round2(Number(doc.wht_amount) || 0);
  if (subtotal <= 0) return { ok: false, error: "เอกสารไม่มียอด — ลงบัญชีไม่ได้" };

  // 5) แยกรายได้ตามชนิดสินค้า/บริการ (product.kind) — free text → รายได้จากการขาย
  const productIds = lines.map((l) => l.product_id).filter(Boolean) as string[];
  const kindByProduct = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: prods } = await admin
      .from("acc_products")
      .select("id, kind")
      .eq("org_id", orgId)
      .in("id", productIds);
    for (const pr of prods ?? [])
      kindByProduct.set((pr as { id: string }).id, (pr as { kind: string }).kind);
  }
  const revenueByAccount = new Map<string, number>();
  for (const l of lines) {
    const kind = l.product_id ? kindByProduct.get(l.product_id) : undefined;
    const code = kind === "service" ? ACC_REVENUE_SERVICE : ACC_REVENUE_GOODS;
    const accId = byCode.get(code) ?? revGoodsId;
    revenueByAccount.set(
      accId,
      round2((revenueByAccount.get(accId) ?? 0) + (Number(l.amount) || 0)),
    );
  }
  // ปัดเศษบรรทัดอาจไม่เท่า subtotal ของหัวเอกสาร → ยัดส่วนต่างเข้าบัญชีรายได้หลัก
  const revenueSum = round2(Array.from(revenueByAccount.values()).reduce((s, v) => s + v, 0));
  if (revenueSum !== subtotal) {
    const diff = round2(subtotal - revenueSum);
    revenueByAccount.set(revGoodsId, round2((revenueByAccount.get(revGoodsId) ?? 0) + diff));
  }

  // 6) ประกอบบรรทัด
  const drafts: JournalLineDraft[] = [];
  const netReceivable = round2(total - whtAmount);
  if (netReceivable > 0)
    drafts.push({
      account_id: drId,
      debit: netReceivable,
      credit: 0,
      line_note: `${doc.buyer_name ?? doc.contact_name ?? "ลูกค้า"} · ${doc.doc_number}`,
    });
  if (whtAmount > 0) {
    const whtId = byCode.get(ACC_WHT_PREPAID);
    if (!whtId)
      return { ok: false, error: `ผังบัญชีไม่มีรหัส ${ACC_WHT_PREPAID} (ภาษีถูกหัก ณ ที่จ่าย)` };
    drafts.push({
      account_id: whtId,
      debit: whtAmount,
      credit: 0,
      line_note: `ถูกหัก ณ ที่จ่าย ${doc.wht_rate}%`,
    });
  }
  for (const [accId, amt] of Array.from(revenueByAccount.entries())) {
    if (amt <= 0) continue;
    drafts.push({ account_id: accId, debit: 0, credit: amt, line_note: "รายได้" });
  }
  if (vatAmount > 0) {
    const vatId = byCode.get(ACC_OUTPUT_VAT);
    if (!vatId) return { ok: false, error: `ผังบัญชีไม่มีรหัส ${ACC_OUTPUT_VAT} (ภาษีขาย)` };
    drafts.push({ account_id: vatId, debit: 0, credit: vatAmount, line_note: "ภาษีขาย" });
  }

  // ใบลดหนี้ = กลับข้าง (ลดลูกหนี้/รายได้/ภาษีขาย)
  const reverse = doc.doc_type === "credit_note";
  const finalLines = reverse
    ? drafts.map((l) => ({ ...l, debit: l.credit, credit: l.debit }))
    : drafts;

  const totalDebit = round2(finalLines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(finalLines.reduce((s, l) => s + l.credit, 0));
  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100))
    return {
      ok: false,
      error: `ยอดเดบิต (${totalDebit}) ไม่เท่าเครดิต (${totalCredit})`,
    };

  // 7) เขียน
  const { data: entry, error: eErr } = await admin
    .from("acc_journal_entries")
    .insert({
      org_id: orgId,
      entry_number: generateEntryNumber(doc.issue_date),
      entry_date: doc.issue_date,
      description: `ขาย ${doc.doc_number}${doc.buyer_name ? ` · ${doc.buyer_name}` : ""}`,
      status: "posted",
      period_id: p?.id ?? null,
      source: "document",
      source_ref_id: doc.id,
      total_debit: totalDebit,
      total_credit: totalCredit,
      created_by: userId,
    })
    .select("id")
    .single();
  if (eErr) {
    const { data: raced } = await admin
      .from("acc_journal_entries")
      .select("id")
      .eq("org_id", orgId)
      .eq("source", "document")
      .eq("source_ref_id", doc.id)
      .maybeSingle();
    if (raced) return { ok: true, journalEntryId: (raced as { id: string }).id, created: false };
    return { ok: false, error: eErr.message };
  }
  const entryId = (entry as { id: string }).id;

  const { error: lErr } = await admin.from("acc_journal_lines").insert(
    finalLines.map((l, i) => ({
      org_id: orgId,
      journal_entry_id: entryId,
      account_id: l.account_id,
      debit: l.debit,
      credit: l.credit,
      line_note: l.line_note,
      sort_order: i + 1,
    })),
  );
  if (lErr) {
    await admin.from("acc_journal_entries").delete().eq("id", entryId).eq("org_id", orgId);
    return { ok: false, error: lErr.message };
  }

  return { ok: true, journalEntryId: entryId, created: true };
}
