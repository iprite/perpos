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

function computeTotalsFromAfterDiscount(input: { afterDiscountBase: number; includeVat: boolean; vatRate: number; whtRate: number }) {
  const b = Math.max(0, safeNumber(input.afterDiscountBase));
  const vr = Math.max(0, safeNumber(input.vatRate));
  const wr = Math.max(0, safeNumber(input.whtRate));
  const vatAmount = input.includeVat && vr > 0 ? round2(b * (vr / 100)) : 0;
  const whtAmount = wr > 0 ? round2(b * (wr / 100)) : 0;
  const grandTotal = round2(b + vatAmount - whtAmount);
  return { afterDiscountBase: round2(b), vatAmount, whtRate: round2(wr), whtAmount, grandTotal };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as null | { orderId?: string };
    const orderId = String(body?.orderId ?? "").trim();
    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    const orderRes = await supabase
      .from("orders")
      .select("id,display_id,customer_id,subtotal,discount,include_vat,vat_rate,wht_rate,status,source_quote_id")
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
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existing.error && existing.data?.id) {
      return NextResponse.json(
        {
          error: "ออเดอร์นี้มีใบแจ้งหนี้อยู่แล้ว (ถ้าต้องการเปลี่ยนโหมด กรุณายกเลิก IV เดิมก่อน)",
          invoiceId: String((existing.data as any).id),
          invoiceNo: (existing.data as any).doc_no ?? null,
        },
        { status: 400 },
      );
    }

    const custRes = await supabase.from("customers").select("id,name,address,tax_id,branch_name").eq("id", customerId).single();
    if (custRes.error || !custRes.data) return NextResponse.json({ error: custRes.error?.message ?? "Customer not found" }, { status: 404 });

    const customerSnapshot = {
      name: String((custRes.data as any).name ?? "").trim(),
      address: String((custRes.data as any).address ?? "").trim(),
      tax_id: String((custRes.data as any).tax_id ?? "").trim(),
      branch_name: String((custRes.data as any).branch_name ?? "").trim(),
    };

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

    const today = new Date().toISOString().slice(0, 10);

    if (quoteId) {
      const [qtRes, qtItemRes] = await Promise.all([
        supabase
          .from("sales_quotes")
          .select("id,quote_no,subtotal,discount_total,include_vat,vat_rate,vat_amount,wht_rate,wht_amount,grand_total,notes")
          .eq("id", quoteId)
          .single(),
        supabase
          .from("sales_quote_items")
          .select("id,name,description,quantity,unit_price,line_total,sort_order")
          .eq("quote_id", quoteId)
          .order("sort_order", { ascending: true }),
      ]);
      if (qtRes.error || !qtRes.data) return NextResponse.json({ error: qtRes.error?.message ?? "Quote not found" }, { status: 404 });
      if (qtItemRes.error) return NextResponse.json({ error: qtItemRes.error.message }, { status: 500 });

      const qt = qtRes.data as any;
      const quoteNo = String(qt.quote_no ?? "").trim();

      const invoiceInsert = await supabase
        .from("invoices")
        .insert({
          status: "issued",
          payment_mode: "full",
          order_id: orderId,
          installment_no: 1,
          issue_date: today,
          due_date: null,
          customer_id: customerId,
          customer_snapshot: customerSnapshot,
          currency: "THB",
          source_quote_id: quoteId,
          subtotal: safeNumber(qt.subtotal),
          discount_total: safeNumber(qt.discount_total),
          include_vat: !!qt.include_vat,
          vat_rate: safeNumber(qt.vat_rate),
          vat_amount: safeNumber(qt.vat_amount),
          wht_rate: safeNumber(qt.wht_rate),
          wht_amount: safeNumber(qt.wht_amount),
          grand_total: safeNumber(qt.grand_total),
          notes: quoteNo ? `อ้างอิงใบเสนอราคา ${quoteNo}` : null,
          issued_at: new Date().toISOString(),
        })
        .select("id,doc_no")
        .single();
      if (invoiceInsert.error || !invoiceInsert.data) {
        return NextResponse.json({ error: invoiceInsert.error?.message ?? "Create invoice failed" }, { status: 500 });
      }

      const invoiceId = String((invoiceInsert.data as any).id);

      const payload = (((qtItemRes.data ?? []) as any[]) as any[]).map((it) => {
        const qty = Math.max(0, Math.floor(safeNumber(it.quantity) || 0)) || 1;
        const unitPrice = round2(safeNumber(it.unit_price));
        const lineTotal = round2(qty * unitPrice);
        return {
          invoice_id: invoiceId,
          name: String(it.name ?? "").trim() || "บริการ",
          description: it.description ?? null,
          quantity: qty,
          unit: null,
          unit_price: unitPrice,
          line_total: lineTotal,
          sort_order: Number(it.sort_order ?? 0),
          source_quote_item_id: String(it.id),
          source_order_item_id: null,
          full_unit_price: unitPrice,
        };
      });

      if (payload.length) {
        const ins = await supabase.from("invoice_items").insert(payload);
        if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
      }

      const currentStatus = String(order.status ?? "");
      if (currentStatus !== "completed" && currentStatus !== "cancelled") {
        const upd = await supabase.from("orders").update({ status: "billed_first_installment" }).eq("id", orderId);
        if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, invoiceId, invoiceNo: (invoiceInsert.data as any).doc_no ?? null });
    }

    const itemsRes = await supabase
      .from("order_items")
      .select("id,service_id,description,quantity,unit_price,line_total,services(name)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });

    const orderItems = (((itemsRes.data ?? []) as any[]) as any[]) as any[];
    const subtotal = round2(orderItems.reduce((acc, it) => acc + safeNumber(it.line_total), 0));
    const discountTotal = Math.max(0, round2(safeNumber(order.discount)));
    const afterDiscount = Math.max(0, round2(subtotal - discountTotal));
    const totals = computeTotalsFromAfterDiscount({ afterDiscountBase: afterDiscount, includeVat, vatRate, whtRate });

    const invoiceInsert = await supabase
      .from("invoices")
      .insert({
        status: "issued",
        payment_mode: "full",
        order_id: orderId,
        installment_no: 1,
        issue_date: today,
        due_date: null,
        customer_id: customerId,
        customer_snapshot: customerSnapshot,
        currency: "THB",
        source_quote_id: null,
        subtotal: afterDiscount,
        discount_total: discountTotal,
        include_vat: includeVat,
        vat_rate: vatRate,
        vat_amount: totals.vatAmount,
        wht_rate: totals.whtRate,
        wht_amount: totals.whtAmount,
        grand_total: totals.grandTotal,
        notes: `อ้างอิงออเดอร์ ${(order.display_id ?? orderId) as string}`,
        issued_at: new Date().toISOString(),
      })
      .select("id,doc_no")
      .single();
    if (invoiceInsert.error || !invoiceInsert.data) {
      return NextResponse.json({ error: invoiceInsert.error?.message ?? "Create invoice failed" }, { status: 500 });
    }

    const invoiceId = String((invoiceInsert.data as any).id);
    const payload = orderItems.map((it, idx) => {
      const qty = Math.max(0, Math.floor(safeNumber(it.quantity) || 0)) || 1;
      const unitPrice = round2(safeNumber(it.unit_price));
      const lineTotal = round2(qty * unitPrice);
      const svcName = String((it.services as any)?.name ?? "").trim();
      return {
        invoice_id: invoiceId,
        name: svcName || "บริการ",
        description: it.description ?? null,
        quantity: qty,
        unit: null,
        unit_price: unitPrice,
        line_total: lineTotal,
        sort_order: idx + 1,
        source_quote_item_id: null,
        source_order_item_id: String(it.id),
        full_unit_price: unitPrice,
      };
    });

    if (payload.length) {
      const ins = await supabase.from("invoice_items").insert(payload);
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
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

