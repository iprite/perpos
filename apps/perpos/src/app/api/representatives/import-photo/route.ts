import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function normalizePhotoUrl(value: string) {
  const v = value.trim();
  if (v.startsWith("//")) return `https:${v}`;
  return v;
}

function extFromContentType(contentType: string | null) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("image/jpeg")) return "jpg";
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/webp")) return "webp";
  if (ct.includes("image/gif")) return "gif";
  return "bin";
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let repCode = "";
    let fileBytes: Uint8Array | null = null;
    let fileContentType: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      repCode = String(form.get("repCode") ?? "").trim();
      const file = form.get("file");
      if (!repCode || !(file instanceof File)) {
        return NextResponse.json({ error: "Missing repCode or file" }, { status: 400 });
      }
      fileContentType = file.type || null;
      fileBytes = new Uint8Array(await file.arrayBuffer());
    } else {
      const body = (await req.json()) as { repCode?: string; url?: string };
      repCode = (body.repCode ?? "").trim();
      const url = (body.url ?? "").trim();
      if (!repCode || !url) {
        return NextResponse.json({ error: "Missing repCode or url" }, { status: 400 });
      }

      const normalizedUrl = normalizePhotoUrl(url);
      const res = await fetch(normalizedUrl);
      if (!res.ok) {
        return NextResponse.json({ error: `Fetch image failed (${res.status})` }, { status: 400 });
      }
      fileContentType = res.headers.get("content-type");
      fileBytes = new Uint8Array(await res.arrayBuffer());
    }

    const ext = extFromContentType(fileContentType);

    const supabase = createSupabaseAdminClient();
    const bucket = "company-representatives";

    const { error: bucketError } = await supabase.storage.createBucket(bucket, { public: true });
    if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
      return NextResponse.json({ error: bucketError.message }, { status: 500 });
    }

    const objectPath = `${repCode}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, fileBytes, {
      upsert: true,
      contentType: fileContentType ?? undefined,
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    return NextResponse.json({ publicUrl: publicData.publicUrl, path: objectPath });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
