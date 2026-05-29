import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '../../_lib/supabase';
import { upsertMobileToken } from '../../tmc/mobile/_lib';
import {
  handleCrmCmd, handleCrmIn, handleCrmOut, handleCrmInStatus,
  handleCrmStatus, handleCrmNotes, handleCrmIssues, handleCrmHours,
  handleCrmSolutions, handleCrmPhoto,
  crmHelpText,
} from '../../crm/_line';
import {
  handleJustMeIn, handleJustMeOut, handleJustMeLocation,
} from '../../just-me/_line';

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

// ─── Account IDs ──────────────────────────────────────────────────────────────
const ACC_SAVINGS  = 'a4ee27ea-6568-4097-abd7-a91fbf4805d0'; // กสิกร ออมทรัพย์
const ACC_CURRENT  = '273463cc-2475-439c-acfe-f054be5ffee4'; // กสิกร กระแสรายวัน

const RAB_USAGE =
  '📌 รูปแบบ: /รับ <จำนวน> [หมวด] [แปลง] [@บัญชี]\n\n' +
  'ตัวอย่าง:\n' +
  '• /รับ 31900\n' +
  '• /รับ 31900 รายรับ ค่าเช่า TMC1\n' +
  '• /รับ 5000 ค่ามัดจำ TMC7 @กระแส\n\n' +
  'หมวดรายรับ: รายรับ ค่าเช่า, ค่ามัดจำ, คืนเงินมัดจำ\n' +
  'แปลง: TMC1 TMC2 TMC3-4 TMC5 TMC6 TMC7 ส่วนกลาง\n' +
  'บัญชี: @ออม (default), @กระแส';

const JAI_USAGE =
  '📌 รูปแบบ: /จ่าย <จำนวน> [หมวด] [แปลง] [@บัญชี]\n\n' +
  'ตัวอย่าง:\n' +
  '• /จ่าย 1630 ค่าอาหาร\n' +
  '• /จ่าย 2500 ค่าแรง(เงินเดือน+จ้างนอก) ส่วนกลาง\n' +
  '• /จ่าย 800 ซักผ้า TMC1 @กระแส\n\n' +
  'หมวดรายจ่าย: ค่าอาหาร, ค่าแรง, ค่าไฟ, ค่าน้ำ, ซักผ้า\n' +
  'ล้างแอร์, ค่าของใช้ทั่วไป, ค่าใช้จ่ายอื่นๆ\n' +
  'แปลง: TMC1 TMC2 TMC3-4 TMC5 TMC6 TMC7 ส่วนกลาง\n' +
  'บัญชี: @ออม (default), @กระแส';

/** แยก @บัญชี tag ออกจาก args และ resolve accountId */
function resolveAccount(args: string[]): { accountId: string; accountLabel: string; cleanArgs: string[] } {
  const accIdx = args.findIndex(a => a.startsWith('@'));
  let accountId = ACC_SAVINGS;
  let accountLabel = 'ออมทรัพย์';
  const cleanArgs = [...args];
  if (accIdx !== -1) {
    const tag = args[accIdx].toLowerCase();
    if (tag.includes('กระแส') || tag === '@cur' || tag === '@current') {
      accountId = ACC_CURRENT;
      accountLabel = 'กระแสรายวัน';
    }
    cleanArgs.splice(accIdx, 1);
  }
  return { accountId, accountLabel, cleanArgs };
}

/** ยอดเดือนนี้ของบัญชี */
async function getMonthlyBalance(
  admin: ReturnType<typeof createAdminClient>,
  accountId?: string,
): Promise<{ income: number; expense: number; label: string }> {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  let q = admin
    .from('tmc_finance_entries')
    .select('income, expense, tmc_accounts(name)')
    .eq('org_id', TMC_ORG_ID)
    .gte('entry_date', from);

  if (accountId) {
    q = q.eq('account_id', accountId) as typeof q;
  } else {
    q = q.neq('account_id', '2366c3f9-dcc5-4091-8ab0-c421b77e7fe7') as typeof q; // ไม่รวมเงินสดย่อย
  }

  const { data } = await q;
  const rows = (data ?? []) as { income: number | null; expense: number | null }[];
  const income  = rows.reduce((s, r) => s + Number(r.income  ?? 0), 0);
  const expense = rows.reduce((s, r) => s + Number(r.expense ?? 0), 0);

  const month = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  return { income, expense, label: month };
}

