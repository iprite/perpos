import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '../../_lib/supabase';
import { triggerSttWorker } from '@/lib/assistant/stt-trigger';
import { sendLineMessages } from '@/lib/line/send-messages';
import {
  extractMeetingUrl, makeDedupKey, createBot, AdhocPoolDepletedError, leaveBot, deleteScheduledBot,
} from '@/lib/assistant/recall';
import { buildBotFlex } from '@/lib/assistant/recall-events';
import { provisionLineUser } from '../_provision';
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

    let qtyColor = '#46BC9E'; // เขียว (in_stock)
    let qtyStatusText = '🟢 สต๊อกพร้อมขาย';
    if (qty === 0) {
      qtyColor = '#C43448'; // แดง (out_of_stock)
      qtyStatusText = '🔴 สินค้าหมด';
    } else if (qty < 5) {
      qtyColor = '#E6BB51'; // ส้ม (low_stock)
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
            startColor: '#2A2A2C',
            endColor: '#3C3B3D'
          },
          contents: [
            {
              type: 'text',
              text: '📦 ข้อมูลสินค้า / STOCK',
              weight: 'bold',
              color: '#9CA3AF',
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
                  color: '#656D78'
                },
                {
                  type: 'text',
                  text: item.description || 'ไม่มีรายละเอียด',
                  size: 'sm',
                  color: '#2A2A2C',
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
                  color: '#656D78',
                  flex: 2
                },
                {
                  type: 'text',
                  text: item.location || 'ไม่ระบุ',
                  size: 'sm',
                  color: '#2A2A2C',
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
                  color: '#656D78',
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
          background: { type: 'linearGradient', angle: '135deg', startColor: '#46839A', endColor: '#4FC1E9' },
          contents: [
            { type: 'text', text: '🏢 ORGANIZATIONS', weight: 'bold', color: '#FFFFFF', size: 'sm' },
            { type: 'text', text: 'ยังไม่ได้เข้าร่วม Org', weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
          contents: [{
            type: 'box', layout: 'vertical', backgroundColor: '#FCF1F2', cornerRadius: 'md',
            paddingAll: '12px', borderWidth: '1px', borderColor: '#F3C2C9',
            contents: [{ type: 'text', text: 'ติดต่อผู้ดูแลระบบเพื่อเชิญเข้า Organization', color: '#C43448', size: 'sm', wrap: true }],
          }],
        },
      },
    }]);
  }

  if (!args[0]) {
    const orgRows = orgs.map((m, i) => ({
      type: 'box', layout: 'horizontal', contents: [
        { type: 'text', text: `${i + 1}. ${m.organizations.name}`, size: 'sm', color: '#2A2A2C', flex: 1, wrap: true },
      ],
    }));
    return replyLine(replyToken, [{
      type: 'flex',
      altText: `Organizations (${orgs.length})`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', paddingAll: '16px',
          background: { type: 'linearGradient', angle: '135deg', startColor: '#46839A', endColor: '#4FC1E9' },
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
            { type: 'text', text: 'พิมพ์ /org <N> เพื่อเปลี่ยน', size: 'xs', color: '#656D78', wrap: true },
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
        background: { type: 'linearGradient', angle: '135deg', startColor: '#46BC9E', endColor: '#79DCC3' },
        contents: [
          { type: 'text', text: '✅ เปลี่ยน ORG แล้ว', weight: 'bold', color: '#FFFFFF', size: 'sm' },
          { type: 'text', text: selected.organizations.name, weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
        contents: [{
          type: 'box', layout: 'vertical', backgroundColor: '#F2FCF9', cornerRadius: 'md',
          paddingAll: '12px', borderWidth: '1px', borderColor: '#C8F1E6',
          contents: [{ type: 'text', text: `Org ที่ใช้งานอยู่ตอนนี้: ${selected.organizations.name}`, color: '#44A38B', size: 'sm', wrap: true }],
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
// สิทธิ์ผู้ช่วย AI / แกะเสียง (/mom) — per-profile, key ภายในยังเป็น 'stt'
// grant ให้ตั้งแต่ onboarding (พร้อม trial 300 นาที) → ด่านเก็บเงินจริงคือ quota ที่ stt-worker
async function checkSttAccess(admin: ReturnType<typeof createAdminClient>, profileId: string, role: string): Promise<boolean> {
  const { data: prof } = await admin.from('profiles').select('is_active').eq('id', profileId).maybeSingle();
  if ((prof as { is_active?: boolean } | null)?.is_active === false) return false;
  if (role === 'super_admin') return true;
  const [perm, grant] = await Promise.all([
    checkPermission(admin, profileId, 'bot.assistant.transcribe', role),
    checkPersonalGrant(admin, profileId, 'stt'),
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
  // กันผู้ใช้ที่ถูกระงับ (is_active=false) — path "audio ที่มี session ค้าง" เรียกตรงไม่ผ่าน checkSttAccess
  const { data: prof } = await admin.from('profiles').select('is_active').eq('id', profileId).maybeSingle();
  if ((prof as { is_active?: boolean } | null)?.is_active === false) {
    await admin.from('assistant_line_sessions').delete().eq('line_user_id', lineUserId).then(() => undefined, () => undefined);
    await replyText(replyToken, '❌ บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
    return;
  }

  const { ext } = normalizeAudioMime('', fileNameHint);
  const fileName = fileNameHint || `line-เสียง-${Date.now()}.${ext}`;

  // ตอบ LINE ให้เร็วที่สุด → insert งานเลย (ไม่ lookup email; profile_id พอสำหรับ audit)
  const { data: job, error: jobErr } = await admin
    .from('assistant_jobs')
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
  await replyLine(replyToken, [{
    type: 'flex',
    altText: 'ได้รับไฟล์แล้ว — กำลังจัดทำรายงานการประชุม',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
        contents: [
          {
            type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center',
            contents: [
              { type: 'text', text: '✅', size: 'lg', flex: 0 },
              { type: 'text', text: 'รับไฟล์เรียบร้อย', weight: 'bold', size: 'md', color: '#4DB0D3', gravity: 'center' },
            ],
          },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'ระบบกำลังถอดเสียงและจัดทำรายงานการประชุม (Minutes of Meeting)', size: 'sm', wrap: true, color: '#3C3B3D', margin: 'md' },
          { type: 'text', text: 'เสร็จแล้วจะส่งไฟล์ PDF กลับมาให้อัตโนมัติ ไม่ต้องส่งซ้ำ', size: 'xs', wrap: true, color: '#9CA3AF' },
        ],
      },
    },
  }]);

  // จากนั้นค่อยสั่ง worker — ถ้าล้มเหลว push แจ้ง (reply token ใช้ไปแล้ว ตอบซ้ำไม่ได้)
  const trig = await triggerSttWorker(admin, job.id as string, orgId);
  if (!trig.ok) {
    // คิวเต็มชั่วคราว (queued) → งานไม่ถูกทิ้ง รอ scheduler ยิงซ้ำ → บอกให้รอ
    // error จริง → ให้ลองใหม่
    const text = trig.queued
      ? '⏳ ขณะนี้มีงานเข้ามาจำนวนมาก งานของคุณเข้าคิวเรียบร้อยแล้ว ระบบจะถอดเสียงให้อัตโนมัติเมื่อถึงคิว รอสักครู่นะครับ 🙏'
      : '❌ ขออภัย เริ่มถอดเสียงไม่สำเร็จ กรุณาพิมพ์ /mom แล้วส่งไฟล์อีกครั้ง';
    await sendLineMessages({
      to: lineUserId,
      messages: [{ type: 'text', text }],
    }).catch(() => undefined);
  }
}

// ผู้ใช้กดปุ่ม "ถอดเสียงเลย" จาก Flex (กรณีส่งไฟล์มาก่อนพิมพ์ /mom) → ตรวจสิทธิ์+org+โควต้า
// แล้วเริ่มถอดเสียงจาก messageId นั้น (handleMomAudio idempotent ต่อ line_message_id → กดซ้ำไม่สร้างงานซ้ำ)
async function handleMomConfirm(
  admin: ReturnType<typeof createAdminClient>,
  lineUserId: string,
  messageId: string,
  replyToken: string,
) {
  if (!messageId) return;
  const profile = await getProfileByLineId(admin, lineUserId);
  if (!profile) { await replyText(replyToken, '❌ กรุณาแอด LINE และเริ่มต้นใช้งานก่อนครับ'); return; }
  if (!await checkSttAccess(admin, profile.id, profile.role)) {
    await replyText(replyToken, '❌ ไม่มีสิทธิ์ถอดเสียง (ต้องเปิดใช้งานฟีเจอร์แกะเสียงก่อน)'); return;
  }
  const activeOrg = await getOrSetActiveOrg(admin, profile.id, profile.line_active_org_id);
  if (!activeOrg) { await replyText(replyToken, '❌ ยังไม่ได้เลือกองค์กร พิมพ์ /org เพื่อเลือกองค์กรก่อน'); return; }

  const { data: q } = await admin.from('stt_quota').select('limit_seconds, used_seconds').eq('profile_id', profile.id).maybeSingle();
  const qRemain = ((q as { limit_seconds?: number } | null)?.limit_seconds ?? 18000) - ((q as { used_seconds?: number } | null)?.used_seconds ?? 0);
  if (qRemain <= 0) { await replyText(replyToken, '❌ นาทีถอดเสียงของคุณหมดแล้ว (0 นาที)\nสมัครแพ็กเกจรายเดือนเพื่อใช้ต่อ พิมพ์ /web เพื่อเปิดหน้าซื้อครับ'); return; }

  await handleMomAudio(admin, lineUserId, messageId, profile.id, activeOrg.id, '', replyToken);
}

// auto-onboarding เมื่อมี follow event → provision + welcome Flex (การ์ดต้อนรับสวย ๆ)
async function handleFollow(admin: ReturnType<typeof createAdminClient>, lineUserId: string) {
  const result = await provisionLineUser(admin, lineUserId);
  const name = result.displayName;
  const greeting = result.isNew ? `ยินดีต้อนรับ คุณ${name} 🎉` : `ยินดีต้อนรับกลับมา คุณ${name} 🙌`;

  // โควต้าคงเหลือ (ใหม่ = 300, กลับมา = ที่เหลือจริง)
  const { data: q } = await admin.from('stt_quota').select('limit_seconds, used_seconds').eq('profile_id', result.profileId).maybeSingle();
  const qq = q as { limit_seconds?: number; used_seconds?: number } | null;
  const remainMin = qq ? Math.max(0, Math.floor(((qq.limit_seconds ?? 18000) - (qq.used_seconds ?? 0)) / 60)) : 300;
  const giftLabel = result.isNew ? 'โควต้าฟรีสำหรับคุณ' : 'โควต้าคงเหลือ';

  const steps: Array<[string, string]> = [
    ['1', 'พิมพ์ /mom ในแชท'],
    ['2', 'ส่งไฟล์เสียงการประชุม'],
    ['3', 'รับรายงาน PDF อัตโนมัติ'],
  ];
  const stepBoxes = steps.map(([n, txt]) => ({
    type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', margin: 'md',
    contents: [
      {
        type: 'box', layout: 'vertical', width: '26px', height: '26px', backgroundColor: '#ECE8F4',
        cornerRadius: '13px', justifyContent: 'center', flex: 0,
        contents: [{ type: 'text', text: n, size: 'sm', weight: 'bold', color: '#4FC1E9', align: 'center' }],
      },
      { type: 'text', text: txt, size: 'sm', color: '#525866', wrap: true, gravity: 'center' },
    ],
  }));

  await sendLineMessages({
    to: lineUserId,
    messages: [{
      type: 'flex',
      altText: `ยินดีต้อนรับสู่ PERPOS Assistant — โควต้า ${remainMin} นาที`,
      contents: {
        type: 'bubble', size: 'mega',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#4FC1E9', paddingAll: '20px', paddingBottom: '16px', spacing: 'sm',
          contents: [
            { type: 'text', text: 'PERPOS Assistant', color: '#ffffff', weight: 'bold', size: 'xl' },
            { type: 'text', text: '🎙️ ถอดเสียงประชุม → รายงานการประชุม (PDF)', color: '#E5F6FC', size: 'xs', wrap: true },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
          contents: [
            { type: 'text', text: greeting, weight: 'bold', size: 'md', color: '#2A2A2C', wrap: true },
            {
              type: 'box', layout: 'horizontal', backgroundColor: '#F2FCF9', cornerRadius: '12px', paddingAll: '14px', spacing: 'md', alignItems: 'center',
              contents: [
                { type: 'text', text: '🎁', size: 'xxl', flex: 0, gravity: 'center' },
                {
                  type: 'box', layout: 'vertical', spacing: 'none',
                  contents: [
                    { type: 'text', text: giftLabel, size: 'xs', color: '#44A38B' },
                    { type: 'text', text: `${remainMin} นาที`, weight: 'bold', size: 'xxl', color: '#428B79' },
                  ],
                },
              ],
            },
            { type: 'separator', margin: 'lg' },
            { type: 'text', text: 'ใช้งานง่าย 3 ขั้นตอน', weight: 'bold', size: 'sm', color: '#3C3B3D', margin: 'lg' },
            ...stepBoxes,
          ],
        },
        footer: {
          type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px', paddingTop: '8px',
          contents: [
            { type: 'button', style: 'primary', color: '#4FC1E9', height: 'md',
              action: { type: 'message', label: '🎙️ เริ่มถอดเสียงเลย', text: '/mom' } },
            { type: 'text', text: 'รองรับไฟล์เสียง/วิดีโอ ไม่เกิน 200MB', size: 'xxs', color: '#9ca3af', align: 'center' },
          ],
        },
      },
    }],
  }).catch(() => undefined);
}

// ─── Main webhook handler ─────────────────────────────────────────────────────

const TMC_CMDS = ['รับ', 'จ่าย', 'บัญชี', 'stock', 'stkin', 'stkout', 'stk', 'เช็คอิน', 'pcin', 'pcout', 'pcbal', 'pcfunds', 'tmc'];
const CRM_CMDS = ['n', 'survey', 'issue', 'mtg', 'log', 'sol', 'status', 'notes', 'issues', 'hours'];

// ─── Meeting bot (Recall.ai) — วางลิงก์ประชุมใน LINE → บอทเข้าห้องอัด → MoM ────────
const BOT_MIN_START = 300;  // โควต้าบอทขั้นต่ำที่ส่งบอทแล้วคุ้ม (5 นาที)
const BOT_HOLD_CAP = 3600;  // เพดานจองต่อประชุม (60 นาที) — settle ปรับเป็นจริงทีหลัง
const BOT_TRIAL_LIMIT = 7200;

const PLATFORM_LABEL: Record<string, string> = {
  google_meet: 'Google Meet', zoom: 'Zoom', teams: 'Microsoft Teams',
};

function buildLinkConfirmFlex(platformLabel: string, remainMin: number, jobId: string) {
  return {
    type: 'flex' as const,
    altText: '🤖 ได้รับลิงก์ประชุมแล้ว — บอทกำลังเข้าห้อง',
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'horizontal', backgroundColor: '#3C3B3D', paddingAll: '14px',
        contents: [{ type: 'text', text: '🤖 ได้รับลิงก์ประชุมแล้ว', color: '#ffffff', weight: 'bold', size: 'md' }] },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '18px', contents: [
        { type: 'text', text: `📹 ${platformLabel}`, size: 'sm', color: '#1A1A1B' },
        { type: 'box', layout: 'horizontal', backgroundColor: '#E6F1FB', cornerRadius: '8px', paddingAll: '10px', margin: 'sm',
          contents: [{ type: 'text', text: '⏳ บอทกำลังเข้าห้องประชุม…', size: 'sm', color: '#0C447C', wrap: true }] },
        { type: 'text', text: 'บอทจะปรากฏในห้องชื่อ "PERPOS Assistant (AI Note-taker)" · เมื่อประชุมจบจะส่งรายงานการประชุม (MoM) กลับมาที่นี่', size: 'xs', wrap: true, color: '#656D78', margin: 'md' },
        { type: 'text', text: `⏱️ โควต้าบอทคงเหลือ ${remainMin} นาที`, size: 'xs', color: '#9CA3AF', margin: 'md' },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: '🔒 ผู้ส่งลิงก์รับผิดชอบการขอความยินยอมบันทึกในห้อง · ไฟล์เสียงถูกลบทันทีหลังสรุปเสร็จ', size: 'xxs', wrap: true, color: '#9CA3AF', margin: 'md' },
      ] },
      footer: { type: 'box', layout: 'vertical', paddingAll: '14px',
        contents: [{ type: 'button', style: 'secondary', height: 'sm',
          action: { type: 'postback', label: '✕ ยกเลิก ให้บอทออกจากห้อง', data: `botcancel:${jobId}`, displayText: 'ยกเลิกบอท' } }] },
    },
  };
}

/** คืนนาทีคงเหลือของ bot_quota (ไม่มี row = trial เต็ม) */
async function getBotRemaining(admin: ReturnType<typeof createAdminClient>, profileId: string): Promise<{ remainSec: number; remainMin: number }> {
  const { data } = await admin.from('bot_quota').select('limit_seconds, used_seconds').eq('profile_id', profileId).maybeSingle();
  const limit = (data as { limit_seconds?: number } | null)?.limit_seconds ?? BOT_TRIAL_LIMIT;
  const used = (data as { used_seconds?: number } | null)?.used_seconds ?? 0;
  const remainSec = Math.max(0, limit - used);
  return { remainSec, remainMin: Math.floor(remainSec / 60) };
}

/** วางลิงก์ประชุม → gate + hold + createBot → reply การ์ดยืนยัน. คืน true ถ้าจัดการแล้ว */
async function handleMeetingLink(admin: ReturnType<typeof createAdminClient>, lineUserId: string, text: string, replyToken: string): Promise<boolean> {
  const found = extractMeetingUrl(text);
  if (!found) return false;

  const profile = await getProfileByLineId(admin, lineUserId);
  if (!profile) {
    await replyText(replyToken, '❌ ยังไม่ได้ผูกบัญชี — แอด LINE OA นี้ใหม่อีกครั้งเพื่อเริ่มใช้งานครับ');
    return true;
  }
  if (!await checkSttAccess(admin, profile.id, profile.role)) {
    await replyText(replyToken, '❌ บัญชีนี้ยังไม่มีสิทธิ์ใช้ผู้ช่วย AI ครับ');
    return true;
  }
  const activeOrg = await getOrSetActiveOrg(admin, profile.id, profile.line_active_org_id);
  if (!activeOrg) {
    await replyText(replyToken, '❌ ไม่พบพื้นที่ทำงานของคุณ กรุณาลองใหม่ภายหลังครับ');
    return true;
  }

  const { remainSec, remainMin } = await getBotRemaining(admin, profile.id);
  if (remainSec < BOT_MIN_START) {
    await replyText(replyToken, `⏱️ โควต้าบอทเหลือ ${remainMin} นาที ไม่พอเริ่มประชุมครับ — เติมโควต้าก่อนนะครับ 🙏`);
    return true;
  }

  const dedupKey = makeDedupKey(found.url);
  const { data: dup } = await admin
    .from('assistant_jobs').select('bot_state')
    .eq('dedup_key', dedupKey)
    .maybeSingle();
  // dedup_key unique → มีได้แถวเดียว; ถ้ายัง active (ไม่ใช่ terminal) = กำลังทำอยู่
  const dupState = (dup as { bot_state?: string } | null)?.bot_state;
  if (dup && !['cancelled', 'fatal', 'create_failed', 'recording_ready', 'done'].includes(dupState ?? '')) {
    await replyText(replyToken, '🤖 บอทกำลังเข้าห้องประชุมนี้อยู่แล้วครับ');
    return true;
  }

  // dup เก่าที่จบแล้ว (terminal) ใน slot เดียวกัน → ลบทิ้งเพื่อปล่อย dedup_key ให้ paste ใหม่ได้
  if (dup) await admin.from('assistant_jobs').delete().eq('dedup_key', dedupKey);

  const EST = Math.min(remainSec, BOT_HOLD_CAP);
  const platformLabel = PLATFORM_LABEL[found.platform] ?? 'ห้องประชุม';

  // insert job ก่อน (dedup guard ระดับ DB) — ถ้าชน (race) ถือว่าซ้ำ
  const { data: jobRow, error: insErr } = await admin
    .from('assistant_jobs')
    .insert({
      org_id: activeOrg.id, profile_id: profile.id, source: 'recall', kind: 'stt',
      audio_url: null, file_name: `${platformLabel} recording`, mime_type: 'audio/mp4',
      meeting_url: found.url, dedup_key: dedupKey, hold_seconds: EST,
      bot_state: 'creating', triggered_by: profile.id,
    })
    .select('id').single();
  if (insErr || !jobRow) {
    await replyText(replyToken, '🤖 บอทกำลังเข้าห้องประชุมนี้อยู่แล้วครับ'); // unique violation = ซ้ำ
    return true;
  }
  const jobId = (jobRow as { id: string }).id;

  // hold โควต้า (atomic) — ถ้าไม่พอ (race) ลบ job + แจ้ง
  const { data: held } = await admin.rpc('hold_bot_quota', { p_profile_id: profile.id, p_seconds: EST, p_job_id: jobId });
  if (!held || (held as { ok?: boolean }).ok !== true) {
    await admin.from('assistant_jobs').delete().eq('id', jobId);
    await replyText(replyToken, '⏱️ โควต้าบอทไม่พอเริ่มประชุมครับ 🙏');
    return true;
  }

  // สั่งบอท — ครั้งเดียว (ห้าม retry 30 วิ inline: reply token หมดอายุ/LINE timeout)
  try {
    const bot = await createBot({
      meetingUrl: found.url, holdSeconds: EST,
      metadata: { profile_id: profile.id, job_id: jobId, org_id: activeOrg.id },
    });
    // บันทึก recall_bot_id "เสมอ" (กัน orphan — leave/cancel/scheduler ต้องใช้) + อ่าน state ปัจจุบัน
    // (webhook joining_call อาจมาถึงก่อน หรือผู้ใช้กดยกเลิกระหว่าง createBot)
    const { data: upd } = await admin.from('assistant_jobs')
      .update({ recall_bot_id: bot.id, updated_at: new Date().toISOString() })
      .eq('id', jobId).select('bot_state').single();
    const curState = (upd as { bot_state?: string } | null)?.bot_state;

    if (curState === 'cancelled') {
      // ผู้ใช้ยกเลิกระหว่าง createBot → สั่งบอทออกทันที กัน orphan (cancel handler ตอนนั้น recall_bot_id ยัง null)
      await leaveBot(bot.id).catch(() => false);
      return true; // การ์ดยกเลิกถูกส่งโดย cancel handler แล้ว
    }
    if (curState === 'creating') {
      await admin.from('assistant_jobs').update({ bot_state: 'scheduled' }).eq('id', jobId).eq('bot_state', 'creating');
    }
    // curState อื่น (joining/recording…) = webhook นำหน้าแล้ว → คงไว้
    await replyLine(replyToken, [buildLinkConfirmFlex(platformLabel, Math.floor(EST / 60), jobId)]);
  } catch (e) {
    // คืนโควต้าก่อน (ขณะ job ยังอยู่) แล้วลบ job เพื่อปล่อย dedup_key ให้ลองใหม่ได้
    await admin.rpc('refund_bot_quota', { p_job_id: jobId }).then(() => undefined, () => undefined);
    await admin.from('assistant_jobs').delete().eq('id', jobId);
    if (e instanceof AdhocPoolDepletedError) {
      await replyText(replyToken, '⏳ ระบบกำลังหนาแน่น ส่งลิงก์ประชุมอีกครั้งใน 1–2 นาทีได้เลยครับ 🙏');
    } else {
      await replyLine(replyToken, [buildBotFlex('fatal', { reason: 'เข้าห้องประชุมไม่สำเร็จ ลองใหม่อีกครั้งได้เลยครับ' })]);
    }
  }
  return true;
}

/** ปุ่มยกเลิกบอท (postback botcancel:<jobId>) → leave/delete + refund */
async function handleRecallCancel(admin: ReturnType<typeof createAdminClient>, lineUserId: string, jobId: string, replyToken: string): Promise<void> {
  const { data: jobData } = await admin
    .from('assistant_jobs')
    .select('id, profile_id, recall_bot_id, bot_state')
    .eq('id', jobId).maybeSingle();
  const job = jobData as { id: string; profile_id: string | null; recall_bot_id: string | null; bot_state: string | null } | null;
  if (!job) return;

  // ตรวจเจ้าของ (กันคนอื่นยกเลิกบอทเรา)
  const { data: prof } = await admin.from('profiles').select('line_user_id').eq('id', job.profile_id ?? '').maybeSingle();
  if ((prof as { line_user_id?: string } | null)?.line_user_id !== lineUserId) return;

  if (['cancelled', 'fatal', 'recording_ready', 'done'].includes(job.bot_state ?? '')) {
    await replyText(replyToken, 'งานนี้จบหรือถูกยกเลิกไปแล้วครับ');
    return;
  }

  if (job.recall_bot_id) {
    if (job.bot_state === 'scheduled') await deleteScheduledBot(job.recall_bot_id).catch(() => false);
    else await leaveBot(job.recall_bot_id).catch(() => false);
  }
  await admin.rpc('refund_bot_quota', { p_job_id: jobId }).then(() => undefined, () => undefined);
  await admin.from('assistant_jobs').update({ status: 'failed', bot_state: 'cancelled', updated_at: new Date().toISOString() }).eq('id', jobId);
  await replyText(replyToken, '✅ ยกเลิกบอทแล้ว คืนโควต้าให้เรียบร้อยครับ');
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-line-signature');

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const parsed = JSON.parse(rawBody) as { events: Record<string, unknown>[] };
  const admin = createAdminClient();

  for (const event of parsed.events ?? []) {
    // ─── Follow event — auto-onboarding (แอด LINE → สร้าง account + โควต้า + welcome) ──
    if (event.type === 'follow') {
      const fUserId = (event.source as Record<string, string>)?.userId ?? '';
      if (fUserId) {
        await handleFollow(admin, fUserId).catch((e) => console.error('[line] follow provision failed:', String(e)));
      }
      continue;
    }

    // ─── Postback — ปุ่มยืนยันถอดเสียงจาก Flex (ผู้ใช้ส่งไฟล์ก่อนพิมพ์ /mom) ──────
    if (event.type === 'postback') {
      const pbUserId = (event.source as Record<string, string>)?.userId ?? '';
      const pbReplyToken = String(event.replyToken ?? '');
      const pbData = String((event.postback as Record<string, unknown>)?.data ?? '');
      if (pbUserId && pbData.startsWith('momfile:')) {
        await handleMomConfirm(admin, pbUserId, pbData.slice('momfile:'.length), pbReplyToken);
      } else if (pbData === 'momcancel') {
        await replyText(pbReplyToken, 'รับทราบครับ — หากต้องการถอดเสียงภายหลัง พิมพ์ /mom แล้วส่งไฟล์ได้เลย 🙏');
      } else if (pbUserId && pbData.startsWith('botcancel:')) {
        await handleRecallCancel(admin, pbUserId, pbData.slice('botcancel:'.length), pbReplyToken);
      }
      continue;
    }

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

      const fileName = String(msg.fileName ?? '');
      const isAudioFile = msg.type === 'audio' || /\.(ogg|mp3|m4a|wav|mp4|aac|flac|webm|opus)$/i.test(fileName);

      // เช็ค session ก่อน (ถูกกว่า) — session เก็บ profile_id/org_id ไว้แล้ว ไม่ต้อง lookup profile ซ้ำ
      const { data: sess } = await admin
        .from('assistant_line_sessions')
        .select('org_id, profile_id, expires_at')
        .eq('line_user_id', lineUserId)
        .maybeSingle();
      const hasSession = sess && new Date(sess.expires_at as string).getTime() >= Date.now();

      // มี session /mom ค้างอยู่ → ถอดเสียงทันที (พฤติกรรมเดิม)
      if (hasSession) {
        if (msg.type === 'file' && !isAudioFile) {
          await replyText(replyToken, '❌ ไฟล์นี้ไม่ใช่ไฟล์เสียง/วิดีโอ กรุณาส่งไฟล์เสียง (mp3, ogg, m4a, wav, mp4)');
          continue;
        }
        await handleMomAudio(admin, lineUserId, messageId, String(sess!.profile_id), String(sess!.org_id), fileName, replyToken);
        continue;
      }

      // ไม่มี session — ถ้าเป็นไฟล์เสียง/วิดีโอ และผู้ใช้มีสิทธิ์ → ถามด้วย Flex ว่าจะถอดเสียงไหม
      if (!isAudioFile) continue; // ไฟล์เอกสาร/อื่น ๆ ไม่ยุ่ง
      const audioProfile = await getProfileByLineId(admin, lineUserId);
      if (!audioProfile) continue;
      if (!await checkSttAccess(admin, audioProfile.id, audioProfile.role)) continue;
      await replyLine(replyToken, [{
        type: 'flex',
        altText: 'ได้รับไฟล์เสียงแล้ว — ต้องการให้ถอดเป็นรายงานการประชุมไหม?',
        contents: {
          type: 'bubble',
          body: {
            type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '18px',
            contents: [
              {
                type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center',
                contents: [
                  { type: 'text', text: '🎧', size: 'lg', flex: 0 },
                  { type: 'text', text: 'ได้รับไฟล์เสียงแล้ว', weight: 'bold', size: 'md', color: '#4DB0D3', gravity: 'center' },
                ],
              },
              { type: 'separator', margin: 'md' },
              { type: 'text', text: 'ต้องการให้ช่วยถอดเป็นรายงานการประชุม (MoM) จากไฟล์นี้ไหมครับ?', size: 'sm', wrap: true, color: '#3C3B3D', margin: 'md' },
              ...(fileName ? [{ type: 'text', text: `📄 ${fileName}`, size: 'xs', wrap: true, color: '#9CA3AF' } as const] : []),
            ],
          },
          footer: {
            type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', paddingTop: '4px',
            contents: [
              { type: 'button', style: 'primary', color: '#4DB0D3', height: 'sm',
                action: { type: 'postback', label: 'ถอดเสียงเลย', data: `momfile:${messageId}`, displayText: 'ถอดเสียงไฟล์นี้' } },
              { type: 'button', style: 'secondary', height: 'sm',
                action: { type: 'postback', label: 'ไม่เป็นไร', data: 'momcancel', displayText: 'ไม่เป็นไร' } },
            ],
          },
        },
      }]);
      continue;
    }

    if (msg.type !== 'text') continue;

    const text = String(msg.text ?? '').trim();

    // วางลิงก์ประชุม (ไม่ขึ้นต้นด้วย /) → ส่งบอท Recall เข้าห้อง
    if (lineUserId && extractMeetingUrl(text)) {
      await handleMeetingLink(admin, lineUserId, text, replyToken);
      continue;
    }

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
        const hasStt = await checkSttAccess(admin, profile.id, profile.role);
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
            { type: 'text', text: code, size: 'xs', color: '#6C5A92', flex: 2, weight: 'bold' },
            { type: 'text', text: desc, size: 'xs', color: '#3C3B3D', flex: 4, wrap: true },
          ],
        });

        const bodyContents: unknown[] = [
          {
            type: 'box', layout: 'vertical', backgroundColor: '#F5F7FA', cornerRadius: 'md',
            paddingAll: '10px', borderWidth: '1px', borderColor: '#E6E9EE',
            contents: [{ type: 'text', text: `🏢 ${activeOrg?.name ?? 'ไม่มี Org'}`, size: 'sm', color: '#2A2A2C', weight: 'bold', wrap: true }],
          },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'คำสั่งหลัก', size: 'xs', color: '#9CA3AF', margin: 'md' },
          cmdRow('/org', 'ดู/เปลี่ยน Organization'),
          cmdRow('/help', 'แสดงคำสั่งทั้งหมด'),
        ];

        if (hasStt) {
          bodyContents.push(
            { type: 'separator', margin: 'md' },
            { type: 'text', text: 'ผู้ช่วย AI', size: 'xs', color: '#9CA3AF', margin: 'md' },
            cmdRow('/mom', 'ส่งไฟล์เสียง → ได้รายงานประชุม (PDF)'),
            cmdRow('/web', 'เปิดหน้าเว็บผู้ช่วย AI'),
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
              background: { type: 'linearGradient', angle: '135deg', startColor: '#2A2A2C', endColor: '#525866' },
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
      if (!await checkSttAccess(admin, profile.id, profile.role)) {
        await replyText(replyToken, '❌ ไม่มีสิทธิ์ถอดเสียง (ต้องเปิดใช้งานฟีเจอร์แกะเสียงก่อน)'); continue;
      }
      if (!activeOrg) {
        await replyText(replyToken, '❌ ยังไม่ได้เลือกองค์กร พิมพ์ /org เพื่อเลือกองค์กรก่อน'); continue;
      }
      // pre-check โควต้า — ถ้าหมดแล้วไม่ต้องเปิด session
      const { data: q } = await admin.from('stt_quota').select('limit_seconds, used_seconds').eq('profile_id', profile.id).maybeSingle();
      const qRemain = ((q as { limit_seconds?: number } | null)?.limit_seconds ?? 18000) - ((q as { used_seconds?: number } | null)?.used_seconds ?? 0);
      if (qRemain <= 0) {
        await replyLine(replyToken, [{
          type: 'flex',
          altText: 'โควต้าถอดเสียงหมดแล้ว — ติดต่อแอดมินเพื่อเพิ่มโควต้า',
          contents: {
            type: 'bubble',
            header: {
              type: 'box', layout: 'vertical', backgroundColor: '#C43448', paddingAll: '16px',
              contents: [{ type: 'text', text: '⏱️ โควต้าหมดแล้ว', color: '#ffffff', weight: 'bold', size: 'md' }],
            },
            body: {
              type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px',
              contents: [
                { type: 'text', text: 'โควต้าถอดเสียงของคุณคงเหลือ 0 นาที', weight: 'bold', size: 'sm', color: '#1A1A1B', wrap: true },
                { type: 'text', text: 'กรุณาติดต่อแอดมินเพื่อขอเพิ่มโควต้า แล้วจึงส่งไฟล์ได้อีกครั้ง 🙏', size: 'xs', color: '#656D78', wrap: true, margin: 'sm' },
              ],
            },
          },
        }]); continue;
      }
      // best-effort: เก็บกวาด session หมดอายุที่ค้างไว้
      void admin.from('assistant_line_sessions').delete().lt('expires_at', new Date().toISOString());
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await admin.from('assistant_line_sessions').upsert({
        line_user_id: lineUserId, org_id: activeOrg.id, profile_id: profile.id, action: 'mom', expires_at: expiresAt,
      }, { onConflict: 'line_user_id' });
      await replyLine(replyToken, [{
        type: 'flex',
        altText: 'พร้อมรับไฟล์เสียง — ส่งไฟล์การประชุมมาได้เลย',
        contents: {
          type: 'bubble',
          header: {
            type: 'box', layout: 'vertical', backgroundColor: '#4DB0D3', paddingAll: '18px', paddingBottom: '14px', spacing: 'xs',
            contents: [
              { type: 'text', text: '🎙️ ถอดเสียงเป็นรายงานการประชุม', color: '#ffffff', weight: 'bold', size: 'md', wrap: true },
              { type: 'text', text: 'Minutes of Meeting', color: '#E5F6FC', size: 'xxs' },
            ],
          },
          body: {
            type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
            contents: [
              { type: 'text', text: 'ส่งไฟล์เสียงการประชุมเข้ามาได้เลยครับ', weight: 'bold', size: 'sm', color: '#2A2A2C', wrap: true },
              {
                type: 'box', layout: 'vertical', spacing: 'sm',
                contents: [
                  {
                    type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center',
                    contents: [
                      { type: 'text', text: '🎧', size: 'sm', flex: 0 },
                      { type: 'text', text: 'รองรับไฟล์เสียง / วิดีโอ ขนาดไม่เกิน 200MB', size: 'xs', color: '#656D78', wrap: true, gravity: 'center' },
                    ],
                  },
                  {
                    type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center',
                    contents: [
                      { type: 'text', text: '⏱️', size: 'sm', flex: 0 },
                      { type: 'text', text: `โควต้าคงเหลือ ${Math.floor(qRemain / 60)} นาที`, size: 'xs', color: '#656D78', wrap: true, gravity: 'center' },
                    ],
                  },
                  {
                    type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center',
                    contents: [
                      { type: 'text', text: '📄', size: 'sm', flex: 0 },
                      { type: 'text', text: 'ได้รับไฟล์ PDF รายงานการประชุมกลับอัตโนมัติ', size: 'xs', color: '#656D78', wrap: true, gravity: 'center' },
                    ],
                  },
                ],
              },
            ],
          },
        },
      }]);
      continue;
    }

    if (cmd === 'web') {
      // magic link เคลมบัญชี/ดูประวัติบนเว็บ (one-time, อายุ 5 นาที)
      const token = crypto.randomBytes(24).toString('base64url');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await admin.from('web_login_tokens').insert({ token, profile_id: profile.id, expires_at: expiresAt });
      const baseUrl = (process.env.APP_BASE_URL ?? 'https://app.perpos.io').replace(/\/$/, '');
      await replyText(replyToken,
        '🔗 เปิดลิงก์นี้เพื่อเข้าเว็บผู้ช่วย AI (เข้าระบบอัตโนมัติ ดูประวัติ/ดาวน์โหลดรายงาน)\n' +
        `${baseUrl}/line/claim?t=${token}\n\n` +
        '⏳ ลิงก์ใช้ได้ภายใน 5 นาที',
      );
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
              background: { type: 'linearGradient', angle: '135deg', startColor: '#C43448', endColor: '#E36A7B' },
              contents: [
                { type: 'text', text: '❌ ORG ไม่รองรับ', weight: 'bold', color: '#FFFFFF', size: 'sm' },
                { type: 'text', text: `${activeOrg?.name ?? 'ไม่มี Org'}`, weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
              ],
            },
            body: {
              type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
              contents: [{
                type: 'box', layout: 'vertical', backgroundColor: '#FCF1F2', cornerRadius: 'md',
                paddingAll: '12px', borderWidth: '1px', borderColor: '#F3C2C9',
                contents: [{ type: 'text', text: 'พิมพ์ /org เพื่อดูและเปลี่ยน Org', color: '#C43448', size: 'sm', wrap: true }],
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
              background: { type: 'linearGradient', angle: '135deg', startColor: '#C43448', endColor: '#E36A7B' },
              contents: [
                { type: 'text', text: '❌ ไม่มี Organization', weight: 'bold', color: '#FFFFFF', size: 'sm' },
                { type: 'text', text: 'กรุณาตั้งค่า Org ก่อน', weight: 'bold', size: 'md', color: '#FFFFFF', margin: 'xs', wrap: true },
              ],
            },
            body: {
              type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
              contents: [{
                type: 'box', layout: 'vertical', backgroundColor: '#FCF1F2', cornerRadius: 'md',
                paddingAll: '12px', borderWidth: '1px', borderColor: '#F3C2C9',
                contents: [{ type: 'text', text: 'พิมพ์ /org เพื่อตั้งค่า', color: '#C43448', size: 'sm', wrap: true }],
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
