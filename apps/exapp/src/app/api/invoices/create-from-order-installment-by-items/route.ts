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

type InstallmentBody = {
  orderId?: string;
  installmentNo?: number;
  items?: Array<{
    sourceQuoteItemId?: string;
    sourceOrderItemId?: string;
    billedUnitPrice?: number;
  }>;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as InstallmentBody | null;
    const orderId = String(body?.orderId ?? "").trim();
    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const installmentNo = Math.max(1, Math.floor(safeNumber(body?.installmentNo)));
    const requested = Array.isArray(body?.items) ? body!.items! : [];

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

    const existingFull = await supabase
      .from("invoices")
      .select("id")
      .eq("order_id", orderId)
      .eq("payment_mode", "full")
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle();
    if (!existingFull.error && existingFull.data?.id) {
      return NextResponse.json({ error: "ออเดอร์นี้ถูกออกใบแจ้งหนี้แบบชำระเต็มแล้ว (กรุณายกเลิก IV เดิมก่อนหากต้องการเปลี่ยนโหมด)" }, { status: 400 });
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

    const includeVat = !!order.include_vat;
    const vatRate = safeNumber(order.vat_rate);

    let whtRate = Math.max(0, safeNumber(order.wht_rate));
    const quoteId = String(order.source_quote_id ?? "").trim() || null;
    if (whtRate <= 0 && quoteId) {
      const qRes = await supabase.from("sales_quotes").select("wht_rate").eq("id", quoteId).maybeSingle();
      if (!qRes.error && qRes.data) {
        whtRate = Math.max(0, safeNumber((qRes.data as any).wht_rate));
      }
    }

    const custRes = await supabase.from("customers").select("id,name,address,tax_id,branch_name").eq("id", customerId).single();
    if (custRes.error || !custRes.data) return NextResponse.json({ error: custRes.error?.message ?? "Customer not found" }, { status: 404 });

    const customerSnapshot = {
      name: String((custRes.data as any).name ?? "").trim(),
      address: String((custRes.data as any).address ?? "").trim(),
      tax_id: String((custRes.data as any).tax_id ?? "").trim(),
      branch_name: String((custRes.data as any).branch_name ?? "").trim(),
    };

    const today = new Date().toISOString().slice(0, 10);

    if (quoteId) {
      const [srcRes, billedRes] = await Promise.all([
        supabase
          .from("sales_quote_items")
          .select("id,name,description,quantity,unit_price,sort_order")
          .eq("quote_id", quoteId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("invoice_items")
          .select("source_quote_item_id,unit_price,invoices!inner(order_id,status)")
          .eq("invoices.order_id", orderId)
          .neq("invoices.status", "cancelled"),
      ]);
      if (srcRes.error || billedRes.error) {
        return NextResponse.json({ error: (srcRes.error ?? billedRes.error)?.message ?? "Load items failed" }, { status: 500 });
      }

      const sources = (((srcRes.data ?? []) as any[]) as any[]).map((it) => {
        const qty = Math.max(0, Math.floor(safeNumber(it.quantity) || 0)) || 1;
        const fullUnitPrice = round2(safeNumber(it.unit_price));
        return {
          id: String(it.id),
          name: String(it.name ?? "").trim() || "บริการ",
          description: String(it.description ?? ""),
          quantity: qty,
          full_unit_price: fullUnitPrice,
          sort_order: Number(it.sort_order ?? 0),
        };
      });

      const billedById = new Map<string, number>();
      for (const row of ((billedRes.data ?? []) as any[]) as any[]) {
        const sid = String(row.source_quote_item_id ?? "").trim();
        if (!sid) continue;
        billedById.set(sid, (billedById.get(sid) ?? 0) + safeNumber(row.unit_price));
      }

      const billedInput = new Map<string, number>();
      for (const it of requested) {
        const sid = String(it?.sourceQuoteItemId ?? "").trim();
        if (!sid) continue;
        billedInput.set(sid, round2(Math.max(0, safeNumber(it?.billedUnitPrice))));
      }

      let anyPositive = false;
      const payload = sources.map((src) => {
        const billedSum = billedById.get(src.id) ?? 0;
        const remaining = Math.max(0, round2(src.full_unit_price - billedSum));
        const billedUnitPrice = billedInput.get(src.id) ?? 0;
        if (billedUnitPrice > 0) anyPositive = true;
        if (billedUnitPrice > remaining + 0.0001) {
          throw new Error(`ยอดต่อหน่วยของ “${src.name}” เกินยอดคงเหลือ (คงเหลือ ${remaining.toLocaleString()} บาท/หน่วย)`);
        }
        const lineTotal = round2(src.quantity * billedUnitPrice);
        return {
          invoice_id: "__pending__",
          name: src.name,
          description: src.description || null,
          quantity: src.quantity,
          unit: null,
          unit_price: billedUnitPrice,
          line_total: lineTotal,
          sort_order: src.sort_order,
          source_quote_item_id: src.id,
          source_order_item_id: null,
          full_unit_price: src.full_unit_price,
        };
      });

      if (!anyPositive) return NextResponse.json({ error: "กรุณาระบุยอดชำระอย่างน้อย 1 รายการ" }, { status: 400 });

      const subtotal = round2(payload.reduce((acc, it) => acc + safeNumber(it.line_total), 0));
      const totals = computeTotalsFromAfterDiscount({ afterDiscountBase: subtotal, includeVat, vatRate, whtRate });

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
        return NextResponse.json(
          { ok: true, invoiceId: String((existing.data as any).id), invoiceNo: (existing.data as any).doc_no ?? null, existing: true },
          { status: 200 },
        );
      }

      const invoiceInsert = await supabase
        .from("invoices")
        .insert({
          status: "issued",
          payment_mode: "installment",
          order_id: orderId,
          installment_no: installmentNo,
          issue_date: today,
          due_date: null,
          customer_id: customerId,
          customer_snapshot: customerSnapshot,
          currency: "THB",
          source_quote_id: quoteId,
          subtotal: totals.afterDiscountBase,
          discount_total: 0,
          include_vat: includeVat,
          vat_rate: vatRate,
          vat_amount: totals.vatAmount,
          wht_rate: totals.whtRate,
          wht_amount: totals.whtAmount,
          grand_total: totals.grandTotal,
          notes: `วางบิลแบบแบ่งชำระ (งวดที่ ${installmentNo}) อ้างอิงออเดอร์ ${(order.display_id ?? orderId) as string}`,
          issued_at: new Date().toISOString(),
        })
        .select("id,doc_no")
        .single();
      if (invoiceInsert.error || !invoiceInsert.data) {
        return NextResponse.json({ error: invoiceInsert.error?.message ?? "Create invoice failed" }, { status: 500 });
      }

      const invoiceId = String((invoiceInsert.data as any).id);
      for (const it of payload) (it as any).invoice_id = invoiceId;
      const ins = await supabase.from("invoice_items").insert(payload);
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });

      if (installmentNo === 1) {
        const currentStatus = String(order.status ?? "");
        if (currentStatus !== "completed" && currentStatus !== "cancelled") {
          const upd = await supabase.from("orders").update({ status: "billed_first_installment" }).eq("id", orderId);
          if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
        }
      }

      return NextResponse.json({ ok: true, invoiceId, invoiceNo: (invoiceInsert.data as any).doc_no ?? null });
    }

    const [srcRes, billedRes] = await Promise.all([
      supabase
        .from("order_items")
        .select("id,description,quantity,unit_price,created_at,services(name)")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      supabase
        .from("invoice_items")
        .select("source_order_item_id,unit_price,invoices!inner(order_id,status)")
        .eq("invoices.order_id", orderId)
        .neq("invoices.status", "cancelled"),
    ]);
    if (srcRes.error || billedRes.error) {
      return NextResponse.json({ error: (srcRes.error ?? billedRes.error)?.message ?? "Load items failed" }, { status: 500 });
    }

    const sources = (((srcRes.data ?? []) as any[]) as any[]).map((it, idx) => {
      const qty = Math.max(0, Math.floor(safeNumber(it.quantity) || 0)) || 1;
      const fullUnitPrice = round2(safeNumber(it.unit_price));
      const svcName = String((it.services as any)?.name ?? "").trim();
      return {
        id: String(it.id),
        name: svcName || "บริการ",
        description: String(it.description ?? ""),
        quantity: qty,
        full_unit_price: fullUnitPrice,
        sort_order: idx + 1,
      };
    });

    const billedById = new Map<string, number>();
    for (const row of ((billedRes.data ?? []) as any[]) as any[]) {
      const sid = String(row.source_order_item_id ?? "").trim();
      if (!sid) continue;
      billedById.set(sid, (billedById.get(sid) ?? 0) + safeNumber(row.unit_price));
    }

    const billedInput = new Map<string, number>();
    for (const it of requested) {
      const sid = String(it?.sourceOrderItemId ?? "").trim();
      if (!sid) continue;
      billedInput.set(sid, round2(Math.max(0, safeNumber(it?.billedUnitPrice))));
    }

    let anyPositive = false;
    const payload = sources.map((src) => {
      const billedSum = billedById.get(src.id) ?? 0;
      const remaining = Math.max(0, round2(src.full_unit_price - billedSum));
      const billedUnitPrice = billedInput.get(src.id) ?? 0;
      if (billedUnitPrice > 0) anyPositive = true;
      if (billedUnitPrice > remaining + 0.0001) {
        throw new Error(`ยอดต่อหน่วยของ “${src.name}” เกินยอดคงเหลือ (คงเหลือ ${remaining.toLocaleString()} บาท/หน่วย)`);
      }
      const lineTotal = round2(src.quantity * billedUnitPrice);
      return {
        invoice_id: "__pending__",
        name: src.name,
        description: src.description || null,
        quantity: src.quantity,
        unit: null,
        unit_price: billedUnitPrice,
        line_total: lineTotal,
        sort_order: src.sort_order,
        source_quote_item_id: null,
        source_order_item_id: src.id,
        full_unit_price: src.full_unit_price,
      };
    });

    if (!anyPositive) return NextResponse.json({ error: "กรุณาระบุยอดชำระอย่างน้อย 1 รายการ" }, { status: 400 });

    const subtotal = round2(payload.reduce((acc, it) => acc + safeNumber(it.line_total), 0));
    const totals = computeTotalsFromAfterDiscount({ afterDiscountBase: subtotal, includeVat, vatRate, whtRate });

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
      return NextResponse.json(
        { ok: true, invoiceId: String((existing.data as any).id), invoiceNo: (existing.data as any).doc_no ?? null, existing: true },
        { status: 200 },
      );
    }

    const invoiceInsert = await supabase
      .from("invoices")
      .insert({
        status: "issued",
        payment_mode: "installment",
        order_id: orderId,
        installment_no: installmentNo,
        issue_date: today,
        due_date: null,
        customer_id: customerId,
        customer_snapshot: customerSnapshot,
        currency: "THB",
        source_quote_id: null,
        subtotal: totals.afterDiscountBase,
        discount_total: 0,
        include_vat: includeVat,
        vat_rate: vatRate,
        vat_amount: totals.vatAmount,
        wht_rate: totals.whtRate,
        wht_amount: totals.whtAmount,
        grand_total: totals.grandTotal,
        notes: `วางบิลแบบแบ่งชำระ (งวดที่ ${installmentNo}) อ้างอิงออเดอร์ ${(order.display_id ?? orderId) as string}`,
        issued_at: new Date().toISOString(),
      })
      .select("id,doc_no")
      .single();
    if (invoiceInsert.error || !invoiceInsert.data) {
      return NextResponse.json({ error: invoiceInsert.error?.message ?? "Create invoice failed" }, { status: 500 });
    }

    const invoiceId = String((invoiceInsert.data as any).id);
    for (const it of payload) (it as any).invoice_id = invoiceId;
    const ins = await supabase.from("invoice_items").insert(payload);
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });

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