async function handleTmcRab(
  admin: ReturnType<typeof createAdminClient>,
  args: string[], profileId: string, replyToken: string,
) {
  if (!args[0]) return replyText(replyToken, `❌ ยังไม่ระบุจำนวนเงิน\n\n${RAB_USAGE}`);
  const amount = parseFloat(args[0]);
  if (isNaN(amount)) return replyText(replyToken, `❌ "${args[0]}" ไม่ใช่ตัวเลข\n\n${RAB_USAGE}`);
  if (amount <= 0)   return replyText(replyToken, `❌ จำนวนเงินต้องมากกว่า 0\n\n${RAB_USAGE}`);

  const { accountId, accountLabel, cleanArgs } = resolveAccount(args.slice(1));
  const category     = cleanArgs[0] ?? 'รายรับ ค่าเช่า';
  const propertyCode = cleanArgs[1] ?? 'ส่วนกลาง';

  const { data: prop } = await admin
    .from('tmc_properties').select('id').eq('org_id', TMC_ORG_ID).eq('code', propertyCode).maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  await admin.from('tmc_finance_entries').insert({
    org_id:        TMC_ORG_ID,
    account_id:    accountId,
    entry_date:    today,
    description:   `[LINE] รายรับ ${category} ${propertyCode}`,
    category,
    property_id:   prop?.id ?? null,
    property_code: propertyCode,
    income:        amount,
    created_by:    profileId,
  });

  const bal = await getMonthlyBalance(admin, accountId);
  return replyText(replyToken,
    `✅ บันทึกรายรับ +${amount.toLocaleString('th-TH')} บาท\n` +
    `หมวด: ${category}\nแปลง: ${propertyCode}\nบัญชี: ${accountLabel}\n\n` +
    `📊 ${bal.label}:\n` +
    `รายรับ: ${bal.income.toLocaleString('th-TH')} บาท\n` +
    `รายจ่าย: ${bal.expense.toLocaleString('th-TH')} บาท\n` +
    `สุทธิ: ${(bal.income - bal.expense).toLocaleString('th-TH')} บาท`,
  );
}

async function handleTmcJai(
  admin: ReturnType<typeof createAdminClient>,
  args: string[], profileId: string, replyToken: string,
) {
  if (!args[0]) return replyText(replyToken, `❌ ยังไม่ระบุจำนวนเงิน\n\n${JAI_USAGE}`);
  const amount = parseFloat(args[0]);
  if (isNaN(amount)) return replyText(replyToken, `❌ "${args[0]}" ไม่ใช่ตัวเลข\n\n${JAI_USAGE}`);
  if (amount <= 0)   return replyText(replyToken, `❌ จำนวนเงินต้องมากกว่า 0\n\n${JAI_USAGE}`);

  const { accountId, accountLabel, cleanArgs } = resolveAccount(args.slice(1));
  const category     = cleanArgs[0] ?? 'ค่าใช้จ่ายอื่นๆ';
  const propertyCode = cleanArgs[1] ?? 'ส่วนกลาง';

  const { data: prop } = await admin
    .from('tmc_properties').select('id').eq('org_id', TMC_ORG_ID).eq('code', propertyCode).maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  await admin.from('tmc_finance_entries').insert({
    org_id:        TMC_ORG_ID,
    account_id:    accountId,
    entry_date:    today,
    description:   `[LINE] รายจ่าย ${category} ${propertyCode}`,
    category,
    property_id:   prop?.id ?? null,
    property_code: propertyCode,
    expense:       amount,
    created_by:    profileId,
  });

  const bal = await getMonthlyBalance(admin, accountId);
  return replyText(replyToken,
    `✅ บันทึกรายจ่าย -${amount.toLocaleString('th-TH')} บาท\n` +
    `หมวด: ${category}\nแปลง: ${propertyCode}\nบัญชี: ${accountLabel}\n\n` +
    `📊 ${bal.label}:\n` +
    `รายรับ: ${bal.income.toLocaleString('th-TH')} บาท\n` +
    `รายจ่าย: ${bal.expense.toLocaleString('th-TH')} บาท\n` +
    `สุทธิ: ${(bal.income - bal.expense).toLocaleString('th-TH')} บาท`,
  );
}

