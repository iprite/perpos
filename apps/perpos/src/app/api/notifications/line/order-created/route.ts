import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendLineText } from "@/lib/line/send-text";

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

async function resolveRecipients(args: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  eventKey: string;
  roles: string[];
}) {
  const { admin, eventKey, roles } = args;

  const evRes = await admin.from("notification_events").select("key,is_active").eq("key", eventKey).maybeSingle();
  if (evRes.error) throw new Error(evRes.error.message);
  if (!evRes.data || !(evRes.data as any).is_active) return [];

  const profRes = await admin
    .from("profiles")
    .select("id,role,line_user_id")
    .in("role", roles)
    .not("line_user_id", "is", null)
    .limit(2000);
  if (profRes.error) throw new Error(profRes.error.message);

  const profiles = ((profRes.data ?? []) as any[]).map((p) => ({ id: String(p.id), line_user_id: String(p.line_user_id ?? "") }));
  if (!profiles.length) return [];

  const ids = profiles.map((p) => p.id);
  const setRes = await admin
    .from("user_notification_settings")
    .select("profile_id,enabled")
    .eq("event_key", eventKey)
    .in("profile_id", ids)
    .limit(2000);
  if (setRes.error) throw new Error(setRes.error.message);

  const enabledById = new Map<string, boolean>();
  for (const r of (setRes.data ?? []) as any[]) {
    enabledById.set(String(r.profile_id), !!r.enabled);
  }

  return profiles.filter((p) => (enabledById.has(p.id) ? enabledById.get(p.id) === true : true));
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rls = createSupabaseRlsClient(token);
    const userRes = await rls.auth.getUser();
    const userId = String(userRes.data.user?.id ?? "").trim();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as null | { orderId?: string };
    const orderId = String(body?.orderId ?? "").trim();
    if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

    const { error: accessErr } = await rls.from("orders").select("id").eq("id", orderId).single();
    if (accessErr) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const meRes = await admin.from("profiles").select("id,role").eq("id", userId).single();
    if (meRes.error || !meRes.data) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const role = String((meRes.data as any).role ?? "");
    if (!["admin", "sale", "operation"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const orderRes = await admin
      .from("orders")
      .select("id,display_id,customer_id,status")
      .eq("id", orderId)
      .single();
    if (orderRes.error || !orderRes.data) return NextResponse.json({ error: orderRes.error?.message ?? "Order not found" }, { status: 404 });

    const displayId = String((orderRes.data as any).display_id ?? "").trim();
    const customerId = String((orderRes.data as any).customer_id ?? "").trim();
    let customerName: string | null = null;
    if (customerId) {
      const custRes = await admin.from("customers").select("name").eq("id", customerId).maybeSingle();
      if (!custRes.error && custRes.data) customerName = String((custRes.data as any).name ?? "").trim() || null;
    }

    const eventMessage = `เปิดออเดอร์ ${displayId || orderId}`.trim();
    await admin.from("order_events").insert({
      order_id: orderId,
      event_type: "order_created",
      message: eventMessage,
      entity_table: "orders",
      entity_id: orderId,
      created_by_profile_id: userId,
    });

    const text = `เปิดออเดอร์ใหม่: ${displayId || orderId}${customerName ? ` (${customerName})` : ""}`;
    const recipients = await resolveRecipients({ admin, eventKey: "order_created", roles: ["admin", "sale", "operation"] });
    const to = recipients.map((r) => r.line_user_id).filter((x) => !!x);

    let notified = false;
    let warn: string | null = null;
    if (to.length) {
      const sendRes = await sendLineText({ to, text });
      notified = sendRes.ok;
      if (!sendRes.ok) warn = sendRes.error;
    }

    return NextResponse.json({ ok: true, notified, warn });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}

