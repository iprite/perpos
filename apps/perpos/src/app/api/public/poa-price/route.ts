import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const repCode = String(url.searchParams.get("rep_code") ?? "").trim();
    const typeId = String(url.searchParams.get("poa_request_type_id") ?? "").trim();
    if (!repCode || !typeId) {
      return NextResponse.json({ error: "missing_params" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const [typeRes, ovRes] = await Promise.all([
      admin.from("poa_request_types").select("id,base_price,is_active").eq("id", typeId).single(),
      admin
        .from("poa_request_type_rep_price_overrides")
        .select("unit_price_per_worker,active")
        .eq("rep_code", repCode)
        .eq("poa_request_type_id", typeId)
        .maybeSingle(),
    ]);

    const firstErr = typeRes.error ?? ovRes.error;
    if (firstErr) return NextResponse.json({ error: firstErr.message }, { status: 400 });

    const type = typeRes.data as any;
    if (!type?.is_active) return NextResponse.json({ error: "type_inactive" }, { status: 400 });

    const baseUnit = Number(type?.base_price ?? 0);
    const ov = ovRes.data as any;
    const canUseOverride = !!ov?.active && Number.isFinite(Number(ov?.unit_price_per_worker));
    const unit = canUseOverride ? Number(ov.unit_price_per_worker) : baseUnit;

    return NextResponse.json({ ok: true, unit_price_per_worker: unit, source: canUseOverride ? "override" : "default" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "resolve_failed" }, { status: 500 });
  }
}
