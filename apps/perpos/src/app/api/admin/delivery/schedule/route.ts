import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const { cron, timezone } = (body ?? {}) as { cron?: string; timezone?: string };
  if (!cron || !timezone) return NextResponse.json({ error: 'missing cron or timezone' }, { status: 400 });

  const admin = createAdminClient();

  // Get or create a news_agent_config row
  const cfgRes = await admin
    .from('news_agent_configs')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cfgRes.error) return NextResponse.json({ error: cfgRes.error.message }, { status: 500 });

  let configId = (cfgRes.data as Record<string, string> | null)?.id ?? null;
  if (!configId) {
    const ins = await admin.from('news_agent_configs').insert({}).select('id').single();
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
    configId = String((ins.data as Record<string, string>).id);
  }

  const { error } = await admin
    .from('delivery_schedules')
    .upsert(
      { news_agent_config_id: configId, cron, timezone, is_enabled: true, updated_at: new Date().toISOString() },
      { onConflict: 'news_agent_config_id' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
