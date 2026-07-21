/**
 * purchase-journal.ts — สะพานเอกสารซื้อ → สมุดรายวัน (auto journal)
 *
 * ยึด pattern เดียวกับ payroll-bridge.ts: idempotency key กันซ้ำ + สร้าง entry เดียวต่อเอกสาร
 * ใช้ source='document' (มีใน enum อยู่แล้ว) + source_ref_id = purchase document id
 * DB มี partial unique index acc_journal_entries_document_uniq กันซ้ำอีกชั้น
 *
 * รูปแบบรายการ (ใบกำกับภาษีซื้อทั่วไป):
 *   Dr  ค่าใช้จ่าย/สินทรัพย์ (ตาม account_id ของแต่ละบรรทัด)   = subtotal
 *   Dr  ภาษีซื้อ (1150)                                        = vat_amount   [เฉพาะที่เครดิตได้]
 *       Cr  เจ้าหนี้การค้า (2100)                              = total − wht
 *       Cr  ภาษีหัก ณ ที่จ่ายรอนำส่ง                            = wht_amount   [ถ้ามี]
 *
 * ภาษีซื้อต้องห้าม (is_vat_claimable=false) → ไม่แยกบัญชีภาษีซื้อ แต่รวม VAT
 * เข้าเป็นต้นทุน/ค่าใช้จ่ายตามหลักบัญชี (ลง Dr บรรทัดค่าใช้จ่ายบรรทัดแรกแทน)
 *
 * ใบลดหนี้ (credit_note) = กลับข้างทุกบรรทัด (Dr ↔ Cr)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccPurchaseDocument, AccPurchaseDocumentLine } from "./types";

/** รหัสบัญชีมาตรฐานจากผังบัญชีไทยที่ seed ให้ทุก org */
const ACC_CODE_INPUT_VAT = "1150"; // ภาษีซื้อ
const ACC_CODE_TRADE_PAYABLE = "2100"; // เจ้าหนี้การค้า
/** ภาษีหัก ณ ที่จ่ายรอนำส่ง — 2210 = ภ.ง.ด.1 · 2220 = ภ.ง.ด.3/53 (ถ้ามีในผัง) */
const ACC_CODE_WHT_PAYABLE_CANDIDATES = ["2220", "2210"];

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type PurchaseJournalResult =
  | { ok: true; journalEntryId: string; created: boolean }
  | { ok: false; error: string };

interface JournalLineDraft {
  account_id: string;
  debit: number;
  credit: number;
  line_note: string | null;
}

