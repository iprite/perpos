import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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
    const invoiceId = String(form.get("invoiceId") ?? "").trim();
    const amountStr = String(form.get("amount") ?? "").trim();
    const installmentNoStr = String(form.get("installmentNo") ?? "").trim();
    const note = String(form.get("note") ?? "").trim() || null;
    const file = form.get("file");
    if (!invoiceId || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing invoiceId or file" }, { status: 400 });
    }

    const amountNum = Number(amountStr || 0);
    const amount = Number.isFinite(amountNum) ? amountNum : 0;
    if (amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    const invRes = await supabase.from("invoices").select("id,order_id,installment_no,status").eq("id", invoiceId).single();
    if (invRes.error || !invRes.data) return NextResponse.json({ error: invRes.error?.message ?? "Invoice not found" }, { status: 404 });
    const inv = invRes.data as any;
    if (String(inv.status) === "cancelled") return NextResponse.json({ error: "Invoice is cancelled" }, { status: 400 });

    const installmentNo = (() => {
      const n = Number(installmentNoStr || 0);
      const parsed = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
      if (parsed) return parsed;
      const fromInv = Number(inv.installment_no ?? 0);
      if (Number.isFinite(fromInv) && fromInv > 0) return Math.floor(fromInv);
      return 1;
    })();

    const bucket = "invoice-slips";
    const { error: bucketError } = await supabase.storage.createBucket(bucket, { public: false });
    if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
      return NextResponse.json({ error: bucketError.message }, { status: 500 });
    }

    const ext = extFromContentType(file.type || null);
    const objectPath = `${invoiceId}/installment-${installmentNo}-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, bytes, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const now = new Date().toISOString();
    const payUpsert = await supabase.from("invoice_payments").upsert(
      {
        invoice_id: invoiceId,
        installment_no: installmentNo,
        amount,
        note,
        slip_storage_provider: "supabase",
        slip_storage_bucket: bucket,
        slip_storage_path: objectPath,
        slip_file_name: file.name || null,
        slip_mime_type: file.type || null,
        slip_size_bytes: bytes.length,
        confirmed_at: now,
      },
      { onConflict: "invoice_id,installment_no" },
    );
    if (payUpsert.error) {
      return NextResponse.json({ error: payUpsert.error.message }, { status: 500 });
    }

    const invUpd = await supabase
      .from("invoices")
      .update({ status: "paid_confirmed", paid_confirmed_at: now })
      .eq("id", invoiceId);
    if (invUpd.error) {
      return NextResponse.json({ error: invUpd.error.message }, { status: 500 });
    }

    const orderId = String(inv.order_id ?? "").trim();
    if (orderId) {
      const orderPay = await supabase.from("order_payments").upsert(
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
          confirmed_at: now,
        } as any,
        { onConflict: "order_id,installment_no" },
      );
      if (orderPay.error) {
        return NextResponse.json({ error: orderPay.error.message }, { status: 500 });
      }

      if (installmentNo === 1) {
        const ordRes = await supabase.from("orders").select("id,status").eq("id", orderId).maybeSingle();
        if (ordRes.error) {
          return NextResponse.json({ error: ordRes.error.message }, { status: 500 });
        }
        const ord = ordRes.data as any;
        const currentStatus = String(ord?.status ?? "");
        if (currentStatus !== "completed" && currentStatus !== "cancelled") {
          const upd = await supabase.from("orders").update({ status: "in_progress" }).eq("id", orderId);
          if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
