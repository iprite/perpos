/**
 * Module-specific seed functions.
 * Called when a specific module is first enabled for an org.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── TMC ─────────────────────────────────────────────────────────────────────────

const TMC_FINANCE_CATEGORIES = [
  "รายรับ ค่าเช่า",
  "ค่ามัดจำ",
  "คืนเงินมัดจำ",
  "ค่าอาหาร",
  "อาหารเช้า",
  "หมูกระทะ",
  "บาร์บีคิว",
  "ค่าแรง(เงินเดือน+จ้างนอก)",
  "ค่าไฟ",
  "ค่าน้ำ",
  "ซักผ้า",
  "ล้างแอร์",
  "ค่าของใช้ทั่วไป",
  "ค่าโทรศัพท์",
  "ค่าใช้จ่ายอื่นๆ",
  "ค่าส่งของ",
  "ค่าเสื้อพนักงาน",
  "ค่านวด",
  "เงินสดย่อย",
  "แมคโค",
  "ส่วนกลาง",
  "บัญชี",
  "Timber",
];

const TMC_PETTY_CASH_CATEGORIES = [
  "ค่าอาหาร",
  "อาหารเช้า",
  "หมูกระทะ",
  "บาร์บีคิว",
  "ค่าแรง",
  "ค่าไฟ",
  "ค่าน้ำ",
  "ซักผ้า",
  "ล้างแอร์",
  "ค่าของใช้ทั่วไป",
  "ค่าโทรศัพท์",
  "ค่าส่งของ",
  "ค่าเสื้อพนักงาน",
  "ค่านวด",
  "แมคโค",
  "Timber",
  "ค่าใช้จ่ายอื่นๆ",
  "ค่าแรง(เงินเดือน+จ้างนอก)",
  "ค่าน้ำมัน",
  "เติมหมึกปริ้น",
  "ประกันสังคม",
];

const TMC_STOCK_UNITS = ["ชิ้น", "ผืน", "ถุง", "กล่อง", "แพ็ค", "ขวด", "ลัง", "โหล", "กก.", "ม้วน"];

const TMC_STOCK_CATEGORIES = [
  "ผ้า",
  "ของใช้ห้องน้ำ",
  "อาหาร/เครื่องดื่ม",
  "อุปกรณ์",
  "ทำความสะอาด",
  "อื่นๆ",
];

const TMC_DEFAULT_ACCOUNTS = [
  { name: "ออมทรัพย์", account_type: "savings", sort_order: 1 },
  { name: "กระแสรายวัน", account_type: "current", sort_order: 2 },
  { name: "เงินสดย่อย", account_type: "petty_cash", sort_order: 3 },
];

export async function seedTmc(
  orgId: string,
  admin: SupabaseClient,
): Promise<Record<string, number>> {
  const seeded: Record<string, number> = {};

  const { data: finCats } = await admin
    .from("tmc_finance_categories")
    .insert(TMC_FINANCE_CATEGORIES.map((name, i) => ({ org_id: orgId, name, sort_order: i + 1 })))
    .select("id");
  seeded.finance_categories = finCats?.length ?? 0;

  const { data: pcCats } = await admin
    .from("tmc_petty_cash_categories")
    .insert(
      TMC_PETTY_CASH_CATEGORIES.map((name, i) => ({ org_id: orgId, name, sort_order: i + 1 })),
    )
    .select("id");
  seeded.petty_cash_categories = pcCats?.length ?? 0;

  const { data: funds } = await admin
    .from("tmc_petty_cash_funds")
    .insert([{ org_id: orgId, name: "กองทุนหลัก" }])
    .select("id");
  seeded.petty_cash_funds = funds?.length ?? 0;

  const { data: accounts } = await admin
    .from("tmc_accounts")
    .insert(TMC_DEFAULT_ACCOUNTS.map((a) => ({ org_id: orgId, ...a })))
    .select("id");
  seeded.accounts = accounts?.length ?? 0;

  const { data: units } = await admin
    .from("tmc_stock_units")
    .insert(TMC_STOCK_UNITS.map((name, i) => ({ org_id: orgId, name, sort_order: i + 1 })))
    .select("id");
  seeded.stock_units = units?.length ?? 0;

  const { data: stockCats } = await admin
    .from("tmc_stock_categories")
    .insert(TMC_STOCK_CATEGORIES.map((name, i) => ({ org_id: orgId, name, sort_order: i + 1 })))
    .select("id");
  seeded.stock_categories = stockCats?.length ?? 0;

  return seeded;
}

// ── Accounting ────────────────────────────────────────────────────────────────
// ผังบัญชีมาตรฐาน SME ไทย — header (X000, ไม่มี parent) + บัญชีย่อย (parent = X000)
// ทุกบัญชี is_system=true (ลบไม่ได้, ผู้ใช้เพิ่มบัญชีย่อยเองได้ที่หน้า /accounting/accounts)

type AccType = "asset" | "liability" | "equity" | "income" | "expense";

const STANDARD_THAI_CHART: { code: string; name: string; account_type: AccType }[] = [
  // 1xxx สินทรัพย์
  { code: "1000", name: "สินทรัพย์", account_type: "asset" },
  { code: "1010", name: "เงินสด", account_type: "asset" },
  { code: "1020", name: "เงินฝากธนาคาร", account_type: "asset" },
  { code: "1100", name: "ลูกหนี้การค้า", account_type: "asset" },
  { code: "1130", name: "สินค้าคงเหลือ", account_type: "asset" },
  { code: "1150", name: "ภาษีซื้อ", account_type: "asset" },
  // ลูกค้าหักภาษี ณ ที่จ่ายจากเรา = ภาษีจ่ายล่วงหน้า (สินทรัพย์) ใช้เครดิตภาษีเงินได้ตอนสิ้นปี
  { code: "1160", name: "ภาษีเงินได้ถูกหัก ณ ที่จ่าย", account_type: "asset" },
  { code: "1510", name: "อุปกรณ์", account_type: "asset" },
  { code: "1520", name: "ยานพาหนะ", account_type: "asset" },
  { code: "1590", name: "ค่าเสื่อมราคาสะสม", account_type: "asset" },
  // 2xxx หนี้สิน
  { code: "2000", name: "หนี้สิน", account_type: "liability" },
  { code: "2100", name: "เจ้าหนี้การค้า", account_type: "liability" },
  { code: "2150", name: "ภาษีขาย", account_type: "liability" },
  { code: "2210", name: "ภาษีหัก ณ ที่จ่ายค้างจ่าย (ภงด.1)", account_type: "liability" },
  // เราหักภาษี ณ ที่จ่ายจากผู้รับเงิน แล้วค้างนำส่งสรรพากร — แยกตามแบบที่ต้องยื่น
  { code: "2211", name: "ภาษีหัก ณ ที่จ่ายค้างจ่าย (ภงด.3)", account_type: "liability" },
  { code: "2212", name: "ภาษีหัก ณ ที่จ่ายค้างจ่าย (ภงด.53)", account_type: "liability" },
  { code: "2220", name: "ประกันสังคมค้างจ่าย", account_type: "liability" },
  { code: "2230", name: "กองทุนสำรองเลี้ยงชีพค้างจ่าย", account_type: "liability" },
  { code: "2240", name: "เงินหักอื่นค้างจ่าย", account_type: "liability" },
  // 3xxx ส่วนของเจ้าของ
  { code: "3000", name: "ส่วนของเจ้าของ", account_type: "equity" },
  { code: "3100", name: "ทุนจดทะเบียน", account_type: "equity" },
  { code: "3200", name: "กำไรสะสม", account_type: "equity" },
  // 4xxx รายได้
  { code: "4000", name: "รายได้", account_type: "income" },
  { code: "4100", name: "รายได้จากการขายสินค้า", account_type: "income" },
  { code: "4200", name: "รายได้จากการให้บริการ", account_type: "income" },
  { code: "4900", name: "รายได้อื่น", account_type: "income" },
  // 5xxx ค่าใช้จ่าย
  { code: "5000", name: "ค่าใช้จ่าย", account_type: "expense" },
  { code: "5100", name: "เงินเดือนและค่าจ้าง", account_type: "expense" },
  { code: "5110", name: "ค่าใช้จ่ายประกันสังคม (นายจ้าง)", account_type: "expense" },
  { code: "5120", name: "ค่าใช้จ่ายกองทุนสำรองเลี้ยงชีพ (นายจ้าง)", account_type: "expense" },
  { code: "5300", name: "ต้นทุนขาย", account_type: "expense" },
  { code: "5400", name: "ค่าเช่า", account_type: "expense" },
  { code: "5410", name: "ค่าสาธารณูปโภค", account_type: "expense" },
  { code: "5500", name: "ค่าใช้จ่ายในการขายและบริหาร", account_type: "expense" },
  { code: "5800", name: "ค่าเสื่อมราคา", account_type: "expense" },
  { code: "5900", name: "ค่าใช้จ่ายอื่น", account_type: "expense" },
];

/**
 * seed ผังบัญชีมาตรฐาน + acc_org_settings ให้ org (idempotent — ข้ามถ้ามีผังแล้ว).
 * header (X000) insert ก่อน แล้วบัญชีย่อยผูก parent_id = X000.
 */