/** /บัญชี [สรุป|ออม|กระแส] — ดูยอดบัญชีเดือนนี้ */
async function handleTmcBill(
  admin: ReturnType<typeof createAdminClient>,
  args: string[], replyToken: string,
) {
  const sub = args[0]?.toLowerCase() ?? '';
  const isGra = sub.includes('กระแส') || sub === 'cur';
  const isOom = sub.includes('ออม')   || sub === 'sav';

  if (isGra || isOom) {
    // แสดงเฉพาะบัญชีนั้น
    const accountId = isGra ? ACC_CURRENT : ACC_SAVINGS;
    const label     = isGra ? 'กระแสรายวัน' : 'ออมทรัพย์';
    const bal = await getMonthlyBalance(admin, accountId);
    return replyText(replyToken,
      `🏦 บัญชี ${label} — ${bal.label}\n\n` +
      `รายรับ:  ${bal.income.toLocaleString('th-TH')} บาท\n` +
      `รายจ่าย: ${bal.expense.toLocaleString('th-TH')} บาท\n` +
      `─────────────────\n` +
      `สุทธิ:   ${(bal.income - bal.expense).toLocaleString('th-TH')} บาท`,
    );
  }

  // สรุปทั้งหมด (ทุกบัญชียกเว้นเงินสดย่อย)
  const [oom, gra] = await Promise.all([
    getMonthlyBalance(admin, ACC_SAVINGS),
    getMonthlyBalance(admin, ACC_CURRENT),
  ]);
  const pettyBal = await (async () => {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const { data } = await admin
      .from('tmc_petty_cash_txns')
      .select('txn_type, amount')
      .eq('org_id', TMC_ORG_ID)
      .gte('txn_date', from);
    const rows = (data ?? []) as { txn_type: string; amount: number }[];
    const exp = rows.filter(r => r.txn_type === 'expense').reduce((s, r) => s + Number(r.amount), 0);
    return exp;
  })();

  const totalIn  = oom.income + gra.income;
  const totalOut = oom.expense + gra.expense + pettyBal;

  return replyText(replyToken,
    `📊 สรุปบัญชี TMC — ${oom.label}\n\n` +
    `🏦 ออมทรัพย์\n` +
    `  รับ ${oom.income.toLocaleString('th-TH')} / จ่าย ${oom.expense.toLocaleString('th-TH')}\n` +
    `  สุทธิ ${(oom.income - oom.expense).toLocaleString('th-TH')} บาท\n\n` +
    `🏦 กระแสรายวัน\n` +
    `  รับ ${gra.income.toLocaleString('th-TH')} / จ่าย ${gra.expense.toLocaleString('th-TH')}\n` +
    `  สุทธิ ${(gra.income - gra.expense).toLocaleString('th-TH')} บาท\n\n` +
    `💵 เงินสดย่อย จ่าย ${pettyBal.toLocaleString('th-TH')} บาท\n\n` +
    `─────────────────\n` +
    `รายรับรวม:  ${totalIn.toLocaleString('th-TH')} บาท\n` +
    `รายจ่ายรวม: ${totalOut.toLocaleString('th-TH')} บาท\n` +
    `สุทธิรวม:   ${(totalIn - totalOut).toLocaleString('th-TH')} บาท\n\n` +
    `💡 /บัญชี ออม  หรือ  /บัญชี กระแส`,
  );
}

// ─── Stock usage strings ──────────────────────────────────────────────────────

const STK_IN_USAGE =
  '📌 รูปแบบ: /stkin <ชื่อสินค้า> <จำนวน> [แปลง]\n\n' +
  'ตัวอย่าง:\n' +
  '• /stkin ผ้าขนหนู 20\n' +
  '• /stkin สบู่ 50 TMC1\n' +
  '• /stkin น้ำยาซักผ้า 10 ส่วนกลาง\n\n' +
  'แปลง: TMC1 TMC2 TMC3-4 TMC5 TMC6 TMC7 ส่วนกลาง';

const STK_OUT_USAGE =
  '📌 รูปแบบ: /stkout <ชื่อสินค้า> <จำนวน> [แปลง]\n\n' +
  'ตัวอย่าง:\n' +
  '• /stkout ผ้าขนหนู 5\n' +
  '• /stkout สบู่ 3 TMC2\n' +
  '• /stkout กระดาษชำระ 2 TMC7\n\n' +
  'แปลง: TMC1 TMC2 TMC3-4 TMC5 TMC6 TMC7 ส่วนกลาง';

// ─── Push multicast helper ────────────────────────────────────────────────────

async function pushLineToUsers(lineUserIds: string[], text: string) {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? '';
  if (!token || !lineUserIds.length) return;
  // LINE multicast supports up to 500 recipients per call
  const chunks: string[][] = [];
  for (let i = 0; i < lineUserIds.length; i += 500) {
    chunks.push(lineUserIds.slice(i, i + 500));
  }
  for (const chunk of chunks) {
    await fetch('https://api.line.me/v2/bot/message/multicast', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ to: chunk, messages: [{ type: 'text', text }] }),
    });
  }
}

/** ดึง line_user_id ของสมาชิก TMC ทุกคนที่ผูก LINE แล้ว */
async function getTmcLineUserIds(admin: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const { data } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', TMC_ORG_ID);
  if (!data?.length) return [];

  const userIds = (data as { user_id: string }[]).map(m => m.user_id);
  const { data: profiles } = await admin
    .from('profiles')
    .select('line_user_id')
    .in('id', userIds)
    .not('line_user_id', 'is', null);

  return (profiles as { line_user_id: string }[] | null)?.map(p => p.line_user_id).filter(Boolean) ?? [];
}

/** ตรวจสต๊อกหลัง movement — ถ้าถึงขั้นต่ำให้ push แจ้งเตือน */
async function checkAndAlertLowStock(
  admin: ReturnType<typeof createAdminClient>,
  itemId: string,
) {
  const { data: item } = await admin
    .from('tmc_stock_items')
    .select('name, unit, current_qty, min_quantity')
    .eq('id', itemId)
    .single();

  if (!item) return;
  const { name, unit, current_qty, min_quantity } = item as {
    name: string; unit: string; current_qty: number; min_quantity: number;
  };
  if (min_quantity <= 0 || current_qty > min_quantity) return;

  const lineIds = await getTmcLineUserIds(admin);
  if (!lineIds.length) return;

  await pushLineToUsers(lineIds,
    `⚠️ แจ้งเตือน: สินค้าใกล้หมด!\n\n` +
    `📦 ${name}\n` +
    `คงเหลือ: ${current_qty} ${unit}\n` +
    `ขั้นต่ำ: ${min_quantity} ${unit}\n\n` +
    `กรุณาสั่งซื้อเพิ่ม`,
  );
}

