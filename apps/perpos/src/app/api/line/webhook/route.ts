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

const RAB_USAGE =
  '📌 รูปแบบ: /รับ <จำนวน> [หมวด] [แปลง]\n\n' +
  'ตัวอย่าง:\n' +
  '• /รับ 31900\n' +
  '• /รับ 31900 รายรับ ค่าเช่า TMC1\n' +
  '• /รับ 5000 ค่ามัดจำ TMC7\n\n' +
  'หมวดรายรับ: รายรับ ค่าเช่า, ค่ามัดจำ, คืนเงินมัดจำ\n' +
  'แปลง: TMC1 TMC2 TMC3-4 TMC5 TMC6 TMC7 ส่วนกลาง';

const JAI_USAGE =
  '📌 รูปแบบ: /จ่าย <จำนวน> [หมวด] [แปลง]\n\n' +
  'ตัวอย่าง:\n' +
  '• /จ่าย 1630 ค่าอาหาร\n' +
  '• /จ่าย 2500 ค่าแรง(เงินเดือน+จ้างนอก) ส่วนกลาง\n' +
  '• /จ่าย 800 ซักผ้า TMC1\n\n' +
  'หมวดรายจ่าย: ค่าอาหาร, ค่าแรง, ค่าไฟ, ค่าน้ำ, ซักผ้า\n' +
  'ล้างแอร์, ค่าของใช้ทั่วไป, ค่าใช้จ่ายอื่นๆ\n' +
  'แปลง: TMC1 TMC2 TMC3-4 TMC5 TMC6 TMC7 ส่วนกลาง';

async function handleTmcRab(
  admin: ReturnType<typeof createAdminClient>,
  args: string[], profileId: string, replyToken: string,
) {
  if (!args[0]) return replyText(replyToken, `❌ ยังไม่ระบุจำนวนเงิน\n\n${RAB_USAGE}`);
  const amount = parseFloat(args[0]);
  if (isNaN(amount)) return replyText(replyToken, `❌ "${args[0]}" ไม่ใช่ตัวเลข\n\n${RAB_USAGE}`);
  if (amount <= 0)   return replyText(replyToken, `❌ จำนวนเงินต้องมากกว่า 0\n\n${RAB_USAGE}`);
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
  if (!args[0]) return replyText(replyToken, `❌ ยังไม่ระบุจำนวนเงิน\n\n${JAI_USAGE}`);
  const amount = parseFloat(args[0]);
  if (isNaN(amount)) return replyText(replyToken, `❌ "${args[0]}" ไม่ใช่ตัวเลข\n\n${JAI_USAGE}`);
  if (amount <= 0)   return replyText(replyToken, `❌ จำนวนเงินต้องมากกว่า 0\n\n${JAI_USAGE}`);
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
    '💰 บัญชีหลัก:\n' +
    '/รับ <จำนวน> <หมวด> <แปลง>\n' +
    '/จ่าย <จำนวน> <หมวด> <แปลง>\n\n' +
    '💵 เงินสดย่อย:\n' +
    '/pcin <จำนวน> [รายการ]\n' +
    '/pcout <จำนวน> <รายการ> [หมวด] [แปลง]\n' +
    '/pcbal  — ดูยอดคงเหลือ\n' +
    '/pcfunds — รายชื่อกระเป๋า\n\n' +
    '📦 Stock:\n' +
    '/stock รับ <ของ> <จำนวน> [แปลง]\n' +
    '/stock ออก <ของ> <จำนวน> [แปลง]\n\n' +
    '🏠 เข้าพัก:\n' +
    '/เช็คอิน <ชื่อ> <แปลง> <วันออก> [ยอด] [ช่องทาง]\n\n' +
    'แปลง: TMC1 TMC5 TMC7 ส่วนกลาง\n' +
    'หมวดรายจ่าย: ค่าอาหาร, ค่าของใช้, ซักผ้า, ค่าไฟ ฯลฯ',
  );
}

// ─── Petty Cash helpers ───────────────────────────────────────────────────────

/** ดึงกระเป๋าแรก (active) ของ TMC org — ถ้ามีหลายกระเป๋า ให้ระบุชื่อ */
async function getDefaultFund(
  admin: ReturnType<typeof createAdminClient>,
  fundHint?: string,
) {
  let q = admin
    .from('tmc_petty_cash_funds')
    .select('id, name')
    .eq('org_id', TMC_ORG_ID)
    .eq('is_active', true)
    .order('created_at');

  if (fundHint) {
    q = q.ilike('name', `%${fundHint}%`) as typeof q;
  }
  const { data } = await q.limit(1).maybeSingle();
  return data as { id: string; name: string } | null;
}

const PC_IN_USAGE =
  '📌 รูปแบบ: /pcin <จำนวน> [รายการ]\n\n' +
  'ตัวอย่าง:\n' +
  '• /pcin 1000\n' +
  '• /pcin 1000 เติมรอบสัปดาห์\n' +
  '• /pcin 500 รับเงินคืนค่าของ';

