import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function safeNumber(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function computeVatFromGrand(grandTotal: number, includeVat: boolean, vatRate: number) {
  const g = Math.max(0, safeNumber(grandTotal));
  const r = Math.max(0, safeNumber(vatRate));
  if (!includeVat || r <= 0) return { subtotal: g, vatAmount: 0, grandTotal: g };
  const base = g / (1 + r / 100);
  const vat = g - base;
  return {
    subtotal: Math.round(base * 100) / 100,
    vatAmount: Math.round(vat * 100) / 100,
    grandTotal: Math.round(g * 100) / 100,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as null | { orderId?: string; amount?: number };
    const orderId = String(body?.orderId ?? "").trim();
    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const amountNum = safeNumber(body?.amount);
    if (amountNum <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    const orderRes = await supabase
      .from("orders")
      .select("id,display_id,customer_id,include_vat,vat_rate,status")
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
      .eq("installment_no", 1)
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
    const totals = computeVatFromGrand(amountNum, includeVat, vatRate);

    const customerSnapshot = {
      name: String((custRes.data as any).name ?? "").trim(),
      address: String((custRes.data as any).address ?? "").trim(),
      tax_id: String((custRes.data as any).tax_id ?? "").trim(),
      branch_name: String((custRes.data as any).branch_name ?? "").trim(),
    };

    const invoiceInsert = await supabase
      .from("invoices")
      .insert({
        status: "issued",
        order_id: orderId,
        installment_no: 1,
        issue_date: new Date().toISOString().slice(0, 10),
        customer_id: customerId,
        customer_snapshot: customerSnapshot,
        subtotal: totals.subtotal,
        discount_total: 0,
        include_vat: includeVat,
        vat_rate: vatRate,
        vat_amount: totals.vatAmount,
        grand_total: totals.grandTotal,
        notes: `วางบิลงวดแรกของออเดอร์ ${(order.display_id ?? orderId) as string}`,
        issued_at: new Date().toISOString(),
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
        name: "ค่าบริการ (งวดที่ 1)",
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

    const currentStatus = String(order.status ?? "");
    if (currentStatus !== "completed" && currentStatus !== "cancelled") {
      const upd = await supabase.from("orders").update({ status: "billed_first_installment" }).eq("id", orderId);
      if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, invoiceId, invoiceNo: (invoiceInsert.data as any).doc_no ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