export async function seedAccounting(
  orgId: string,
  admin: SupabaseClient,
): Promise<Record<string, number>> {
  const seeded: Record<string, number> = {};

  // idempotent: ถ้ามีผังอยู่แล้ว ข้าม (กัน seed ซ้ำ/ทับของผู้ใช้)
  const { count } = await admin
    .from("acc_accounts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  // มีผังแล้ว = seed รอบก่อน → ข้ามผังบัญชี แต่ **ยังต้องเติมงวด/settings**
  // (org ที่ seed ไปก่อนฟีเจอร์งวดจะไม่มี acc_periods เลย → ต้อง backfill ตอนเรียกซ้ำ)
  if ((count ?? 0) > 0) {
    seeded.accounts = 0;
    await admin
      .from("acc_org_settings")
      .upsert({ org_id: orgId }, { onConflict: "org_id", ignoreDuplicates: true });
    seeded.periods = await seedAccountingPeriods(orgId, admin, new Date().getFullYear());
    return seeded;
  }

  // 1. header (X000, ไม่มี parent)
  const headers = STANDARD_THAI_CHART.filter((a) => a.code.endsWith("000"));
  const { data: hdrRows, error: hErr } = await admin
    .from("acc_accounts")
    .insert(
      headers.map((h) => ({
        org_id: orgId,
        code: h.code,
        name: h.name,
        account_type: h.account_type,
        is_system: true,
      })),
    )
    .select("id, code");
  if (hErr) throw new Error(`seedAccounting headers: ${hErr.message}`);
  const hdrByCode = new Map((hdrRows ?? []).map((r) => [String(r.code), String(r.id)]));

  // 2. บัญชีย่อย (parent = X000 ตามหลักแรกของ code)
  const children = STANDARD_THAI_CHART.filter((a) => !a.code.endsWith("000"));
  const { data: childRows, error: cErr } = await admin
    .from("acc_accounts")
    .insert(
      children.map((c) => ({
        org_id: orgId,
        code: c.code,
        name: c.name,
        account_type: c.account_type,
        is_system: true,
        parent_id: hdrByCode.get(`${c.code[0]}000`) ?? null,
      })),
    )
    .select("id");
  if (cErr) throw new Error(`seedAccounting children: ${cErr.message}`);
  seeded.accounts = (hdrRows?.length ?? 0) + (childRows?.length ?? 0);

  // 3. acc_org_settings (ค่า default — Non-VAT, เริ่มงวด ม.ค.) เพื่อให้หน้า settings ทำงาน
  await admin
    .from("acc_org_settings")
    .upsert({ org_id: orgId }, { onConflict: "org_id", ignoreDuplicates: true });

  // 4. งวดบัญชีของปีปัจจุบัน 12 งวด (เปิดทั้งหมด)
  //    ถ้าไม่มีงวด: journal ที่ลงจะได้ period_id = null → ปิดงวดไม่คุม, รายงานรายงวดเพี้ยน
  //    และ auto journal ของเอกสารซื้อ/ขายจะผูกงวดไม่ได้ → ต้อง seed มาพร้อมโมดูล
  seeded.periods = await seedAccountingPeriods(orgId, admin, new Date().getFullYear());

  return seeded;
}

/**
 * สร้างงวดบัญชี 12 เดือนของปีที่ระบุ (idempotent — ข้ามงวดที่มีแล้ว)
 * แยกเป็นฟังก์ชันเพื่อ backfill org เดิมที่ seed ไปก่อนหน้าได้ด้วย
 */
export async function seedAccountingPeriods(
  orgId: string,
  admin: SupabaseClient,
  year: number,
): Promise<number> {
  const { data: existing } = await admin
    .from("acc_periods")
    .select("month")
    .eq("org_id", orgId)
    .eq("year", year);
  const have = new Set((existing ?? []).map((r) => Number((r as { month: number }).month)));

  const rows = Array.from({ length: 12 }, (_, i) => i + 1)
    .filter((m) => !have.has(m))
    .map((m) => ({ org_id: orgId, year, month: m, status: "open" }));
  if (rows.length === 0) return 0;

  const { error } = await admin.from("acc_periods").insert(rows);
  if (error) throw new Error(`seedAccountingPeriods: ${error.message}`);
  return rows.length;
}

/** Call the right seed function for a module. Returns null if no seeding needed. */
export async function seedModule(
  moduleKey: string,
  orgId: string,
  admin: SupabaseClient,
): Promise<Record<string, number> | null> {
  if (moduleKey === "tmc") return seedTmc(orgId, admin);
  if (moduleKey === "accounting") return seedAccounting(orgId, admin);
  return null;
}
