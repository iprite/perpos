/**
 * _types.ts — ชนิดข้อมูลที่ server page ส่งให้ client view ของหน้ารายละเอียดโครงการ
 * (แยกไฟล์เพื่อไม่ให้ tab ต่าง ๆ import วนกันเอง)
 */

import type { ProjectMoneySummary } from "@/lib/just-me/project-metrics";
import type {
  JustMeBoq,
  JustMeBoqItem,
  JustMeProject,
  JustMeProjectFile,
  JustMeWorkCategory,
  PurchaseRequestStatus,
} from "@/lib/just-me/types";

/** แถวราคามาตรฐานเท่าที่หน้า BOQ ต้องใช้ (ไม่ส่งให้ viewer เลย) */
export interface BoqPriceOption {
  id: string;
  name: string;
  unit: string;
  category_id: string | null;
  material_unit_cost: number | null;
  labor_unit_cost: number;
  overhead_unit_cost: number;
}

export interface ProjectDetailInitial {
  project: JustMeProject;
  files: JustMeProjectFile[];
  boqs: JustMeBoq[];
  /** บรรทัดของ BOQ ฉบับที่เลือกไว้ตอนเปิดหน้า (ฉบับล่าสุด) */
  activeBoqId: string | null;
  activeItems: JustMeBoqItem[];
  /** null = ผู้ใช้ไม่มีสิทธิ์เห็นต้นทุน */
  summary: ProjectMoneySummary | null;
  categories: JustMeWorkCategory[];
  priceOptions: BoqPriceOption[];
  /** ใบขอซื้อของโครงการนี้ (owner/manager เท่านั้น — viewer ได้ [] และไม่เห็นแท็บ) */
  purchaseRequests: ProjectPrRow[];
}

/** ใบขอซื้อเท่าที่แท็บ "จัดซื้อ" ต้องใช้ (สรุปจาก server แล้ว) */
export interface ProjectPrRow {
  id: string;
  pr_code: string;
  status: PurchaseRequestStatus;
  needed_date: string | null;
  vendor_name: string | null;
  total_estimated_cost: number | null;
  total_selected_cost: number | null;
  item_count: number;
  received_count: number;
}
