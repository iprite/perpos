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
    const installmentNoStr = String(form.get("installmentNo") ?? "").trim();
    const amountStr = String(form.get("amount") ?? "").trim();
    const file = form.get("file");

    const installmentNoNum = Number(installmentNoStr || 0);
    const installmentNo = Number.isFinite(installmentNoNum) ? Math.floor(installmentNoNum) : 0;

    if (!orderId || installmentNo < 2 || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing orderId, installmentNo, or file" }, { status: 400 });
    }

    const amountNum = Number(amountStr || 0);
    const amount = Number.isFinite(amountNum) ? amountNum : 0;
    if (amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const bucket = "order-slips";
    const { error: bucketError } = await supabase.storage.createBucket(bucket, { public: false });
    if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
      return NextResponse.json({ error: bucketError.message }, { status: 500 });
    }

    const ext = extFromContentType(file.type || null);
    const objectPath = `${orderId}/installment-${installmentNo}-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { data: existing } = await supabase
      .from("order_payments")
      .select("amount")
      .eq("order_id", orderId)
      .eq("installment_no", installmentNo)
      .maybeSingle();
    const prevAmount = Number(existing?.amount ?? 0);
    const prev = Number.isFinite(prevAmount) ? prevAmount : 0;

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
        installment_no: installmentNo,
        amount,
        slip_url: null,
        slip_storage_provider: "supabase",
        slip_storage_bucket: bucket,
        slip_storage_path: objectPath,
        slip_file_name: file.name || null,
        slip_mime_type: file.type || null,
        slip_size_bytes: bytes.length,
        confirmed_at: new Date().toISOString(),
        confirmed_by_profile_id: null,
      },
      { onConflict: "order_id,installment_no" },
    );
    if (payErr) {
      return NextResponse.json({ error: payErr.message }, { status: 500 });
    }

    const delta = amount - prev;
    if (delta !== 0) {
      const { data: ord, error: ordErr } = await supabase.from("orders").select("total,paid_amount").eq("id", orderId).single();
      if (ordErr) {
        return NextResponse.json({ error: ordErr.message }, { status: 500 });
      }
      const total = Number(ord?.total ?? 0);
      const paid = Number(ord?.paid_amount ?? 0);
      const nextPaid = Math.max(0, (Number.isFinite(paid) ? paid : 0) + delta);
      const nextRemaining = Math.max(0, (Number.isFinite(total) ? total : 0) - nextPaid);
      const { error: upErr } = await supabase.from("orders").update({ paid_amount: nextPaid, remaining_amount: nextRemaining }).eq("id", orderId);
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
