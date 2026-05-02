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

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { customerId?: string };
    const customerId = String(body.customerId ?? "").trim();
    if (!customerId) return NextResponse.json({ error: "Missing customerId" }, { status: 400 });

    const rls = createSupabaseRlsClient(token);
    const userRes = await rls.auth.getUser();
    const userId = String(userRes.data.user?.id ?? "").trim();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const roleRes = await rls.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (roleRes.error) return NextResponse.json({ error: roleRes.error.message }, { status: 500 });
    const role = String((roleRes.data as any)?.role ?? "");
    if (role !== "admin" && role !== "sale") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const accessRes = await rls.from("customers").select("id").eq("id", customerId).single();
    if (accessRes.error) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();

    const { error: upErr } = await admin
      .from("customer_line_connections")
      .upsert(
        {
          customer_id: customerId,
          status: "NOT_CONNECTED",
          line_user_id: null,
          connected_at: null,
          last_error_message: null,
          updated_at: now,
        },
        { onConflict: "customer_id" },
      );
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}

