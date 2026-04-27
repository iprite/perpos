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

type TableName = "worker_documents" | "customer_documents" | "user_assets";

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { table?: TableName; id?: string } | null;
    const table = body?.table;
    const id = String(body?.id ?? "").trim();
    if (!table || !id) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const rls = createSupabaseRlsClient(token);
    const admin = createSupabaseAdminClient();

    const { data, error } = await rls
      .from(table)
      .select("storage_provider,storage_bucket,storage_path")
      .eq("id", id)
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

    if (String((data as any).storage_provider) !== "supabase") {
      return NextResponse.json({ error: "Document is not stored in Supabase Storage" }, { status: 400 });
    }
    const bucket = String((data as any).storage_bucket ?? "");
    const path = String((data as any).storage_path ?? "");
    if (!bucket || !path) return NextResponse.json({ error: "Missing storage path" }, { status: 400 });

    const { error: removeErr } = await admin.storage.from(bucket).remove([path]);
    if (removeErr) {
      const msg = String(removeErr.message ?? "");
      if (!msg.toLowerCase().includes("not found")) {
        return NextResponse.json({ error: msg || "Delete file failed" }, { status: 500 });
      }
    }

    const { error: delErr } = await rls.from(table).delete().eq("id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
