// labels.ts — ตาราง label ไทย canonical (Contract v3) — แหล่งเดียวของทั้ง prototype
// ทุกหน้า/ทุก component ต้องดึงคำจากที่นี่ — ห้ามพิมพ์คำแปลเองกระจายในหน้า (กันคำไม่ตรงกันข้ามหน้า)
import { ORDER_STAGE_LIST } from "./helpers";
import type {
  ActivityType,
  ChatChannel,
  ConversationStatus,
  CustomerTier,
  CfStatus,
  CostCategory,
  DesignJobStatus,
  DesignSource,
  EdgeFinish,
  IntegrationKind,
  IntegrationStatus,
  MachineKind,
  MachineStatus,
  MaterialCategory,
  MaterialUnit,
  MessageDirection,
  OrderPriority,
  OrderStage,
  OrderStatus,
  PackingStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  PrintJobStatus,
  QcDefectType,
  QcResult,
  RugCategory,
  ShipmentCarrier,
  ShipmentStatus,
  SizeKind,
  StaffRole,
  StockMoveType,
} from "./types";

// ---- order_status (14) — เคาะแล้วตามที่ ux-reviewer สั่ง ----
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "ฉบับร่าง",
  quoted: "เสนอราคาแล้ว",
  confirmed: "ยืนยันแล้ว",
  designing: "กำลังทำลาย",
  awaiting_cf: "รอลูกค้ายืนยันลาย",
  cf_approved: "ลูกค้ายืนยันแล้ว รอพิมพ์",
  printing: "กำลังพิมพ์",
  qc: "ตรวจคุณภาพ",
  packing: "กำลังแพ็ค",
  ready_to_ship: "แพ็คแล้ว รอส่ง",
  shipped: "ส่งแล้ว",
  delivered: "ส่งถึงแล้ว",
  cancelled: "ยกเลิก",
  on_hold: "พักไว้",
};

// ---- order_stage (5) — Contract v3 ----
export const ORDER_STAGE_LABEL: Record<OrderStage, string> = {
  receive: "รับออเดอร์",
  design: "ทำลาย",
  produce: "ผลิต",
  ship: "ส่งของ",
  paused: "พัก/ยกเลิก",
};

/** ลิสต์ stage เรียงลำดับพร้อม label ไทย — ให้บอร์ด/KPI/filter หยิบไปวนได้ตรง ๆ */
export const ORDER_STAGES: { key: OrderStage; label: string }[] = ORDER_STAGE_LIST.map((key) => ({
  key,
  label: ORDER_STAGE_LABEL[key],
}));

// ---- ช่องทางแชท / สถานะห้องแชท ----
export const CHAT_CHANNEL_LABEL: Record<ChatChannel, string> = {
  facebook: "Facebook",
  line: "LINE",
  tiktok: "TikTok",
};
export const CONVERSATION_STATUS_LABEL: Record<ConversationStatus, string> = {
  open: "เปิดอยู่",
  pending: "รอลูกค้าตอบ",
  closed: "ปิดแล้ว",
};
export const MESSAGE_DIRECTION_LABEL: Record<MessageDirection, string> = {
  inbound: "ลูกค้าส่งมา",
  outbound: "ร้านตอบไป",
};

// ---- ลูกค้า ----
export const CUSTOMER_TIER_LABEL: Record<CustomerTier, string> = {
  new: "ลูกค้าใหม่",
  regular: "ลูกค้าประจำ",
  vip: "ลูกค้า VIP",
};

// ---- ออเดอร์ (priority/design source) ----
export const ORDER_PRIORITY_LABEL: Record<OrderPriority, string> = {
  normal: "ปกติ",
  rush: "ด่วน",
};
export const DESIGN_SOURCE_LABEL: Record<DesignSource, string> = {
  customer_file: "ลูกค้าส่งลายเอง",
  in_house: "ทีมออกแบบให้",
};

// ---- แบบพรม ----
export const RUG_CATEGORY_LABEL: Record<RugCategory, string> = {
  doormat: "พรมเช็ดเท้า",
  entrance: "พรมหน้าบ้าน",
  living_room: "พรมห้องนั่งเล่น",
  bedroom: "พรมห้องนอน",
  kitchen: "พรมห้องครัว",
  table_mat: "แผ่นรองจาน",
  custom: "สั่งพิเศษ",
};
export const SIZE_KIND_LABEL: Record<SizeKind, string> = {
  standard: "ขนาดมาตรฐาน",
  custom_cut: "สั่งตัดพิเศษ",
};
export const EDGE_FINISH_LABEL: Record<EdgeFinish, string> = {
  overlock: "เย็บโพ้ง",
  binding: "หุ้มขอบ",
  raw: "ไม่เย็บขอบ",
};

// ---- งานแบบ + CF ----
export const DESIGN_JOB_STATUS_LABEL: Record<DesignJobStatus, string> = {
  queued: "รอคิว",
  in_progress: "กำลังออกแบบ",
  waiting_cf: "รอลูกค้ายืนยันลาย",
  revising: "กำลังแก้ไข",
  approved: "อนุมัติแล้ว",
  cancelled: "ยกเลิก",
};
export const CF_STATUS_LABEL: Record<CfStatus, string> = {
  not_sent: "ยังไม่ส่ง",
  sent: "ส่งขอ CF แล้ว",
  approved: "ลูกค้ายืนยันแล้ว รอพิมพ์",
  rejected: "ลูกค้าขอแก้",
};

