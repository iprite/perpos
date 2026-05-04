import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertCallerIsAdmin } from "../../users/_utils";

export const runtime = "nodejs";

const BodySchema = z.object({
  cron: z.string().min(1),
  timezone: z.string().min(1).default("Asia/Bangkok"),
});

export async function PUT(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: "missing_supabase_admin_env", message: String(e?.message ?? "") }, { status: 500 });
  }

  const cfgRes = await admin.from("news_agent_configs").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (cfgRes.error) return NextResponse.json({ error: cfgRes.error.message }, { status: 400 });
  let configId = (cfgRes.data as any)?.id as string | null;
  if (!configId) {
    const ins = await admin.from("news_agent_configs").insert({}).select("id").single();
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
    configId = String((ins.data as any).id);
  }

  const schedRes = await admin
    .from("delivery_schedules")
    .upsert(
      {
        news_agent_config_id: configId,
        cron: parsed.data.cron,
        timezone: parsed.data.timezone,
        is_enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "news_agent_config_id" },
    )
    .select("id")
    .single();

  if (schedRes.error) return NextResponse.json({ error: schedRes.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: String((schedRes.data as any).id) });
}

