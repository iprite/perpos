import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send-email";

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

function renderTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => {
    const v = vars[String(k)];
    return v === undefined ? "" : String(v);
  });
}

function textToHtml(text: string) {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return `<div style="font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial;font-size:14px;line-height:1.55">${escaped.replaceAll(
    "\n",
    "<br/>"
  )}</div>`;
}

async function assertInternal(req: Request) {
  const token = getBearerToken(req);
  if (!token) throw new Error("Unauthorized");
  const rls = createSupabaseRlsClient(token);
  const userRes = await rls.auth.getUser();
  const uid = userRes.data.user?.id;
  if (!uid) throw new Error("Unauthorized");
  const prof = await rls.from("profiles").select("id,role").eq("id", uid).single();
  if (prof.error || !prof.data) throw new Error("Unauthorized");
  const role = String((prof.data as any).role ?? "");
  if (!role || !["admin", "sale", "operation"].includes(role)) throw new Error("Forbidden");
}

export async function POST(req: Request) {
  try {
    await assertInternal(req);
    const body = (await req.json().catch(() => ({}))) as { to?: string; doc_type?: string; audience?: string };
    const to = String(body.to ?? "").trim();
    const docType = String(body.doc_type ?? "").trim();
    const audience = String(body.audience ?? "").trim();
    if (!to) return NextResponse.json({ error: "Missing to" }, { status: 400 });
    if (!["passport", "visa", "wp"].includes(docType)) return NextResponse.json({ error: "Invalid doc_type" }, { status: 400 });
    if (!["employer", "sale"].includes(audience)) return NextResponse.json({ error: "Invalid audience" }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data: tpl, error } = await admin
      .from("document_expiry_notification_templates")
      .select("id,subject_template,body_template")
      .is("customer_id", null)
      .eq("doc_type", docType)
      .eq("audience", audience)
      .eq("channel", "email")
      .eq("enabled", true)
      .single();
    if (error || !tpl) return NextResponse.json({ error: error?.message ?? "Template not found" }, { status: 404 });

    const vars: Record<string, string> = {
      customer_name: "บริษัทตัวอย่าง",
      worker_full_name: "แรงงานตัวอย่าง",
      expires_at: "2026-12-31",
      days_left: "30",
      passport_no: "P0000000",
      wp_number: "WP0000000",
    };
    const subject = renderTemplate(String((tpl as any).subject_template ?? ""), vars).trim() || "แจ้งเตือนเอกสารใกล้หมดอายุ";
    const bodyText = renderTemplate(String((tpl as any).body_template ?? ""), vars).trim() || "-";
    const html = textToHtml(bodyText);

    const sendRes = await sendEmail({ to, subject, html, text: bodyText });
    if (!sendRes.ok) return NextResponse.json({ error: sendRes.reason }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message ?? "Unexpected error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

