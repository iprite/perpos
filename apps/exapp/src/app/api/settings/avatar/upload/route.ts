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
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !anonKey) throw new Error("Missing Supabase env");
  return createClient(url, anonKey, { global: { headers: { Authorization: "Bearer " + accessToken } } });
}

function extFromContentType(contentType: string | null) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("image/jpeg")) return "jpg";
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/webp")) return "webp";
  return null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (!String(file.type ?? "").toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const ext = extFromContentType(file.type || null);
    if (!ext) return NextResponse.json({ error: "รองรับเฉพาะไฟล์ jpg/png/webp" }, { status: 400 });

    const rls = createSupabaseRlsClient(token);
    const admin = createSupabaseAdminClient();

    const userRes = await rls.auth.getUser();
    const userId = String(userRes.data.user?.id ?? "").trim();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const bucket = "avatars";
    const { error: bucketError } = await admin.storage.createBucket(bucket, { public: true });
    if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
      return NextResponse.json({ error: bucketError.message }, { status: 500 });
    }

    const basePath = `users/${userId}/avatar`;
    const candidates = ["jpg", "png", "webp"].map((e) => `${basePath}.${e}`);
    await admin.storage.from(bucket).remove(candidates);
    const objectPath = `${basePath}.${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploadRes = await admin.storage.from(bucket).upload(objectPath, bytes, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (uploadRes.error) {
      return NextResponse.json({ error: uploadRes.error.message }, { status: 500 });
    }

    const publicUrl = admin.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
    const avatarUrl = `${publicUrl}?v=${Date.now()}`;
    const { error: upErr } = await rls.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userId);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, avatarUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
