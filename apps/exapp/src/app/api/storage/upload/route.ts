import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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

function stripDuplicateExt(name: string, ext: string) {
  const n = String(name ?? "").trim();
  const lower = n.toLowerCase();
  const variants =
    ext === "jpg"
      ? ["jpg", "jpeg"]
      : ext === "png"
        ? ["png"]
        : ext === "webp"
          ? ["webp"]
          : ext === "pdf"
            ? ["pdf"]
            : [ext];
  for (const v of variants) {
    const suffix = "." + v;
    if (lower.endsWith(suffix)) return n.slice(0, n.length - suffix.length);
  }
  return n;
}

function extFromContentType(contentType: string | null) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("image/jpeg")) return "jpg";
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/webp")) return "webp";
  if (ct.includes("application/pdf")) return "pdf";
  return "bin";
}

async function getCustomerIdForEntity(supabase: any, entityType: string, entityId: string) {
  if (entityType === "customer") return entityId;
  if (entityType === "order") {
    const { data, error } = await supabase.from("orders").select("customer_id").eq("id", entityId).single();
    if (error || !data?.customer_id) throw new Error(error?.message ?? "ไม่พบออเดอร์");
    return String(data.customer_id);
  }
  if (entityType === "order_item") {
    const { data: oi, error: oiErr } = await supabase.from("order_items").select("order_id").eq("id", entityId).single();
    if (oiErr || !oi?.order_id) throw new Error(oiErr?.message ?? "ไม่พบรายการบริการ");
    const { data, error } = await supabase.from("orders").select("customer_id").eq("id", oi.order_id).single();
    if (error || !data?.customer_id) throw new Error(error?.message ?? "ไม่พบออเดอร์");
    return String(data.customer_id);
  }
  if (entityType === "worker") {
    const { data, error } = await supabase.from("workers").select("customer_id").eq("id", entityId).single();
    if (error || !data?.customer_id) throw new Error(error?.message ?? "ไม่พบแรงงาน");
    return String(data.customer_id);
  }
  throw new Error("Invalid entityType");
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
    }

    const form = await req.formData();
    const entityType = String(form.get("entityType") ?? "").trim();
    const entityId = String(form.get("entityId") ?? "").trim();
    const orderId = String(form.get("orderId") ?? "").trim();
    const docType = String(form.get("docType") ?? "").trim();
    const workerId = String(form.get("workerId") ?? "").trim();
    const orderItemId = String(form.get("orderItemId") ?? "").trim();
    const expiryDate = String(form.get("expiryDate") ?? "").trim();
    const file = form.get("file");

    if (!entityType || !entityId || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const customerId = await getCustomerIdForEntity(supabase, entityType, entityId);

    if (entityType === "order_item") {
      const { data: oi, error: oiErr } = await supabase.from("order_items").select("id,order_id").eq("id", entityId).single();
      if (oiErr || !oi?.id) throw new Error(oiErr?.message ?? "ไม่พบรายการบริการ");
      if (orderId && String(oi.order_id ?? "") !== orderId) throw new Error("รายการบริการไม่อยู่ในออเดอร์นี้");
    }

    const bucket = "documents";
    const { error: bucketError } = await supabase.storage.createBucket(bucket, { public: false });
    if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
      return NextResponse.json({ error: bucketError.message }, { status: 500 });
    }

    const ext = extFromContentType(file.type || null);
    const baseNameNoDupExt = stripDuplicateExt(file.name || "file", ext);
    const filename = sanitizeAsciiSegment(baseNameNoDupExt);
    const docSeg = sanitizeAsciiSegment(docType || "document");
    const now = Date.now();

    const effectiveOrderId = entityType === "order" ? entityId : entityType === "order_item" ? orderId : "";
    if ((entityType === "order" || entityType === "order_item") && !effectiveOrderId) {
      throw new Error("Missing orderId");
    }

    const objectPath =
      entityType === "customer"
        ? `customers/${customerId}/customer-documents/${now}-${docSeg}-${filename}.${ext}`
        : entityType === "worker"
          ? `customers/${customerId}/workers/${entityId}/documents/${now}-${docSeg}-${filename}.${ext}`
          : entityType === "order_item"
            ? `customers/${customerId}/orders/${effectiveOrderId}/order-items/${entityId}/documents/${now}-${docSeg}-${filename}.${ext}`
            : `customers/${customerId}/orders/${effectiveOrderId}/documents/${now}-${docSeg}-${filename}.${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, bytes, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    if (entityType === "order") {
      if (workerId) {
        const { data: w, error: wErr } = await supabase.from("workers").select("id").eq("id", workerId).maybeSingle();
        if (wErr || !w?.id) throw new Error("ไม่พบแรงงาน");

        const { data: links, error: lErr } = await supabase.from("order_item_workers").select("order_item_id").eq("worker_id", workerId).limit(5000);
        if (lErr) throw new Error("ตรวจสอบแรงงานในออเดอร์ไม่สำเร็จ");
        const orderItemIds = (links ?? []).map((x: any) => String(x.order_item_id)).filter(Boolean);
        if (orderItemIds.length === 0) throw new Error("แรงงานนี้ไม่ได้อยู่ในออเดอร์นี้");

        const { data: oi, error: oiErr } = await supabase
          .from("order_items")
          .select("id")
          .in("id", orderItemIds)
          .eq("order_id", entityId)
          .limit(1)
          .maybeSingle();
        if (oiErr || !oi?.id) throw new Error("แรงงานนี้ไม่ได้อยู่ในออเดอร์นี้");
      }
      if (orderItemId) {
        const { data: oi, error: oiErr } = await supabase.from("order_items").select("id,order_id").eq("id", orderItemId).maybeSingle();
        if (oiErr || !oi?.id) throw new Error("ไม่พบบริการในออเดอร์");
        if (String((oi as any).order_id ?? "") !== entityId) throw new Error("บริการนี้ไม่ได้อยู่ในออเดอร์นี้");
      }
      const { error } = await supabase.from("order_documents").insert({
        order_id: entityId,
        worker_id: workerId || null,
        order_item_id: orderItemId || null,
        doc_type: docType || null,
        storage_provider: "supabase",
        storage_bucket: bucket,
        storage_path: objectPath,
        file_name: file.name || null,
        mime_type: file.type || null,
        size_bytes: bytes.length,
      });
      if (error) throw new Error(error.message);
    } else if (entityType === "order_item") {
      const { data: oi, error: oiErr } = await supabase.from("order_items").select("order_id").eq("id", entityId).single();
      if (oiErr || !oi?.order_id) throw new Error(oiErr?.message ?? "ไม่พบรายการบริการ");
      const { error } = await supabase.from("order_item_documents").insert({
        order_id: String(oi.order_id),
        order_item_id: entityId,
        doc_type: docType || null,
        storage_provider: "supabase",
        storage_bucket: bucket,
        storage_path: objectPath,
        file_name: file.name || null,
        mime_type: file.type || null,
        size_bytes: bytes.length,
      });
      if (error) throw new Error(error.message);
    } else if (entityType === "worker") {
      const { error } = await supabase.from("worker_documents").insert({
        worker_id: entityId,
        doc_type: docType || null,
        expiry_date: expiryDate || null,
        storage_provider: "supabase",
        storage_bucket: bucket,
        storage_path: objectPath,
        file_name: file.name || null,
        mime_type: file.type || null,
        size_bytes: bytes.length,
      });
      if (error) throw new Error(error.message);
    } else if (entityType === "customer") {
      const { error } = await supabase.from("customer_documents").insert({
        customer_id: entityId,
        doc_type: docType || null,
        expiry_date: expiryDate || null,
        storage_provider: "supabase",
        storage_bucket: bucket,
        storage_path: objectPath,
        file_name: file.name || null,
        mime_type: file.type || null,
        size_bytes: bytes.length,
      });
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
