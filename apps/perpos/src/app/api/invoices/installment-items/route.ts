import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function safeNumber(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as null | { orderId?: string };
    const orderId = String(body?.orderId ?? "").trim();
    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    const orderRes = await supabase
      .from("orders")
      .select("id,source_quote_id,include_vat,vat_rate,wht_rate")
      .eq("id", orderId)
      .single();
    if (orderRes.error || !orderRes.data) return NextResponse.json({ error: orderRes.error?.message ?? "Order not found" }, { status: 404 });

    const sourceQuoteId = String((orderRes.data as any).source_quote_id ?? "").trim() || null;
    const includeVat = !!(orderRes.data as any).include_vat;
    const vatRate = safeNumber((orderRes.data as any).vat_rate);
    let whtRate = Math.max(0, safeNumber((orderRes.data as any).wht_rate));
    if (whtRate <= 0 && sourceQuoteId) {
      const qRes = await supabase.from("sales_quotes").select("wht_rate").eq("id", sourceQuoteId).maybeSingle();
      if (!qRes.error && qRes.data) {
        whtRate = Math.max(0, safeNumber((qRes.data as any).wht_rate));
      }
    }

    const legacyRes = await supabase
      .from("invoices")
      .select("id,invoice_items(id,source_quote_item_id,source_order_item_id)")
      .eq("order_id", orderId)
      .neq("status", "cancelled")
      .limit(50);
    if (legacyRes.error) return NextResponse.json({ error: legacyRes.error.message }, { status: 500 });

    const invoices = ((legacyRes.data ?? []) as any[]) as any[];
    for (const inv of invoices) {
      const its = (inv.invoice_items ?? []) as any[];
      if (!its.length) continue;
      const hasAnyMapped = its.some((x) => !!x?.source_quote_item_id || !!x?.source_order_item_id);
      const hasAnyUnmapped = its.some((x) => !x?.source_quote_item_id && !x?.source_order_item_id);
      if (!hasAnyMapped && hasAnyUnmapped) {
        return NextResponse.json(
          { error: "ไม่สามารถแบ่งชำระแบบแยกรายการได้ (พบใบแจ้งหนี้แบบเก่าที่ไม่ผูกกับรายการบริการ) กรุณายกเลิก IV เดิมก่อน" },
          { status: 400 },
        );
      }
    }

    if (sourceQuoteId) {
      const [itemsRes, billedRes] = await Promise.all([
        supabase
          .from("sales_quote_items")
          .select("id,name,description,quantity,unit_price,sort_order")
          .eq("quote_id", sourceQuoteId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("invoice_items")
          .select("source_quote_item_id,unit_price,invoices!inner(order_id,status)")
          .eq("invoices.order_id", orderId)
          .neq("invoices.status", "cancelled"),
      ]);

      if (itemsRes.error || billedRes.error) {
        return NextResponse.json({ error: (itemsRes.error ?? billedRes.error)?.message ?? "Load items failed" }, { status: 500 });
      }

      const billedById = new Map<string, number>();
      for (const row of ((billedRes.data ?? []) as any[]) as any[]) {
        const sid = String(row.source_quote_item_id ?? "").trim();
        if (!sid) continue;
        billedById.set(sid, (billedById.get(sid) ?? 0) + safeNumber(row.unit_price));
      }

      const items = (((itemsRes.data ?? []) as any[]) as any[]).map((it) => {
        const id = String(it.id);
        const fullUnitPrice = safeNumber(it.unit_price);
        const billedUnitSum = billedById.get(id) ?? 0;
        const remaining = Math.max(0, fullUnitPrice - billedUnitSum);
        return {
          id,
          source: "quote" as const,
          name: String(it.name ?? "").trim(),
          description: String(it.description ?? ""),
          quantity: safeNumber(it.quantity) || 1,
          full_unit_price: fullUnitPrice,
          billed_unit_price_sum: billedUnitSum,
          remaining_unit_price: remaining,
          sort_order: Number(it.sort_order ?? 0),
        };
      });

      return NextResponse.json({ ok: true, source: "quote", quoteId: sourceQuoteId, includeVat, vatRate, whtRate, items });
    }

    const [orderItemsRes, billedRes] = await Promise.all([
      supabase
        .from("order_items")
        .select("id,service_id,description,quantity,unit_price,services(name)")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      supabase
        .from("invoice_items")
        .select("source_order_item_id,unit_price,invoices!inner(order_id,status)")
        .eq("invoices.order_id", orderId)
        .neq("invoices.status", "cancelled"),
    ]);
    if (orderItemsRes.error || billedRes.error) {
      return NextResponse.json({ error: (orderItemsRes.error ?? billedRes.error)?.message ?? "Load items failed" }, { status: 500 });
    }

    const billedById = new Map<string, number>();
    for (const row of ((billedRes.data ?? []) as any[]) as any[]) {
      const sid = String(row.source_order_item_id ?? "").trim();
      if (!sid) continue;
      billedById.set(sid, (billedById.get(sid) ?? 0) + safeNumber(row.unit_price));
    }

    const items = (((orderItemsRes.data ?? []) as any[]) as any[]).map((it, idx) => {
      const id = String(it.id);
      const fullUnitPrice = safeNumber(it.unit_price);
      const billedUnitSum = billedById.get(id) ?? 0;
      const remaining = Math.max(0, fullUnitPrice - billedUnitSum);
      const svcName = String((it.services as any)?.name ?? "").trim();
      return {
        id,
        source: "order" as const,
        name: svcName || "บริการ",
        description: String(it.description ?? ""),
        quantity: safeNumber(it.quantity) || 1,
        full_unit_price: fullUnitPrice,
        billed_unit_price_sum: billedUnitSum,
        remaining_unit_price: remaining,
        sort_order: idx + 1,
      };
    });

    return NextResponse.json({ ok: true, source: "order", quoteId: null, includeVat, vatRate, whtRate, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
