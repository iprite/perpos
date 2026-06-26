// assets.ts — acc_assets ทะเบียนสินทรัพย์ ~5 รายการ active
// ค่าเสื่อมเส้นตรง = (cost - salvage_value) / useful_life_months ต่อเดือน

import type { AccAsset } from "./types";
import { MOCK_ORG_ID } from "./org-settings";

const ORG = MOCK_ORG_ID;

function monthlyDepr(cost: number, salvage: number, life: number): number {
  return Math.round(((cost - salvage) / life) * 100) / 100;
}

export const mockAssets: AccAsset[] = [
  // 1. คอมพิวเตอร์ MacBook Pro (ใช้มา 6 เดือน จาก 36 เดือน)
  // ค่าเสื่อม/เดือน = (60,000 - 5,000) / 36 = 1,527.78
  // สะสม 6 เดือน = 9,166.68
  {
    id: "asset-001",
    org_id: ORG,
    name: 'คอมพิวเตอร์ MacBook Pro 14" (M3)',
    asset_account_id: "acc-1510",
    acquire_date: "2025-12-15",
    cost: 60000.0,
    salvage_value: 5000.0,
    useful_life_months: 36,
    depreciation_method: "straight_line",
    accumulated_depreciation: 9166.68, // 6 เดือน × 1,527.78
    status: "active",
    created_at: "2025-12-15T09:00:00.000Z",
    book_value: 50833.32, // 60,000 - 9,166.68
    monthly_depreciation: monthlyDepr(60000, 5000, 36),
    asset_account_name: "อุปกรณ์และเครื่องใช้สำนักงาน",
  },
  // 2. จอมอนิเตอร์ LG 27" (ใช้มา 4 เดือน จาก 36 เดือน)
  // ค่าเสื่อม/เดือน = (18,500 - 500) / 36 = 500.00
  // สะสม 4 เดือน = 2,000.00
  {
    id: "asset-002",
    org_id: ORG,
    name: 'จอมอนิเตอร์ LG 27" 4K',
    asset_account_id: "acc-1510",
    acquire_date: "2026-02-01",
    cost: 18500.0,
    salvage_value: 500.0,
    useful_life_months: 36,
    depreciation_method: "straight_line",
    accumulated_depreciation: 2000.0, // 4 เดือน × 500
    status: "active",
    created_at: "2026-02-01T09:00:00.000Z",
    book_value: 16500.0,
    monthly_depreciation: monthlyDepr(18500, 500, 36),
    asset_account_name: "อุปกรณ์และเครื่องใช้สำนักงาน",
  },
  // 3. กล้องถ่ายภาพ Sony Alpha (ใช้มา 3 เดือน จาก 60 เดือน)
  // ค่าเสื่อม/เดือน = (85,000 - 10,000) / 60 = 1,250.00
  // สะสม 3 เดือน = 3,750.00
  {
    id: "asset-003",
    org_id: ORG,
    name: "กล้อง Mirrorless Sony Alpha A7 IV",
    asset_account_id: "acc-1510",
    acquire_date: "2026-03-10",
    cost: 85000.0,
    salvage_value: 10000.0,
    useful_life_months: 60,
    depreciation_method: "straight_line",
    accumulated_depreciation: 3750.0, // 3 เดือน × 1,250
    status: "active",
    created_at: "2026-03-10T10:00:00.000Z",
    book_value: 81250.0,
    monthly_depreciation: monthlyDepr(85000, 10000, 60),
    asset_account_name: "อุปกรณ์และเครื่องใช้สำนักงาน",
  },
  // 4. รถยนต์ Toyota Yaris (ใช้มา 18 เดือน จาก 60 เดือน)
  // ค่าเสื่อม/เดือน = (680,000 - 100,000) / 60 = 9,666.67
  // สะสม 18 เดือน = 174,000.06 ≈ 174,000.06
  {
    id: "asset-004",
    org_id: ORG,
    name: "รถยนต์ Toyota Yaris Cross (ทะเบียน กข-1234)",
    asset_account_id: "acc-1520",
    acquire_date: "2025-01-15",
    cost: 680000.0,
    salvage_value: 100000.0,
    useful_life_months: 60,
    depreciation_method: "straight_line",
    accumulated_depreciation: 174000.06, // 18 เดือน × 9,666.67
    status: "active",
    created_at: "2025-01-15T09:00:00.000Z",
    book_value: 505999.94,
    monthly_depreciation: monthlyDepr(680000, 100000, 60),
    asset_account_name: "ยานพาหนะ",
  },
  // 5. เครื่องพิมพ์สี Epson (ใช้มา 12 เดือน จาก 36 เดือน)
  // ค่าเสื่อม/เดือน = (24,000 - 2,000) / 36 = 611.11
  // สะสม 12 เดือน = 7,333.32
  {
    id: "asset-005",
    org_id: ORG,
    name: "เครื่องพิมพ์ Epson A3+ Pro Photo",
    asset_account_id: "acc-1510",
    acquire_date: "2025-06-20",
    cost: 24000.0,
    salvage_value: 2000.0,
    useful_life_months: 36,
    depreciation_method: "straight_line",
    accumulated_depreciation: 7333.32, // 12 เดือน × 611.11
    status: "active",
    created_at: "2025-06-20T09:00:00.000Z",
    book_value: 16666.68,
    monthly_depreciation: monthlyDepr(24000, 2000, 36),
    asset_account_name: "อุปกรณ์และเครื่องใช้สำนักงาน",
  },
];

/** ค่าเสื่อมรวมทุกสินทรัพย์ใน 1 เดือน (สำหรับ dashboard/B5) */
export const totalMonthlyDepreciation = mockAssets
  .filter((a) => a.status === "active")
  .reduce((sum, a) => sum + (a.monthly_depreciation ?? 0), 0);

/** มูลค่าสุทธิสินทรัพย์รวม (book value) */
export const totalBookValue = mockAssets
  .filter((a) => a.status === "active")
  .reduce((sum, a) => sum + (a.book_value ?? a.cost - a.accumulated_depreciation), 0);