// ─── Shared: record a stock movement & return updated item ────────────────────

type StockMovResult = {
  ok: boolean;
  item?: { id: string; name: string; unit: string; current_qty: number; min_quantity: number };
  error?: string;
};

async function recordStockMovement(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  itemName: string,
  movType: 'in' | 'out',
  qty: number,
  propertyCode: string | null,
  profileId: string,
): Promise<StockMovResult> {
  // ค้นหาสินค้าด้วยชื่อ (partial match)
  const { data: item } = await admin
    .from('tmc_stock_items')
    .select('id, name, current_qty, unit, min_quantity')
    .eq('org_id', orgId)
    .ilike('name', `%${itemName}%`)
    .eq('is_active', true)
    .order('name')
    .limit(1)
    .maybeSingle();

  if (!item) {
    return { ok: false, error: `❌ ไม่พบสินค้า "${itemName}"\nลองใช้ชื่อย่อหรือบางส่วนของชื่อ\nดูรายการทั้งหมด: /stk` };
  }

  const { data: prop } = propertyCode
    ? await admin.from('tmc_properties').select('id').eq('org_id', orgId).eq('code', propertyCode).maybeSingle()
    : { data: null };

  const { error: movErr } = await admin.from('tmc_stock_movements').insert({
    org_id: orgId,
    item_id: item.id,
    movement_type: movType,
    quantity: qty,
    property_id: prop?.id ?? null,
    property_code: propertyCode,
    created_by: profileId,
  });
  if (movErr) return { ok: false, error: `❌ บันทึกไม่สำเร็จ: ${movErr.message}` };

  // อ่านค่า current_qty ล่าสุด
  const { data: updated } = await admin
    .from('tmc_stock_items')
    .select('id, name, unit, current_qty, min_quantity')
    .eq('id', (item as { id: string }).id)
    .single();

  return { ok: true, item: updated as StockMovResult['item'] };
}

// ─── /stkin — รับสินค้าเข้า ───────────────────────────────────────────────────
async function handleStkIn(
  admin: ReturnType<typeof createAdminClient>,
  args: string[], profileId: string, replyToken: string,
) {
  if (!args[0]) return replyText(replyToken, `❌ ยังไม่ระบุชื่อสินค้า\n\n${STK_IN_USAGE}`);

  const itemName    = args[0];
  const qty         = parseFloat(args[1] ?? '');
  const propertyCode = args[2]?.trim() || null;

  if (!args[1] || isNaN(qty)) return replyText(replyToken, `❌ ยังไม่ระบุจำนวน\n\n${STK_IN_USAGE}`);
  if (qty <= 0) return replyText(replyToken, `❌ จำนวนต้องมากกว่า 0\n\n${STK_IN_USAGE}`);

  const validProps = ['TMC1','TMC2','TMC3-4','TMC5','TMC6','TMC7','ส่วนกลาง'];
  if (propertyCode && !validProps.includes(propertyCode)) {
    return replyText(replyToken, `❌ แปลง "${propertyCode}" ไม่ถูกต้อง\nแปลงที่ใช้ได้: ${validProps.join(', ')}\n\n${STK_IN_USAGE}`);
  }

  const result = await recordStockMovement(admin, TMC_ORG_ID, itemName, 'in', qty, propertyCode, profileId);
  if (!result.ok || !result.item) return replyText(replyToken, result.error ?? '❌ บันทึกไม่สำเร็จ');

  const { name, unit, current_qty, min_quantity } = result.item;
  const lowWarn = min_quantity > 0 && current_qty <= min_quantity
    ? `\n⚠️ สินค้าคงเหลือถึงขั้นต่ำ (${min_quantity} ${unit})` : '';

  return replyText(replyToken,
    `✅ รับสินค้าเข้า +${qty} ${unit}\n` +
    `📦 ${name}\n` +
    (propertyCode ? `แปลง: ${propertyCode}\n` : '') +
    `คงเหลือ: ${current_qty} ${unit}${lowWarn}`,
  );
}

