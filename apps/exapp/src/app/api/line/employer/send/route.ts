import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { sendLineMessages } from "@/lib/line/send-messages";
import { sendLineText } from "@/lib/line/send-text";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function createSupabaseRlsClient(accessToken: string) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !anonKey) throw new Error("Missing Supabase env");
  return createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } } });
}

function money(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function quoteStatusLabel(s: string) {
  if (s === "draft") return "ร่าง";
  if (s === "pending_approval") return "รออนุมัติ";
  if (s === "approved") return "อนุมัติแล้ว";
  if (s === "rejected") return "ไม่อนุมัติ";
  if (s === "cancelled") return "ยกเลิก";
  return s || "-";
}

function formatShortDate(input: string | null) {
  if (!input) return "-";
  const d = new Date(input);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

function createQuoteFlexMessage(args: {
  employerName: string;
  quoteNo: string;
  statusText: string;
  jobNameText: string;
  amountText: string;
  itemsCountText: string;
  validUntilText: string;
}) {
  const altText = `ใบเสนอราคา ${args.quoteNo}`;
  const headerColor = "#2563EB";

  return {
    type: "flex" as const,
    altText,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: `ใบเสนอราคา ${args.quoteNo}`,
            color: "#FFFFFF",
            weight: "bold",
            size: "lg",
            wrap: true,
          },
          {
            type: "text",
            text: args.employerName,
            color: "#DBEAFE",
            size: "sm",
            wrap: true,
            margin: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            margin: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: "ชื่องาน", size: "sm", color: "#6B7280", flex: 3 },
                  { type: "text", text: args.jobNameText, size: "sm", color: "#111827", flex: 7, wrap: true },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: "สถานะ", size: "sm", color: "#6B7280", flex: 3 },
                  { type: "text", text: args.statusText, size: "sm", color: "#111827", flex: 7, wrap: true },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: "รายการ", size: "sm", color: "#6B7280", flex: 3 },
                  { type: "text", text: args.itemsCountText, size: "sm", color: "#111827", flex: 7, wrap: true },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: "ยอดรวม", size: "sm", color: "#6B7280", flex: 3 },
                  { type: "text", text: args.amountText, size: "sm", color: "#111827", flex: 7, wrap: true },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: "หมดอายุ", size: "sm", color: "#6B7280", flex: 3 },
                  { type: "text", text: args.validUntilText, size: "sm", color: "#111827", flex: 7, wrap: true },
                ],
              },
            ],
          },
        ],
      },
    },
  };
}

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key) => {
    const k = String(key ?? "");
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k] ?? "") : "";
  });
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      kind?: "quote" | "order";
      id?: string;
      eventKey?: string;
    };
    const kind = body.kind === "quote" ? "quote" : body.kind === "order" ? "order" : "";
    const id = String(body.id ?? "").trim();
    const eventKeyRaw = String(body.eventKey ?? "").trim();
    if (!kind || !id) return NextResponse.json({ error: "Missing kind/id" }, { status: 400 });

    const eventKey = eventKeyRaw || (kind === "quote" ? "quote_updated" : "order_updated");

    const rls = createSupabaseRlsClient(token);
    const userRes = await rls.auth.getUser();
    const userId = String(userRes.data.user?.id ?? "").trim();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const roleRes = await rls.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (roleRes.error) return NextResponse.json({ error: roleRes.error.message }, { status: 500 });
    const role = String((roleRes.data as any)?.role ?? "");
    if (role !== "admin" && role !== "sale") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createSupabaseAdminClient();

    let customerId: string | null = null;
    let statusText = "";
    let quoteNo = "";
    let orderNo = "";
    let amountText = "";
    let quoteValidUntil: string | null = null;
    let quoteItemsCount = 0;
    let quoteJobNameText = "-";

    if (kind === "quote") {
      const q = await admin
        .from("sales_quotes")
        .select("id,quote_no,status,customer_id,grand_total,valid_until")
        .eq("id", id)
        .maybeSingle();
      if (q.error || !q.data) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
      customerId = String((q.data as any).customer_id ?? "").trim() || null;
      quoteNo = String((q.data as any).quote_no ?? "").trim() || id;
      const rawStatus = String((q.data as any).status ?? "").trim();
      statusText = quoteStatusLabel(rawStatus);
      amountText = `${money(Number((q.data as any).grand_total ?? 0))} บาท`;
      quoteValidUntil = (q.data as any).valid_until ? String((q.data as any).valid_until) : null;

      const cnt = await admin.from("sales_quote_items").select("id", { count: "exact", head: true }).eq("quote_id", id);
      quoteItemsCount = Number(cnt.count ?? 0);

      const itemRes = await admin
        .from("sales_quote_items")
        .select("name,quantity,sort_order,created_at")
        .eq("quote_id", id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(3);
      const names = ((itemRes.data ?? []) as any[])
        .map((r) => String(r?.name ?? "").trim())
        .filter((x) => x.length > 0);
      if (names.length) {
        const shown = names.slice(0, 2);
        const more = Math.max(0, quoteItemsCount - shown.length);
        quoteJobNameText = `${shown.join(", ")}${more > 0 ? ` + อีก ${more} รายการ` : ""}`;
      }
    }

    if (kind === "order") {
      const o = await admin.from("orders").select("id,display_id,status,customer_id,remaining_amount").eq("id", id).maybeSingle();
      if (o.error || !o.data) return NextResponse.json({ error: "Order not found" }, { status: 404 });
      customerId = String((o.data as any).customer_id ?? "").trim() || null;
      orderNo = String((o.data as any).display_id ?? "").trim() || id;
      statusText = String((o.data as any).status ?? "").trim();
      const rem = Number((o.data as any).remaining_amount ?? 0);
      amountText = `ยอดค้างชำระ ${money(rem)} บาท`;
    }

    if (!customerId) return NextResponse.json({ error: "Missing customer" }, { status: 400 });

    const connRes = await admin
      .from("customer_line_connections")
      .select("customer_id,line_user_id,status")
      .eq("customer_id", customerId)
      .maybeSingle();
    const conn = connRes.data as any;
    const lineUserId = String(conn?.line_user_id ?? "").trim();
    if (!lineUserId || String(conn?.status ?? "") !== "CONNECTED") {
      return NextResponse.json({ error: "Employer not connected" }, { status: 400 });
    }

    const custRes = await admin.from("customers").select("name").eq("id", customerId).maybeSingle();
    const employerName = String((custRes.data as any)?.name ?? "").trim() || "นายจ้าง";

    const tplRes = await admin.from("employer_line_templates").select("event_key,enabled,template_text").eq("event_key", eventKey).maybeSingle();
    const enabled = tplRes.data ? Boolean((tplRes.data as any).enabled) : true;
    const templateText = tplRes.data ? String((tplRes.data as any).template_text ?? "") : "";
    if (!enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });

    const fallback = kind === "quote" ? "ใบเสนอราคา {quoteNo}\nสถานะ: {status}\n{amount}" : "อัปเดตออเดอร์ {orderNo}\nสถานะ: {status}";
    const base = templateText.trim() || fallback;

    const text = renderTemplate(base, {
      employerName,
      quoteNo,
      orderNo,
      status: statusText,
      amount: amountText,
      link: "",
    }).trim();

    const sendRes =
      kind === "quote" && eventKey === "quote_updated"
        ? await sendLineMessages({
            to: lineUserId,
            messages: [
              createQuoteFlexMessage({
                employerName,
                quoteNo,
                statusText,
                jobNameText: quoteJobNameText,
                amountText,
                itemsCountText: `${quoteItemsCount} รายการ`,
                validUntilText: formatShortDate(quoteValidUntil),
              }),
            ],
          })
        : await sendLineText({ to: lineUserId, text });
    const now = new Date().toISOString();

    if (!sendRes.ok) {
      await admin.from("employer_line_message_logs").insert({
        customer_id: customerId,
        event_key: eventKey,
        ref_table: kind === "quote" ? "sales_quotes" : "orders",
        ref_id: id,
        delivery_status: "FAILED",
        error_message: sendRes.error,
        created_by_profile_id: userId,
      });
      await admin
        .from("customer_line_connections")
        .update({ status: "ERROR", last_error_at: now, last_error_message: sendRes.error, updated_at: now })
        .eq("customer_id", customerId);
      return NextResponse.json({ ok: false, error: sendRes.error }, { status: 502 });
    }

    await admin.from("employer_line_message_logs").insert({
      customer_id: customerId,
      event_key: eventKey,
      ref_table: kind === "quote" ? "sales_quotes" : "orders",
      ref_id: id,
      delivery_status: "SENT",
      error_message: null,
      created_by_profile_id: userId,
    });
    await admin
      .from("customer_line_connections")
      .update({ status: "CONNECTED", last_error_at: null, last_error_message: null, updated_at: now })
      .eq("customer_id", customerId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
