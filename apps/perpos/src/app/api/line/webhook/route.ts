import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '../../_lib/supabase';

// ─── TMC Org ID (TMC Management) ─────────────────────────────────────────────
const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';

// ─── TMC LINE helpers ─────────────────────────────────────────────────────────

async function getTmcMembership(admin: ReturnType<typeof createAdminClient>, profileId: string) {
  const { data } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', TMC_ORG_ID)
    .eq('user_id', profileId)
    .maybeSingle();
  return data as { role: string } | null;
}

async function handleTmcRab(
  admin: ReturnType<typeof createAdminClient>,
  args: string[], profileId: string, replyToken: string,
) {
  // /รับ <จำนวน> <หมวด> <แปลง> [บัญชี]
  // e.g. /รับ 31900 "รายรับ ค่าเช่า" TMC1
  const amount = parseFloat(args[0] ?? '');
  if (!amount || isNaN(amount)) return replyText(replyToken, '❌ ระบุจำนวนเงิน เช่น /รับ 31900 "รายรับ ค่าเช่า" TMC1');
  const category = args[1] ?? 'รายรับ ค่าเช่า';
  const propertyCode = args[2] ?? 'ส่วนกลาง';

  // Default to กสิกร ออมทรัพย์
  const { data: account } = await admin
    .from('tmc_accounts').select('id').eq('org_id', TMC_ORG_ID).eq('account_type', 'savings').maybeSingle();
  const { data: prop } = await admin
    .from('tmc_properties').select('id').eq('org_id', TMC_ORG_ID).eq('code', propertyCode).maybeSingle();

  await admin.from('tmc_finance_entries').insert({
    org_id: TMC_ORG_ID,
    account_id: account?.id,
    entry_date: new Date().toISOString().slice(0, 10),
    description: `[LINE] รายรับ ${category} ${propertyCode}`,
    category,
    property_id: prop?.id ?? null,
    property_code: propertyCode,
    income: amount,
    created_by: profileId,
  });
  return replyText(replyToken, `✅ บันทึกรายรับ ${amount.toLocaleString('th-TH')} บาท\nหมวด: ${category} | แปลง: ${propertyCode}`);
}

async function handleTmcJai(
  admin: ReturnType<typeof createAdminClient>,
  args: string[], profileId: string, replyToken: string,
) {
  // /จ่าย <จำนวน> <หมวด> <แปลง>
  const amount = parseFloat(args[0] ?? '');
  if (!amount || isNaN(amount)) return replyText(replyToken, '❌ ระบุจำนวนเงิน เช่น /จ่าย 1630 ค่าอาหาร ส่วนกลาง');
  const category = args[1] ?? 'ค่าใช้จ่ายอื่นๆ';
  const propertyCode = args[2] ?? 'ส่วนกลาง';

  const { data: account } = await admin
    .from('tmc_accounts').select('id').eq('org_id', TMC_ORG_ID).eq('account_type', 'savings').maybeSingle();
  const { data: prop } = await admin
    .from('tmc_properties').select('id').eq('org_id', TMC_ORG_ID).eq('code', propertyCode).maybeSingle();

  await admin.from('tmc_finance_entries').insert({
    org_id: TMC_ORG_ID,
    account_id: account?.id,
    entry_date: new Date().toISOString().slice(0, 10),
    description: `[LINE] รายจ่าย ${category} ${propertyCode}`,
    category,
    property_id: prop?.id ?? null,
    property_code: propertyCode,
    expense: amount,
    created_by: profileId,
  });
  return replyText(replyToken, `✅ บันทึกรายจ่าย ${amount.toLocaleString('th-TH')} บาท\nหมวด: ${category} | แปลง: ${propertyCode}`);
}

async function handleTmcStock(
  admin: ReturnType<typeof createAdminClient>,
  subCmd: string, args: string[], profileId: string, replyToken: string,
) {
  // /stock ออก <ชื่อของ> <จำนวน> [แปลง]
  // /stock รับ <ชื่อของ> <จำนวน>
  const itemName = args[0] ?? '';
  const qty = parseFloat(args[1] ?? '');
  const propertyCode = args[2] ?? null;
  if (!itemName || !qty || isNaN(qty)) {
    return replyText(replyToken, '❌ เช่น /stock ออก ผ้าขนหนู 5 TMC1\n   /stock รับ สบู่ 20');
  }

  // Find or create item
  let { data: item } = await admin
    .from('tmc_stock_items').select('id, name, current_qty, unit')
    .eq('org_id', TMC_ORG_ID).ilike('name', itemName).maybeSingle();

  if (!item) {
    const { data: created } = await admin.from('tmc_stock_items')
      .insert({ org_id: TMC_ORG_ID, name: itemName, unit: 'ชิ้น' })
      .select('id, name, current_qty, unit').single();
    item = created;
  }
  if (!item) return replyText(replyToken, '❌ ไม่สามารถเพิ่มรายการสินค้าได้');

  const movType = subCmd === 'รับ' ? 'in' : 'out';
  const { data: prop } = propertyCode
    ? await admin.from('tmc_properties').select('id').eq('org_id', TMC_ORG_ID).eq('code', propertyCode).maybeSingle()
    : { data: null };

  await admin.from('tmc_stock_movements').insert({
    org_id: TMC_ORG_ID,
    item_id: item.id,
    movement_type: movType,
    quantity: qty,
    property_id: prop?.id ?? null,
    property_code: propertyCode,
    created_by: profileId,
  });

  // Read updated qty
  const { data: updated } = await admin.from('tmc_stock_items').select('current_qty').eq('id', item.id).single();
  const newQty = (updated as Record<string, number> | null)?.current_qty ?? 0;
  return replyText(replyToken,
    `✅ ${subCmd === 'รับ' ? 'รับเข้า' : 'เบิกออก'} ${item.name} ${qty} ${item.unit}\n` +
    `${propertyCode ? `แปลง: ${propertyCode}\n` : ''}` +
    `คงเหลือ: ${newQty} ${item.unit}`,
  );
}

