// types.ts — gov_procure fixture types (canonical — ยึด spec §3 Data Contract ตรงเป๊ะ)
// ทุก field/enum ต้องตรงกับ specs/gov_procure.md §3 (ห้ามเพิ่ม/ลด field ที่ ui-designer จะ import)
//
// สำคัญ (N1 — spec §3.3 / §8.1): duration_days / aging_days = PURE DERIVED
// ห้ามเก็บใน GovProcureOrder หรือใส่ค่าใน fixture — คำนวณผ่าน helper (deriveDurationDays/deriveAgingDays)
// ตอนแสดงผลเท่านั้น กัน 2 แหล่งข้อมูลไม่ตรงกัน (b2g เดิมเก็บ duration_days เป็น stored column ผิด — เราไม่ทำซ้ำ)

// ---- Enums (canonical) ----

/** 6-stage pipeline — แกนของ module (spec §4) */
export type Stage =
  | "quotation" // เสนอราคา
  | "contracted" // เซ็นสัญญาแล้ว รอส่งของ
  | "procuring" // สั่งซื้อ/ชำระซัพพลายเออร์
  | "delivered" // ส่งสินค้าแล้ว รอรับเช็ค
  | "paid" // รับเช็คแล้ว
  | "closed"; // ปิดงาน (manual close เท่านั้น)

/** บริษัทตัวกลาง 2 บริษัท (ต้องมีช่องว่างตรงเป๊ะ) */
export type Company = "89 Global Work" | "P2P Supply";

/** สถานะสลิป (checklist Done/-) */
export type SlipStatus = "Done" | "-" | null;

/** 4 role ตาม spec §1 — entry แรก = สิทธิ์สูงสุด */
export type ModuleRole = "owner" | "manager" | "staff" | "viewer";

/** attachment kind — spec §3.2 */
export type AttachmentKind =
  | "customer_change_slip"
  | "petty_cash_slip"
  | "commission_slip"
  | "cheque_photo"
  | "other";

// ---- Entity หลัก: gov_procure_order (spec §3.1) ----

export interface GovProcureOrder {
  // กลุ่ม A — ข้อมูลพื้นฐาน
  id: string;
  org_id: string;
  created_by: string;
  seq_no: number | null;
  customer_name: string;
  department: string | null;
  company: Company | null;
  qt_reference: string | null;
  product_description: string | null;
  start_date: string | null; // ISO YYYY-MM-DD

  // กลุ่ม B — การเงิน
  price_incl_vat: number | null;
  price_excl_vat: number | null;
  withholding_tax: number | null;
  net_receivable: number | null;
  cost_price: number | null;
  gross_profit: number | null;
  security_deposit: number | null;

  // กลุ่ม C — ทุนหมุนเวียน
  transfer_date: string | null;
  transfer_round1: string | null;
  transfer_round2: string | null;

  // กลุ่ม D — แบ่งรายได้/ต้นทุนภายใน 89
  customer_change: number | null;
  customer_change_slip: SlipStatus;
  petty_cash: number | null;
  petty_cash_slip: SlipStatus;
  transport_buy: number | null;
  transport_sell: number | null;
  transport_other: number | null;
  operate_89: number | null;
  total_cost_89: number | null;
  net_profit_89: number | null;
  profit_pct: number | null;

  // กลุ่ม E — คอมมิชชั่นทีมขาย
  commission_base_profit: number | null;
  commission_amount: number | null;
  commission_wht: number | null;
  commission_net_payable: number | null;
  commission_slip: SlipStatus;

  // กลุ่ม F — Milestone timeline
  contract_date: string | null;
  payment_order_date: string | null;
  delivery_date: string | null;
  receipt_date: string | null;
  finance_payment_date: string | null;
  support_payment_date: string | null;
  commission_payment_date: string | null;

  // กลุ่ม G — สถานะ/หมายเหตุ
  stage: Stage;
  stage_manual_override: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;

  // attachment — prototype mock array ใน order object (spec §3.2 หมายเหตุ prototype)
  attachments: GovProcureAttachment[];
}

// ---- Entity ย่อย: gov_procure_attachment (spec §3.2) ----
// prototype: mock array ใน order.attachments (ไม่แยกตาราง) — production = ตารางจริง + storage bucket

export interface GovProcureAttachment {
  id: string;
  org_id: string;
  order_id: string;
  kind: AttachmentKind;
  file_path: string; // mock: ชื่อไฟล์/placeholder path (ไม่มี storage จริงใน prototype)
  file_name: string | null;
  uploaded_by: string;
  created_at: string;
}

// ---- Entity ที่ 3: gov_procure_settings (spec §3.2b — B2, production entity) ----
// prototype = client state ในหน้า settings (ไม่ persist ข้าม reload)

