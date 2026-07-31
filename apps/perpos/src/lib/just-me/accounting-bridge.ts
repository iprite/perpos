/**
 * accounting-bridge.ts — **ตัวกลางที่เดียว** ระหว่าง just_me กับ module `accounting`
 * contract: .claude/feature-factory/specs/just-me-project-loop.md §6 (B5) · §7 ข้อ 3/10 · §8 กฎ 5
 *
 * ⛔ กฎที่ห้ามพัง (docs/ACCOUNTING_FEATURE.md §1):
 *  1. **just_me ห้ามออกเลขเอกสารเอง** — ทุกใบต้องไปเกิดที่ `POST /api/accounting/documents`
 *     (RPC `next_acc_doc_number()` เป็นคนจ่ายเลข atomic) · ไฟล์นี้แค่ "แปลงเป็น payload" + ยิงต่อ
 *  2. **ห้ามส่งต้นทุน/margin ออกไปที่เอกสารลูกค้า** — บรรทัดที่ประกอบที่นี่มีเฉพาะราคาขาย
 *     (สร้าง object ทีละคีย์ ห้าม spread แถว BOQ เข้าไปตรง ๆ)
 *  3. snapshot ม.86/4 ทำที่ accounting ⇒ ลูกค้าโครงการต้องมีแถวใน `acc_contacts` ก่อนเสมอ
 *  4. ยอดเงินคำนวณจากค่าที่ freeze ไว้แล้ว (`boq_items.amount` / `billings.amount`) —
 *     ห้ามคิดสูตรใหม่ที่นี่ (สูตรอยู่ `project-metrics.ts`)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "./project-metrics";
import type { JustMeBoq, JustMeBoqItem, JustMeProject, JustMeProjectBilling } from "./types";

// ─── payload ที่ `/api/accounting/documents` รับจริง ────────────────────────
/** ชนิดเอกสารที่ just_me ออกได้ (ที่เหลือเป็นงานของหน้าบัญชีโดยตรง) */
export type BridgeDocType = "quotation" | "invoice" | "tax_invoice";

export interface AccDocumentLinePayload {
  item_name: string;
  description: string;
  qty: number;
  unit_price: number;
  unit: string | null;
  discount: number;
  discount_type: "amount" | "percent";
}

export interface AccDocumentPayload {
  orgId: string;
  doc_type: BridgeDocType;
  issue_date: string;
  due_date: string | null;
  contact_id: string;
  vat_enabled: boolean;
  wht_rate: number;
  note: string | null;
  lines: AccDocumentLinePayload[];
}

export type QuotationGroupBy = "item" | "category";

const UNGROUPED_LABEL = "งานอื่น ๆ";

/** บรรทัดเอกสาร = ราคาขายล้วน (จุดเดียวที่ประกอบบรรทัด — กันต้นทุนหลุดโดยไม่ตั้งใจ) */
function sellLine(args: {
  item_name: string;
  description?: string;
  qty: number;
  unit_price: number;
  unit?: string | null;
  discount?: number;
}): AccDocumentLinePayload {
  return {
    item_name: args.item_name,
    description: args.description ?? "",
    qty: round2(args.qty),
    unit_price: round2(args.unit_price),
    unit: args.unit?.trim() ? args.unit.trim() : null,
    discount: round2(args.discount ?? 0),
    discount_type: "amount",
  };
}

// ─── ใบเสนอราคา จาก BOQ ─────────────────────────────────────────────────────
export interface QuotationOptions {
  orgId: string;
  contactId: string;
  issueDate: string;
  dueDate?: string | null;
  /** default = `category` (สรุปตามหมวดงาน — กันลูกค้าเห็นโครงต้นทุนของเรา · contract §10 Q7) */
  groupBy?: QuotationGroupBy;
  vatEnabled: boolean;
  whtRate?: number;
  /** ชื่อหมวดงานสำหรับโหมด category (id → ชื่อ) */
  categoryNames?: Map<string, string>;
  note?: string | null;
}

/**
 * BOQ → payload ใบเสนอราคา
 * - โหมด `category`: 1 บรรทัดต่อหมวดงาน · `qty = 1` · ราคา = ยอดขายรวมของหมวด
 * - โหมด `item`: 1 บรรทัดต่อรายการ BOQ (ปริมาณ + ราคาขายต่อหน่วยจริง)
 * - ทั้งสองโหมด **ยอดรวมต้องเท่ากับ Σ `boq_items.amount`** (มี unit test คุม)
 */