// ─── /stkout — เบิกสินค้าออก ─────────────────────────────────────────────────
async function handleStkOut(
  admin: ReturnType<typeof createAdminClient>,
  args: string[], profileId: string, replyToken: string,
) {
  if (!args[0]) return replyText(replyToken, `❌ ยังไม่ระบุชื่อสินค้า\n\n${STK_OUT_USAGE}`);

  const itemName     = args[0];
  const qty          = parseFloat(args[1] ?? '');
  const propertyCode = args[2]?.trim() || null;

  if (!args[1] || isNaN(qty)) return replyText(replyToken, `❌ ยังไม่ระบุจำนวน\n\n${STK_OUT_USAGE}`);
  if (qty <= 0) return replyText(replyToken, `❌ จำนวนต้องมากกว่า 0\n\n${STK_OUT_USAGE}`);

  const validProps = ['TMC1','TMC2','TMC3-4','TMC5','TMC6','TMC7','ส่วนกลาง'];
  if (propertyCode && !validProps.includes(propertyCode)) {
    return replyText(replyToken, `❌ แปลง "${propertyCode}" ไม่ถูกต้อง\nแปลงที่ใช้ได้: ${validProps.join(', ')}\n\n${STK_OUT_USAGE}`);
  }

  const result = await recordStockMovement(admin, TMC_ORG_ID, itemName, 'out', qty, propertyCode, profileId);
  if (!result.ok || !result.item) return replyText(replyToken, result.error ?? '❌ บันทึกไม่สำเร็จ');

  const { name, unit, current_qty, min_quantity } = result.item;
  const isLow = min_quantity > 0 && current_qty <= min_quantity;
  const lowWarn = isLow ? `\n⚠️ สินค้าใกล้หมด! (ขั้นต่ำ ${min_quantity} ${unit})` : '';

  await replyText(replyToken,
    `✅ เบิกสินค้าออก -${qty} ${unit}\n` +
    `📦 ${name}\n` +
    (propertyCode ? `แปลง: ${propertyCode}\n` : '') +
    `คงเหลือ: ${current_qty} ${unit}${lowWarn}`,
  );

  // push alert ถ้าถึงขั้นต่ำ
  if (isLow) {
    await checkAndAlertLowStock(admin, result.item.id);
  }
}

// ─── /stk — ดูรายการสต๊อก ────────────────────────────────────────────────────
async function handleStkBal(
  admin: ReturnType<typeof createAdminClient>,
  replyToken: string,
) {
  const { data: items } = await admin
    .from('tmc_stock_items')
    .select('name, unit, current_qty, min_quantity')
    .eq('org_id', TMC_ORG_ID)
    .eq('is_active', true)
    .order('name');

  if (!items?.length) return replyText(replyToken, '❌ ยังไม่มีรายการสินค้าในคลัง');

  type Item = { name: string; unit: string; current_qty: number; min_quantity: number };
  const list = items as Item[];

  // เรียงใกล้หมดขึ้นก่อน
  list.sort((a, b) => {
    const aLow = a.min_quantity > 0 && a.current_qty <= a.min_quantity ? 0 : 1;
    const bLow = b.min_quantity > 0 && b.current_qty <= b.min_quantity ? 0 : 1;
    return aLow - bLow || a.name.localeCompare(b.name);
  });

  const lines = list.map(i => {
    const isLow = i.min_quantity > 0 && i.current_qty <= i.min_quantity;
    const icon = isLow ? '⚠️' : '✅';
    return `${icon} ${i.name}: ${i.current_qty} ${i.unit}`;
  });

  const lowCount = list.filter(i => i.min_quantity > 0 && i.current_qty <= i.min_quantity).length;
  const header = lowCount > 0
    ? `📦 สต๊อกคลัง (⚠️ ใกล้หมด ${lowCount} รายการ):\n\n`
    : `📦 สต๊อกคลัง (${list.length} รายการ):\n\n`;

  return replyText(replyToken, header + lines.join('\n'));
}

