import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
    if (!url || !anonKey) throw new Error("Missing Supabase env");

    const authClient = createClient(url, anonKey);
    const userRes = await authClient.auth.getUser(token);
    const userId = userRes.data.user?.id ?? null;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const orderId = String(searchParams.get("order_id") ?? "").trim();
    if (!orderId) return NextResponse.json({ error: "Missing order_id" }, { status: 400 });

    const rls = createSupabaseRlsClient(token);
    const { error: orderErr } = await rls.from("orders").select("id").eq("id", orderId).single();
    if (orderErr) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const { data: me, error: meErr } = await admin.from("profiles").select("id,role").eq("id", userId).single();
    if (meErr || !me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!["admin", "sale", "operation"].includes(String((me as any).role ?? ""))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await admin
      .from("order_events")
      .select("id,event_type,message,created_at,created_by_profile_id,profiles(email)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const events = (data ?? []).map((r: any) => ({
      id: r.id,
      event_type: r.event_type,
      message: r.message,
      created_at: r.created_at,
      created_by_profile_id: r.created_by_profile_id ?? null,
      created_by_email: r.profiles?.email ?? null,
    }));

    return NextResponse.json({ ok: true, events });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
