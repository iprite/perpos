/**
 * _types.ts — โครงข้อมูลที่ SSR ส่งให้หน้ารายละเอียดใบขอซื้อ
 * (ค่าทุกตัวถูกคิด/กรองมาแล้วฝั่ง server — client ไม่คำนวณเงินเอง)
 */

import type { BoqCompareRow } from "@/lib/just-me/purchasing";
import type {
  JustMePrItem,
  JustMePurchaseRequest,
  JustMeVendorQuote,
  JustMeVendorQuoteItem,
} from "@/lib/just-me/types";

export interface PrOption {
  value: string;
  label: string;
}

/** บรรทัด BOQ ที่ยังเหลือให้สั่งซื้อ (ใช้ในกล่อง "เพิ่มจาก BOQ") */
export interface BoqPickRow {
  boq_item_id: string;
  name: string;
  unit: string;
  qty: number;
  ordered_qty: number;
  remaining_qty: number;
  item_id: string | null;
  material_unit_cost: number | null;
}

export interface PrDetailInitial {
  pr: JustMePurchaseRequest;
  items: JustMePrItem[];
  quotes: JustMeVendorQuote[];
  quoteItems: JustMeVendorQuoteItem[];
  boqCompare: BoqCompareRow[];
  boqPicks: BoqPickRow[];
  projectLabel: string | null;
  vendorOptions: PrOption[];
  warehouseOptions: PrOption[];
  inventoryOptions: PrOption[];
  approvalRequired: boolean;
}