// ─── (compat) /stock รับ|ออก — เรียกใช้ shared helper ───────────────────────
async function handleTmcStock(
  admin: ReturnType<typeof createAdminClient>,
  subCmd: string, args: string[], profileId: string, replyToken: string,
) {
  const itemName    = args[0] ?? '';
  const qty         = parseFloat(args[1] ?? '');
  const propertyCode = args[2] ?? null;
  if (!itemName || !qty || isNaN(qty)) {
    return replyText(replyToken,
      '❌ รูปแบบไม่ถูกต้อง\n\n' +
      `${subCmd === 'รับ' ? STK_IN_USAGE : STK_OUT_USAGE}`,
    );
  }
  const movType: 'in' | 'out' = subCmd === 'รับ' ? 'in' : 'out';
  const result = await recordStockMovement(admin, TMC_ORG_ID, itemName, movType, qty, propertyCode, profileId);
  if (!result.ok || !result.item) return replyText(replyToken, result.error ?? '❌ บันทึกไม่สำเร็จ');

  const { name, unit, current_qty, min_quantity } = result.item;
  const isLow = min_quantity > 0 && current_qty <= min_quantity;
  await replyText(replyToken,
    `✅ ${subCmd === 'รับ' ? 'รับเข้า' : 'เบิกออก'} ${name} ${qty} ${unit}\n` +
    (propertyCode ? `แปลง: ${propertyCode}\n` : '') +
    `คงเหลือ: ${current_qty} ${unit}` +
    (isLow ? `\n⚠️ สินค้าใกล้หมด!` : ''),
  );
  if (isLow && movType === 'out') {
    await checkAndAlertLowStock(admin, result.item.id);
  }
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
    '📖 คำสั่ง TMC Management\n\n' +
    '─── 💰 บัญชีการเงิน ───\n' +
    '/รับ <จำนวน> [หมวด] [แปลง] [@บัญชี]\n' +
    '  → บันทึกรายรับลงบัญชี\n' +
    '/จ่าย <จำนวน> [หมวด] [แปลง] [@บัญชี]\n' +
    '  → บันทึกรายจ่ายลงบัญชี\n' +
    '/บัญชี         — สรุปยอดทั้งหมดเดือนนี้\n' +
    '/บัญชี ออม    — เฉพาะออมทรัพย์\n' +
    '/บัญชี กระแส  — เฉพาะกระแสรายวัน\n\n' +
    '@บัญชี: @ออม (default) / @กระแส\n\n' +
    '─── 💵 เงินสดย่อย ───\n' +
    '/pcin <จำนวน> [รายการ]  — เติมเงิน\n' +
    '/pcout <จำนวน> <รายการ> [หมวด] [แปลง]\n' +
    '/pcbal   — ยอดคงเหลือ\n\n' +
    '─── 📦 Stock ───\n' +
    '/stkin <ชื่อ> <จำนวน> [แปลง]\n' +
    '/stkout <ชื่อ> <จำนวน> [แปลง]\n' +
    '/stk   — ดูสต๊อกทั้งหมด\n\n' +
    '─── 🏠 เข้าพัก ───\n' +
    '/เช็คอิน <ชื่อ> <แปลง> <วันออก> [ยอด]\n' +
    '/tmc   — ลิงก์บันทึกเข้าพัก\n\n' +
    'แปลง: TMC1 TMC5 TMC7 ส่วนกลาง ฯลฯ',
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
  const { data } = await admin.from('profiles').select('id, role, line_active_org_id').eq('line_user_id', lineUserId).maybeSingle();
  return data as { id: string; role: string; line_active_org_id: string | null } | null;
}

type OrgInfo = { id: string; name: string; slug: string };

type OrgMembership = { organization_id: string; role: string; organizations: OrgInfo };

