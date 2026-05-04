import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

export async function POST(req: Request) {
  try {
    const oaIdRaw = (process.env.LINE_OA_ID ?? "").trim();
    const oaId = oaIdRaw ? (oaIdRaw.startsWith("@") ? oaIdRaw : `@${oaIdRaw}`) : "";
    if (!oaId) return NextResponse.json({ error: "LINE env not configured" }, { status: 500 });

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rls = createSupabaseRlsClient(token);
    const admin = createSupabaseAdminClient();

    const userRes = await rls.auth.getUser();
    const userId = String(userRes.data.user?.id ?? "").trim();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const linkToken = crypto.randomUUID();

    const { error: insErr } = await admin.from("line_link_tokens").insert({
      token: linkToken,
      profile_id: userId,
      expires_at: expiresAt,
      used_at: null,
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    const message = `LINK ${linkToken}`;
    const linkUrl = `https://line.me/R/oaMessage/${oaId}/?${encodeURIComponent(message)}`;

    return NextResponse.json({ ok: true, token: linkToken, expiresAt, linkUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
