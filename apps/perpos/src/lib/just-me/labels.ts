/**
 * just_me project loop — คำไทยของทุก enum **แหล่งเดียว**
 * ห้ามหน้าไหนเขียนคำไทยของสถานะเอง (คำไม่ตรงกัน = ผู้ใช้คิดว่าคนละเรื่อง)
 */

import type {
  BillingStatus,
  BoqItemKind,
  BoqStatus,
  MarginSource,
  ProjectCostKind,
  ProjectFileKind,
  ProjectStatus,
  PurchaseRequestStatus,
  VendorQuoteStatus,
} from "./types";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  survey: "สำรวจหน้างาน",
  boq: "ถอด BOQ",
  quoted: "เสนอราคาแล้ว",
  won: "ได้งาน",
  in_progress: "กำลังดำเนินงาน",
  completed: "ส่งมอบแล้ว",
  closed: "ปิดโครงการ",
  lost: "ไม่ได้งาน",
  cancelled: "ยกเลิก",
};

export const PROJECT_STATUS_TONE: Record<ProjectStatus, Tone> = {
  survey: "neutral",
  boq: "neutral",
  quoted: "info",
  won: "success",
  in_progress: "info",
  completed: "success",
  closed: "neutral",
  lost: "danger",
  cancelled: "neutral",
};

export const BOQ_STATUS_LABEL: Record<BoqStatus, string> = {
  draft: "ฉบับร่าง",
  approved: "อนุมัติแล้ว",
  superseded: "ถูกแทนที่",
};

export const BOQ_ITEM_KIND_LABEL: Record<BoqItemKind, string> = {
  material: "วัสดุ",
  labor: "ค่าแรง",
  subcontract: "ผู้รับเหมาช่วง",
  other: "อื่น ๆ",
};

export const PR_STATUS_LABEL: Record<PurchaseRequestStatus, string> = {
  draft: "ฉบับร่าง",
  submitted: "ส่งขออนุมัติ",
  approved: "อนุมัติแล้ว",
  ordered: "สั่งซื้อแล้ว",
  partially_received: "รับของบางส่วน",
  received: "รับของครบ",
  cancelled: "ยกเลิก",
};

export const PR_STATUS_TONE: Record<PurchaseRequestStatus, Tone> = {
  draft: "neutral",
  submitted: "warning",
  approved: "info",
  ordered: "info",
  partially_received: "warning",
  received: "success",
  cancelled: "neutral",
};

export const VENDOR_QUOTE_STATUS_LABEL: Record<VendorQuoteStatus, string> = {
  pending: "รอเสนอราคา",
  received: "ได้ราคาแล้ว",
  selected: "เลือกเจ้านี้",
  rejected: "ไม่เลือก",
};

export const BILLING_STATUS_LABEL: Record<BillingStatus, string> = {
  planned: "วางแผนไว้",
  ready: "พร้อมวางบิล",
  invoiced: "วางบิลแล้ว",
  paid: "รับเงินแล้ว",
  cancelled: "ยกเลิก",
};

export const BILLING_STATUS_TONE: Record<BillingStatus, Tone> = {
  planned: "neutral",
  ready: "warning",
  invoiced: "info",
  paid: "success",
  cancelled: "neutral",
};

export const PROJECT_FILE_KIND_LABEL: Record<ProjectFileKind, string> = {
  survey_photo: "รูปสำรวจ",
  drawing: "แบบ",
  contract: "สัญญา",
  other: "อื่น ๆ",
};

export const PROJECT_COST_KIND_LABEL: Record<ProjectCostKind, string> = {
  labor: "ค่าแรง",
  subcontract: "ผู้รับเหมาช่วง",
  transport: "ค่าขนส่ง",
  other: "อื่น ๆ",
};

/** margin ของบรรทัดนี้มาจากชั้นไหน — ต้องโชว์เสมอ ไม่งั้นผู้ใช้ไม่รู้ว่าทำไมราคาเป็นแบบนี้ */
export const MARGIN_SOURCE_LABEL: Record<MarginSource, string> = {
  item: "ตั้งที่รายการ",
  category: "ตามหมวดงาน",
  project: "ตามโครงการ",
  company: "ค่าเริ่มต้นบริษัท",
};

/** ตัวช่วยแปลงแบบไม่พัง ถ้าเจอค่าที่ไม่รู้จัก (ข้อมูลเก่า/ค่าใหม่ที่ยังไม่ได้เพิ่ม) */
export function labelOf<T extends string>(map: Record<T, string>, value: string | null): string {
  if (!value) return "—";
  return (map as Record<string, string>)[value] ?? value;
}