async function getUserOrgs(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<OrgMembership[]> {
  const { data } = await admin
    .from('organization_members')
    .select('organization_id, role, organizations(id, name, slug)')
    .eq('user_id', profileId)
    .order('created_at');
  return (data ?? []) as unknown as OrgMembership[];
}

async function getOrSetActiveOrg(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  currentActiveOrgId: string | null,
): Promise<OrgInfo | null> {
  const orgs = await getUserOrgs(admin, profileId);
  if (!orgs.length) return null;

  if (currentActiveOrgId) {
    const current = orgs.find(m => m.organization_id === currentActiveOrgId);
    if (current) return current.organizations;
  }

  // Auto-set to first org the user joined
  const first = orgs[0];
  await admin.from('profiles').update({ line_active_org_id: first.organization_id }).eq('id', profileId);
  return first.organizations;
}

async function handleOrgCmd(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  args: string[],
  replyToken: string,
) {
  const orgs = await getUserOrgs(admin, profileId);
  if (!orgs.length) {
    return replyText(replyToken, '❌ ยังไม่ได้เข้าร่วม Organization ใดๆ\nติดต่อผู้ดูแลระบบเพื่อเชิญเข้า org');
  }

  if (!args[0]) {
    const lines = orgs.map((m, i) => `${i + 1}. ${m.organizations.name}`);
    return replyText(replyToken,
      `🏢 Organizations ของคุณ (${orgs.length}):\n\n${lines.join('\n')}\n\n` +
      `พิมพ์ /org <หมายเลข> เพื่อเปลี่ยน\nเช่น /org 1`,
    );
  }

  const n = parseInt(args[0]);
  if (isNaN(n) || n < 1 || n > orgs.length) {
    return replyText(replyToken, `❌ หมายเลขไม่ถูกต้อง ต้องอยู่ระหว่าง 1-${orgs.length}`);
  }

  const selected = orgs[n - 1];
  await admin.from('profiles').update({ line_active_org_id: selected.organization_id }).eq('id', profileId);
  return replyText(replyToken, `✅ เปลี่ยน org เป็น: ${selected.organizations.name}`);
}

async function checkPermission(admin: ReturnType<typeof createAdminClient>, profileId: string, key: string, role: string): Promise<boolean> {
  if (role === 'super_admin') return true;
  const { data } = await admin.from('user_permissions').select('allowed').eq('user_id', profileId).eq('function_key', key).maybeSingle();
  return Boolean((data as Record<string, unknown> | null)?.allowed);
}

// ─── Main webhook handler ─────────────────────────────────────────────────────

const TMC_CMDS = ['รับ', 'จ่าย', 'บัญชี', 'stock', 'stkin', 'stkout', 'stk', 'เช็คอิน', 'pcin', 'pcout', 'pcbal', 'pcfunds', 'tmc'];
const CRM_CMDS = ['n', 'survey', 'issue', 'mtg', 'log', 'in', 'out', 'sol', 'status', 'notes', 'issues', 'hours'];

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

    const replyToken  = String(event.replyToken ?? '');
    const source      = event.source as Record<string, string>;
    const lineUserId  = source?.userId ?? '';

    // ─── Image messages — CRM photo attachment ──────────────────────────────
    if (msg.type === 'image') {
      const messageId = String(msg.id ?? '');
      if (lineUserId && messageId) {
        const imgProfile = await getProfileByLineId(admin, lineUserId);
        if (imgProfile) {
          await handleCrmPhoto(admin, lineUserId, messageId, imgProfile.id, replyToken);
        }
      }
      continue;
    }

    // ─── Location messages — Clock In/Out ───────────────────────────────────
    if (msg.type === 'location') {
      const title     = String(msg.title ?? '');
      const address   = String(msg.address ?? '');
      const latitude  = Number(msg.latitude);
      const longitude = Number(msg.longitude);

      if (lineUserId) {
        const locProfile = await getProfileByLineId(admin, lineUserId);
        if (locProfile) {
          const activeOrg = await getOrSetActiveOrg(admin, locProfile.id, locProfile.line_active_org_id);
          if (activeOrg) {
            // Check if just_me is enabled
            const { data: moduleSetting } = await admin
              .from('org_module_settings')
              .select('is_enabled')
              .eq('organization_id', activeOrg.id)
              .eq('module_key', 'just_me')
              .maybeSingle();

            if (moduleSetting?.is_enabled) {
              await handleJustMeLocation(
                admin,
                { latitude, longitude, address, title },
                lineUserId,
                locProfile.id,
                activeOrg.id,
                replyToken,
              );
              continue;
            }
          }
        }
      }
      continue;
    }

    if (msg.type !== 'text') continue;

    const text = String(msg.text ?? '').trim();

    if (!text.startsWith('/')) continue;

    const [cmd, ...args] = text.slice(1).split(' ');

    // /link <token> — no auth needed
    if (cmd === 'link' && args[0]) {
      await handleLink(admin, lineUserId, args[0], replyToken);
      continue;
    }

    // All other commands require a linked profile
    const profile = await getProfileByLineId(admin, lineUserId);
    if (!profile) {
      await replyText(replyToken,
        '❌ ยังไม่ได้ผูกบัญชี LINE\n' +
        'ไปที่ "ตั้งค่าโปรไฟล์" ในระบบ PERPOS แล้วกด "ผูกบัญชี LINE"',
      );
      continue;
    }

    // /org [N] — list or switch active organization
    if (cmd === 'org') {
      await handleOrgCmd(admin, profile.id, args, replyToken);
      continue;
    }

    // Resolve active org (auto-sets on first use)
    const activeOrg = await getOrSetActiveOrg(admin, profile.id, profile.line_active_org_id);

    // /help — org-aware
    if (cmd === 'help') {
      if (activeOrg?.id === TMC_ORG_ID) {
        await handleTmcHelp(replyToken);
      } else {
        await replyText(replyToken,
          `📖 คำสั่ง PERPOS\n` +
          `🏢 Org: ${activeOrg?.name ?? 'ไม่มี'}\n\n` +
          `─── 📋 งาน ───\n` +
          `/t <งาน>  — บันทึกงาน\n` +
          `/tk  — รายการงานที่รอ\n` +
          `/d <N>  — ปิดงานที่ N\n\n` +
          `─── 💰 การเงินส่วนตัว ───\n` +
          `/รายรับ <จำนวน> [โน้ต]\n` +
          `/รายจ่าย <จำนวน> [โน้ต]\n\n` +
          `─── 📰 ข่าว ───\n` +
          `/ข่าว  — ข่าวสรุป\n\n` +
          crmHelpText() + '\n\n' +
          `/org  — ดู/เปลี่ยน Organization`,
        );
      }
      continue;
    }

    // ─── Org-specific commands (TMC) ─────────────────────────────────────────
    if (TMC_CMDS.includes(cmd)) {
      if (!activeOrg || activeOrg.id !== TMC_ORG_ID) {
        await replyText(replyToken,
          `❌ org ปัจจุบัน "${activeOrg?.name ?? 'ไม่มี'}" ไม่รองรับคำสั่งนี้\n` +
          `พิมพ์ /org เพื่อดูและเปลี่ยน org`,
        );
        continue;
      }

      if (cmd === 'tmc' && args[0] === 'help') { await handleTmcHelp(replyToken); continue; }

      if (cmd === 'tmc' && !args[0]) {
        const token = await upsertMobileToken(profile.id, TMC_ORG_ID);
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://app.perpos.io';
        await replyText(replyToken,
          `🏠 บันทึกการเข้าพัก TMC\n\n` +
          `${baseUrl}/tmc/checkin?t=${token}\n\n` +
          `⏱️ ลิงก์นี้ใช้ได้ 7 วัน\n` +
          `💡 กด "บันทึกรายการใหม่" ในหน้าถัดไปหลังบันทึก\n` +
          `    เพื่อรับลิงก์แก้ไขสำหรับรายการนั้น`,
        );
        continue;
      }

      if (cmd === 'รับ')    { await handleTmcRab(admin, args, profile.id, replyToken);  continue; }
      if (cmd === 'จ่าย')   { await handleTmcJai(admin, args, profile.id, replyToken);  continue; }
      if (cmd === 'บัญชี')  { await handleTmcBill(admin, args, replyToken);             continue; }
      if (cmd === 'stock') {
        const subCmd = args[0] ?? '';
        if (!['รับ', 'ออก'].includes(subCmd)) {
          await replyText(replyToken, '❌ ใช้ /stock รับ หรือ /stock ออก');
        } else {
          await handleTmcStock(admin, subCmd, args.slice(1), profile.id, replyToken);
        }
        continue;
      }
      if (cmd === 'stkin')   { await handleStkIn(admin, args, profile.id, replyToken);  continue; }
      if (cmd === 'stkout')  { await handleStkOut(admin, args, profile.id, replyToken); continue; }
      if (cmd === 'stk')     { await handleStkBal(admin, replyToken);                   continue; }
      if (cmd === 'เช็คอิน') { await handleTmcCheckin(admin, args, profile.id, replyToken); continue; }
      if (cmd === 'pcin')    { await handlePcIn(admin, args, profile.id, replyToken);   continue; }
      if (cmd === 'pcout')   { await handlePcOut(admin, args, profile.id, replyToken);  continue; }
      if (cmd === 'pcbal')   { await handlePcBal(admin, replyToken);                    continue; }
      if (cmd === 'pcfunds') { await handlePcFunds(admin, replyToken);                  continue; }
    }

    // ─── CRM commands (/n /survey /issue /mtg /log /in /out) ────────────────
    if (CRM_CMDS.includes(cmd)) {
      // /in status — no org needed
      if (cmd === 'in' && args[0] === 'status') {
        await handleCrmInStatus(admin, lineUserId, replyToken);
        continue;
      }

      if (!activeOrg) {
        await replyText(replyToken, '❌ ยังไม่มี Organization\nพิมพ์ /org เพื่อตั้งค่า');
        continue;
      }

      // Fetch profile name (shared by note commands + /out)
      const { data: pdata } = await admin
        .from('profiles')
        .select('display_name, email')
        .eq('id', profile.id)
        .maybeSingle();
      const profileName = (pdata as { display_name?: string; email?: string } | null)?.display_name
        || (pdata as { display_name?: string; email?: string } | null)?.email
        || 'Someone';

      // Check if just_me is enabled for the active org
      const { data: justMeSetting } = await admin
        .from('org_module_settings')
        .select('is_enabled')
        .eq('organization_id', activeOrg.id)
        .eq('module_key', 'just_me')
        .maybeSingle();

      if (justMeSetting?.is_enabled) {
        if (cmd === 'in') {
          await handleJustMeIn(admin, lineUserId, profile.id, activeOrg.id, replyToken);
          continue;
        }
        if (cmd === 'out') {
          await handleJustMeOut(admin, lineUserId, profile.id, activeOrg.id, replyToken);
          continue;
        }
      }

      if (cmd === 'in') {
        await handleCrmIn(admin, args, lineUserId, profile.id, profile.role, activeOrg.id, replyToken);
        continue;
      }

      if (cmd === 'out') {
        await handleCrmOut(admin, args, lineUserId, profile.id, profileName, replyToken);
        continue;
      }

      // Phase D — query commands
      if (cmd === 'sol') {
        await handleCrmSolutions(admin, args, profile.id, profile.role, activeOrg.id, replyToken);
        continue;
      }
      if (cmd === 'status') {
        await handleCrmStatus(admin, args, profile.id, profile.role, activeOrg.id, replyToken);
        continue;
      }
      if (cmd === 'notes') {
        await handleCrmNotes(admin, args, profile.id, profile.role, activeOrg.id, replyToken);
        continue;
      }
      if (cmd === 'issues') {
        await handleCrmIssues(admin, profile.id, profile.role, activeOrg.id, replyToken);
        continue;
      }
      if (cmd === 'hours') {
        await handleCrmHours(admin, args, profile.id, activeOrg.id, replyToken);
        continue;
      }

      // /n /survey /issue /mtg /log
      await handleCrmCmd(admin, cmd, args, profile.id, profileName, profile.role, activeOrg.id, replyToken);
      continue;
    }

    // ─── Personal commands (all orgs, permission-gated) ───────────────────────

    if (cmd === 'ข่าว') {
      if (!await checkPermission(admin, profile.id, 'bot.news.request', profile.role)) {
        await replyText(replyToken, '❌ ไม่มีสิทธิ์ใช้คำสั่งนี้'); continue;
      }
      await replyText(replyToken, '⏳ กำลังดึงข่าว...');
      continue;
    }

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
