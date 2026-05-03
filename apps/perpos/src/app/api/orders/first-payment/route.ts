import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function extFromContentType(contentType: string | null) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("image/jpeg")) return "jpg";
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/webp")) return "webp";
  if (ct.includes("application/pdf")) return "pdf";
  return "bin";
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
    }

    const form = await req.formData();
    const orderId = String(form.get("orderId") ?? "").trim();
    const amountStr = String(form.get("amount") ?? "").trim();
    const file = form.get("file");
    if (!orderId || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing orderId or file" }, { status: 400 });
    }

    const amountNum = Number(amountStr || 0);
    const amount = Number.isFinite(amountNum) ? amountNum : 0;

    const supabase = createSupabaseAdminClient();

    const bucket = "order-slips";
    const { error: bucketError } = await supabase.storage.createBucket(bucket, { public: false });
    if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
      return NextResponse.json({ error: bucketError.message }, { status: 500 });
    }

    const ext = extFromContentType(file.type || null);
    const objectPath = `${orderId}/installment-1-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, bytes, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { error: payErr } = await supabase.from("order_payments").upsert(
      {
        order_id: orderId,
        installment_no: 1,
        amount,
        slip_url: null,
        slip_storage_provider: "supabase",
        slip_storage_bucket: bucket,
        slip_storage_path: objectPath,
        slip_file_name: file.name || null,
        slip_mime_type: file.type || null,
        slip_size_bytes: bytes.length,
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: "order_id,installment_no" },
    );
    if (payErr) {
      return NextResponse.json({ error: payErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