/** entry_number ของ auto journal ฝั่งซื้อ: PUR-YYYYMMDD-<rand6> */
function generateEntryNumber(entryDate: string): string {
  const datePart = entryDate.replace(/-/g, "").slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PUR-${datePart}-${rand}`;
}

/**
 * สร้าง journal entry จากเอกสารซื้อ 1 ใบ (idempotent — เรียกซ้ำได้ ไม่เบิ้ล)
 * คืน created=false ถ้ามี journal ของเอกสารใบนี้อยู่แล้ว
 */
export async function postPurchaseDocumentToJournal(
  admin: SupabaseClient,
  orgId: string,
  doc: AccPurchaseDocument,
  lines: AccPurchaseDocumentLine[],
  userId: string | null,
): Promise<PurchaseJournalResult> {
  if (doc.status === "void") return { ok: false, error: "เอกสารที่ยกเลิกแล้ว ลงบัญชีไม่ได้" };

  // 1) idempotency — มี journal ของเอกสารใบนี้แล้ว → ไม่สร้างซ้ำ
  const { data: existing } = await admin
    .from("acc_journal_entries")
    .select("id")
    .eq("org_id", orgId)
    .eq("source", "document")
    .eq("source_ref_id", doc.id)
    .maybeSingle();
  if (existing) {
    return { ok: true, journalEntryId: (existing as { id: string }).id, created: false };
  }

  // 2) งวดต้องเปิดอยู่
  const d = new Date(doc.issue_date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const { data: period } = await admin
    .from("acc_periods")
    .select("id, status")
    .eq("org_id", orgId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  const p = period as { id: string; status: string } | null;
  if (p && p.status === "closed") {
    return {
      ok: false,
      error: `งวดบัญชี ${year}/${String(month).padStart(2, "0")} ปิดแล้ว ลงบัญชีไม่ได้`,
    };
  }

  // 3) resolve บัญชีที่ต้องใช้จากผังบัญชีของ org
  const wanted = [ACC_CODE_INPUT_VAT, ACC_CODE_TRADE_PAYABLE, ...ACC_CODE_WHT_PAYABLE_CANDIDATES];
  const { data: accs } = await admin
    .from("acc_accounts")
    .select("id, code")
    .eq("org_id", orgId)
    .in("code", wanted);
  const byCode = new Map(
    (accs ?? []).map((a) => [(a as { code: string }).code, (a as { id: string }).id]),
  );

  const payableId = byCode.get(ACC_CODE_TRADE_PAYABLE);
  if (!payableId) {
    return { ok: false, error: `ผังบัญชีไม่มีรหัส ${ACC_CODE_TRADE_PAYABLE} (เจ้าหนี้การค้า)` };
  }

  const vatAmount = round2(Number(doc.vat_amount) || 0);
  const whtAmount = round2(Number(doc.wht_amount) || 0);
  const claimVat = doc.is_vat_claimable && vatAmount > 0;

  const inputVatId = byCode.get(ACC_CODE_INPUT_VAT);
  if (claimVat && !inputVatId) {
    return { ok: false, error: `ผังบัญชีไม่มีรหัส ${ACC_CODE_INPUT_VAT} (ภาษีซื้อ)` };
  }
  const whtPayableId = ACC_CODE_WHT_PAYABLE_CANDIDATES.map((c) => byCode.get(c)).find(Boolean);
  if (whtAmount > 0 && !whtPayableId) {
    return {
      ok: false,
      error: "ผังบัญชีไม่มีบัญชีภาษีหัก ณ ที่จ่ายรอนำส่ง (2220/2210) — เพิ่มก่อนจึงลงบัญชีได้",
    };
  }

  // ทุกบรรทัดต้องระบุบัญชีปลายทาง ไม่งั้นลงบัญชีไม่ได้
  const missingAccount = lines.find((l) => !l.account_id);
  if (missingAccount) {
    return { ok: false, error: "มีบรรทัดที่ยังไม่ได้เลือกบัญชี — เลือกให้ครบก่อนลงบัญชี" };
  }
  if (lines.length === 0) return { ok: false, error: "เอกสารไม่มีรายการ" };

  // 4) ประกอบบรรทัด Dr/Cr
  const drafts: JournalLineDraft[] = [];

  // Dr ค่าใช้จ่าย/สินทรัพย์ ตามบรรทัด — VAT ต้องห้ามบวกเข้าบรรทัดแรก (เป็นต้นทุน)
  const nonClaimableVat = !doc.is_vat_claimable ? vatAmount : 0;
  lines.forEach((l, i) => {
    const base = round2(Number(l.amount) || 0);
    const amount = i === 0 ? round2(base + nonClaimableVat) : base;
    if (amount <= 0) return;
    drafts.push({
      account_id: l.account_id as string,
      debit: amount,
      credit: 0,
      line_note: l.item_name || l.description || null,
    });
  });

  if (claimVat && inputVatId) {
    drafts.push({ account_id: inputVatId, debit: vatAmount, credit: 0, line_note: "ภาษีซื้อ" });
  }

  const payable = round2(Number(doc.total) || 0) - whtAmount;
  if (payable > 0) {
    drafts.push({
      account_id: payableId,
      debit: 0,
      credit: payable,
      line_note: `${doc.seller_name ?? "เจ้าหนี้"} · ${doc.doc_number}`,
    });
  }
  if (whtAmount > 0 && whtPayableId) {
    drafts.push({
      account_id: whtPayableId,
      debit: 0,
      credit: whtAmount,
      line_note: `หัก ณ ที่จ่าย ${doc.wht_rate}%`,
    });
  }

  // ใบลดหนี้ = กลับข้างทุกบรรทัด
  const reverse = doc.doc_type === "credit_note";
  const finalLines = reverse
    ? drafts.map((l) => ({ ...l, debit: l.credit, credit: l.debit }))
    : drafts;

  const totalDebit = round2(finalLines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(finalLines.reduce((s, l) => s + l.credit, 0));
  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
    return {
      ok: false,
      error: `ยอดเดบิต (${totalDebit}) ไม่เท่าเครดิต (${totalCredit}) — ตรวจยอดบนเอกสารอีกครั้ง`,
    };
  }

  // 5) เขียน entry + lines (rollback หัวถ้าบรรทัดพัง)
  const { data: entry, error: eErr } = await admin
    .from("acc_journal_entries")
    .insert({
      org_id: orgId,
      entry_number: generateEntryNumber(doc.issue_date),
      entry_date: doc.issue_date,
      description: `ซื้อ ${doc.doc_number}${doc.seller_name ? ` · ${doc.seller_name}` : ""}`,
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
    // unique index ชน = มีคนสร้างพร้อมกัน → ถือว่าสำเร็จ (idempotent)
    const { data: raced } = await admin
      .from("acc_journal_entries")
      .select("id")
      .eq("org_id", orgId)
      .eq("source", "document")
      .eq("source_ref_id", doc.id)
      .maybeSingle();
    if (raced) {
      return { ok: true, journalEntryId: (raced as { id: string }).id, created: false };
    }
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

  await admin
    .from("acc_purchase_documents")
    .update({ journal_entry_id: entryId })
    .eq("id", doc.id)
    .eq("org_id", orgId);

  return { ok: true, journalEntryId: entryId, created: true };
}
