import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '../../_lib/supabase';

// ─── Signature ────────────────────────────────────────────────────────────────

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.LINE_MESSAGING_CHANNEL_SECRET ?? '';
  if (!secret || !signature) return false;
  const computed = crypto.createHmac('sha256', secret).update(body).digest('base64');
  try {
    const a = Buffer.from(computed);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

// ─── LINE push helper ─────────────────────────────────────────────────────────

async function replyLine(replyToken: string, messages: unknown[]) {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? '';
  if (!token) return;
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ replyToken, messages }),
  });
}

function replyText(replyToken: string, text: string) {
  return replyLine(replyToken, [{ type: 'text', text }]);
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function handleLink(admin: ReturnType<typeof createAdminClient>, lineUserId: string, token: string, replyToken: string) {
  const now = new Date().toISOString();
  const { data: row } = await admin
    .from('line_link_tokens')
    .select('profile_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle();

  if (!row) return replyText(replyToken, '❌ Token ไม่ถูกต้อง');
  if (row.used_at) return replyText(replyToken, '❌ Token นี้ถูกใช้แล้ว');
  if (new Date(row.expires_at) < new Date()) return replyText(replyToken, '❌ Token หมดอายุแล้ว');

  await admin.from('profiles').update({ line_user_id: lineUserId }).eq('id', row.profile_id);
  await admin.from('line_link_tokens').update({ used_at: now }).eq('token', token);
  return replyText(replyToken, '✅ ผูกบัญชี LINE สำเร็จแล้ว!');
}

async function getProfileByLineId(admin: ReturnType<typeof createAdminClient>, lineUserId: string) {
  const { data } = await admin.from('profiles').select('id, role').eq('line_user_id', lineUserId).maybeSingle();
  return data as { id: string; role: string } | null;
}

async function checkPermission(admin: ReturnType<typeof createAdminClient>, profileId: string, key: string, role: string): Promise<boolean> {
  if (role === 'admin') return true;
  const { data } = await admin.from('user_permissions').select('allowed').eq('user_id', profileId).eq('function_key', key).maybeSingle();
  return Boolean((data as Record<string, unknown> | null)?.allowed);
}

// ─── Main webhook handler ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-line-signature');

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const parsed = JSON.parse(rawBody) as { events: Record<string, unknown>[] };
  const admin = createAdminClient();

  for (const event of parsed.events ?? []) {
    if (event.type !== 'message') continue;
    const msg = event.message as Record<string, unknown>;
    if (msg.type !== 'text') continue;

    const replyToken = String(event.replyToken ?? '');
    const source = event.source as Record<string, string>;
    const lineUserId = source?.userId ?? '';
    const text = String(msg.text ?? '').trim();

    if (!text.startsWith('/')) continue;

    const [cmd, ...args] = text.slice(1).split(' ');

    // /link <token> — no auth needed
    if (cmd === 'link' && args[0]) {
      await handleLink(admin, lineUserId, args[0], replyToken);
      continue;
    }

    // /help
    if (cmd === 'help') {
      await replyText(replyToken, '📖 คำสั่งที่ใช้ได้:\n/ข่าว\n/รายรับ <จำนวน> <โน้ต>\n/รายจ่าย <จำนวน> <โน้ต>\n/t <งาน>\n/tk\n/d <N>');
      continue;
    }

    const profile = await getProfileByLineId(admin, lineUserId);
    if (!profile) {
      await replyText(replyToken, '❌ ยังไม่ได้ผูกบัญชี LINE กรุณาใช้ /link <token>');
      continue;
    }

    // /ข่าว
    if (cmd === 'ข่าว') {
      if (!await checkPermission(admin, profile.id, 'bot.news.request', profile.role)) {
        await replyText(replyToken, '❌ ไม่มีสิทธิ์ใช้คำสั่งนี้'); continue;
      }
      await replyText(replyToken, '⏳ กำลังดึงข่าว...');
      continue;
    }

    // /รายรับ <จำนวน> <โน้ต>
    if (cmd === 'รายรับ' || cmd === 'รายจ่าย') {
      const permKey = cmd === 'รายรับ' ? 'bot.finance.income_add' : 'bot.finance.expense_add';
      if (!await checkPermission(admin, profile.id, permKey, profile.role)) {
        await replyText(replyToken, '❌ ไม่มีสิทธิ์ใช้คำสั่งนี้'); continue;
      }
      const amount = parseFloat(args[0] ?? '');
      if (!amount || isNaN(amount)) { await replyText(replyToken, '❌ ระบุจำนวนเงินให้ถูกต้อง'); continue; }
      const note = args.slice(1).join(' ') || '';
      await admin.from('finance_entries').insert({ profile_id: profile.id, entry_type: cmd === 'รายรับ' ? 'income' : 'expense', amount, note });
      await replyText(replyToken, `✅ บันทึก${cmd} ${amount.toLocaleString('th-TH')} บาท${note ? ` (${note})` : ''}`);
      continue;
    }

    // /t <งาน>
    if (cmd === 't') {
      if (!await checkPermission(admin, profile.id, 'bot.assistant.tasks', profile.role)) {
        await replyText(replyToken, '❌ ไม่มีสิทธิ์ใช้คำสั่งนี้'); continue;
      }
      const title = args.join(' ').trim();
      if (!title) { await replyText(replyToken, '❌ ระบุชื่องาน เช่น /t ติดต่อลูกค้า'); continue; }
      await admin.from('tasks').insert({ profile_id: profile.id, title, status: 'pending', priority: 'medium' });
      await replyText(replyToken, `✅ บันทึกงาน: ${title}`);
      continue;
    }

    // /tk — list pending tasks
    if (cmd === 'tk') {
      if (!await checkPermission(admin, profile.id, 'bot.assistant.tasks', profile.role)) {
        await replyText(replyToken, '❌ ไม่มีสิทธิ์ใช้คำสั่งนี้'); continue;
      }
      const { data: tasks } = await admin.from('tasks').select('title').eq('profile_id', profile.id).eq('status', 'pending').order('created_at').limit(10);
      if (!tasks?.length) { await replyText(replyToken, '✅ ไม่มีงานที่รออยู่'); continue; }
      const lines = tasks.map((t: Record<string, string>, i: number) => `${i + 1}. ${t.title}`);
      await replyText(replyToken, `📋 งานที่รอ:\n${lines.join('\n')}`);
      continue;
    }

    // /d <N> — done task N
    if (cmd === 'd') {
      if (!await checkPermission(admin, profile.id, 'bot.assistant.tasks', profile.role)) {
        await replyText(replyToken, '❌ ไม่มีสิทธิ์ใช้คำสั่งนี้'); continue;
      }
      const n = parseInt(args[0] ?? '');
      if (!n || isNaN(n)) { await replyText(replyToken, '❌ ระบุหมายเลขงาน เช่น /d 1'); continue; }
      const { data: tasks } = await admin.from('tasks').select('id, title').eq('profile_id', profile.id).eq('status', 'pending').order('created_at').limit(20);
      const target = tasks?.[n - 1] as Record<string, string> | undefined;
      if (!target) { await replyText(replyToken, `❌ ไม่พบงานที่ ${n}`); continue; }
      await admin.from('tasks').update({ status: 'completed' }).eq('id', target.id);
      await replyText(replyToken, `✅ ปิดงาน: ${target.title}`);
      continue;
    }
  }

  return NextResponse.json({ ok: true });
}
