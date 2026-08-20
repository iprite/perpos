/**
 * computeTmcDashboard — ภาพรวมธุรกิจ TMC (finance + petty cash + stays + stock)
 * aggregate รายเดือน/แปลง/หมวด/ยอดรวม จาก 5 ตาราง tmc_*
 *
 * ใช้ร่วม 2 ที่:
 *   - Server Component (hydrogen)/[orgSlug]/tmc/page.tsx → fetch ตอน SSR (range จาก searchParams)
 *   - API route /api/tmc/dashboard → คงไว้ (เผื่อ caller อื่น)
 *
 * รับ `db` = **RLS-scoped client** (createSupabaseServerClient ฝั่ง page / createAuthedClient ฝั่ง route)
 * — auth/membership check เป็นหน้าที่ caller · ห้ามส่ง admin service-role client (จะ bypass RLS ข้าม org)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { availableNightsIn, isOpenOn, openCodesOn, type RentableProperty } from "./rentable";

export type Totals = {
  finance: { income: number; expense: number };
  petty: { top_up: number; expense: number };
  stays: { count: number; nights: number; revenue: number };
  stock: { items: number; low: number };
  staysAllTime: number;
  /** อัตราการเข้าพัก — คิดจากห้องที่เปิดขาย (tmc_properties.is_rentable) เท่านั้น */
  occupancy: { rate: number | null; soldNights: number; availableNights: number; rooms: number };
};
export type Monthly = {
  month: string;
  income?: number;
  expense?: number;
  top_up?: number;
  stays?: number;
  nights?: number;
  revenue?: number;
  food?: number;
  /** อัตราการเข้าพักของเดือนนั้น (%) — null เมื่อไม่มีห้องเปิดขาย */
  occupancy?: number | null;
};
export type PropRow = {
  property: string;
  finIncome: number;
  finExpense: number;
  pettyExpense: number;
  stays: number;
  nights: number;
  stayRevenue: number;
};
export type CatRow = { category: string; income: number; expense: number };

export type TmcDashData = {
  totals: Totals;
  financeMonthly: Monthly[];
  pettyMonthly: Monthly[];
  staysMonthly: Monthly[];
  byProperty: PropRow[];
  byCategory: CatRow[];
  stockLow: { name: string; qty: number }[];
};

const PETTY_CASH_ACCOUNT = "2366c3f9-dcc5-4091-8ab0-c421b77e7fe7";

/**
 * หมวดฝั่งบัญชีที่เป็น "เงินโยกภายใน" ไปเติมกองเงินสดย่อย — ไม่ใช่รายจ่ายจริง
 * ต้องตัดออกเสมอ ไม่งั้นนับซ้ำกับรายจ่ายเงินสดย่อย (เงินก้อนเดียวถูกนับ 2 รอบ)
 */
const PETTY_TRANSFER_CATEGORY = "เงินสดย่อย";

/** หมวดเงินมัดจำ (เงินของแขก ไม่ใช่รายได้/รายจ่ายจริง) — ตัดออกได้ผ่านตัวกรองบนแดชบอร์ด */
export const DEPOSIT_CATEGORIES = ["ค่ามัดจำ", "คืนเงินมัดจำ"];

const DAY_MS = 86_400_000;

/**
 * กระจายคืนของ stay ตาม "วันที่พักจริง" — คืนของวันที่ X นับเข้าเดือนของ X
 * (เช่น 31 ธ.ค. → 2 ม.ค. = ธ.ค. 1 คืน + ม.ค. 1 คืน) · clip ให้อยู่ในช่วง [from, to]
 */
function nightsPerMonth(
  checkIn: string,
  checkOut: string | null,
  from: string,
  to: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of nightsList(checkIn, checkOut, from, to)) {
    const m = d.slice(0, 7);
    out[m] = (out[m] ?? 0) + 1;
  }
  return out;
}