async function handleTmcCheckin(
  admin: ReturnType<typeof createAdminClient>,
  args: string[], profileId: string, replyToken: string,
) {
  // /เช็คอิน <ชื่อ> <แปลง> <วันออก> [ยอด] [ช่องทาง]
  // e.g. /เช็คอิน คุณวชิราภรณ์ TMC7 2026-05-22 31900 Line
  const firstName = args[0] ?? '';
  const propertyCode = args[1] ?? '';
  const checkOut = args[2] ?? '';
  if (!firstName || !propertyCode || !checkOut) {
    return replyText(replyToken, '❌ เช่น /เช็คอิน คุณวชิราภรณ์ TMC7 2026-05-22 31900 Line');
  }
  const roomRate = args[3] ? parseFloat(args[3]) : null;
  const channel = args[4] ?? 'Line';
  const today = new Date().toISOString().slice(0, 10);

  const { data: prop } = await admin
    .from('tmc_properties').select('id').eq('org_id', TMC_ORG_ID).eq('code', propertyCode).maybeSingle();

  // Upsert guest (no tel from LINE)
  const { data: guest } = await admin.from('tmc_guests')
    .insert({ org_id: TMC_ORG_ID, first_name: firstName })
    .select('id').single();

  await admin.from('tmc_stays').insert({
    org_id: TMC_ORG_ID,
    guest_id: guest?.id ?? null,
    property_id: prop?.id ?? null,
    property_code: propertyCode,
    check_in: today,
    check_out: checkOut,
    booking_channel: channel,
    stay_type: roomRate ? 'paid' : 'free',
    room_rate: roomRate,
    created_by: profileId,
  });

  return replyText(replyToken,
    `✅ บันทึกเช็คอิน\n` +
    `ลูกค้า: ${firstName}\nแปลง: ${propertyCode}\n` +
    `วันออก: ${checkOut}` +
    (roomRate ? `\nยอด: ${roomRate.toLocaleString('th-TH')} บาท` : ''),
  );
}

async function handleTmcHelp(replyToken: string) {
  return replyText(replyToken,
    '📖 คำสั่ง TMC Management:\n\n' +
    '💰 บัญชี:\n' +
    '/รับ <จำนวน> <หมวด> <แปลง>\n' +
    '/จ่าย <จำนวน> <หมวด> <แปลง>\n\n' +
    '📦 Stock:\n' +
    '/stock รับ <ของ> <จำนวน> [แปลง]\n' +
    '/stock ออก <ของ> <จำนวน> [แปลง]\n\n' +
    '🏠 เข้าพัก:\n' +
    '/เช็คอิน <ชื่อ> <แปลง> <วันออก> [ยอด] [ช่องทาง]\n\n' +
    'แปลง: TMC1 TMC5 TMC7 ส่วนกลาง\n' +
    'หมวดรายรับ: รายรับ ค่าเช่า, ค่ามัดจำ\n' +
    'หมวดรายจ่าย: ค่าอาหาร, ค่าแรง, ซักผ้า, ค่าไฟ ฯลฯ',
  );
}

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
      await replyText(replyToken, '📖 คำสั่งที่ใช้ได้:\n/ข่าว\n/รายรับ <จำนวน> <โน้ต>\n/รายจ่าย <จำนวน> <โน้ต>\n/t <งาน>\n/tk\n/d <N>\n\nสำหรับ TMC:\n/tmc help');
      continue;
    }

    // ─── TMC Commands (/รับ /จ่าย /stock /เช็คอิน /tmc) ───────────────────────
    if (cmd === 'tmc' && args[0] === 'help') {
      await handleTmcHelp(replyToken);
      continue;
    }

    if (['รับ', 'จ่าย', 'stock', 'เช็คอิน'].includes(cmd)) {
      const profile = await getProfileByLineId(admin, lineUserId);
      if (!profile) {
        await replyText(replyToken, '❌ ยังไม่ได้ผูกบัญชี LINE กรุณาใช้ /link <token>');
        continue;
      }
      const tmcMember = await getTmcMembership(admin, profile.id);
      if (!tmcMember) {
        await replyText(replyToken, '❌ ไม่มีสิทธิ์ใช้งาน TMC Management');
        continue;
      }

      if (cmd === 'รับ') { await handleTmcRab(admin, args, profile.id, replyToken); continue; }
      if (cmd === 'จ่าย') { await handleTmcJai(admin, args, profile.id, replyToken); continue; }
      if (cmd === 'stock') {
        const subCmd = args[0] ?? '';
        if (!['รับ', 'ออก'].includes(subCmd)) {
          await replyText(replyToken, '❌ ใช้ /stock รับ หรือ /stock ออก');
        } else {
          await handleTmcStock(admin, subCmd, args.slice(1), profile.id, replyToken);
        }
        continue;
      }
      if (cmd === 'เช็คอิน') { await handleTmcCheckin(admin, args, profile.id, replyToken); continue; }
    }
    // ─────────────────────────────────────────────────────────────────────────

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
