import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '../../_lib/supabase';
import { triggerSttWorker } from '@/lib/assistant/stt-trigger';
import { sendLineMessages } from '@/lib/line/send-messages';
import { upsertMobileToken } from '../../tmc/mobile/_lib';
import {
  handleCrmCmd, handleCrmIn, handleCrmOut, handleCrmInStatus,
  handleCrmStatus, handleCrmNotes, handleCrmIssues, handleCrmHours,
  handleCrmSolutions, handleCrmPhoto,
  crmHelpText,
} from '../../crm/_line';
import {
  handleJustMeClock,
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

async function handleJaquarStock(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  args: string[],
  replyToken: string,
) {
  const search = args.join(' ').trim();
  if (!search) {
    return replyText(
      replyToken,
      `📌 รูปแบบ: /jq <รหัสสินค้า หรือ คำค้นหา>\n` +
      `ตัวอย่าง: /jq JQ-101`
    );
  }

  // ค้นหาสินค้าจาก jaquar_inventory_items
  const { data: items, error } = await admin
    .from('jaquar_inventory_items')
    .select('item_code, description, location, total_saleable')
    .eq('org_id', orgId)
    .or(`item_code.ilike.%${search}%,description.ilike.%${search}%`)
    .order('item_code', { ascending: true })
    .limit(50);

  if (error) {
    return replyText(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูล: ${error.message}`);
  }

  if (!items || items.length === 0) {
    return replyText(replyToken, `❌ ไม่พบสินค้าสำหรับคำค้นหา "${search}"`);
  }

  // กรณีพบ 1 รายการ
  if (items.length === 1) {
    const item = items[0];
    const qty = Number(item.total_saleable || 0);

    let qtyColor = '#059669'; // เขียว (in_stock)
    let qtyStatusText = '🟢 สต๊อกพร้อมขาย';
    if (qty === 0) {
      qtyColor = '#DC2626'; // แดง (out_of_stock)
      qtyStatusText = '🔴 สินค้าหมด';
    } else if (qty < 5) {
      qtyColor = '#D97706'; // ส้ม (low_stock)
      qtyStatusText = '⚠️ สต๊อกใกล้หมด';
    }

    return replyLine(replyToken, [{
      type: 'flex',
      altText: `ข้อมูลสินค้า ${item.item_code}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          background: {
            type: 'linearGradient',
            angle: '135deg',
            startColor: '#1E293B',
            endColor: '#334155'
          },
          contents: [
            {
              type: 'text',
              text: '📦 ข้อมูลสินค้า / STOCK',
              weight: 'bold',
              color: '#94A3B8',
              size: 'xs'
            },
            {
              type: 'text',
              text: item.item_code,
              weight: 'bold',
              size: 'xl',
              color: '#FFFFFF',
              margin: 'xs',
              wrap: true
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          spacing: 'md',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              spacing: 'xs',
              contents: [
                {
                  type: 'text',
                  text: 'รายละเอียด',
                  size: 'xs',
                  color: '#64748B'
                },
                {
                  type: 'text',
                  text: item.description || 'ไม่มีรายละเอียด',
                  size: 'sm',
                  color: '#1E293B',
                  wrap: true
                }
              ]
            },
            {
              type: 'separator'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '📍 ที่เก็บสินค้า',
                  size: 'sm',
                  color: '#64748B',
                  flex: 2
                },
                {
                  type: 'text',
                  text: item.location || 'ไม่ระบุ',
                  size: 'sm',
                  color: '#1E293B',
                  weight: 'bold',
                  flex: 3,
                  align: 'end',
                  wrap: true
                }
              ]
            },
            {
              type: 'separator'
            },
            {
              type: 'box',
              layout: 'horizontal',
              alignItems: 'center',
              contents: [
                {
                  type: 'text',
                  text: qtyStatusText,
                  size: 'sm',
                  color: '#64748B',
                  flex: 2
                },
                {
                  type: 'text',
                  text: `${qty.toLocaleString('th-TH')} ชิ้น`,
                  size: 'lg',
                  color: qtyColor,
                  weight: 'bold',
                  flex: 3,
                  align: 'end'
                }
              ]
            }
          ]
        }
      }
    }]);
  }

  // กรณีพบหลายรายการ
  const totalFound = items.length;
  const showLimit = 10;
  const listLines = items.slice(0, showLimit).map((item) => {
    const qty = Number(item.total_saleable || 0);
    const loc = item.location ? ` (ที่เก็บ: ${item.location})` : '';
    const desc = item.description ? ` - ${item.description}` : '';
    return `• ${item.item_code}${desc}: ${qty.toLocaleString('th-TH')} ชิ้น${loc}`;
  });

  let suffix = '';
  if (totalFound > showLimit) {
    suffix = `\n... และสินค้าอื่น ๆ อีก ${(totalFound - showLimit).toLocaleString('th-TH')} รายการ\n`;
  }

  return replyText(
    replyToken,
    `🔍 พบสินค้าที่ใกล้เคียง ${totalFound} รายการ:\n\n` +
    listLines.join('\n') +
    suffix +
    `\n💡 พิมพ์ /jq <รหัสสินค้า> ให้ระบุเจาะจงขึ้นเพื่อดูข้อมูล`
  );
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
    return replyLine(replyToken, [{
      type: 'flex',
      altText: 'Organizations',
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', paddingAll: '16px',
          background: { type: 'linearGradient', angle: '135deg', startColor: '#1E40AF', endColor: '#3B82F6' },
          contents: [
            { type: 'text', text: '🏢 ORGANIZATIONS', weight: 'bold', color: '#FFFFFF', size: 'sm' },
            { type: 'text', text: 'ยังไม่ได้เข้าร่วม Org', weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
          contents: [{
            type: 'box', layout: 'vertical', backgroundColor: '#FEF2F2', cornerRadius: 'md',
            paddingAll: '12px', borderWidth: '1px', borderColor: '#FECACA',
            contents: [{ type: 'text', text: 'ติดต่อผู้ดูแลระบบเพื่อเชิญเข้า Organization', color: '#DC2626', size: 'sm', wrap: true }],
          }],
        },
      },
    }]);
  }

  if (!args[0]) {
    const orgRows = orgs.map((m, i) => ({
      type: 'box', layout: 'horizontal', contents: [
        { type: 'text', text: `${i + 1}. ${m.organizations.name}`, size: 'sm', color: '#1F2937', flex: 1, wrap: true },
      ],
    }));
    return replyLine(replyToken, [{
      type: 'flex',
      altText: `Organizations (${orgs.length})`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', paddingAll: '16px',
          background: { type: 'linearGradient', angle: '135deg', startColor: '#1E40AF', endColor: '#3B82F6' },
          contents: [
            { type: 'text', text: '🏢 ORGANIZATIONS', weight: 'bold', color: '#FFFFFF', size: 'sm' },
            { type: 'text', text: `เลือก Org ที่ต้องการ`, weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
          contents: [
            ...orgRows,
            { type: 'separator' },
            { type: 'text', text: 'พิมพ์ /org <N> เพื่อเปลี่ยน', size: 'xs', color: '#6B7280', wrap: true },
          ],
        },
      },
    }]);
  }

  const n = parseInt(args[0]);
  if (isNaN(n) || n < 1 || n > orgs.length) {
    return replyText(replyToken, `❌ หมายเลขไม่ถูกต้อง ต้องอยู่ระหว่าง 1-${orgs.length}`);
  }

  const selected = orgs[n - 1];
  await admin.from('profiles').update({ line_active_org_id: selected.organization_id }).eq('id', profileId);
  return replyLine(replyToken, [{
    type: 'flex',
    altText: `เปลี่ยน Org เป็น ${selected.organizations.name}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        background: { type: 'linearGradient', angle: '135deg', startColor: '#059669', endColor: '#34D399' },
        contents: [
          { type: 'text', text: '✅ เปลี่ยน ORG แล้ว', weight: 'bold', color: '#FFFFFF', size: 'sm' },
          { type: 'text', text: selected.organizations.name, weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
        contents: [{
          type: 'box', layout: 'vertical', backgroundColor: '#F0FDF4', cornerRadius: 'md',
          paddingAll: '12px', borderWidth: '1px', borderColor: '#BBF7D0',
          contents: [{ type: 'text', text: `Org ที่ใช้งานอยู่ตอนนี้: ${selected.organizations.name}`, color: '#15803D', size: 'sm', wrap: true }],
        }],
      },
    },
  }]);
}

async function checkPermission(admin: ReturnType<typeof createAdminClient>, profileId: string, key: string, role: string): Promise<boolean> {
  if (role === 'super_admin') return true;
  const { data } = await admin.from('user_permissions').select('allowed').eq('user_id', profileId).eq('function_key', key).maybeSingle();
  return Boolean((data as Record<string, unknown> | null)?.allowed);
}

/** ตรวจ personal_module_grants — คืน true ถ้า user ได้รับสิทธิ์ personal module นั้น */
async function checkPersonalGrant(admin: ReturnType<typeof createAdminClient>, profileId: string, moduleKey: string): Promise<boolean> {
  const { data } = await admin
    .from('personal_module_grants')
    .select('is_enabled')
    .eq('user_id', profileId)
    .eq('module_key', moduleKey)
    .eq('is_enabled', true)
    .maybeSingle();
  return data !== null;
}

/** ตรวจสิทธิ์ assistant — ผ่านถ้า super_admin หรือมี user_permission หรือมี personal_module_grant */
async function checkAssistantAccess(admin: ReturnType<typeof createAdminClient>, profileId: string, role: string): Promise<boolean> {
  if (role === 'super_admin') return true;
  const [perm, grant] = await Promise.all([
    checkPermission(admin, profileId, 'bot.assistant.tasks', role),
    checkPersonalGrant(admin, profileId, 'assistant'),
  ]);
  return perm || grant;
}

// ─── /mom — รับไฟล์เสียงจาก LINE → STT → ส่ง PDF MoM กลับ ──────────────────────
const STT_ALLOWED_MIME = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/aac',
  'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'video/mp4', 'video/webm', 'video/quicktime',
]);
const EXT_TO_MIME: Record<string, string> = {
  ogg: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
  aac: 'audio/aac', flac: 'audio/flac', mp4: 'video/mp4', webm: 'audio/webm',
};
const MIME_TO_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/aac': 'aac', 'audio/flac': 'flac', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/webm': 'webm',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
};

/** normalize content-type ของ LINE ให้เป็น mime ที่ bucket อนุญาต (LINE เสียง = m4a/audio/x-m4a) */
function normalizeAudioMime(rawMime: string, fileName: string): { mime: string; ext: string } {
  let mime = (rawMime || '').split(';')[0].trim().toLowerCase();
  if (!STT_ALLOWED_MIME.has(mime)) {
    const ext = (fileName.split('.').pop() ?? '').toLowerCase();
    mime = EXT_TO_MIME[ext] ?? 'audio/mp4';
  }
  return { mime, ext: MIME_TO_EXT[mime] ?? 'm4a' };
}

// webhook ต้องตอบ LINE เร็ว → **ไม่โหลดไฟล์ที่นี่** (ไฟล์ประชุมใหญ่จะ timeout + LINE retry).
// แค่ INSERT job เก็บ line_message_id แล้วให้ stt-worker (Cloud Run) โหลดจาก LINE เองทีหลัง.
async function handleMomAudio(
  admin: ReturnType<typeof createAdminClient>,
  lineUserId: string,
  messageId: string,
  profileId: string,
  orgId: string,
  fileNameHint: string,
  replyToken: string,
) {
  const { ext } = normalizeAudioMime('', fileNameHint);
  const fileName = fileNameHint || `line-เสียง-${Date.now()}.${ext}`;

  // ตอบ LINE ให้เร็วที่สุด → insert งานเลย (ไม่ lookup email; profile_id พอสำหรับ audit)
  const { data: job, error: jobErr } = await admin
    .from('transcription_jobs')
    .insert({
      org_id: orgId, profile_id: profileId, audio_url: null, line_message_id: messageId,
      file_name: fileName, mime_type: 'audio/mp4', model: 'gemini-2.5-flash', source: 'line',
      triggered_by: profileId,
    })
    .select('id')
    .single();

  if (jobErr || !job) {
    // unique violation (23505) = LINE ส่ง event เดิมซ้ำ → งานถูกคิวไว้แล้ว เงียบได้
    if ((jobErr as { code?: string } | null)?.code === '23505') return;
    await replyText(replyToken, `❌ สร้างงานถอดเสียงไม่สำเร็จ: ${jobErr?.message ?? ''}`);
    return;
  }

  // ใช้ session แล้ว — ลบทิ้ง (กันส่งไฟล์ซ้ำเข้าคิวเดิม)
  await admin.from('assistant_line_sessions').delete().eq('line_user_id', lineUserId);

  // ตอบรับ "ทันที" ด้วย replyToken (อายุสั้น) — ต้องทำ **ก่อน** trigger worker
  // ซึ่ง await การตอบจาก Cloud Run ที่อาจช้า 2–5 วิจาก cold start
  await replyText(replyToken,
    '✅ ได้รับไฟล์แล้ว กำลังถอดเสียงเป็นรายงานการประชุม…\n' +
    'เมื่อเสร็จจะส่งไฟล์ PDF กลับมาให้อัตโนมัติ (ประมาณ 1–3 นาที) 🙏',
  );

  // จากนั้นค่อยสั่ง worker — ถ้าล้มเหลว push แจ้ง (reply token ใช้ไปแล้ว ตอบซ้ำไม่ได้)
  const trig = await triggerSttWorker(admin, job.id as string, orgId);
  if (!trig.ok) {
    await sendLineMessages({
      to: lineUserId,
      messages: [{ type: 'text', text: '❌ ขออภัย เริ่มถอดเสียงไม่สำเร็จ กรุณาพิมพ์ /mom แล้วส่งไฟล์อีกครั้ง' }],
    }).catch(() => undefined);
  }
}

// ─── Main webhook handler ─────────────────────────────────────────────────────

const TMC_CMDS = ['รับ', 'จ่าย', 'บัญชี', 'stock', 'stkin', 'stkout', 'stk', 'เช็คอิน', 'pcin', 'pcout', 'pcbal', 'pcfunds', 'tmc'];
const CRM_CMDS = ['n', 'survey', 'issue', 'mtg', 'log', 'sol', 'status', 'notes', 'issues', 'hours'];

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

    // Location messages not handled (GPS captured via web link instead)
    if (msg.type === 'location') continue;

    // ─── Audio / file messages — STT MoM (เฉพาะเมื่อมี session /mom ค้างอยู่) ──────
    if (msg.type === 'audio' || msg.type === 'file') {
      const messageId = String(msg.id ?? '');
      if (!lineUserId || !messageId) continue;

      // เช็ค session ก่อน (ถูกกว่า) — session เก็บ profile_id/org_id ไว้แล้ว ไม่ต้อง lookup profile ซ้ำ
      const { data: sess } = await admin
        .from('assistant_line_sessions')
        .select('org_id, profile_id, expires_at')
        .eq('line_user_id', lineUserId)
        .maybeSingle();
      // ไม่มี session /mom หรือหมดอายุ → เงียบ (ไม่ยุ่งฟีเจอร์อื่น)
      if (!sess || new Date(sess.expires_at as string).getTime() < Date.now()) continue;

      const fileName = String(msg.fileName ?? '');
      if (msg.type === 'file' && !/\.(ogg|mp3|m4a|wav|mp4|aac|flac|webm|opus)$/i.test(fileName)) {
        await replyText(replyToken, '❌ ไฟล์นี้ไม่ใช่ไฟล์เสียง/วิดีโอ กรุณาส่งไฟล์เสียง (mp3, ogg, m4a, wav, mp4)');
        continue;
      }
      await handleMomAudio(admin, lineUserId, messageId, String(sess.profile_id), String(sess.org_id), fileName, replyToken);
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

    // /help — org-aware Flex Card
    if (cmd === 'help') {
      if (activeOrg?.id === TMC_ORG_ID) {
        await handleTmcHelp(replyToken);
      } else {
        const hasAssistant = await checkAssistantAccess(admin, profile.id, profile.role);
        // Check just_me module
        let hasJustMe = false;
        // Check jaquar module
        let hasJaquar = false;
        if (activeOrg) {
          const [jmSetting, jqSetting] = await Promise.all([
            admin
              .from('org_module_settings')
              .select('is_enabled')
              .eq('organization_id', activeOrg.id)
              .eq('module_key', 'just_me')
              .maybeSingle(),
            admin
              .from('org_module_settings')
              .select('is_enabled')
              .eq('organization_id', activeOrg.id)
              .eq('module_key', 'jaquar')
              .maybeSingle()
          ]);
          hasJustMe = Boolean(jmSetting.data?.is_enabled);
          hasJaquar = Boolean(jqSetting.data?.is_enabled);
        }

        const cmdRow = (code: string, desc: string) => ({
          type: 'box', layout: 'horizontal', spacing: 'sm',
          contents: [
            { type: 'text', text: code, size: 'xs', color: '#6D28D9', flex: 2, weight: 'bold' },
            { type: 'text', text: desc, size: 'xs', color: '#374151', flex: 4, wrap: true },
          ],
        });

        const bodyContents: unknown[] = [
          {
            type: 'box', layout: 'vertical', backgroundColor: '#F3F4F6', cornerRadius: 'md',
            paddingAll: '10px', borderWidth: '1px', borderColor: '#E5E7EB',
            contents: [{ type: 'text', text: `🏢 ${activeOrg?.name ?? 'ไม่มี Org'}`, size: 'sm', color: '#1F2937', weight: 'bold', wrap: true }],
          },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'คำสั่งหลัก', size: 'xs', color: '#9CA3AF', margin: 'md' },
          cmdRow('/org', 'ดู/เปลี่ยน Organization'),
          cmdRow('/help', 'แสดงคำสั่งทั้งหมด'),
        ];

        if (hasAssistant) {
          bodyContents.push(
            { type: 'separator', margin: 'md' },
            { type: 'text', text: 'Assistant', size: 'xs', color: '#9CA3AF', margin: 'md' },
            cmdRow('/t <งาน>', 'บันทึกงานใหม่'),
            cmdRow('/tk', 'รายการงานที่รอ'),
            cmdRow('/d <N>', 'ปิดงานที่ N'),
            cmdRow('/a <ชื่อ> <HH:MM>', 'บันทึกนัดหมาย'),
            cmdRow('/ap', 'นัดหมายวันนี้'),
          );
        }

        if (hasJustMe) {
          bodyContents.push(
            { type: 'separator', margin: 'md' },
            { type: 'text', text: 'Just Me', size: 'xs', color: '#9CA3AF', margin: 'md' },
            cmdRow('/ck home', 'บันทึก clock ที่บ้าน'),
            cmdRow('/ck site [ชื่อ]', 'บันทึก clock ที่หน้างาน'),
          );
        }

        if (hasJaquar) {
          bodyContents.push(
            { type: 'separator', margin: 'md' },
            { type: 'text', text: 'Jaquar', size: 'xs', color: '#9CA3AF', margin: 'md' },
            cmdRow('/jq <สินค้า>', 'เช็คสต๊อกสินค้า'),
          );
        }

        bodyContents.push(
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'การเงิน', size: 'xs', color: '#9CA3AF', margin: 'md' },
          cmdRow('/รายรับ <จำนวน>', 'บันทึกรายรับ'),
          cmdRow('/รายจ่าย <จำนวน>', 'บันทึกรายจ่าย'),
        );

        await replyLine(replyToken, [{
          type: 'flex',
          altText: 'คำสั่ง PERPOS Bot',
          contents: {
            type: 'bubble',
            header: {
              type: 'box', layout: 'vertical', paddingAll: '16px',
              background: { type: 'linearGradient', angle: '135deg', startColor: '#1E293B', endColor: '#475569' },
              contents: [
                { type: 'text', text: '💡 PERPOS BOT', weight: 'bold', color: '#FFFFFF', size: 'sm' },
                { type: 'text', text: 'คำสั่งทั้งหมด', weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
              ],
            },
            body: {
              type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
              contents: bodyContents,
            },
          },
        }]);
      }
      continue;
    }

    // ─── Global commands (no active org required) ────────────────────────────

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

    if (cmd === 'mom') {
      if (!await checkAssistantAccess(admin, profile.id, profile.role)) {
        await replyText(replyToken, '❌ ไม่มีสิทธิ์ใช้คำสั่งนี้ (ต้องเปิดใช้งานผู้ช่วย AI ในองค์กร)'); continue;
      }
      if (!activeOrg) {
        await replyText(replyToken, '❌ ยังไม่ได้เลือกองค์กร พิมพ์ /org เพื่อเลือกองค์กรก่อน'); continue;
      }
      // pre-check โควต้า — ถ้าหมดแล้วไม่ต้องเปิด session
      const { data: q } = await admin.from('stt_quota').select('limit_seconds, used_seconds').eq('profile_id', profile.id).maybeSingle();
      const qRemain = ((q as { limit_seconds?: number } | null)?.limit_seconds ?? 18000) - ((q as { used_seconds?: number } | null)?.used_seconds ?? 0);
      if (qRemain <= 0) {
        await replyText(replyToken, '❌ โควต้าแกะเสียงของคุณหมดแล้ว (0 นาที)\nติดต่อแอดมินเพื่อเพิ่มโควต้าครับ'); continue;
      }
      // best-effort: เก็บกวาด session หมดอายุที่ค้างไว้
      void admin.from('assistant_line_sessions').delete().lt('expires_at', new Date().toISOString());
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await admin.from('assistant_line_sessions').upsert({
        line_user_id: lineUserId, org_id: activeOrg.id, profile_id: profile.id, action: 'mom', expires_at: expiresAt,
      }, { onConflict: 'line_user_id' });
      await replyText(replyToken,
        '🎙️ ส่งไฟล์เสียงที่ต้องการถอดเป็นรายงานการประชุม (MoM) มาได้เลยครับ\n\n' +
        '• รองรับไฟล์เสียง/วิดีโอ ไม่เกิน 200MB\n' +
        `• โควต้าคงเหลือ ~${Math.floor(qRemain / 60)} นาที\n` +
        '• เมื่อถอดเสร็จจะส่งไฟล์ PDF กลับมาให้อัตโนมัติ (ประมาณ 1–3 นาที)',
      );
      continue;
    }

    if (cmd === 't') {
      if (!await checkAssistantAccess(admin, profile.id, profile.role)) {
        await replyText(replyToken, '❌ ไม่มีสิทธิ์ใช้คำสั่งนี้'); continue;
      }
      const title = args.join(' ').trim();
      if (!title) { await replyText(replyToken, '❌ ระบุชื่องาน เช่น /t ติดต่อลูกค้า'); continue; }
      const { error: tErr } = await admin.from('tasks').insert({ profile_id: profile.id, title, status: 'pending', priority: 'medium' });
      if (tErr) { await replyText(replyToken, `❌ บันทึกไม่สำเร็จ: ${tErr.message}`); continue; }
      await replyText(replyToken, `✅ บันทึกงาน: ${title}`);
      continue;
    }

    if (cmd === 'tk') {
      if (!await checkAssistantAccess(admin, profile.id, profile.role)) {
        await replyText(replyToken, '❌ ไม่มีสิทธิ์ใช้คำสั่งนี้'); continue;
      }
      const { data: tasks } = await admin.from('tasks').select('title').eq('profile_id', profile.id).eq('status', 'pending').order('created_at').limit(10);
      const taskList = (tasks ?? []) as { title: string }[];

      let bodyContents: unknown[];
      if (!taskList.length) {
        bodyContents = [{
          type: 'box', layout: 'vertical', backgroundColor: '#F0FDF4', cornerRadius: 'md',
          paddingAll: '12px', borderWidth: '1px', borderColor: '#BBF7D0',
          contents: [
            { type: 'text', text: '✅ ไม่มีงานที่รออยู่', color: '#15803D', size: 'sm', wrap: true },
            { type: 'text', text: '/t ชื่องาน เพื่อเพิ่มงาน', color: '#166534', size: 'xs', wrap: true, margin: 'xs' },
          ],
        }];
      } else {
        const taskRows = taskList.map((t, i) => ({
          type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: `${i + 1}.`, size: 'sm', color: '#7C3AED', flex: 0, margin: 'none' },
            { type: 'text', text: t.title, size: 'sm', color: '#1F2937', flex: 1, wrap: true, margin: 'sm' },
          ],
        }));
        bodyContents = [
          ...taskRows,
          { type: 'separator', margin: 'md' },
          { type: 'text', text: '/d <N> เพื่อปิดงาน', size: 'xs', color: '#6B7280', margin: 'sm' },
        ];
      }

      await replyLine(replyToken, [{
        type: 'flex',
        altText: `งานที่รอ (${taskList.length})`,
        contents: {
          type: 'bubble',
          header: {
            type: 'box', layout: 'vertical', paddingAll: '16px',
            background: { type: 'linearGradient', angle: '135deg', startColor: '#7C3AED', endColor: '#A78BFA' },
            contents: [
              { type: 'text', text: '📋 TASK LIST', weight: 'bold', color: '#FFFFFF', size: 'sm' },
              { type: 'text', text: 'งานที่รอดำเนินการ', weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
            ],
          },
          body: {
            type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
            contents: bodyContents,
          },
        },
      }]);
      continue;
    }

    if (cmd === 'd') {
      if (!await checkAssistantAccess(admin, profile.id, profile.role)) {
        await replyText(replyToken, '❌ ไม่มีสิทธิ์ใช้คำสั่งนี้'); continue;
      }
      const n = parseInt(args[0] ?? '');
      if (!n || isNaN(n)) { await replyText(replyToken, '❌ ระบุหมายเลขงาน เช่น /d 1'); continue; }
      const { data: tasks } = await admin.from('tasks').select('id, title').eq('profile_id', profile.id).eq('status', 'pending').order('created_at').limit(20);
      const target = (tasks as { id: string; title: string }[] | null)?.[n - 1];
      if (!target) { await replyText(replyToken, `❌ ไม่พบงานที่ ${n}`); continue; }
      await admin.from('tasks').update({ status: 'completed' }).eq('id', target.id);
      await replyText(replyToken, `✅ ปิดงาน: ${target.title}`);
      continue;
    }

    // /a <ชื่อ> <วัน YYYY-MM-DD|today|วันนี้> <HH:MM> — บันทึกนัดหมาย
    if (cmd === 'a') {
      if (!await checkAssistantAccess(admin, profile.id, profile.role)) {
        await replyText(replyToken, '❌ ไม่มีสิทธิ์ใช้คำสั่งนี้'); continue;
      }
      // /a <ชื่อ> <HH:MM>  หรือ  /a <ชื่อ> <YYYY-MM-DD> <HH:MM>
      if (!args[0]) {
        await replyText(replyToken, '❌ รูปแบบ: /a <ชื่องาน> <HH:MM>\nหรือ: /a <ชื่องาน> <วัน YYYY-MM-DD> <HH:MM>\nเช่น: /a ประชุมทีม 14:00');
        continue;
      }
      // detect if args contains a date (YYYY-MM-DD) or time (HH:MM)
      const timeRe  = /^\d{1,2}:\d{2}$/;
      const dateRe  = /^\d{4}-\d{2}-\d{2}$/;
      const todayIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

      let title = '';
      let dateStr = todayIso;
      let timeStr = '';

      // last arg: time, second-to-last: optional date, rest: title
      const lastArg = args[args.length - 1];
      if (timeRe.test(lastArg)) {
        timeStr = lastArg;
        const rest = args.slice(0, -1);
        if (rest.length > 0 && dateRe.test(rest[rest.length - 1])) {
          dateStr = rest[rest.length - 1];
          title   = rest.slice(0, -1).join(' ').trim();
        } else {
          title = rest.join(' ').trim();
        }
      } else {
        await replyText(replyToken, '❌ ต้องระบุเวลา HH:MM ท้ายสุด เช่น /a ประชุมทีม 14:00');
        continue;
      }

      if (!title) { await replyText(replyToken, '❌ ระบุชื่อนัดหมาย เช่น /a ประชุมทีม 14:00'); continue; }

      const startsAt = `${dateStr}T${timeStr}:00+07:00`;
      const { error: aErr } = await admin.from('calendar_events').insert({
        profile_id: profile.id,
        title,
        starts_at: startsAt,
      });
      if (aErr) { await replyText(replyToken, `❌ บันทึกไม่สำเร็จ: ${aErr.message}`); continue; }

      const displayDate = dateStr === todayIso ? 'วันนี้' : dateStr;
      await replyText(replyToken, `✅ บันทึกนัดหมาย\n📅 ${displayDate} ${timeStr} น.\n📌 ${title}`);
      continue;
    }

    // /ap — รายการนัดวันนี้
    if (cmd === 'ap') {
      if (!await checkAssistantAccess(admin, profile.id, profile.role)) {
        await replyText(replyToken, '❌ ไม่มีสิทธิ์ใช้คำสั่งนี้'); continue;
      }
      const todayIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
      const tomorrowIso = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
      const thaiDateTitle = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok' });
      const { data: events } = await admin
        .from('calendar_events')
        .select('title, starts_at')
        .eq('profile_id', profile.id)
        .gte('starts_at', `${todayIso}T00:00:00+07:00`)
        .lt('starts_at',  `${tomorrowIso}T00:00:00+07:00`)
        .order('starts_at');

      const eventList = (events ?? []) as { title: string; starts_at: string }[];

      let bodyContents: unknown[];
      if (!eventList.length) {
        bodyContents = [{
          type: 'box', layout: 'vertical', backgroundColor: '#F0F9FF', cornerRadius: 'md',
          paddingAll: '12px', borderWidth: '1px', borderColor: '#BAE6FD',
          contents: [
            { type: 'text', text: 'ไม่มีนัดหมายวันนี้', color: '#0369A1', size: 'sm', wrap: true },
            { type: 'text', text: '/a ชื่อ HH:MM เพื่อเพิ่มนัด', color: '#075985', size: 'xs', wrap: true, margin: 'xs' },
          ],
        }];
      } else {
        const eventRows = eventList.map(e => {
          const t = new Date(e.starts_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
          return {
            type: 'box', layout: 'horizontal', contents: [
              { type: 'text', text: `🕐 ${t}`, size: 'sm', color: '#0369A1', flex: 0 },
              { type: 'text', text: `— ${e.title}`, size: 'sm', color: '#1F2937', flex: 1, wrap: true, margin: 'sm' },
            ],
          };
        });
        bodyContents = eventRows;
      }

      await replyLine(replyToken, [{
        type: 'flex',
        altText: `นัดหมายวันนี้ (${eventList.length})`,
        contents: {
          type: 'bubble',
          header: {
            type: 'box', layout: 'vertical', paddingAll: '16px',
            background: { type: 'linearGradient', angle: '135deg', startColor: '#0369A1', endColor: '#38BDF8' },
            contents: [
              { type: 'text', text: "📅 TODAY'S SCHEDULE", weight: 'bold', color: '#FFFFFF', size: 'sm' },
              { type: 'text', text: `วันนี้ ${thaiDateTitle}`, weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
            ],
          },
          body: {
            type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
            contents: bodyContents,
          },
        },
      }]);
      continue;
    }

    // ─── Org-specific commands (TMC) ─────────────────────────────────────────
    if (TMC_CMDS.includes(cmd)) {
      if (!activeOrg || activeOrg.id !== TMC_ORG_ID) {
        await replyLine(replyToken, [{
          type: 'flex',
          altText: 'ไม่รองรับคำสั่งนี้',
          contents: {
            type: 'bubble',
            header: {
              type: 'box', layout: 'vertical', paddingAll: '16px',
              background: { type: 'linearGradient', angle: '135deg', startColor: '#DC2626', endColor: '#F87171' },
              contents: [
                { type: 'text', text: '❌ ORG ไม่รองรับ', weight: 'bold', color: '#FFFFFF', size: 'sm' },
                { type: 'text', text: `${activeOrg?.name ?? 'ไม่มี Org'}`, weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
              ],
            },
            body: {
              type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
              contents: [{
                type: 'box', layout: 'vertical', backgroundColor: '#FEF2F2', cornerRadius: 'md',
                paddingAll: '12px', borderWidth: '1px', borderColor: '#FECACA',
                contents: [{ type: 'text', text: 'พิมพ์ /org เพื่อดูและเปลี่ยน Org', color: '#DC2626', size: 'sm', wrap: true }],
              }],
            },
          },
        }]);
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

    // ─── Just Me travel clock (/ck home | /ck site) ─────────────────────────
    if (cmd === 'ck') {
      if (!activeOrg) {
        await replyLine(replyToken, [{
          type: 'flex',
          altText: 'ยังไม่มี Organization',
          contents: {
            type: 'bubble',
            header: {
              type: 'box', layout: 'vertical', paddingAll: '16px',
              background: { type: 'linearGradient', angle: '135deg', startColor: '#DC2626', endColor: '#F87171' },
              contents: [
                { type: 'text', text: '❌ ไม่มี Organization', weight: 'bold', color: '#FFFFFF', size: 'sm' },
                { type: 'text', text: 'กรุณาตั้งค่า Org ก่อน', weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
              ],
            },
            body: {
              type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
              contents: [{
                type: 'box', layout: 'vertical', backgroundColor: '#FEF2F2', cornerRadius: 'md',
                paddingAll: '12px', borderWidth: '1px', borderColor: '#FECACA',
                contents: [{ type: 'text', text: 'พิมพ์ /org เพื่อตั้งค่า', color: '#DC2626', size: 'sm', wrap: true }],
              }],
            },
          },
        }]);
        continue;
      }
      const { data: ckModuleSetting } = await admin
        .from('org_module_settings')
        .select('is_enabled')
        .eq('organization_id', activeOrg.id)
        .eq('module_key', 'just_me')
        .maybeSingle();
      if (!ckModuleSetting?.is_enabled) {
        await replyText(replyToken, '❌ Just Me module ยังไม่ได้เปิดใช้งาน\nกรุณาติดต่อผู้ดูแลระบบเพื่อเปิด module "Just Me" ใน Admin → Modules');
        continue;
      }
      const subCmd = (args[0] ?? '').toLowerCase();
      if (subCmd !== 'home' && subCmd !== 'site') {
        await replyText(replyToken, '📍 วิธีใช้:\n/ck home — บันทึก clock ที่บ้าน\n/ck site [ชื่อ] — บันทึก clock ที่หน้างาน\n\nตัวอย่าง:\n/ck home\n/ck site บริษัท ABC');
        continue;
      }
      const locationType = subCmd as 'home' | 'site';
      const ckNote = args.slice(1).join(' ').trim() || undefined;
      await handleJustMeClock(admin, lineUserId, profile.id, activeOrg.id, replyToken, locationType, ckNote);
      continue;
    }

    // ─── Jaquar Stock Check (/jq | /jaquar) ─────────────────────────────────
    if (cmd === 'jq' || cmd === 'jaquar') {
      if (!activeOrg) {
        await replyText(replyToken, '❌ ยังไม่มี Organization\nพิมพ์ /org เพื่อตั้งค่า');
        continue;
      }

      const { data: jaquarSetting } = await admin
        .from('org_module_settings')
        .select('is_enabled')
        .eq('organization_id', activeOrg.id)
        .eq('module_key', 'jaquar')
        .maybeSingle();

      if (!jaquarSetting?.is_enabled) {
        await replyText(replyToken, '❌ Jaquar module ยังไม่ได้เปิดใช้งานใน Organization นี้');
        continue;
      }

      await handleJaquarStock(admin, activeOrg.id, args, replyToken);
      continue;
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
  }

  return NextResponse.json({ ok: true });
}
