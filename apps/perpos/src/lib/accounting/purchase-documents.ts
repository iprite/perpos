/**
 * purchase-documents.ts — ทะเบียนใบกำกับภาษีซื้อ (acc_purchase_documents + lines)
 *
 * ต่างจากฝั่งขาย (documents.ts) ตรงที่:
 *   • doc_number = เลขที่บนใบกำกับ "ของผู้ขาย" → ไม่ generate เอง
 *   • ยอดมาจากหน้าบิลจริง → ไม่ recompute VAT เอง (บิลอาจปัดเศษต่างจากสูตรเรา)
 *     server ตรวจแค่ว่า subtotal + vat = total (สมดุล) ไม่ไปทับตัวเลขบนเอกสารจริง
 *   • seller = ผู้ขาย (snapshot จากใบกำกับ) · buyer = กิจการเรา (snapshot จาก org settings)
 *
 * caller เช็ค auth ก่อน · ทุก query filter org_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccPurchaseDocument, AccPurchaseDocumentLine } from "./types";
import { normalizePage, toPaged, type PageOpts, type Paged } from "./paging";

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

interface PurchaseLineInput {
  item_name?: string;
  description?: string;
  qty?: unknown;
  unit?: string;
  unit_price?: unknown;
  amount?: unknown;
  account_id?: string;
}

export interface ComputedPurchaseDocument {
  lines: {
    item_name: string;
    description: string;
    qty: number;
    unit: string | null;
    unit_price: number;
    amount: number;
    account_id: string | null;
  }[];
  subtotal: number;
}

/**
 * normalize บรรทัด + รวม subtotal.
 * amount ต่อบรรทัด: ถ้าส่งมาใช้ค่านั้น (ตรงกับบิล) ถ้าไม่ส่ง → qty × unit_price
 */
export function computePurchaseLines(rawLines: unknown): ComputedPurchaseDocument {
  const arr = Array.isArray(rawLines) ? (rawLines as PurchaseLineInput[]) : [];
  const lines = arr.map((l) => {
    const qty = round2(num(l.qty));
    const unitPrice = round2(num(l.unit_price));
    const amount = l.amount === undefined ? round2(qty * unitPrice) : round2(num(l.amount));
    return {
      item_name: (l.item_name as string) || "",
      description: (l.description as string) || "",
      qty,
      unit: ((l.unit as string) || "").trim() || null,
      unit_price: unitPrice,
      amount,
      account_id: (l.account_id as string) || null,
    };
  });
  return { lines, subtotal: round2(lines.reduce((s, l) => s + l.amount, 0)) };
}

export interface PurchasePartySnapshot {
  seller_name: string | null;
  seller_address: string | null;
  seller_tax_id: string | null;
  seller_branch: string | null;
  buyer_name: string | null;
  buyer_address: string | null;
  buyer_tax_id: string | null;
  buyer_branch: string | null;
}

/**
 * snapshot คู่กรณีของใบกำกับภาษีซื้อ:
 *   seller = ผู้ขาย (จาก acc_contacts ที่เลือก — override ด้วยค่าที่อ่านจากบิลได้)
 *   buyer  = กิจการเรา (จาก acc_org_settings)
 */
export async function buildPurchasePartySnapshot(
  db: SupabaseClient,
  orgId: string,
  contactId: string | null,
  sellerOverride?: Partial<
    Pick<
      PurchasePartySnapshot,
      "seller_name" | "seller_address" | "seller_tax_id" | "seller_branch"
    >
  >,
): Promise<PurchasePartySnapshot> {
  const { data: s } = await db
    .from("acc_org_settings")
    .select("org_name, address, tax_id, branch")
    .eq("org_id", orgId)
    .maybeSingle();
  const buyer = (s ?? {}) as {
    org_name?: string | null;
    address?: string | null;
    tax_id?: string | null;
    branch?: string | null;
  };

  let vendor: {
    name?: string | null;
    address?: string | null;
    tax_id?: string | null;
    branch?: string | null;
  } = {};
  if (contactId) {
    const { data: c } = await db
      .from("acc_contacts")
      .select("name, address, tax_id, branch")
      .eq("org_id", orgId)
      .eq("id", contactId)
      .maybeSingle();
    vendor = (c ?? {}) as typeof vendor;
  }

  return {
    // ค่าที่อ่านจากบิลจริงชนะข้อมูล master (บิลคือหลักฐาน master อาจไม่ตรง)
    seller_name: sellerOverride?.seller_name ?? vendor.name ?? null,
    seller_address: sellerOverride?.seller_address ?? vendor.address ?? null,
    seller_tax_id: sellerOverride?.seller_tax_id ?? vendor.tax_id ?? null,
    seller_branch: sellerOverride?.seller_branch ?? vendor.branch ?? null,
    buyer_name: buyer.org_name ?? null,
    buyer_address: buyer.address ?? null,
    buyer_tax_id: buyer.tax_id ?? null,
    buyer_branch: buyer.branch ?? null,
  };
}

