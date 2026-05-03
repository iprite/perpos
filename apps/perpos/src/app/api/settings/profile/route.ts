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

    const { data, error } = await rls
      .from("profiles")
      .select("id,email,role,display_name,avatar_url,line_user_id,line_linked_at,created_at")
      .eq("id", userId)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, profile: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { displayName?: string | null };
    const displayNameRaw = body.displayName;
    const displayName =
      displayNameRaw === null ? null : typeof displayNameRaw === "string" ? displayNameRaw.trim() : undefined;

    if (displayName !== undefined && displayName !== null && displayName.length === 0) {
      return NextResponse.json({ error: "ชื่อแสดงผลห้ามว่าง" }, { status: 400 });
    }

    const rls = createSupabaseRlsClient(token);
    const userRes = await rls.auth.getUser();
    const userId = String(userRes.data.user?.id ?? "").trim();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const patch: Record<string, any> = {};
    if (displayName !== undefined) patch.display_name = displayName;
    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

    const { data, error } = await rls
      .from("profiles")
      .update(patch)
      .eq("id", userId)
      .select("id,email,role,display_name,avatar_url,line_user_id,line_linked_at,created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, profile: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
