import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendLineText } from "@/lib/line/send-text";

type RepresentativeOption = {
  rep_code: string | null;
  display_name: string;
};

type PoaTypeOption = {
  id: string;
  name: string;
  base_price: number;
  is_active: boolean;
};

async function resolveUnitPriceForRep({
  admin,
  repCode,
  poaRequestTypeId,
  fallbackUnit,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  repCode: string | null;
  poaRequestTypeId: string;
  fallbackUnit: number;
}) {
  const code = String(repCode ?? "").trim();
  if (!code) return { unit: fallbackUnit, source: "default" as const };
  const { data, error } = await admin
    .from("poa_request_type_rep_price_overrides")
    .select("unit_price_per_worker,active")
    .eq("rep_code", code)
    .eq("poa_request_type_id", poaRequestTypeId)
    .maybeSingle();
  if (error || !data) return { unit: fallbackUnit, source: "default" as const };
  if (!(data as any).active) return { unit: fallbackUnit, source: "default" as const };
  const unit = Number((data as any).unit_price_per_worker ?? NaN);
  if (!Number.isFinite(unit)) return { unit: fallbackUnit, source: "default" as const };
  return { unit, source: "override" as const };
}

function repDisplayName(input: { prefix?: string | null; first_name?: string | null; last_name?: string | null; rep_code?: string | null }) {
  const first = String(input.first_name ?? "").trim();
  const last = String(input.last_name ?? "").trim();
  const full = `${first} ${last}`.trim();
  return full || String(input.rep_code ?? "").trim() || "-";
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
    .select("id,role,line_user_id")
    .in("role", roles)
    .not("line_user_id", "is", null)
    .limit(2000);
  if (profRes.error) throw new Error(profRes.error.message);

  const profiles = ((profRes.data ?? []) as any[]).map((p) => ({ id: String(p.id), line_user_id: String(p.line_user_id ?? "") }));
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

  return profiles.filter((p) => (enabledById.has(p.id) ? enabledById.get(p.id) === true : true));
}

export async function GET() {
  try {
    const admin = createSupabaseAdminClient();
    const [repsRes, typesRes] = await Promise.all([
      admin
        .from("company_representatives")
        .select("rep_code,first_name,last_name,status")
        .order("rep_code", { ascending: true }),
      admin
        .from("poa_request_types")
        .select("id,name,base_price,is_active")
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

    const firstErr = repsRes.error ?? typesRes.error;
    if (firstErr) {
      return NextResponse.json({ error: firstErr.message }, { status: 400 });
    }

    const representatives: RepresentativeOption[] = ((repsRes.data ?? []) as any[])
      .map((r) => {
        const repCode = String(r.rep_code ?? "").trim();
        if (!repCode) return null;
        return {
          rep_code: repCode,
          display_name: repDisplayName({
            first_name: r.first_name ?? null,
            last_name: r.last_name ?? null,
            rep_code: repCode,
          }),
        };
      })
      .filter(Boolean) as RepresentativeOption[];

    const types: PoaTypeOption[] = ((typesRes.data ?? []) as any[])
      .map((t) => ({
        id: String(t.id),
        name: String(t.name ?? ""),
        base_price: Number(t.base_price ?? 0),
        is_active: !!t.is_active,
      }))
      .filter((t) => t.id && t.name);

    return NextResponse.json({ representatives, types });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "bootstrap_failed" }, { status: 500 });
  }
}