export interface ListPurchaseDocumentsOpts extends PageOpts {
  docType?: string;
  status?: string;
  contactId?: string;
  /** งวดภาษี (tax_year/tax_month) — ใช้ทำรายงานภาษีซื้อรายเดือน */
  taxYear?: number;
  taxMonth?: number;
  from?: string;
  to?: string;
  claimableOnly?: boolean;
}

export async function listPurchaseDocuments(
  db: SupabaseClient,
  orgId: string,
  opts?: ListPurchaseDocumentsOpts,
): Promise<Paged<AccPurchaseDocument>> {
  const { limit, offset } = normalizePage(opts);
  let q = db
    .from("acc_purchase_documents")
    .select("*, acc_contacts(name)", { count: "exact" })
    .eq("org_id", orgId)
    .is("deleted_at", null);
  if (opts?.docType) q = q.eq("doc_type", opts.docType);
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.contactId) q = q.eq("contact_id", opts.contactId);
  if (opts?.taxYear) q = q.eq("tax_year", opts.taxYear);
  if (opts?.taxMonth) q = q.eq("tax_month", opts.taxMonth);
  if (opts?.from) q = q.gte("issue_date", opts.from);
  if (opts?.to) q = q.lte("issue_date", opts.to);
  if (opts?.claimableOnly) q = q.eq("is_vat_claimable", true);
  q = q.order("issue_date", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((r: Record<string, unknown>) => ({
    ...(r as unknown as AccPurchaseDocument),
    contact_name: (r.acc_contacts as { name?: string } | null)?.name ?? undefined,
  }));
  return toPaged(rows, count, limit, offset);
}

/** เอกสารซื้อ 1 ใบ + lines (พร้อมรหัส/ชื่อบัญชีของแต่ละบรรทัด) */
export async function getPurchaseDocument(
  db: SupabaseClient,
  orgId: string,
  id: string,
): Promise<AccPurchaseDocument | null> {
  const { data: doc, error } = await db
    .from("acc_purchase_documents")
    .select(
      "*, acc_contacts(name), ref_document:ref_document_id(doc_number), acc_journal_entries(entry_number)",
    )
    .eq("org_id", orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!doc) return null;

  const { data: lines, error: e2 } = await db
    .from("acc_purchase_document_lines")
    .select("*, acc_accounts(code, name)")
    .eq("org_id", orgId)
    .eq("document_id", id)
    .order("sort_order", { ascending: true });
  if (e2) throw new Error(e2.message);

  const row = doc as Record<string, unknown>;
  return {
    ...(row as unknown as AccPurchaseDocument),
    contact_name: (row.acc_contacts as { name?: string } | null)?.name ?? undefined,
    ref_doc_number: (row.ref_document as { doc_number?: string } | null)?.doc_number ?? undefined,
    journal_entry_number:
      (row.acc_journal_entries as { entry_number?: string } | null)?.entry_number ?? undefined,
    lines: (lines ?? []).map((l: Record<string, unknown>) => {
      const acc = l.acc_accounts as { code?: string; name?: string } | null;
      return {
        ...(l as unknown as AccPurchaseDocumentLine),
        account_code: acc?.code,
        account_name: acc?.name,
      };
    }),
  };
}
