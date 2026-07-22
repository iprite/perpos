// lib/gov-procure/types.ts — canonical types สำหรับ production gov_procure
// ยึด specs/gov_procure.md §3 Data Contract + migration 20260710120000_gov_procure_schema.sql
// (mirror prototype _fixtures/types.ts แต่ตัด attachments ออกจาก order — production แยกตารางจริง)
//
// สำคัญ (N1 — §3.3/§8.1): duration_days / aging_days = PURE DERIVED — ไม่มีใน order (คำนวณผ่าน helper)

// ---- Enums (canonical) ----

/** 6-stage pipeline — แกนของ module (§4) */
export type Stage =
  | "quotation" // เสนอราคา
  | "contracted" // เซ็นสัญญาแล้ว รอส่งของ
  | "procuring" // สั่งซื้อ/ชำระซัพพลายเออร์
  | "delivered" // ส่งสินค้าแล้ว รอรับเช็ค
  | "paid" // รับเช็คแล้ว
  | "closed"; // ปิดงาน (manual close เท่านั้น)

export const STAGES: Stage[] = [
  "quotation",
  "contracted",
  "procuring",
  "delivered",
  "paid",
  "closed",
];

/** บริษัทรับงาน (ต้องสะกด/เว้นวรรคตรงเป๊ะ ตาม CHECK constraint `gov_procure_orders_company_chk`) */
export const COMPANIES = [
  "89 Global Work",
  "P2P Supply",
  "ALPHA ENGINEERING",
  "MAGISTATS TRADING",
] as const;

export type Company = (typeof COMPANIES)[number];

/** สีจุดนำหน้าชื่อบริษัท (รายงาน/legend) — พาเลตต์ DESIGN.md §2 */
export const COMPANY_DOT_CLASS: Record<Company, string> = {
  "89 Global Work": "bg-blue-400",
  "P2P Supply": "bg-violet-400",
  "ALPHA ENGINEERING": "bg-green-400",
  "MAGISTATS TRADING": "bg-orange-400",
};

/** สถานะสลิป (checklist Done/-) */
export type SlipStatus = "Done" | "-" | null;

/** 4 role ตาม §1 — entry แรก = สิทธิ์สูงสุด */
export type GovProcureRole = "owner" | "manager" | "staff" | "viewer";

/** attachment kind — §3.2 */
export type AttachmentKind =
  | "customer_change_slip"
  | "petty_cash_slip"
  | "commission_slip"
  | "cheque_photo"
  | "other";

export const ATTACHMENT_KINDS: AttachmentKind[] = [
  "customer_change_slip",
  "petty_cash_slip",
  "commission_slip",
  "cheque_photo",
  "other",
];

// ---- Entity หลัก: gov_procure_order (§3.1) ----

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
}

// ---- Entity ย่อย: gov_procure_attachment (§3.2) ----

export interface GovProcureAttachment {
  id: string;
  org_id: string;
  order_id: string;
  kind: AttachmentKind;
  file_path: string; // path ใน storage bucket 'gov-procure'
  file_name: string | null;
  uploaded_by: string;
  created_at: string;
}

// ---- Entity ที่ 3: gov_procure_settings (§3.2b — B2) ----

export interface GovProcureSettings {
  org_id: string;
  sla_threshold: number; // เกณฑ์ overdue (วัน) default 30
  pct_customer_change: number | null;
  pct_petty: number | null;
  pct_operate: number | null;
  line_alert_enabled: boolean;
  line_recipients: GovProcureRole[] | null;
  line_weekly_enabled: boolean;
  line_event_paid: boolean;
  line_event_delivered: boolean;
  // notify-state (server-managed, anti-spam — migration gov_procure_notify_state)
  last_aging_alert_at?: string | null; // T1 push ล่าสุด (re-alert ทุก 3 วัน/ชุดเปลี่ยน)
  last_aging_alert_key?: string | null; // signature ชุด overdue ล่าสุด (order_id sorted)
  last_weekly_sent_at?: string | null; // T2 push ล่าสุด (idempotency กัน double-run)
  // LINE group ของทีมงาน/นักลงทุน (1 กลุ่มต่อ org) — ผูกด้วยคำสั่ง /ผูกกลุ่ม ในกลุ่ม
  line_group_id?: string | null;
  line_group_bound_at?: string | null;
  line_group_bound_by?: string | null;
  created_at: string;
  updated_at: string;
}

/** ค่าตั้งต้น settings (ใช้เมื่อ org ยังไม่มี row — กัน null/404, B2) */
export const DEFAULT_SETTINGS: Omit<GovProcureSettings, "org_id" | "created_at" | "updated_at"> = {
  sla_threshold: 30,
  pct_customer_change: 10,
  pct_petty: 5,
  pct_operate: 10,
  line_alert_enabled: true,
  line_recipients: ["owner", "manager"],
  line_weekly_enabled: true,
  line_event_paid: true,
  line_event_delivered: false,
};
