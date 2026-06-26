/**
 * documents.ts — fetch logic เอกสารขาย (acc_documents + acc_document_lines nested).
 * caller เช็ค auth ก่อน · ทุก query filter org_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccDocument, AccDocumentLine } from "./types";

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

interface LineInput {
  item_name?: string;
  description?: string;
  qty?: unknown;
  unit_price?: unknown;
  discount?: unknown;
  discount_type?: string;
  product_id?: string;
}

export interface ComputedDocument {
  lines: {
    item_name: string;
    description: string;
    qty: number;
    unit_price: number;
    discount: number;
    discount_type: string;
    amount: number;
    product_id: string | null;
  }[];
  subtotal: number;
  vat_amount: number;
  total: number;
  wht_amount: number;
}

/**
 * recompute lines + totals (G1, server เป็น source of truth) — reuse ที่ documents POST/PATCH/convert.
 *   lineDiscount = percent ? round2(qty*unit_price*discount/100) : discount
 *   amount = max(0, qty*unit_price − lineDiscount)
 *   subtotal = Σ amount · vat = vat_enabled ? round2(subtotal*vat_rate/100) : 0 · total = subtotal+vat
 *   wht_amount = round2(subtotal * wht_rate/100)
 */
export function computeDocument(
  rawLines: unknown,
  vatEnabled: boolean,
  vatRate: number,
  whtRate: number,
): ComputedDocument {
  const arr = Array.isArray(rawLines) ? (rawLines as LineInput[]) : [];
  const lines = arr.map((l) => {
    const qty = round2(num(l.qty));
    const unitPrice = round2(num(l.unit_price));
    const discountType = l.discount_type === "percent" ? "percent" : "amount";
    const discountRaw = round2(num(l.discount));
    const gross = round2(qty * unitPrice);
    const lineDiscount =
      discountType === "percent" ? round2((gross * discountRaw) / 100) : discountRaw;
    const amount = Math.max(0, round2(gross - lineDiscount));
    return {
      item_name: (l.item_name as string) || "",
      description: (l.description as string) || "",
      qty,
      unit_price: unitPrice,
      discount: discountRaw,
      discount_type: discountType,
      amount,
      product_id: (l.product_id as string) || null,
    };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const vat_amount = vatEnabled ? round2((subtotal * vatRate) / 100) : 0;
  const total = round2(subtotal + vat_amount);
  const wht_amount = whtRate > 0 ? round2((subtotal * whtRate) / 100) : 0;
  return { lines, subtotal, vat_amount, total, wht_amount };
}

export interface ListDocumentsOpts {
  docType?: string;
  status?: string;
  contactId?: string;
  from?: string;
  to?: string;
}

export async function listDocuments(
  db: SupabaseClient,
  orgId: string,
  opts?: ListDocumentsOpts,
): Promise<AccDocument[]> {
  let q = db.from("acc_documents").select("*, acc_contacts(name)").eq("org_id", orgId);
  if (opts?.docType) q = q.eq("doc_type", opts.docType);
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.contactId) q = q.eq("contact_id", opts.contactId);
  if (opts?.from) q = q.gte("issue_date", opts.from);
  if (opts?.to) q = q.lte("issue_date", opts.to);
  q = q.order("issue_date", { ascending: false });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...(r as unknown as AccDocument),
    contact_name: (r.acc_contacts as { name?: string } | null)?.name ?? undefined,
  }));
}

/** เอกสาร 1 ใบ + lines (เรียง sort_order) + ชื่อ contact. */
export async function getDocument(
  db: SupabaseClient,
  orgId: string,
  id: string,
): Promise<AccDocument | null> {
  const { data: doc, error } = await db
    .from("acc_documents")
    .select("*, acc_contacts(name)")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!doc) return null;

  const { data: lines, error: e2 } = await db
    .from("acc_document_lines")
    .select("*")
    .eq("org_id", orgId)
    .eq("document_id", id)
    .order("sort_order", { ascending: true });
  if (e2) throw new Error(e2.message);

  const row = doc as Record<string, unknown>;
  return {
    ...(row as unknown as AccDocument),
    contact_name: (row.acc_contacts as { name?: string } | null)?.name ?? undefined,
    lines: (lines ?? []) as AccDocumentLine[],
  };
}