// ---- ผลิต ----
export const MACHINE_KIND_LABEL: Record<MachineKind, string> = {
  fabric_printer: "เครื่องพิมพ์ผ้า",
  heat_press: "เครื่องรีดร้อน",
  cut_sew: "เครื่องตัด/เย็บขอบ",
};
export const MACHINE_STATUS_LABEL: Record<MachineStatus, string> = {
  idle: "ว่าง",
  running: "กำลังทำงาน",
  maintenance: "ซ่อมบำรุง",
};
export const PRINT_JOB_STATUS_LABEL: Record<PrintJobStatus, string> = {
  queued: "รอคิว",
  printing: "กำลังพิมพ์",
  done: "เสร็จแล้ว",
  reprint: "พิมพ์ซ้ำ",
  cancelled: "ยกเลิก",
};

// ---- QC & แพ็ค ----
export const QC_RESULT_LABEL: Record<QcResult, string> = {
  pass: "ผ่าน",
  fail: "ไม่ผ่าน",
};
export const QC_DEFECT_TYPE_LABEL: Record<QcDefectType, string> = {
  color_off: "สีเพี้ยน",
  misalign: "ลายเบี้ยว",
  material_defect: "ผ้า/วัสดุตำหนิ",
  wrong_size: "ผิดขนาด",
  wrong_version: "ผิดเวอร์ชัน",
  edge_defect: "ขอบเย็บไม่เรียบ",
  other: "อื่น ๆ",
};
export const PACKING_STATUS_LABEL: Record<PackingStatus, string> = {
  not_packed: "ยังไม่แพ็ค",
  packed: "แพ็คแล้ว",
};

// ---- จัดส่ง ----
export const SHIPMENT_CARRIER_LABEL: Record<ShipmentCarrier, string> = {
  jt: "J&T Express",
  shipnity_other: "ขนส่งอื่น (Shipnity)",
  pickup: "ลูกค้ามารับเอง",
};
export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  pending: "รอสร้างเลขพัสดุ",
  label_created: "สร้างเลขพัสดุแล้ว",
  picked_up: "เข้ารับพัสดุแล้ว",
  in_transit: "ระหว่างขนส่ง",
  delivered: "ส่งสำเร็จ",
  failed: "ส่งไม่สำเร็จ",
  returned: "ตีกลับ",
};

// ---- การเงิน ----
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: "โอนเงิน",
  promptpay: "พร้อมเพย์",
  cod: "เก็บเงินปลายทาง",
  cash: "เงินสด",
  card: "บัตร",
};
export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  deposit: "มัดจำ",
  balance: "ยอดคงเหลือ",
  full: "จ่ายเต็ม",
  refund: "คืนเงิน",
};
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "รอดำเนินการ",
  paid: "ชำระแล้ว",
  failed: "ไม่สำเร็จ",
  refunded: "คืนเงินแล้ว",
};

// ---- วัสดุ/สต๊อก ----
export const MATERIAL_CATEGORY_LABEL: Record<MaterialCategory, string> = {
  rug_fabric: "ผ้าพรม",
  ink: "หมึก",
  film: "ฟิล์ม/กระดาษทรานสเฟอร์",
  backing: "ยางรองหลัง",
  packaging: "บรรจุภัณฑ์",
  other: "อื่น ๆ",
};
export const MATERIAL_UNIT_LABEL: Record<MaterialUnit, string> = {
  sqm: "ตร.ม.",
  meter: "เมตร",
  roll: "ม้วน",
  liter: "ลิตร",
  piece: "ชิ้น",
  box: "กล่อง",
};
export const STOCK_MOVE_TYPE_LABEL: Record<StockMoveType, string> = {
  receive: "รับเข้า",
  consume_print: "ตัดตอนพิมพ์",
  consume_pack: "ตัดตอนแพ็ค",
  adjust: "ปรับยอด",
  waste: "ของเสีย",
  return: "คืนเข้าสต๊อก",
};

// ---- ต้นทุน (owner-only) ----
export const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  material: "ค่าวัสดุ",
  labor: "ค่าแรง",
  machine: "ค่าเครื่อง",
  shipping: "ค่าขนส่ง",
  other: "อื่น ๆ",
};

// ---- การเชื่อมต่อ ----
export const INTEGRATION_KIND_LABEL: Record<IntegrationKind, string> = {
  zaapi: "ZAAPI (แชทรวม)",
  shipnity: "Shipnity",
  jt: "J&T Express",
  line_notify: "แจ้งเตือน LINE",
};
export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = {
  connected: "เชื่อมต่อแล้ว",
  disconnected: "ยังไม่เชื่อมต่อ",
  error: "เชื่อมต่อผิดพลาด",
};

// ---- timeline ----
export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  status_change: "เปลี่ยนสถานะ",
  note: "บันทึกโน้ต",
  file_upload: "อัปโหลดไฟล์",
  cf_result: "ผลการยืนยันลาย",
  payment: "การชำระเงิน",
  shipment: "การจัดส่ง",
  stock: "ความเคลื่อนไหวสต๊อก",
  system: "ระบบ",
};

// ---- ทีมงาน ----
export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  owner: "เจ้าของ/ผู้จัดการ",
  sale: "ฝ่ายขาย",
  designer: "ทีมแบบ/กราฟิก",
  production: "ทีมผลิต",
};