export function buildQuotationPayload(
  project: Pick<JustMeProject, "project_code" | "name">,
  boq: Pick<JustMeBoq, "revision_no" | "title">,
  items: Pick<
    JustMeBoqItem,
    "name" | "unit" | "qty" | "unit_price" | "amount" | "category_id" | "sort_order"
  >[],
  opts: QuotationOptions,
): AccDocumentPayload {
  if (items.length === 0) {
    throw new Error("BOQ ฉบับนี้ยังไม่มีรายการ — เพิ่มรายการก่อนออกใบเสนอราคา");
  }
  const groupBy: QuotationGroupBy = opts.groupBy ?? "category";

  let lines: AccDocumentLinePayload[];
  if (groupBy === "item") {
    lines = items.map((it) =>
      sellLine({
        item_name: it.name,
        qty: it.qty,
        unit_price: it.unit_price,
        unit: it.unit,
      }),
    );
  } else {
    // รวมยอดขายรายหมวด — เรียงตามลำดับที่เจอครั้งแรกใน BOQ (คงลำดับที่ผู้ใช้จัดไว้)
    const order: string[] = [];
    const bucket = new Map<string, { amount: number; count: number }>();
    for (const it of items) {
      const key = it.category_id ?? "";
      if (!bucket.has(key)) {
        bucket.set(key, { amount: 0, count: 0 });
        order.push(key);
      }
      const cur = bucket.get(key)!;
      cur.amount += it.amount ?? 0;
      cur.count += 1;
    }
    lines = order.map((key) => {
      const g = bucket.get(key)!;
      const name = (key && opts.categoryNames?.get(key)) || UNGROUPED_LABEL;
      return sellLine({
        item_name: name,
        description: `รวม ${g.count.toLocaleString("th-TH")} รายการ`,
        qty: 1,
        unit_price: g.amount,
        unit: "งาน",
      });
    });
  }

  const noteParts = [
    `อ้างอิง BOQ ฉบับที่ ${boq.revision_no}${boq.title ? ` (${boq.title})` : ""}`,
    `โครงการ ${project.project_code} · ${project.name}`,
  ];
  if (opts.note?.trim()) noteParts.push(opts.note.trim());

  return {
    orgId: opts.orgId,
    doc_type: "quotation",
    issue_date: opts.issueDate,
    due_date: opts.dueDate ?? null,
    contact_id: opts.contactId,
    vat_enabled: opts.vatEnabled,
    wht_rate: opts.whtRate ?? 0,
    note: noteParts.join("\n"),
    lines,
  };
}

// ─── ใบแจ้งหนี้/ใบกำกับ จากงวดงาน ───────────────────────────────────────────
export interface InvoiceOptions {
  orgId: string;
  contactId: string;
  issueDate: string;
  dueDate?: string | null;
  /** `invoice` (default) หรือ `tax_invoice` — ผู้ใช้เลือกตอนกดออกเอกสาร */
  docType?: Extract<BridgeDocType, "invoice" | "tax_invoice">;
  vatEnabled: boolean;
  whtRate?: number;
  /**
   * เงินประกันผลงาน (retention):
   *  - `note` (default) = **ไม่ลดยอดในเอกสาร** เขียนไว้ในหมายเหตุเท่านั้น
   *    (ระบบบัญชีคิด VAT จากยอดในบรรทัด — การหักก่อน VAT เป็นการตัดสินทางภาษี ไม่ตัดสินแทนผู้ใช้)
   *  - `discount` = หักออกจากบรรทัดผ่านช่องส่วนลด (ฐาน VAT ลดลงตาม)
   *    ⚠️ accounting clamp บรรทัดที่ติดลบเป็น 0 ⇒ ทำเป็น "บรรทัดหักติดลบ" ไม่ได้
   */
  retentionMode?: "note" | "discount";
  note?: string | null;
}

/** งวดงาน → payload ใบแจ้งหนี้/ใบกำกับ (1 งวด = 1 บรรทัด) */
export function buildInvoicePayload(
  project: Pick<JustMeProject, "project_code" | "name">,
  billing: Pick<
    JustMeProjectBilling,
    "seq" | "title" | "amount" | "retention_amount" | "percent_of_contract" | "due_date"
  >,
  opts: InvoiceOptions,
): AccDocumentPayload {
  const amount = Number(billing.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("งวดนี้ยังไม่มียอดเงิน — กรอกยอดงวดก่อนออกใบแจ้งหนี้");
  }
  const retention = Number(billing.retention_amount ?? 0);
  const mode = opts.retentionMode ?? "note";
  if (mode === "discount" && retention > amount) {
    throw new Error("เงินประกันผลงานมากกว่ายอดงวด — ตรวจสอบยอดก่อนออกเอกสาร");
  }

  const percentText =
    billing.percent_of_contract == null
      ? ""
      : ` (${billing.percent_of_contract.toLocaleString("th-TH")}% ของสัญญา)`;

  const line = sellLine({
    item_name: billing.title?.trim() || `งวดที่ ${billing.seq}`,
    description: `${project.project_code} · ${project.name}${percentText}`,
    qty: 1,
    unit_price: amount,
    unit: "งวด",
    discount: mode === "discount" && retention > 0 ? retention : 0,
  });

  const noteParts = [`งวดที่ ${billing.seq} ของโครงการ ${project.project_code}`];
  if (retention > 0) {
    noteParts.push(
      mode === "discount"
        ? `หักเงินประกันผลงาน ${retention.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท แล้ว`
        : `มีเงินประกันผลงาน ${retention.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท (ยังไม่ได้หักออกจากยอดในเอกสารนี้)`,
    );
  }
  if (opts.note?.trim()) noteParts.push(opts.note.trim());

  return {
    orgId: opts.orgId,
    doc_type: opts.docType ?? "invoice",
    issue_date: opts.issueDate,
    due_date: opts.dueDate ?? billing.due_date ?? null,
    contact_id: opts.contactId,
    vat_enabled: opts.vatEnabled,
    wht_rate: opts.whtRate ?? 0,
    note: noteParts.join("\n"),
    lines: [line],
  };
}