const SubmitSchema = z.object({
  representative_rep_code: z.string().min(1).transform((v) => String(v).trim()),
  representative_name: z
    .string()
    .optional()
    .nullable()
    .transform((v) => {
      const s = String(v ?? "").trim();
      return s ? s : null;
    }),
  poa_request_type_id: z.string().uuid(),
  employer_name: z.string().min(1),
  employer_tax_id: z.string().optional().nullable().transform((v) => (v ? String(v).trim() : null)),
  employer_tel: z.string().optional().nullable().transform((v) => (v ? String(v).trim() : null)),
  employer_type: z.string().optional().nullable().transform((v) => (v ? String(v).trim() : null)),
  employer_address: z.string().optional().nullable().transform((v) => (v ? String(v).trim() : null)),
  worker_count: z.coerce.number().int().min(1).optional(),
  worker_male: z.coerce.number().int().min(0).optional(),
  worker_female: z.coerce.number().int().min(0).optional(),
  worker_nation: z.string().optional().nullable().transform((v) => (v ? String(v).trim() : null)),
  worker_type: z.string().optional().nullable().transform((v) => (v ? String(v).trim() : null)),
});

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = SubmitSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const input = parsed.data;
    const admin = createSupabaseAdminClient();

    const [repRes, typeRes] = await Promise.all([
      admin
        .from("company_representatives")
        .select("rep_code,first_name,last_name")
        .eq("rep_code", input.representative_rep_code)
        .maybeSingle(),
      admin
        .from("poa_request_types")
        .select("id,name,base_price,is_active")
        .eq("id", input.poa_request_type_id)
        .single(),
    ]);

    const firstErr = repRes.error ?? typeRes.error;
    if (firstErr) {
      return NextResponse.json({ error: firstErr.message }, { status: 400 });
    }

    const repCode = String(input.representative_rep_code ?? "").trim() || null;
    const repFromDb = repRes.data as any;
    const repFirstName = String(repFromDb?.first_name ?? "").trim() || null;
    const repLastName = String(repFromDb?.last_name ?? "").trim() || null;
    const repName = repRes.data
      ? repDisplayName({ first_name: repFirstName, last_name: repLastName, rep_code: repCode })
      : (String(input.representative_name ?? "").trim() || null);

    if (!repName) {
      return NextResponse.json({ error: "rep_not_found" }, { status: 400 });
    }

    const poaTypeName = String((typeRes.data as any)?.name ?? "").trim();
    const poaBasePrice = Number((typeRes.data as any)?.base_price ?? 0);
    const poaIsActive = !!(typeRes.data as any)?.is_active;
    if (!poaIsActive) {
      return NextResponse.json({ error: "type_inactive" }, { status: 400 });
    }

    const isMouSelected = poaTypeName.toUpperCase() === "MOU";

    const maleNum = isMouSelected ? Math.max(0, Math.trunc(Number(input.worker_male ?? 0))) : 0;
    const femaleNum = isMouSelected ? Math.max(0, Math.trunc(Number(input.worker_female ?? 0))) : 0;
    const wc = isMouSelected ? Math.max(1, maleNum + femaleNum) : Math.max(1, Math.trunc(Number(input.worker_count ?? 1)));
    const male = isMouSelected ? (Number.isFinite(maleNum) ? maleNum : 0) : null;
    const female = isMouSelected ? (Number.isFinite(femaleNum) ? femaleNum : 0) : null;

    const payload: any = {
      employer_name: input.employer_name.trim(),
      employer_tax_id: input.employer_tax_id,
      employer_tel: input.employer_tel,
      employer_type: input.employer_type,
      employer_address: input.employer_address,
      worker_count: wc,
      worker_male: male,
      worker_female: female,
      worker_nation: isMouSelected ? input.worker_nation : null,
      worker_type: isMouSelected ? input.worker_type : null,
      poa_request_type_id: input.poa_request_type_id,
      status: "submitted",
      representative_profile_id: null,
      representative_rep_code: repCode,
      representative_name: repName || null,
      representative_company_name: repCode,
    };

    const { data: created, error: insErr } = await admin.from("poa_requests").insert(payload).select("id,display_id").single();
    if (insErr || !created?.id) {
      return NextResponse.json({ error: insErr?.message ?? "create_failed" }, { status: 400 });
    }

    const requestId = String((created as any).id);
    const displayId = String((created as any).display_id ?? "").trim() || null;

    const baseUnit = Number.isFinite(poaBasePrice) ? poaBasePrice : 0;
    const resolved = await resolveUnitPriceForRep({ admin, repCode, poaRequestTypeId: input.poa_request_type_id, fallbackUnit: baseUnit });
    const unit = resolved.unit;
    const total = unit * wc;
    const upsertRow = {
      poa_request_id: requestId,
      poa_request_type_id: input.poa_request_type_id,
      unit_price_per_worker: unit,
      worker_count: wc,
      total_price: total,
      payment_status: "unpaid",
    };

    const { error: itemErr } = await admin.from("poa_request_items").upsert([upsertRow], { onConflict: "poa_request_id,poa_request_type_id" });
    if (itemErr) {
      return NextResponse.json({ error: itemErr.message }, { status: 400 });
    }

    let notified = false;
    let warn: string | null = null;
    try {
      const text = `มีคำขอ POA ใหม่: ${displayId ?? requestId}${repName ? ` | ${repName}` : ""}${payload.employer_name ? ` | ${payload.employer_name}` : ""}${
        poaTypeName ? ` | ${poaTypeName}` : ""
      } | จำนวน ${wc}`;
      const recipients = await resolveRecipients({ admin, eventKey: "poa_request_created", roles: ["admin", "sale", "operation"] });
      const to = recipients.map((r) => r.line_user_id).filter((x) => !!x);
      if (to.length) {
        const sendRes = await sendLineText({ to, text });
        if (!sendRes.ok) warn = sendRes.error;
        notified = sendRes.ok;
      }
    } catch (e: any) {
      warn = e?.message ?? "notify_failed";
    }

    return NextResponse.json({ ok: true, id: requestId, reference: displayId ?? requestId, notified, warn });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "submit_failed" }, { status: 500 });
  }
}
