import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';

const BKK = 'Asia/Bangkok';

function bkkHourMin(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BKK, hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { hour, minute };
}

async function pushLine(accessToken: string, to: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  });
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  const cronErr = requireCron(req);
  if (cronErr) return cronErr;

  const admin = createAdminClient();
  const now = new Date();
  const { hour, minute } = bkkHourMin(now);
  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? '';
  if (!accessToken) return NextResponse.json({ ok: false, error: 'LINE token not configured' });

  // 1. Due reminders — remind_at within the last 5 minutes
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const { data: dueTasks } = await admin
    .from('tasks')
    .select('id, title, profile_id, remind_at, profiles(line_user_id)')
    .eq('status', 'pending')
    .lte('remind_at', now.toISOString())
    .gte('remind_at', fiveMinAgo);

  for (const task of (dueTasks ?? []) as Record<string, unknown>[]) {
    const lineId = (task.profiles as Record<string, string> | null)?.line_user_id;
    if (!lineId) continue;
    await pushLine(accessToken, lineId, `⏰ แจ้งเตือน: ${String(task.title)}`);
    await admin.from('tasks').update({ remind_at: null }).eq('id', task.id);
  }

  // 2. Daily briefing at 08:00–08:04 BKK
  if (hour === 8 && minute <= 4) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, line_user_id, display_name')
      .not('line_user_id', 'is', null)
      .eq('is_active', true);

    for (const p of (profiles ?? []) as Record<string, string>[]) {
      const { data: tasks } = await admin
        .from('tasks')
        .select('title, priority, due_at')
        .eq('profile_id', p.id)
        .eq('status', 'pending')
        .order('due_at', { ascending: true })
        .limit(5);

      if (!tasks?.length) continue;
      const lines = tasks.map((t: Record<string, string>, i: number) =>
        `${i + 1}. ${t.title}${t.due_at ? ` (${new Date(t.due_at).toLocaleDateString('th-TH')})` : ''}`,
      );
      await pushLine(accessToken, p.line_user_id, `🌅 สวัสดีตอนเช้า ${p.display_name ?? ''}\n\nงานที่รออยู่:\n${lines.join('\n')}`);
    }
  }

  // 3. Follow-up at 17:00–17:04 BKK
  if (hour === 17 && minute <= 4) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, line_user_id, display_name')
      .not('line_user_id', 'is', null)
      .eq('is_active', true);

    for (const p of (profiles ?? []) as Record<string, string>[]) {
      const { data: tasks } = await admin
        .from('tasks')
        .select('title')
        .eq('profile_id', p.id)
        .eq('status', 'in_progress')
        .limit(5);

      if (!tasks?.length) continue;
      const lines = tasks.map((t: Record<string, string>, i: number) => `${i + 1}. ${t.title}`);
      await pushLine(accessToken, p.line_user_id, `🌆 ช่วงเย็น — งานที่กำลังทำ:\n${lines.join('\n')}`);
    }
  }

  return NextResponse.json({ ok: true });
}
