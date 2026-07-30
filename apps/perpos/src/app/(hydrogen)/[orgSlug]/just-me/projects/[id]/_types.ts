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
}
