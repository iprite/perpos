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

function sanitizeAsciiSegment(input: string, maxLen = 80) {
  const s = String(input ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("/", " ")
    .replaceAll("\\", " ");

  const out = s
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, maxLen);

  return out || "file";
}

function extFromContentType(contentType: string | null) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("image/jpeg")) return "jpg";
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/webp")) return "webp";
  return "png";
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
    const assetType = String(form.get("assetType") ?? "").trim();
    const file = form.get("file");
    if ((assetType !== "signature" && assetType !== "stamp") || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!String(file.type ?? "").toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const rls = createSupabaseRlsClient(token);
    const admin = createSupabaseAdminClient();

    const userRes = await rls.auth.getUser();
    const userId = String(userRes.data.user?.id ?? "").trim();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const bucket = "user_assets";
    const { error: bucketError } = await admin.storage.createBucket(bucket, { public: false });
    if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
      return NextResponse.json({ error: bucketError.message }, { status: 500 });
    }

    const existingRes = await rls
      .from("user_assets")
      .select("id,storage_bucket,storage_path")
      .eq("profile_id", userId)
      .eq("asset_type", assetType)
      .maybeSingle();
    if (existingRes.error) return NextResponse.json({ error: existingRes.error.message }, { status: 500 });
    const oldPath = existingRes.data?.storage_path ? String((existingRes.data as any).storage_path) : null;
    const oldBucket = existingRes.data?.storage_bucket ? String((existingRes.data as any).storage_bucket) : null;

    const ext = extFromContentType(file.type || null);
    const filename = sanitizeAsciiSegment(file.name || assetType);
    const now = Date.now();
    const objectPath = `users/${userId}/${assetType}/${now}-${filename}.${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploadRes = await admin.storage.from(bucket).upload(objectPath, bytes, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (uploadRes.error) {
      return NextResponse.json({ error: uploadRes.error.message }, { status: 500 });
    }

    const upsertRes = await rls
      .from("user_assets")
      .upsert(
        {
          profile_id: userId,
          asset_type: assetType,
          storage_provider: "supabase",
          storage_bucket: bucket,
          storage_path: objectPath,
          file_name: file.name || null,
          mime_type: file.type || null,
          size_bytes: bytes.length,
        },
        { onConflict: "profile_id,asset_type" },
      )
      .select("id")
      .single();

    if (upsertRes.error) {
      await admin.storage.from(bucket).remove([objectPath]);
      return NextResponse.json({ error: upsertRes.error.message }, { status: 500 });
    }

    if (oldPath && oldBucket && (oldBucket !== bucket || oldPath !== objectPath)) {
      await admin.storage.from(oldBucket).remove([oldPath]);
    }

    return NextResponse.json({ ok: true, id: String((upsertRes.data as any).id) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}

