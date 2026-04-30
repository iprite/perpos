import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function createSupabaseRlsClient(accessToken: string) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !anonKey) throw new Error("Missing Supabase env");
  return createClient(url, anonKey, { global: { headers: { Authorization: "Bearer " + accessToken } } });
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rls = createSupabaseRlsClient(token);
    const userRes = await rls.auth.getUser();
    const userId = String(userRes.data.user?.id ?? "").trim();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [eventsRes, settingsRes] = await Promise.all([
      rls.from("notification_events").select("key,name,description,is_active,sort_order").eq("is_active", true).order("sort_order"),
      rls.from("user_notification_settings").select("event_key,enabled").eq("profile_id", userId),
    ]);

    if (eventsRes.error) return NextResponse.json({ error: eventsRes.error.message }, { status: 500 });
    if (settingsRes.error) return NextResponse.json({ error: settingsRes.error.message }, { status: 500 });

    const enabledByKey = new Map<string, boolean>();
    for (const row of (settingsRes.data ?? []) as any[]) {
      enabledByKey.set(String((row as any).event_key), Boolean((row as any).enabled));
    }

    const items = ((eventsRes.data ?? []) as any[]).map((e) => ({
      key: String((e as any).key),
      name: String((e as any).name),
      description: (e as any).description === null ? null : String((e as any).description ?? ""),
      enabled: enabledByKey.has(String((e as any).key)) ? enabledByKey.get(String((e as any).key)) : true,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { eventKey?: string; enabled?: boolean };
    const eventKey = typeof body.eventKey === "string" ? body.eventKey.trim() : "";
    const enabled = Boolean(body.enabled);
    if (!eventKey) return NextResponse.json({ error: "Missing eventKey" }, { status: 400 });

    const rls = createSupabaseRlsClient(token);
    const userRes = await rls.auth.getUser();
    const userId = String(userRes.data.user?.id ?? "").trim();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { error } = await rls
      .from("user_notification_settings")
      .upsert(
        { profile_id: userId, event_key: eventKey, enabled, updated_at: new Date().toISOString() },
        { onConflict: "profile_id,event_key" },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