export interface GovProcureSettings {
  org_id: string;
  sla_threshold: number; // เกณฑ์ overdue (วัน) default 30
  pct_customer_change: number | null; // % ทอนลูกค้า default 10
  pct_petty: number | null; // % petty cash default 5
  pct_operate: number | null; // % ค่าดำเนินการ 89 default 10
  line_alert_enabled: boolean;
  line_recipients: ModuleRole[] | null; // role[] เช่น ['owner','manager']
  line_weekly_enabled: boolean;
  line_event_paid: boolean;
  line_event_delivered: boolean;
  created_at: string;
  updated_at: string;
}

// ---- Derived helpers (spec §3.3 — pure derived, ไม่ stored) ----

/**
 * duration_days = receipt_date − contract_date (วัน)
 * ใช้ที่ detail/dashboard (สัญญา→รับเงิน) — คืน null ถ้าวันใดวันหนึ่งไม่ set
 */
export function deriveDurationDays(order: GovProcureOrder): number | null {
  if (!order.contract_date || !order.receipt_date) return null;
  const start = new Date(order.contract_date).getTime();
  const end = new Date(order.receipt_date).getTime();
  const days = Math.round((end - start) / 86_400_000);
  return days >= 0 ? days : null;
}

/**
 * aging_days = today − delivery_date เมื่อ stage ∈ {delivered} (ยังไม่ paid)
 * ใช้ที่ SLA alert / kanban card / dashboard เงินค้างรับ — คืน null ถ้าไม่เข้าเงื่อนไข
 */
export function deriveAgingDays(order: GovProcureOrder, today: Date = new Date()): number | null {
  if (order.stage !== "delivered" || !order.delivery_date) return null;
  const start = new Date(order.delivery_date).getTime();
  const end = today.getTime();
  const days = Math.round((end - start) / 86_400_000);
  return days >= 0 ? days : null;
}

/**
 * is_overdue = aging_days > sla_threshold
 */
export function isOverdue(
  order: GovProcureOrder,
  slaThreshold: number,
  today: Date = new Date(),
): boolean {
  const aging = deriveAgingDays(order, today);
  return aging !== null && aging > slaThreshold;
}

// ---- stage metadata (label ไทย + tone สำหรับ StatusBadge — spec §4) ----

export const STAGE_LABELS: Record<Stage, string> = {
  quotation: "เสนอราคา",
  contracted: "เซ็นสัญญาแล้ว รอส่งของ",
  procuring: "สั่งซื้อ/ชำระซัพพลายเออร์",
  delivered: "ส่งสินค้าแล้ว รอรับเช็ค",
  paid: "รับเช็คแล้ว",
  closed: "ปิดงาน",
};

export const STAGE_ORDER: Stage[] = [
  "quotation",
  "contracted",
  "procuring",
  "delivered",
  "paid",
  "closed",
];

/** tone มาตรฐานต่อ stage (ก่อนพิจารณา overdue) — ใช้กับ <StatusBadge tone=…> */
export const STAGE_TONE: Record<Stage, "neutral" | "info" | "warning" | "success"> = {
  quotation: "neutral",
  contracted: "info",
  procuring: "info",
  delivered: "warning",
  paid: "success",
  closed: "success",
};

/** department suggestion list (spec §Q6 — free-text + autocomplete, ไม่บังคับ) */
export const DEPARTMENT_SUGGESTIONS: string[] = [
  "กองการศึกษา",
  "กองคลัง",
  "กองการเจ้าหน้าที่",
  "สำนักปลัด",
  "กองสาธารณสุข",
  "กองยุทธศาสตร์ฯ",
  "สำนักปลัด ฝ่ายรักษาความสงบ",
];

/** role label ไทย + canWrite (mirror modules.ts ModuleRoleDef shape — spec §1) */
export interface ModuleRoleDef {
  key: ModuleRole;
  label: string;
  canWrite: boolean;
}

export const GOV_PROCURE_ROLES: ModuleRoleDef[] = [
  { key: "owner", label: "เจ้าของกิจการ", canWrite: true },
  { key: "manager", label: "ผู้จัดการงาน", canWrite: true },
  { key: "staff", label: "ทีมหน้างาน", canWrite: true }, // canWrite=true แต่ field-level lock การเงินที่ API (spec §1 หมายเหตุ)
  { key: "viewer", label: "ผู้ดูอย่างเดียว", canWrite: false },
];

/** field การเงินที่ staff แก้ไม่ได้ (spec §1 — hard-enforce ที่ API, prototype = UI lens) */
export const FINANCE_LOCKED_FIELDS: (keyof GovProcureOrder)[] = [
  "price_incl_vat",
  "price_excl_vat",
  "withholding_tax",
  "net_receivable",
  "cost_price",
  "gross_profit",
  "security_deposit",
  "customer_change",
  "petty_cash",
  "transport_buy",
  "transport_sell",
  "transport_other",
  "operate_89",
  "total_cost_89",
  "net_profit_89",
  "profit_pct",
  "commission_base_profit",
  "commission_amount",
  "commission_wht",
  "commission_net_payable",
];
