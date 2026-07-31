/**
 * _types.ts — ชนิดข้อมูลที่ server page ส่งให้ client view ของหน้ารายละเอียดโครงการ
 * (แยกไฟล์เพื่อไม่ให้ tab ต่าง ๆ import วนกันเอง)
 */

import type { ProjectMoneySummary } from "@/lib/just-me/project-metrics";
import type {
  JustMeBoq,
  JustMeBoqItem,
  JustMeProject,
  JustMeProjectBilling,
  JustMeProjectCost,
  JustMeProjectFile,
  JustMeProjectProgress,
  JustMeProjectUsageRow,
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
  /** งวดงาน (ฝั่งขาย → viewer เห็นได้) */
  billings: JustMeProjectBilling[];
  /** ยอดที่ยังวางบิลได้ = สัญญา − งวดที่ยังไม่ยกเลิก (จาก `billingPlanTotals`) */
  billingPlanned: number;
  billingRemaining: number | null;
  /** เลขที่เอกสารในระบบบัญชีของ id ที่ just_me เก็บไว้ */
  documents: Record<string, AccountingLink>;
  /** ความพร้อมของฝั่งบัญชี — ใช้ "เตือน" ก่อนออกเอกสาร (ไม่บล็อก) */
  accounting: ProjectAccountingInfo;
  /** วัสดุที่เบิกเข้าโครงการ (viewer ได้แถวที่ไม่มีมูลค่า) */
  usage: JustMeProjectUsageRow[];
  /** ชื่อวัสดุของแถวเบิก (item_id → ชื่อ) */
  itemNames: Record<string, string>;
  /** ต้นทุนนอกคลัง — viewer ได้ [] */
  costs: JustMeProjectCost[];
  /** ความคืบหน้าที่บันทึกไว้ */
  progress: JustMeProjectProgress[];
  /** บรรทัดของ BOQ ที่อนุมัติแล้ว (ใช้เลือกตอนบันทึกความคืบหน้า) */
  approvedItems: { id: string; name: string; unit: string; qty: number }[];
}

/** เอกสารในระบบบัญชีที่ just_me อ้างถึง */
export interface AccountingLink {
  doc_number: string;
  status: string;
  doc_type: string;
}

export interface ProjectAccountingInfo {
  /** มีแถว `acc_org_settings` แล้วหรือยัง */
  configured: boolean;
  vatRegistered: boolean;
  /** ช่องตาม ม.86/4 ที่ยังว่าง (ว่าง = ครบ) */
  taxIdentityMissing: string[];
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