const PC_OUT_USAGE =
  '📌 รูปแบบ: /pcout <จำนวน> <รายการ> [หมวด] [แปลง]\n\n' +
  'ตัวอย่าง:\n' +
  '• /pcout 150 ซื้อน้ำดื่ม\n' +
  '• /pcout 300 ซื้อสบู่ ค่าของใช้\n' +
  '• /pcout 80 ค่ารถ ค่าส่งของ TMC1\n\n' +
  'หมวดที่ใช้บ่อย:\n' +
  'ค่าอาหาร, ค่าของใช้, ค่าส่งของ\n' +
  'ซักผ้า, ค่าไฟ, ค่าใช้จ่ายอื่นๆ\n\n' +
  'แปลง: TMC1 TMC2 TMC3-4 TMC5 TMC6 TMC7 ส่วนกลาง';

/** เติมเงินสดย่อย: /pcin <amount> [description] */
async function handlePcIn(
  admin: ReturnType<typeof createAdminClient>,
  args: string[], profileId: string, replyToken: string,
) {
  // ไม่มี args เลย
  if (!args[0]) {
    return replyText(replyToken, `❌ ยังไม่ระบุจำนวนเงิน\n\n${PC_IN_USAGE}`);
  }

  const amount = parseFloat(args[0]);
  if (isNaN(amount)) {
    return replyText(replyToken, `❌ "${args[0]}" ไม่ใช่ตัวเลข กรุณาระบุจำนวนเงินเป็นตัวเลข\n\n${PC_IN_USAGE}`);
  }
  if (amount <= 0) {
    return replyText(replyToken, `❌ จำนวนเงินต้องมากกว่า 0\n\n${PC_IN_USAGE}`);
  }

  const description = args.slice(1).join(' ').trim() || 'เติมเงินสดย่อย';

  const fund = await getDefaultFund(admin);
  if (!fund) {
    return replyText(replyToken,
      '❌ ยังไม่มีกระเป๋าเงินสดย่อย\n' +
      'กรุณาสร้างกระเป๋าในระบบ PERPOS ก่อน\n' +
      'หรือพิมพ์ /pcfunds เพื่อตรวจสอบ',
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await admin.from('tmc_petty_cash_txns').insert({
    fund_id:     fund.id,
    org_id:      TMC_ORG_ID,
    txn_date:    today,
    txn_type:    'top_up',
    amount,
    description: `[LINE] ${description}`,
    created_by:  profileId,
  });

  if (error) return replyText(replyToken, `❌ บันทึกไม่สำเร็จ: ${error.message}`);

  const bal = await getFundBalance(admin, fund.id);
  return replyText(replyToken,
    `✅ เติมเงินสดย่อย +${amount.toLocaleString('th-TH')} บาท\n` +
    `รายการ: ${description}\n` +
    `กระเป๋า: ${fund.name}\n` +
    `💰 คงเหลือ: ${bal.toLocaleString('th-TH')} บาท`,
  );
}

/** ใช้เงินสดย่อย: /pcout <amount> <description> [category] [property_code] */
async function handlePcOut(
  admin: ReturnType<typeof createAdminClient>,
  args: string[], profileId: string, replyToken: string,
) {
  // ไม่มี args เลย
  if (!args[0]) {
    return replyText(replyToken, `❌ ยังไม่ระบุจำนวนเงิน\n\n${PC_OUT_USAGE}`);
  }

  const amount = parseFloat(args[0]);
  if (isNaN(amount)) {
    return replyText(replyToken, `❌ "${args[0]}" ไม่ใช่ตัวเลข กรุณาระบุจำนวนเงินเป็นตัวเลข\n\n${PC_OUT_USAGE}`);
  }
  if (amount <= 0) {
    return replyText(replyToken, `❌ จำนวนเงินต้องมากกว่า 0\n\n${PC_OUT_USAGE}`);
  }

  const description = args[1]?.trim() || '';
  if (!description) {
    return replyText(replyToken, `❌ ยังไม่ระบุรายการ (ต้องระบุว่าซื้ออะไร/ใช้จ่ายอะไร)\n\n${PC_OUT_USAGE}`);
  }

  const category     = args[2]?.trim() || null;
  const propertyCode = args[3]?.trim() || null;

  // ตรวจ propertyCode ถ้าระบุมาว่าถูกต้องไหม
  const validProps = ['TMC1','TMC2','TMC3-4','TMC5','TMC6','TMC7','ส่วนกลาง'];
  if (propertyCode && !validProps.includes(propertyCode)) {
    return replyText(replyToken,
      `❌ แปลง "${propertyCode}" ไม่ถูกต้อง\n` +
      `แปลงที่ใช้ได้: ${validProps.join(', ')}\n\n${PC_OUT_USAGE}`,
    );
  }

  const fund = await getDefaultFund(admin);
  if (!fund) {
    return replyText(replyToken,
      '❌ ยังไม่มีกระเป๋าเงินสดย่อย\n' +
      'กรุณาสร้างกระเป๋าในระบบ PERPOS ก่อน',
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await admin.from('tmc_petty_cash_txns').insert({
    fund_id:       fund.id,
    org_id:        TMC_ORG_ID,
    txn_date:      today,
    txn_type:      'expense',
    amount,
    description:   `[LINE] ${description}`,
    category,
    property_code: propertyCode,
    created_by:    profileId,
  });

  if (error) return replyText(replyToken, `❌ บันทึกไม่สำเร็จ: ${error.message}`);

  const bal = await getFundBalance(admin, fund.id);
  return replyText(replyToken,
    `✅ บันทึกใช้เงินสดย่อย -${amount.toLocaleString('th-TH')} บาท\n` +
    `รายการ: ${description}\n` +
    (category     ? `หมวด: ${category}\n`    : '') +
    (propertyCode ? `แปลง: ${propertyCode}\n` : '') +
    `กระเป๋า: ${fund.name}\n` +
    `💰 คงเหลือ: ${bal.toLocaleString('th-TH')} บาท`,
  );
}

/** ดูยอดคงเหลือ: /pcbal */
async function handlePcBal(
  admin: ReturnType<typeof createAdminClient>,
  replyToken: string,
) {
  const { data: funds } = await admin
    .from('tmc_petty_cash_funds')
    .select('id, name')
    .eq('org_id', TMC_ORG_ID)
    .eq('is_active', true)
    .order('created_at');

  if (!funds?.length) {
    return replyText(replyToken, '❌ ยังไม่มีกระเป๋าเงินสดย่อย');
  }

  const lines: string[] = ['💰 ยอดเงินสดย่อย:\n'];
  for (const f of funds as { id: string; name: string }[]) {
    const bal = await getFundBalance(admin, f.id);
    lines.push(`${f.name}: ${bal.toLocaleString('th-TH')} บาท`);
  }
  return replyText(replyToken, lines.join('\n'));
}

/** รายชื่อกระเป๋า: /pcfunds */
async function handlePcFunds(
  admin: ReturnType<typeof createAdminClient>,
  replyToken: string,
) {
  const { data: funds } = await admin
    .from('tmc_petty_cash_funds')
    .select('id, name, note')
    .eq('org_id', TMC_ORG_ID)
    .eq('is_active', true)
    .order('created_at');

  if (!funds?.length) {
    return replyText(replyToken,
      '❌ ยังไม่มีกระเป๋าเงินสดย่อย\nสร้างกระเป๋าได้ที่เมนู "เงินสดย่อย" ใน PERPOS',
    );
  }

  const lines = (funds as { id: string; name: string; note: string | null }[])
    .map((f, i) => `${i + 1}. ${f.name}${f.note ? ` (${f.note})` : ''}`);

  return replyText(replyToken,
    `📋 กระเป๋าเงินสดย่อย (${funds.length} กระเป๋า):\n\n` +
    lines.join('\n') + '\n\n' +
    'ใช้ /pcin หรือ /pcout เพื่อบันทึกรายการ',
  );
}

/** คำนวณยอดคงเหลือของกระเป๋า */
async function getFundBalance(
  admin: ReturnType<typeof createAdminClient>,
  fundId: string,
): Promise<number> {
  const { data } = await admin
    .from('tmc_petty_cash_txns')
    .select('txn_type, amount')
    .eq('fund_id', fundId);

  if (!data) return 0;
  return (data as { txn_type: string; amount: number }[]).reduce((sum, t) => {
    return sum + (t.txn_type === 'top_up' ? t.amount : -t.amount);
  }, 0);
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
      await replyText(replyToken,
        '📖 คำสั่งทั่วไป:\n' +
        '/รายรับ <จำนวน> [โน้ต]\n' +
        '/รายจ่าย <จำนวน> [โน้ต]\n' +
        '/t <งาน>  — บันทึก task\n' +
        '/tk       — รายการ task\n' +
        '/d <N>    — ปิด task\n\n' +
        '💵 TMC เงินสดย่อย:\n' +
        '/pcin <จำนวน> [รายการ]\n' +
        '/pcout <จำนวน> <รายการ> [หมวด] [แปลง]\n' +
        '/pcbal    — ยอดคงเหลือ\n' +
        '/pcfunds  — รายชื่อกระเป๋า\n\n' +
        '📖 TMC ทั้งหมด: /tmc help',
      );
      continue;
    }

    // ─── TMC Commands (/รับ /จ่าย /stock /เช็คอิน /tmc) ───────────────────────
    if (cmd === 'tmc' && args[0] === 'help') {
      await handleTmcHelp(replyToken);
      continue;
    }

    if (['รับ', 'จ่าย', 'stock', 'เช็คอิน', 'pcin', 'pcout', 'pcbal', 'pcfunds'].includes(cmd)) {
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

      // ── Petty Cash ──────────────────────────────────────────────────────────
      if (cmd === 'pcin')    { await handlePcIn(admin, args, profile.id, replyToken);   continue; }
      if (cmd === 'pcout')   { await handlePcOut(admin, args, profile.id, replyToken);  continue; }
      if (cmd === 'pcbal')   { await handlePcBal(admin, replyToken);                    continue; }
      if (cmd === 'pcfunds') { await handlePcFunds(admin, replyToken);                  continue; }
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
