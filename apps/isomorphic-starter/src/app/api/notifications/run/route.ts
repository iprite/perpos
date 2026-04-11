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

async function assertInternalOrCron(req: Request) {
  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  if (expected && cronSecret && cronSecret === expected) return { mode: "cron" as const, userId: null };

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
  return { mode: "user" as const, userId: uid };
}

async function sendQueuedDeliveries(admin: ReturnType<typeof createSupabaseAdminClient>, limit: number) {
  const { data: queued, error: qErr } = await admin
    .from("document_expiry_notification_deliveries")
    .select(
      "id,customer_id,worker_id,doc_type,expires_at,days_left,lead_day,audience,channel,destination_email,status,created_at"
    )
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(500, limit)));
  if (qErr) throw new Error(qErr.message);
  const rows = ((queued ?? []) as any[]) as {
    id: string;
    customer_id: string;
    worker_id: string;
    doc_type: "passport" | "visa" | "wp";
    expires_at: string;
    days_left: number;
    lead_day: number;
    audience: "employer" | "sale";
    channel: "email";
    destination_email: string;
  }[];
  if (rows.length === 0) return { sentCount: 0, failedCount: 0 };

  const customerIds = Array.from(new Set(rows.map((r) => r.customer_id)));
  const workerIds = Array.from(new Set(rows.map((r) => r.worker_id)));

  const [workersRes, customersRes, globalTplRes, custTplRes] = await Promise.all([
    admin.from("workers").select("id,full_name,passport_no,wp_number,customer_id").in("id", workerIds).limit(2000),
    admin.from("customers").select("id,name").in("id", customerIds).limit(2000),
    admin
      .from("document_expiry_notification_templates")
      .select("id,customer_id,doc_type,audience,channel,subject_template,body_template,enabled")
      .is("customer_id", null)
      .eq("enabled", true)
      .limit(200),
    customerIds.length
      ? admin
          .from("document_expiry_notification_templates")
          .select("id,customer_id,doc_type,audience,channel,subject_template,body_template,enabled")
          .in("customer_id", customerIds)
          .eq("enabled", true)
          .limit(2000)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  const firstErr = workersRes.error ?? customersRes.error ?? globalTplRes.error ?? custTplRes.error;
  if (firstErr) throw new Error(firstErr.message);

  const workerById = new Map(
    (((workersRes.data ?? []) as any[]) ?? []).map((w: any) => [String(w.id), w])
  );
  const customerNameById = new Map(
    (((customersRes.data ?? []) as any[]) ?? []).map((c: any) => [String(c.id), String(c.name ?? "")])
  );

  const tplByKey = new Map<string, any>();
  for (const t of ((globalTplRes.data ?? []) as any[]) ?? []) {
    tplByKey.set(`global|${t.doc_type}|${t.audience}|${t.channel}`, t);
  }
  for (const t of ((custTplRes.data ?? []) as any[]) ?? []) {
    tplByKey.set(`${t.customer_id}|${t.doc_type}|${t.audience}|${t.channel}`, t);
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const r of rows) {
    const w = workerById.get(r.worker_id);
    const customerName = customerNameById.get(r.customer_id) ?? r.customer_id;
    if (!w) {
      await admin
        .from("document_expiry_notification_deliveries")
        .update({ status: "failed", error_message: "missing_worker", updated_at: new Date().toISOString() })
        .eq("id", r.id);
      failedCount += 1;
      continue;
    }

    const tpl =
      tplByKey.get(`${r.customer_id}|${r.doc_type}|${r.audience}|email`) ??
      tplByKey.get(`global|${r.doc_type}|${r.audience}|email`) ??
      null;
    if (!tpl) {
      await admin
        .from("document_expiry_notification_deliveries")
        .update({ status: "failed", error_message: "missing_template", updated_at: new Date().toISOString() })
        .eq("id", r.id);
      failedCount += 1;
      continue;
    }

    const vars: Record<string, string> = {
      customer_name: customerName,
      worker_full_name: String((w as any).full_name ?? ""),
      expires_at: String(r.expires_at ?? ""),
      days_left: String(r.days_left ?? ""),
      passport_no: String((w as any).passport_no ?? ""),
      wp_number: String((w as any).wp_number ?? ""),
    };
    const subject = renderTemplate(String(tpl.subject_template ?? ""), vars).trim() || "แจ้งเตือนเอกสารใกล้หมดอายุ";
    const bodyText = renderTemplate(String(tpl.body_template ?? ""), vars).trim() || "-";
    const html = textToHtml(bodyText);

    try {
      const sendRes = await sendEmail({ to: r.destination_email, subject, html, text: bodyText });
      if (!sendRes.ok) {
        await admin
          .from("document_expiry_notification_deliveries")
          .update({
            status: "failed",
            error_message: sendRes.reason,
            template_id: String(tpl.id),
            subject_snapshot: subject,
            body_snapshot: bodyText,
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.id);
        failedCount += 1;
        continue;
      }

      await admin
        .from("document_expiry_notification_deliveries")
        .update({
          status: "sent",
          error_message: null,
          template_id: String(tpl.id),
          subject_snapshot: subject,
          body_snapshot: bodyText,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      sentCount += 1;
    } catch (e: any) {
      await admin
        .from("document_expiry_notification_deliveries")
        .update({
          status: "failed",
          error_message: e?.message ?? "send_failed",
          template_id: String(tpl.id),
          subject_snapshot: subject,
          body_snapshot: bodyText,
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      failedCount += 1;
    }
  }

  return { sentCount, failedCount };
}

export async function POST(req: Request) {
  try {
    const auth = await assertInternalOrCron(req);
    const body = (await req.json().catch(() => ({}))) as { mode?: "scan_only" | "scan_and_send"; sendLimit?: number; runDate?: string };
    const mode = body.mode ?? "scan_and_send";
    const sendLimit = Math.max(1, Math.min(500, Math.floor(Number(body.sendLimit ?? 200))));
    const runDate = typeof body.runDate === "string" && body.runDate.trim() ? body.runDate.trim() : null;

    const admin = createSupabaseAdminClient();
    const rpcArgs = runDate ? { run_date: runDate } : {};
    const { data: res, error } = await admin.rpc("enqueue_document_expiry_notifications", rpcArgs as any);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const queuedCount = Number((res?.[0] as any)?.queued_count ?? (res as any)?.queued_count ?? 0);

    if (mode === "scan_only") {
      return NextResponse.json({ ok: true, queuedCount, sentCount: 0, failedCount: 0, actor: auth.mode });
    }

    const sendRes = await sendQueuedDeliveries(admin, sendLimit);
    return NextResponse.json({ ok: true, queuedCount, sentCount: sendRes.sentCount, failedCount: sendRes.failedCount, actor: auth.mode });
  } catch (e: any) {
    const msg = e?.message ?? "Unexpected error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