/** ยอดก่อน VAT ที่ accounting จะคิดได้จาก payload (ใช้ตรวจ/แสดงผลก่อนกดออกเอกสาร) */
export function payloadSubtotal(payload: AccDocumentPayload): number {
  return round2(
    payload.lines.reduce((sum, l) => {
      const gross = l.qty * l.unit_price;
      const discount = l.discount_type === "percent" ? (gross * l.discount) / 100 : l.discount;
      return sum + Math.max(0, round2(gross - discount));
    }, 0),
  );
}

// ─── ความพร้อมของฝั่งบัญชี (เตือน ไม่บล็อก) ─────────────────────────────────
export interface AccountingReadiness {
  /** ยังไม่ตั้งค่าบัญชีของ org นี้เลย (ไม่มีแถว `acc_org_settings`) */
  configured: boolean;
  vat_registered: boolean;
  vat_rate: number;
  /** ครบตาม ม.86/4 ฝั่งผู้ขายไหม (ชื่อ/เลขผู้เสียภาษี/ที่อยู่) */
  tax_identity_ready: boolean;
  /** ช่องที่ยังว่าง — UI เอาไปเตือนตรง ๆ */
  missing: string[];
}

/**
 * อ่านความพร้อมของ `acc_org_settings` — **เตือนเท่านั้น ห้ามบล็อกเงียบ**
 * (ใบเสนอราคาไม่ใช่เอกสารภาษี ออกได้ · แต่ใบกำกับจะถูก accounting ปฏิเสธ 422 ถ้าข้อมูลไม่ครบ)
 */
export async function loadAccountingReadiness(
  db: SupabaseClient,
  orgId: string,
): Promise<AccountingReadiness> {
  const { data } = await db
    .from("acc_org_settings")
    .select("org_name, tax_id, address, branch, is_vat_registered, vat_rate")
    .eq("org_id", orgId)
    .maybeSingle();
  const s = data as {
    org_name?: string | null;
    tax_id?: string | null;
    address?: string | null;
    is_vat_registered?: boolean | null;
    vat_rate?: number | null;
  } | null;

  if (!s) {
    return {
      configured: false,
      vat_registered: false,
      vat_rate: 7,
      tax_identity_ready: false,
      missing: ["ตั้งค่ากิจการในระบบบัญชี"],
    };
  }
  const missing: string[] = [];
  if (!s.org_name?.trim()) missing.push("ชื่อกิจการ");
  if (!s.tax_id?.trim()) missing.push("เลขประจำตัวผู้เสียภาษี");
  if (!s.address?.trim()) missing.push("ที่อยู่กิจการ");

  return {
    configured: true,
    vat_registered: Boolean(s.is_vat_registered),
    vat_rate: Number(s.vat_rate ?? 7),
    tax_identity_ready: missing.length === 0,
    missing,
  };
}

// ─── ลูกค้าใน `acc_contacts` (ต้องมีก่อนออกเอกสาร — snapshot ม.86/4) ─────────
export type EnsureContactResult =
  | { ok: true; contactId: string; created: boolean }
  | { ok: false; error: string; status: number };

/**
 * หา/สร้างลูกค้าใน `acc_contacts` จากชื่อลูกค้าของโครงการ แล้วผูกกลับที่ `acc_contact_id`
 * - idempotent: ชื่อซ้ำ (ไม่สนตัวพิมพ์) → ใช้แถวเดิม ไม่สร้างซ้ำ
 * - ต้องใช้ client ที่เขียน `acc_contacts` ได้ (service-role ใน route handler)
 */
