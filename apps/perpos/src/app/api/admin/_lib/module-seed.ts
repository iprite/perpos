/**
 * Module-specific seed functions.
 * Called when a specific module is first enabled for an org.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── TMC ─────────────────────────────────────────────────────────────────────────

const TMC_FINANCE_CATEGORIES = [
  'รายรับ ค่าเช่า', 'ค่ามัดจำ', 'คืนเงินมัดจำ', 'ค่าอาหาร', 'อาหารเช้า',
  'หมูกระทะ', 'บาร์บีคิว', 'ค่าแรง(เงินเดือน+จ้างนอก)', 'ค่าไฟ', 'ค่าน้ำ',
  'ซักผ้า', 'ล้างแอร์', 'ค่าของใช้ทั่วไป', 'ค่าโทรศัพท์', 'ค่าใช้จ่ายอื่นๆ',
  'ค่าส่งของ', 'ค่าเสื้อพนักงาน', 'ค่านวด', 'เงินสดย่อย', 'แมคโค',
  'ส่วนกลาง', 'บัญชี', 'Timber',
];

const TMC_PETTY_CASH_CATEGORIES = [
  'ค่าอาหาร', 'อาหารเช้า', 'หมูกระทะ', 'บาร์บีคิว', 'ค่าแรง',
  'ค่าไฟ', 'ค่าน้ำ', 'ซักผ้า', 'ล้างแอร์', 'ค่าของใช้ทั่วไป',
  'ค่าโทรศัพท์', 'ค่าส่งของ', 'ค่าเสื้อพนักงาน', 'ค่านวด', 'แมคโค',
  'Timber', 'ค่าใช้จ่ายอื่นๆ', 'ค่าแรง(เงินเดือน+จ้างนอก)', 'ค่าน้ำมัน',
  'เติมหมึกปริ้น', 'ประกันสังคม',
];

const TMC_STOCK_UNITS = [
  'ชิ้น', 'ผืน', 'ถุง', 'กล่อง', 'แพ็ค', 'ขวด', 'ลัง', 'โหล', 'กก.', 'ม้วน',
];

const TMC_STOCK_CATEGORIES = [
  'ผ้า', 'ของใช้ห้องน้ำ', 'อาหาร/เครื่องดื่ม', 'อุปกรณ์', 'ทำความสะอาด', 'อื่นๆ',
];

const TMC_DEFAULT_ACCOUNTS = [
  { name: 'ออมทรัพย์',    account_type: 'savings',    sort_order: 1 },
  { name: 'กระแสรายวัน', account_type: 'current',    sort_order: 2 },
  { name: 'เงินสดย่อย',  account_type: 'petty_cash', sort_order: 3 },
];

export async function seedTmc(orgId: string, admin: SupabaseClient): Promise<Record<string, number>> {
  const seeded: Record<string, number> = {};

  const { data: finCats } = await admin
    .from('tmc_finance_categories')
    .insert(TMC_FINANCE_CATEGORIES.map((name, i) => ({ org_id: orgId, name, sort_order: i + 1 })))
    .select('id');
  seeded.finance_categories = finCats?.length ?? 0;

  const { data: pcCats } = await admin
    .from('tmc_petty_cash_categories')
    .insert(TMC_PETTY_CASH_CATEGORIES.map((name, i) => ({ org_id: orgId, name, sort_order: i + 1 })))
    .select('id');
  seeded.petty_cash_categories = pcCats?.length ?? 0;

  const { data: funds } = await admin
    .from('tmc_petty_cash_funds')
    .insert([{ org_id: orgId, name: 'กองทุนหลัก' }])
    .select('id');
  seeded.petty_cash_funds = funds?.length ?? 0;

  const { data: accounts } = await admin
    .from('tmc_accounts')
    .insert(TMC_DEFAULT_ACCOUNTS.map(a => ({ org_id: orgId, ...a })))
    .select('id');
  seeded.accounts = accounts?.length ?? 0;

  const { data: units } = await admin
    .from('tmc_stock_units')
    .insert(TMC_STOCK_UNITS.map((name, i) => ({ org_id: orgId, name, sort_order: i + 1 })))
    .select('id');
  seeded.stock_units = units?.length ?? 0;

  const { data: stockCats } = await admin
    .from('tmc_stock_categories')
    .insert(TMC_STOCK_CATEGORIES.map((name, i) => ({ org_id: orgId, name, sort_order: i + 1 })))
    .select('id');
  seeded.stock_categories = stockCats?.length ?? 0;

  return seeded;
}

/** Call the right seed function for a module. Returns null if no seeding needed. */
export async function seedModule(
  moduleKey: string,
  orgId: string,
  admin: SupabaseClient,
): Promise<Record<string, number> | null> {
  if (moduleKey === 'tmc') return seedTmc(orgId, admin);
  return null;
}
