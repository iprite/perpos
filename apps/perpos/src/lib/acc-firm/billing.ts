/**
 * billing.ts — สรุปรายได้ค่าบริการของสำนักงานบัญชี (F2)
 *
 * pure function — รับ list ServiceClient (จาก API /api/acc-firm/service-clients ที่มีอยู่แล้ว)
 * แล้วสรุป: รายได้ค่าบริการรวมปีนี้ / ปีก่อน / YoY% / client ที่ยังไม่ตั้ง fee.
 *
 * Decision D3: field fee_* มีถึง fee_2026 → map "ปีปัจจุบัน" ไป field ปีล่าสุดที่มี
 * (ถึง 2026). ปีเกินช่วง field → คืน yearWarning + ใช้ fee_2026 เป็น proxy (ไม่ขยาย schema).
 */
import type { ServiceClient } from "@/app/api/acc-firm/service-clients/route";

/** ปีล่าสุดที่ schema acc_firm_service_clients มีคอลัมน์ fee_<year> */
export const LATEST_FEE_YEAR = 2026;
/** ปีแรกที่มีคอลัมน์ fee_<year> */
export const EARLIEST_FEE_YEAR = 2023;

export type ServiceFeeSummary = {
  totalThisYear: number;
  totalLastYear: number;
  /** (this − last) / last × 100 · null เมื่อปีก่อน = 0 (หาร 0 ไม่ได้) */
  yoyPct: number | null;
  /** client ที่ is_active แต่ fee ปีนี้ว่าง/0 (รายได้รั่ว) */
  unbilledClients: { id: string; clientCode: string; companyName: string }[];
  /** ปีที่ใช้คำนวณ totalThisYear (อาจถูก clamp ลงมาที่ LATEST_FEE_YEAR) */
  feeYear: number;
  /** เตือนเมื่อปีปัจจุบัน > LATEST_FEE_YEAR (schema ยังไม่มีคอลัมน์ปีนั้น) */
  yearWarning: string | null;
};

type FeeFieldKey = `fee_${number}`;

/** อ่านค่า fee ของปีจาก ServiceClient (clamp ปีเข้าช่วง field) */
function feeForYear(c: ServiceClient, year: number): number {
  const clamped = Math.min(Math.max(year, EARLIEST_FEE_YEAR), LATEST_FEE_YEAR);
  const key = `fee_${clamped}` as FeeFieldKey;
  const v = (c as unknown as Record<string, unknown>)[key];
  return v != null ? Number(v) : 0;
}

/**
 * summarizeServiceFees — สรุปรายได้ค่าบริการของ firm จาก list client
 * @param clients รายการ service client (จาก service-clients API)
 * @param year    ปีที่ต้องการสรุป (default = ปีปัจจุบัน)
 */
export function summarizeServiceFees(clients: ServiceClient[], year: number): ServiceFeeSummary {
  const feeYear = Math.min(Math.max(year, EARLIEST_FEE_YEAR), LATEST_FEE_YEAR);
  const yearWarning =
    year > LATEST_FEE_YEAR
      ? `ยังไม่มีคอลัมน์ค่าบริการของปี ${year} — แสดงยอดของปี ${LATEST_FEE_YEAR} แทน`
      : null;

  let totalThisYear = 0;
  let totalLastYear = 0;
  const unbilledClients: ServiceFeeSummary["unbilledClients"] = [];

  for (const c of clients) {
    const thisFee = feeForYear(c, feeYear);
    const lastFee = feeForYear(c, feeYear - 1);
    totalThisYear += thisFee;
    totalLastYear += lastFee;
    if (c.is_active && thisFee <= 0) {
      unbilledClients.push({
        id: c.id,
        clientCode: c.client_code,
        companyName: c.company_name,
      });
    }
  }

  const yoyPct = totalLastYear > 0 ? ((totalThisYear - totalLastYear) / totalLastYear) * 100 : null;

  return { totalThisYear, totalLastYear, yoyPct, unbilledClients, feeYear, yearWarning };
}
