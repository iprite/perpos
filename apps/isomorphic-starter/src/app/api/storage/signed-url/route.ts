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

type TableName =
  | "order_documents"
  | "order_item_documents"
  | "worker_documents"
  | "customer_documents"
  | "order_payments"
  | "order_refunds"
  | "invoice_payments"
  | "poa_item_payments"
  | "petty_cash_transactions";

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as
      | { table?: TableName; id?: string; disposition?: "inline" | "attachment" }
      | null;
    const table = body?.table;
    const id = String(body?.id ?? "").trim();
    const disposition = body?.disposition ?? "inline";
    if (!table || !id) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const rls = createSupabaseRlsClient(token);
    const admin = createSupabaseAdminClient();

    if (table === "order_payments" || table === "order_refunds" || table === "invoice_payments") {
      const { data, error } = await rls
        .from(table)
        .select("slip_storage_provider,slip_storage_bucket,slip_storage_path,slip_file_name")
        .eq("id", id)
        .single();
      if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
      if (String((data as any).slip_storage_provider) !== "supabase") {
        return NextResponse.json({ error: "Slip is not stored in Supabase Storage" }, { status: 400 });
      }
      const bucket = String((data as any).slip_storage_bucket ?? "");
      const path = String((data as any).slip_storage_path ?? "");
      if (!bucket || !path) return NextResponse.json({ error: "Missing storage path" }, { status: 400 });
      const name = String((data as any).slip_file_name ?? "slip");
      const { data: signed, error: signedErr } = await admin.storage
        .from(bucket)
        .createSignedUrl(path, 300, { download: disposition === "attachment" ? name : false });
      if (signedErr || !signed?.signedUrl) {
        return NextResponse.json({ error: signedErr?.message ?? "Create signed url failed" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, url: signed.signedUrl });
    }

    if (table === "poa_item_payments") {
      const { data, error } = await rls.from(table).select("slip_object_path").eq("id", id).single();
      if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
      const path = String((data as any).slip_object_path ?? "");
      if (!path) return NextResponse.json({ error: "Missing storage path" }, { status: 400 });
      const { data: signed, error: signedErr } = await admin.storage
        .from("poa_slips")
        .createSignedUrl(path, 300, { download: disposition === "attachment" ? "slip" : false });
      if (signedErr || !signed?.signedUrl) {
        return NextResponse.json({ error: signedErr?.message ?? "Create signed url failed" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, url: signed.signedUrl });
    }

    if (table === "petty_cash_transactions") {
      const { data, error } = await rls.from(table).select("receipt_object_path,receipt_file_name").eq("id", id).single();
      if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
      const path = String((data as any).receipt_object_path ?? "");
      if (!path) return NextResponse.json({ error: "Missing storage path" }, { status: 400 });
      const name = String((data as any).receipt_file_name ?? "receipt");
      const { data: signed, error: signedErr } = await admin.storage
        .from("petty_cash_receipts")
        .createSignedUrl(path, 300, { download: disposition === "attachment" ? name : false });
      if (signedErr || !signed?.signedUrl) {
        return NextResponse.json({ error: signedErr?.message ?? "Create signed url failed" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, url: signed.signedUrl });
    }

    const { data, error } = await rls
      .from(table)
      .select("storage_provider,storage_bucket,storage_path,file_name")
      .eq("id", id)
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
    if (String((data as any).storage_provider) !== "supabase") {
      return NextResponse.json({ error: "Document is not stored in Supabase Storage" }, { status: 400 });
    }
    const bucket = String((data as any).storage_bucket ?? "");
    const path = String((data as any).storage_path ?? "");
    if (!bucket || !path) return NextResponse.json({ error: "Missing storage path" }, { status: 400 });
    const name = String((data as any).file_name ?? "document");
    const { data: signed, error: signedErr } = await admin.storage
      .from(bucket)
      .createSignedUrl(path, 300, { download: disposition === "attachment" ? name : false });
    if (signedErr || !signed?.signedUrl) {
      return NextResponse.json({ error: signedErr?.message ?? "Create signed url failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, url: signed.signedUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
