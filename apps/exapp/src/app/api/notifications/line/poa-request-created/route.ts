import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendLineMessages } from "@/lib/line/send-messages";
import { createPoaRequestCreatedFlexMessage } from "@/lib/line/flex/poa";

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

async function resolveRecipients(args: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  eventKey: string;
  roles: string[];
}) {
  const { admin, eventKey, roles } = args;

  const evRes = await admin.from("notification_events").select("key,is_active").eq("key", eventKey).maybeSingle();
  if (evRes.error) throw new Error(evRes.error.message);
  if (!evRes.data || !(evRes.data as any).is_active) return [];

  const profRes = await admin
    .from("profiles")
    .select("id,role,line_user_id,display_name,email")
    .in("role", roles)
    .not("line_user_id", "is", null)
    .limit(2000);
  if (profRes.error) throw new Error(profRes.error.message);

  const profiles = ((profRes.data ?? []) as any[]).map((p) => ({
    id: String(p.id),
    line_user_id: String(p.line_user_id ?? ""),
  }));
  if (!profiles.length) return [];

  const ids = profiles.map((p) => p.id);
  const setRes = await admin
    .from("user_notification_settings")
    .select("profile_id,enabled")
    .eq("event_key", eventKey)
    .in("profile_id", ids)
    .limit(2000);
  if (setRes.error) throw new Error(setRes.error.message);

  const enabledById = new Map<string, boolean>();
  for (const r of (setRes.data ?? []) as any[]) {
    enabledById.set(String(r.profile_id), !!r.enabled);
  }

  return profiles.filter((p) => enabledById.has(p.id) ? enabledById.get(p.id) === true : true);
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rls = createSupabaseRlsClient(token);
    const userRes = await rls.auth.getUser();
    const userId = String(userRes.data.user?.id ?? "").trim();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as null | { requestId?: string };
    const requestId = String(body?.requestId ?? "").trim();
    if (!requestId) return NextResponse.json({ error: "Missing requestId" }, { status: 400 });

    const { error: accessErr } = await rls.from("poa_requests").select("id").eq("id", requestId).single();
    if (accessErr) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const admin = createSupabaseAdminClient();

    const reqRes = await admin
      .from("poa_requests")
      .select(
        "id,display_id,employer_name,representative_name,representative_rep_code,created_at,status,poa_request_items(worker_count,total_price,poa_request_types(name))",
      )
      .eq("id", requestId)
      .single();
    if (reqRes.error || !reqRes.data) return NextResponse.json({ error: reqRes.error?.message ?? "Not found" }, { status: 404 });

    const d = reqRes.data as any;
    const displayId = String(d.display_id ?? "").trim();
    const rep = String(d.representative_name ?? d.representative_rep_code ?? "").trim();
    const employer = String(d.employer_name ?? "").trim();
    const status = String(d.status ?? "").trim();
    const item0 = Array.isArray(d.poa_request_items) ? d.poa_request_items[0] : null;
    const typeName = String(item0?.poa_request_types?.name ?? "").trim();
    const workerCount = item0?.worker_count == null ? null : Number(item0.worker_count);
    const totalPrice = item0?.total_price == null ? null : Number(item0.total_price);

    const flex = createPoaRequestCreatedFlexMessage({
      reference: displayId || requestId,
      employerName: employer,
      representativeName: rep,
      poaTypeName: typeName,
      workerCount,
      totalPrice,
      status,
      createdAt: d.created_at ? String(d.created_at) : null,
    });

    const recipients = await resolveRecipients({ admin, eventKey: "poa_request_created", roles: ["admin", "sale", "operation"] });
    const to = recipients.map((r) => r.line_user_id).filter((x) => !!x);
    if (to.length) {
      const sendRes = await sendLineMessages({ to, messages: [flex] });
      if (!sendRes.ok) {
        return NextResponse.json({ ok: true, notified: false, warn: sendRes.error }, { status: 200 });
      }
    }

    return NextResponse.json({ ok: true, notified: !!to.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
