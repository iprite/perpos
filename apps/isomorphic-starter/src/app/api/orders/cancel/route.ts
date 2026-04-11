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
    if (amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const bucket = "order-refunds";
    const { error: bucketError } = await supabase.storage.createBucket(bucket, { public: false });
    if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
      return NextResponse.json({ error: bucketError.message }, { status: 500 });
    }

    const ext = extFromContentType(file.type || null);

    const { data: order, error: orderErr } = await supabase.from("orders").select("status").eq("id", orderId).single();
    if (orderErr) {
      return NextResponse.json({ error: orderErr.message }, { status: 500 });
    }
    if (order?.status !== "in_progress") {
      return NextResponse.json({ error: "Only in_progress orders can be cancelled" }, { status: 400 });
    }

    const objectPath = `${orderId}/refund-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, bytes, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { error: refundErr } = await supabase.from("order_refunds").upsert(
      {
        order_id: orderId,
        amount,
        slip_url: null,
        slip_storage_provider: "supabase",
        slip_storage_bucket: bucket,
        slip_storage_path: objectPath,
        slip_file_name: file.name || null,
        slip_mime_type: file.type || null,
        slip_size_bytes: bytes.length,
      },
      { onConflict: "order_id" },
    );
    if (refundErr) {
      return NextResponse.json({ error: refundErr.message }, { status: 500 });
    }

    const { error: updErr } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