/** วันที่ของคืนที่ stay ครอบครอง (clip ให้อยู่ในช่วง [from, to]) — YYYY-MM-DD */
function nightsList(checkIn: string, checkOut: string | null, from: string, to: string): string[] {
  const startMs = Math.max(new Date(checkIn).getTime(), new Date(from).getTime());
  const endMs = Math.min(
    checkOut ? new Date(checkOut).getTime() : new Date(checkIn).getTime() + DAY_MS,
    new Date(to).getTime() + DAY_MS,
  );
  const out: string[] = [];
  for (let t = startMs; t < endMs; t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export async function computeTmcDashboard(
  db: SupabaseClient,
  orgId: string,
  range: { from: string; to: string },
  opts?: { excludeDeposits?: boolean },
): Promise<TmcDashData> {
  const { from, to } = range;

  const [finRes, pettyRes, staysRes, stockRes, staysCountRes] = await Promise.all([
    db
      .from("tmc_finance_entries")
      .select("entry_date, income, expense, category, property_code, account_id")
      .eq("org_id", orgId)
      .neq("account_id", PETTY_CASH_ACCOUNT)
      .gte("entry_date", from)
      .lte("entry_date", to),
    db
      .from("tmc_petty_cash_txns")
      .select("txn_date, txn_type, amount, category, property_code")
      .eq("org_id", orgId)
      .gte("txn_date", from)
      .lte("txn_date", to),
    // stays ที่ "คาบเกี่ยว" ช่วง (ไม่ใช่แค่ check_in ในช่วง) — คืนต้องนับตามวันที่พักจริง
    db
      .from("tmc_stays")
      .select(
        "check_in, check_out, room_rate, food_amount, drink_amount, mookata_amount, bbq_amount, property_code",
      )
      .eq("org_id", orgId)
      .lte("check_in", to)
      .or(`check_out.is.null,check_out.gt.${from}`),
    db
      .from("tmc_stock_items")
      .select("name, current_qty, min_quantity")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("current_qty", { ascending: true }),
    db.from("tmc_stays").select("id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);

  // ─── Occupancy — ห้องที่เปิดขายจริงเท่านั้น (ใช้ stayRows ชุดเดียวกัน — คาบเกี่ยวช่วงอยู่แล้ว) ───
  const rentableRes = await db
    .from("tmc_properties")
    .select("code, rentable_from")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .eq("is_rentable", true);

  // ตัดหมวด "เงินสดย่อย" (เงินโยกไปเติมกอง) ออกจากสมุดบัญชีเสมอ — กันนับซ้ำกับรายจ่ายเงินสดย่อย
  // + ตัดหมวดมัดจำเมื่อผู้ใช้เลือก "ไม่รวมมัดจำ" (เงินของแขก ไม่ใช่รายได้/รายจ่ายจริง)
  const finRows = (finRes.data ?? []).filter(
    (e) =>
      e.category !== PETTY_TRANSFER_CATEGORY &&
      (!opts?.excludeDeposits || !DEPOSIT_CATEGORIES.includes(e.category ?? "")),
  );
  const pettyRows = pettyRes.data ?? [];
  const stayRows = staysRes.data ?? [];

  // ─── Monthly aggregates ───
  const finByMonth: Record<string, { income: number; expense: number }> = {};
  const pettyByMonth: Record<string, { top_up: number; expense: number }> = {};
  const staysByMonth: Record<
    string,
    { stays: number; nights: number; revenue: number; food: number }
  > = {};

  for (const e of finRows) {
    const m = e.entry_date.slice(0, 7);
    if (!finByMonth[m]) finByMonth[m] = { income: 0, expense: 0 };
    finByMonth[m].income += Number(e.income ?? 0);
    finByMonth[m].expense += Number(e.expense ?? 0);
  }
  for (const t of pettyRows) {
    const m = t.txn_date.slice(0, 7);
    if (!pettyByMonth[m]) pettyByMonth[m] = { top_up: 0, expense: 0 };
    if (t.txn_type === "top_up") pettyByMonth[m].top_up += Number(t.amount);
    if (t.txn_type === "expense") pettyByMonth[m].expense += Number(t.amount);
  }
  for (const s of stayRows) {
    // ครั้ง/รายรับ/อาหาร นับเข้าเดือนที่เช็คอิน (เฉพาะ stay ที่เช็คอินในช่วง)
    if (s.check_in >= from && s.check_in <= to) {
      const m = s.check_in.slice(0, 7);
      if (!staysByMonth[m]) staysByMonth[m] = { stays: 0, nights: 0, revenue: 0, food: 0 };
      staysByMonth[m].stays++;
      staysByMonth[m].revenue += Number(s.room_rate ?? 0);
      staysByMonth[m].food +=
        Number(s.food_amount ?? 0) +
        Number(s.drink_amount ?? 0) +
        Number(s.mookata_amount ?? 0) +
        Number(s.bbq_amount ?? 0);
    }
    // คืน กระจายตามวันที่พักจริง (stay คร่อมเดือน → แยกคืนเข้าแต่ละเดือน)
    for (const [m, n] of Object.entries(nightsPerMonth(s.check_in, s.check_out, from, to))) {
      if (!staysByMonth[m]) staysByMonth[m] = { stays: 0, nights: 0, revenue: 0, food: 0 };
      staysByMonth[m].nights += n;
    }
  }

  const allMonths = Array.from(
    new Set([
      ...Object.keys(finByMonth),
      ...Object.keys(pettyByMonth),
      ...Object.keys(staysByMonth),
    ]),
  ).sort();

  const financeMonthly = allMonths.map((m) => ({
    month: m,
    income: +(finByMonth[m]?.income ?? 0).toFixed(2),
    expense: +(finByMonth[m]?.expense ?? 0).toFixed(2),
  }));
  const pettyMonthly = allMonths.map((m) => ({
    month: m,
    top_up: +(pettyByMonth[m]?.top_up ?? 0).toFixed(2),
    expense: +(pettyByMonth[m]?.expense ?? 0).toFixed(2),
  }));
  const staysMonthly = allMonths.map((m) => ({
    month: m,
    stays: staysByMonth[m]?.stays ?? 0,
    nights: staysByMonth[m]?.nights ?? 0,
    revenue: +(staysByMonth[m]?.revenue ?? 0).toFixed(2),
    food: +(staysByMonth[m]?.food ?? 0).toFixed(2),
  }));

  // ─── By Property ───
  const finByProp: Record<string, { income: number; expense: number }> = {};
  const pettyByProp: Record<string, number> = {};
  const staysByProp: Record<string, { stays: number; nights: number; revenue: number }> = {};

  for (const e of finRows) {
    const k = e.property_code ?? "(ไม่ระบุ)";
    if (!finByProp[k]) finByProp[k] = { income: 0, expense: 0 };
    finByProp[k].income += Number(e.income ?? 0);
    finByProp[k].expense += Number(e.expense ?? 0);
  }
  for (const t of pettyRows) {
    if (t.txn_type !== "expense") continue;
    const k = t.property_code ?? "(ไม่ระบุ)";
    pettyByProp[k] = (pettyByProp[k] ?? 0) + Number(t.amount);
  }
  for (const s of stayRows) {
    const k = s.property_code ?? "(ไม่ระบุ)";
    if (!staysByProp[k]) staysByProp[k] = { stays: 0, nights: 0, revenue: 0 };
    if (s.check_in >= from && s.check_in <= to) {
      staysByProp[k].stays++;
      staysByProp[k].revenue += Number(s.room_rate ?? 0);
    }
    // คืนต่อห้อง = คืนที่พักจริงในช่วง (clip)
    staysByProp[k].nights += Object.values(
      nightsPerMonth(s.check_in, s.check_out, from, to),
    ).reduce((a, b) => a + b, 0);
  }

  const propKeys = Array.from(
    new Set([...Object.keys(finByProp), ...Object.keys(pettyByProp), ...Object.keys(staysByProp)]),
  ).sort();
  const byProperty = propKeys
    .map((k) => ({
      property: k,
      finIncome: +(finByProp[k]?.income ?? 0).toFixed(2),
      finExpense: +(finByProp[k]?.expense ?? 0).toFixed(2),
      pettyExpense: +(pettyByProp[k] ?? 0).toFixed(2),
      stays: staysByProp[k]?.stays ?? 0,
      nights: staysByProp[k]?.nights ?? 0,
      stayRevenue: +(staysByProp[k]?.revenue ?? 0).toFixed(2),
    }))
    .sort((a, b) => b.finIncome + b.stayRevenue - (a.finIncome + a.stayRevenue));

  // ─── By Category (finance only) ───
  const finByCat: Record<string, { income: number; expense: number }> = {};
  for (const e of finRows) {
    const k = e.category ?? "(ไม่ระบุ)";
    if (!finByCat[k]) finByCat[k] = { income: 0, expense: 0 };
    finByCat[k].income += Number(e.income ?? 0);
    finByCat[k].expense += Number(e.expense ?? 0);
  }
  const byCategory = Object.entries(finByCat)
    .map(([cat, v]) => ({
      category: cat,
      income: +v.income.toFixed(2),
      expense: +v.expense.toFixed(2),
    }))
    .sort((a, b) => b.income + b.expense - (a.income + a.expense));

  // ─── Occupancy rate — คืนที่ขายได้ (clip ให้อยู่ในช่วง) / (จำนวนห้องเปิดขาย × จำนวนคืนในช่วง) ───
  const rentableProps = (rentableRes.data ?? []) as RentableProperty[];
  const rentableByCode = new Map(rentableProps.map((p) => [p.code, p]));
  // นับเป็น "ห้อง×คืน" ที่ไม่ซ้ำ — ถ้ามี stay ซ้อนทับห้องเดียวกันคืนเดียวกัน (จองคาบเกี่ยว/บันทึกซ้ำ)
  // ต้องนับครั้งเดียว ไม่งั้นอัตราการเข้าพักทะลุ 100% · นิยามเดียวกับการ์ดรายวัน (lib/tmc/daily-occupancy.ts)
  const soldNightKeys = new Set<string>();
  const soldByMonth: Record<string, number> = {};
  for (const s of stayRows) {
    const prop = rentableByCode.get(s.property_code ?? "");
    if (!prop) continue;
    for (const d of nightsList(s.check_in, s.check_out, from, to)) {
      // คืนก่อนห้องเปิดขายไม่นับ — นิยามเดียวกับการ์ดรายวัน (lib/tmc/rentable.ts)
      if (!isOpenOn(prop, d)) continue;
      const key = `${s.property_code}|${d}`;
      if (soldNightKeys.has(key)) continue;
      soldNightKeys.add(key);
      const m = d.slice(0, 7);
      soldByMonth[m] = (soldByMonth[m] ?? 0) + 1;
    }
  }
  const soldNights = soldNightKeys.size;
  // "ห้องเปิดขาย" ที่โชว์บนแดชบอร์ด = ณ วันสุดท้ายของช่วง (ห้องที่เพิ่งเปิดกลางช่วงนับด้วย)
  const roomsCount = openCodesOn(rentableProps, to).length;
  const toEx = new Date(new Date(to).getTime() + DAY_MS).toISOString().slice(0, 10);
  const availableNights = availableNightsIn(rentableProps, from, toEx);

  // คืนเปิดขายต่อเดือน = นับรายวันว่าวันนั้นมีห้องเปิดขายกี่ห้อง (ห้องเปิดกลางช่วงจึงไม่ย้อนหลัง)
  const availByMonth: Record<string, number> = {};
  for (let t = new Date(from).getTime(); t < new Date(to).getTime() + DAY_MS; t += DAY_MS) {
    const night = new Date(t).toISOString().slice(0, 10);
    const m = night.slice(0, 7);
    availByMonth[m] =
      (availByMonth[m] ?? 0) + rentableProps.filter((p) => isOpenOn(p, night)).length;
  }
  const occupancyOfMonth = (m: string): number | null => {
    const avail = availByMonth[m] ?? 0;
    return avail > 0 ? +(((soldByMonth[m] ?? 0) / avail) * 100).toFixed(1) : null;
  };
  const staysMonthlyWithOcc: Monthly[] = staysMonthly.map((r) => ({
    ...r,
    occupancy: occupancyOfMonth(r.month),
  }));

  // ─── Totals ───
  const totals: Totals = {
    finance: {
      income: +financeMonthly.reduce((s, r) => s + r.income, 0).toFixed(2),
      expense: +financeMonthly.reduce((s, r) => s + r.expense, 0).toFixed(2),
    },
    petty: {
      top_up: +pettyMonthly.reduce((s, r) => s + r.top_up, 0).toFixed(2),
      expense: +pettyMonthly.reduce((s, r) => s + r.expense, 0).toFixed(2),
    },
    stays: {
      count: staysMonthly.reduce((s, r) => s + r.stays, 0),
      nights: staysMonthly.reduce((s, r) => s + r.nights, 0),
      revenue: +staysMonthly.reduce((s, r) => s + r.revenue, 0).toFixed(2),
    },
    stock: {
      items: (stockRes.data ?? []).length,
      low: (stockRes.data ?? []).filter(
        (i) => Number(i.min_quantity) > 0 && Number(i.current_qty) <= Number(i.min_quantity),
      ).length,
    },
    staysAllTime: staysCountRes.count ?? 0,
    occupancy: {
      rate: availableNights > 0 ? +((soldNights / availableNights) * 100).toFixed(1) : null,
      soldNights,
      availableNights,
      rooms: roomsCount,
    },
  };

  return {
    totals,
    financeMonthly,
    pettyMonthly,
    staysMonthly: staysMonthlyWithOcc,
    byProperty,
    byCategory,
    stockLow: (stockRes.data ?? [])
      .filter((i) => Number(i.min_quantity) > 0 && Number(i.current_qty) <= Number(i.min_quantity))
      .slice(0, 10)
      .map((i) => ({ name: i.name, qty: Number(i.current_qty) })),
  };
}

/** ช่วงเดือน → {from, to} (n เดือนล่าสุด นับจากต้นเดือนที่ n-1 ก่อน) */
export function rangeFromMonths(n: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - n + 1);
  from.setDate(1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
