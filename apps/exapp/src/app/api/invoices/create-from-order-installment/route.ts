import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function safeNumber(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
  return Math.round(safeNumber(n) * 100) / 100;
}

function computeTotalsFromBase(input: { base: number; includeVat: boolean; vatRate: number; whtRate: number }) {
  const b = Math.max(0, safeNumber(input.base));
  const vr = Math.max(0, safeNumber(input.vatRate));
  const wr = Math.max(0, safeNumber(input.whtRate));
  const vatAmount = input.includeVat && vr > 0 ? round2(b * (vr / 100)) : 0;
  const whtAmount = wr > 0 ? round2(b * (wr / 100)) : 0;
  const grandTotal = round2(b + vatAmount - whtAmount);
  return { subtotal: round2(b), vatAmount, whtRate: round2(wr), whtAmount, grandTotal };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as null | { orderId?: string; installmentNo?: number; amount?: number };
    const orderId = String(body?.orderId ?? "").trim();
    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const installmentNo = Math.max(1, Math.floor(safeNumber(body?.installmentNo)));
    const amountNum = safeNumber(body?.amount);
    if (amountNum <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    const orderRes = await supabase
      .from("orders")
      .select("id,display_id,customer_id,include_vat,vat_rate,wht_rate,status,source_quote_id")
      .eq("id", orderId)
      .single();
    if (orderRes.error || !orderRes.data) return NextResponse.json({ error: orderRes.error?.message ?? "Order not found" }, { status: 404 });

    const order = orderRes.data as any;
    const customerId = String(order.customer_id ?? "").trim();
    if (!customerId) return NextResponse.json({ error: "Order missing customer_id" }, { status: 400 });

    const existing = await supabase
      .from("invoices")
      .select("id,doc_no,status")
      .eq("order_id", orderId)
      .eq("installment_no", installmentNo)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existing.error && existing.data?.id) {
      return NextResponse.json({ ok: true, invoiceId: String((existing.data as any).id), invoiceNo: (existing.data as any).doc_no ?? null, existing: true });
    }

    const custRes = await supabase
      .from("customers")
      .select("id,name,address,tax_id,branch_name")
      .eq("id", customerId)
      .single();
    if (custRes.error || !custRes.data) return NextResponse.json({ error: custRes.error?.message ?? "Customer not found" }, { status: 404 });

    const includeVat = !!order.include_vat;
    const vatRate = safeNumber(order.vat_rate);

    let whtRate = Math.max(0, safeNumber(order.wht_rate));
    const quoteId = String(order.source_quote_id ?? "").trim();
    if (whtRate <= 0 && quoteId) {
      const qRes = await supabase.from("sales_quotes").select("wht_rate").eq("id", quoteId).maybeSingle();
      if (!qRes.error && qRes.data) {
        whtRate = Math.max(0, safeNumber((qRes.data as any).wht_rate));
      }
    }

    const totals = computeTotalsFromBase({ base: amountNum, includeVat, vatRate, whtRate });

    const customerSnapshot = {
      name: String((custRes.data as any).name ?? "").trim(),
      address: String((custRes.data as any).address ?? "").trim(),
      tax_id: String((custRes.data as any).tax_id ?? "").trim(),
      branch_name: String((custRes.data as any).branch_name ?? "").trim(),
    };

    const now = new Date().toISOString();
    const invoiceInsert = await supabase
      .from("invoices")
      .insert({
        status: "issued",
        payment_mode: "installment",
        order_id: orderId,
        installment_no: installmentNo,
        issue_date: now.slice(0, 10),
        customer_id: customerId,
        customer_snapshot: customerSnapshot,
        source_quote_id: quoteId || null,
        subtotal: totals.subtotal,
        discount_total: 0,
        include_vat: includeVat,
        vat_rate: vatRate,
        vat_amount: totals.vatAmount,
        wht_rate: totals.whtRate,
        wht_amount: totals.whtAmount,
        grand_total: totals.grandTotal,
        notes: `วางบิลงวดที่ ${installmentNo} ของออเดอร์ ${(order.display_id ?? orderId) as string}`,
        issued_at: now,
      })
      .select("id,doc_no")
      .single();
    if (invoiceInsert.error || !invoiceInsert.data) {
      return NextResponse.json({ error: invoiceInsert.error?.message ?? "Create invoice failed" }, { status: 500 });
    }

    const invoiceId = String((invoiceInsert.data as any).id);
    const itemsErr = await supabase.from("invoice_items").insert([
      {
        invoice_id: invoiceId,
        name: `ค่าบริการ (งวดที่ ${installmentNo})`,
        description: `อ้างอิงออเดอร์ ${(order.display_id ?? orderId) as string}`,
        quantity: 1,
        unit: "งวด",
        unit_price: totals.subtotal,
        line_total: totals.subtotal,
        sort_order: 1,
      },
    ]);
    if (itemsErr.error) {
      return NextResponse.json({ error: itemsErr.error.message }, { status: 500 });
    }

    if (installmentNo === 1) {
      const currentStatus = String(order.status ?? "");
      if (currentStatus !== "completed" && currentStatus !== "cancelled") {
        const upd = await supabase.from("orders").update({ status: "billed_first_installment" }).eq("id", orderId);
        if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, invoiceId, invoiceNo: (invoiceInsert.data as any).doc_no ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
