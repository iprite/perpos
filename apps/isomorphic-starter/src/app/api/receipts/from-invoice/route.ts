import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | null
      | { invoiceId?: string; paidDate?: string; paymentMethod?: string; paymentRef?: string };

    const invoiceId = String(body?.invoiceId ?? "").trim();
    if (!invoiceId) return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });

    const paidDate = String(body?.paidDate ?? "").trim() || null;
    const paymentMethod = String(body?.paymentMethod ?? "").trim() || null;
    const paymentRef = String(body?.paymentRef ?? "").trim() || null;

    const supabase = createSupabaseAdminClient();

    const existingRes = await supabase
      .from("receipts")
      .select("id,doc_no,status")
      .eq("invoice_id", invoiceId)
      .neq("status", "voided")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingRes.error) return NextResponse.json({ error: existingRes.error.message }, { status: 500 });
    if (existingRes.data?.id) {
      return NextResponse.json({ ok: true, receiptId: String((existingRes.data as any).id), receiptNo: (existingRes.data as any).doc_no ?? null });
    }

    const invRes = await supabase
      .from("invoices")
      .select("id,doc_no,status,issue_date,customer_id,customer_snapshot,currency,subtotal,discount_total,include_vat,vat_rate,vat_amount,grand_total,paid_confirmed_at")
      .eq("id", invoiceId)
      .single();
    if (invRes.error || !invRes.data) return NextResponse.json({ error: invRes.error?.message ?? "Invoice not found" }, { status: 404 });
    const inv = invRes.data as any;
    if (String(inv.status) !== "paid_confirmed") return NextResponse.json({ error: "Invoice is not paid_confirmed" }, { status: 400 });

    const itemsRes = await supabase
      .from("invoice_items")
      .select("name,description,quantity,unit,unit_price,line_total,sort_order")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true });
    if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });

    const today = new Date().toISOString().slice(0, 10);
    const receiptInsert = await supabase
      .from("receipts")
      .insert({
        status: "issued",
        invoice_id: invoiceId,
        issue_date: today,
        customer_id: inv.customer_id ?? null,
        customer_snapshot: inv.customer_snapshot ?? {},
        currency: inv.currency ?? "THB",
        subtotal: inv.subtotal ?? 0,
        discount_total: inv.discount_total ?? 0,
        include_vat: inv.include_vat ?? true,
        vat_rate: inv.vat_rate ?? 7,
        vat_amount: inv.vat_amount ?? 0,
        grand_total: inv.grand_total ?? 0,
        paid_date: paidDate ?? (inv.paid_confirmed_at ? String(inv.paid_confirmed_at).slice(0, 10) : today),
        payment_method: paymentMethod,
        payment_ref: paymentRef,
        notes: inv.doc_no ? `อ้างอิงใบแจ้งหนี้ ${String(inv.doc_no)}` : null,
        issued_at: new Date().toISOString(),
      })
      .select("id,doc_no")
      .single();
    if (receiptInsert.error || !receiptInsert.data) {
      const msg = String(receiptInsert.error?.message ?? "");
      if (msg.toLowerCase().includes("duplicate") || msg.includes("uq_receipts_invoice_active")) {
        const retry = await supabase
          .from("receipts")
          .select("id,doc_no")
          .eq("invoice_id", invoiceId)
          .neq("status", "voided")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!retry.error && retry.data?.id) {
          return NextResponse.json({ ok: true, receiptId: String((retry.data as any).id), receiptNo: (retry.data as any).doc_no ?? null });
        }
      }
      return NextResponse.json({ error: receiptInsert.error?.message ?? "Create receipt failed" }, { status: 500 });
    }

    const receiptId = String((receiptInsert.data as any).id);

    const payload = ((itemsRes.data ?? []) as any[]).map((it, idx) => ({
      receipt_id: receiptId,
      name: String(it.name ?? "-") || "-",
      description: it.description ?? null,
      quantity: it.quantity ?? 1,
      unit: it.unit ?? null,
      unit_price: it.unit_price ?? 0,
      line_total: it.line_total ?? 0,
      sort_order: Number(it.sort_order ?? idx + 1),
    }));

    if (payload.length) {
      const insItems = await supabase.from("receipt_items").upsert(payload, { onConflict: "receipt_id,sort_order" });
      if (insItems.error) return NextResponse.json({ error: insItems.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, receiptId, receiptNo: (receiptInsert.data as any).doc_no ?? null });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