export async function ensureAccContact(
  db: SupabaseClient,
  orgId: string,
  project: Pick<JustMeProject, "id" | "acc_contact_id" | "customer_name">,
): Promise<EnsureContactResult> {
  if (project.acc_contact_id) {
    const { data } = await db
      .from("acc_contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("id", project.acc_contact_id)
      .maybeSingle();
    if (data) return { ok: true, contactId: (data as { id: string }).id, created: false };
    // ผูกไว้กับลูกค้าที่ถูกลบไปแล้ว → สร้างใหม่จากชื่อด้านล่าง
  }

  const name = project.customer_name?.trim();
  if (!name) {
    return {
      ok: false,
      error: "โครงการนี้ยังไม่ได้ระบุชื่อลูกค้า — กรอกชื่อลูกค้าก่อนออกเอกสาร",
      status: 400,
    };
  }

  const { data: existing, error: findErr } = await db
    .from("acc_contacts")
    .select("id, name")
    .eq("org_id", orgId)
    .in("kind", ["customer", "both"])
    .ilike("name", name)
    .limit(1);
  if (findErr) return { ok: false, error: "ค้นหาลูกค้าในระบบบัญชีไม่สำเร็จ", status: 500 };

  let contactId = (existing?.[0] as { id: string } | undefined)?.id ?? null;
  let created = false;
  if (!contactId) {
    const { data: inserted, error: insErr } = await db
      .from("acc_contacts")
      .insert({ org_id: orgId, kind: "customer", name })
      .select("id")
      .single();
    if (insErr || !inserted) {
      return { ok: false, error: "สร้างลูกค้าในระบบบัญชีไม่สำเร็จ", status: 500 };
    }
    contactId = (inserted as { id: string }).id;
    created = true;
  }

  const { error: linkErr } = await db
    .from("just_me_projects")
    .update({ acc_contact_id: contactId })
    .eq("org_id", orgId)
    .eq("id", project.id);
  if (linkErr) return { ok: false, error: "ผูกลูกค้าเข้ากับโครงการไม่สำเร็จ", status: 500 };

  return { ok: true, contactId, created };
}

// ─── ยิงเข้า `/api/accounting/documents` (path ปกติของ accounting) ───────────
export type PostDocumentResult =
  | { ok: true; id: string; doc_number: string; journal_warning: string | null }
  | { ok: false; error: string; status: number };

/**
 * สร้างเอกสารผ่าน route ของ accounting เอง — **ไม่ลอก logic มาไว้ที่ just_me**
 * (เลขที่/ผังบัญชี/งวดปิด/snapshot ทั้งหมดตัดสินที่นั่นเหมือนที่ผู้ใช้กดจากหน้าบัญชี)
 * สิทธิ์ใช้ token เดิมของผู้ใช้ ⇒ ต้องเป็นสมาชิก module `accounting` ด้วย (ข้อความ 403 ส่งกลับตรง ๆ)
 */
export async function postAccountingDocument(args: {
  origin: string;
  authorization: string | null;
  payload: AccDocumentPayload;
}): Promise<PostDocumentResult> {
  if (!args.authorization) {
    return { ok: false, error: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", status: 401 };
  }
  let res: Response;
  try {
    res = await fetch(`${args.origin}/api/accounting/documents`, {
      method: "POST",
      headers: { Authorization: args.authorization, "Content-Type": "application/json" },
      body: JSON.stringify(args.payload),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "ติดต่อระบบบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", status: 502 };
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof json.error === "string" ? json.error : "ระบบบัญชีปฏิเสธการออกเอกสารนี้";
    return { ok: false, error: message, status: res.status };
  }
  return {
    ok: true,
    id: String(json.id ?? ""),
    doc_number: String(json.doc_number ?? ""),
    journal_warning: typeof json.journal_warning === "string" ? json.journal_warning : null,
  };
}

/** เลขที่เอกสารของ id ที่ just_me เก็บไว้ (ใช้โชว์ลิงก์ในหน้าโครงการ) */
export async function loadDocumentNumbers(
  db: SupabaseClient,
  orgId: string,
  ids: (string | null | undefined)[],
): Promise<Map<string, { doc_number: string; status: string; doc_type: string }>> {
  const list = Array.from(new Set(ids.filter((v): v is string => !!v)));
  const out = new Map<string, { doc_number: string; status: string; doc_type: string }>();
  if (list.length === 0) return out;
  const { data } = await db
    .from("acc_documents")
    .select("id, doc_number, status, doc_type")
    .eq("org_id", orgId)
    .in("id", list);
  for (const row of (data ?? []) as {
    id: string;
    doc_number: string;
    status: string;
    doc_type: string;
  }[]) {
    out.set(row.id, { doc_number: row.doc_number, status: row.status, doc_type: row.doc_type });
  }
  return out;
}
