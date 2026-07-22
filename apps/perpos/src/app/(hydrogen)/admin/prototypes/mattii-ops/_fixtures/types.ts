// types.ts — mattii_ops fixture types (20 entity + enums)
// ยึดตาม specs/mattii_ops.md §3 Data Contract v2 ตรงเป๊ะ — ห้ามคิดชื่อ/เพิ่ม-ตัด field เอง

// ---- Enums (canonical — ทุกชั้นใช้ค่าเดียวกัน) ----

export type ChatChannel = "facebook" | "line" | "tiktok";
export type ConversationStatus = "open" | "pending" | "closed";
export type MessageDirection = "inbound" | "outbound";
export type CustomerTier = "new" | "regular" | "vip";

export type RugCategory =
  | "doormat"
  | "entrance"
  | "living_room"
  | "bedroom"
  | "kitchen"
  | "table_mat"
  | "custom";

export type SizeKind = "standard" | "custom_cut";
export type EdgeFinish = "overlock" | "binding" | "raw";

export type OrderStatus =
  | "draft"
  | "quoted"
  | "confirmed"
  | "designing"
  | "awaiting_cf"
  | "cf_approved"
  | "printing"
  | "qc"
  | "packing"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "on_hold";

/**
 * order_stage — 5 ช่วงรวบ 14 order_status (Contract v3, derived — ไม่เก็บเป็นข้อมูลจริง)
 * บอร์ด/KPI/filter default ใช้ 5 ช่วงนี้ ไม่ใช่ 14 สถานะดิบ — mapping + helper อยู่ใน helpers.ts,
 * label ไทย canonical อยู่ใน labels.ts
 */
export type OrderStage = "receive" | "design" | "produce" | "ship" | "paused";

export type OrderPriority = "normal" | "rush";
export type DesignSource = "customer_file" | "in_house";
export type DesignJobStatus =
  | "queued"
  | "in_progress"
  | "waiting_cf"
  | "revising"
  | "approved"
  | "cancelled";
export type CfStatus = "not_sent" | "sent" | "approved" | "rejected";

export type MachineKind = "fabric_printer" | "heat_press" | "cut_sew";
export type MachineStatus = "idle" | "running" | "maintenance";
export type PrintJobStatus = "queued" | "printing" | "done" | "reprint" | "cancelled";

export type QcResult = "pass" | "fail";
export type QcDefectType =
  | "color_off"
  | "misalign"
  | "material_defect"
  | "wrong_size"
  | "wrong_version"
  | "edge_defect"
  | "other";
export type PackingStatus = "not_packed" | "packed";

export type ShipmentCarrier = "jt" | "shipnity_other" | "pickup";
export type ShipmentStatus =
  | "pending"
  | "label_created"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "failed"
  | "returned";

export type PaymentMethod = "transfer" | "promptpay" | "cod" | "cash" | "card";
export type PaymentType = "deposit" | "balance" | "full" | "refund";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type MaterialCategory = "rug_fabric" | "ink" | "film" | "backing" | "packaging" | "other";
export type MaterialUnit = "sqm" | "meter" | "roll" | "liter" | "piece" | "box";
export type StockMoveType =
  | "receive"
  | "consume_print"
  | "consume_pack"
  | "adjust"
  | "waste"
  | "return";

export type CostCategory = "material" | "labor" | "machine" | "shipping" | "other";
export type IntegrationKind = "zaapi" | "shipnity" | "jt" | "line_notify";
export type IntegrationStatus = "connected" | "disconnected" | "error";
export type ActivityType =
  | "status_change"
  | "note"
  | "file_upload"
  | "cf_result"
  | "payment"
  | "shipment"
  | "stock"
  | "system";
export type StaffRole = "owner" | "sale" | "designer" | "production";

// ---- Entity Interfaces ----

/** 3.1 mattii_customers */
export interface MattiiCustomer {
  id: string;
  org_id: string;
  code: string;
  display_name: string;
  full_name: string | null;
  phone: string | null;
  primary_channel: ChatChannel;
  channel_handles: { facebook?: string; line?: string; tiktok?: string };
  tier: CustomerTier;
  address_line: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postcode: string | null;
  total_orders: number;
  total_spent: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** 3.2 mattii_conversations */
export interface MattiiConversation {
  id: string;
  org_id: string;
  customer_id: string | null;
  channel: ChatChannel;
  external_thread_id: string;
  subject_preview: string | null;
  status: ConversationStatus;
  assigned_staff_id: string | null;
  unread_count: number;
  last_message_at: string;
  linked_order_id: string | null;
  created_at: string;
  updated_at: string;
}

/** 3.3 mattii_messages */
export interface MattiiMessage {
  id: string;
  org_id: string;
  conversation_id: string;
  direction: MessageDirection;
  sender_name: string;
  body: string | null;
  attachment_url: string | null;
  attachment_kind: "image" | "file" | null;
  sent_at: string;
  created_at: string;
  updated_at: string;
}

/** 3.4 mattii_products — แบบพรม */
export interface MattiiProduct {
  id: string;
  org_id: string;
  code: string;
  name: string;
  category: RugCategory;
  fabric_type: string;
  backing_type: string | null;
  edge_finish: EdgeFinish;
  print_method: string;
  default_lead_time_days: number;
  option_schema: { key: string; label: string; values: string[] }[];
  image_url: string | null;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** 3.5 mattii_product_sizes — ขนาด+ราคาต่อชิ้น */
export interface MattiiProductSize {
  id: string;
  org_id: string;
  product_id: string;
  size_kind: SizeKind;
  size_label: string;
  width_cm: number | null;
  length_cm: number | null;
  unit_price: number;
  base_cost: number; // owner-only
  price_per_sqm: number | null;
  fabric_usage_sqm: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** 3.6 mattii_orders — entity แกน */
export interface MattiiOrder {
  id: string;
  org_id: string;
  order_no: string;
  customer_id: string;
  conversation_id: string | null;
  source_channel: ChatChannel | null;
  status: OrderStatus;
  priority: OrderPriority;
  design_source: DesignSource;
  sale_staff_id: string | null;
  due_date: string | null;
  promised_ship_date: string | null;
  subtotal: number;
  discount_amount: number;
  shipping_fee: number;
  rush_fee: number;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  total_cost: number; // owner-only
  gross_profit: number; // owner-only
  margin_percent: number; // owner-only
  is_cod: boolean;
  cancel_reason: string | null;
  hold_reason: string | null;
  previous_status: OrderStatus | null;
  note: string | null;
  confirmed_at: string | null;
  cf_approved_at: string | null;
  printed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 3.8 mattii_order_items */
export interface MattiiOrderItem {
  id: string;
  org_id: string;
  order_id: string;
  line_no: number;
  product_id: string | null;
  product_size_id: string | null;
  item_name: string;
  size_label: string;
  width_cm: number | null;
  length_cm: number | null;
  fabric_type: string | null;
  edge_finish: EdgeFinish;
  pattern_name: string | null;
  qty: number;
  unit_price: number;
  unit_cost: number; // owner-only
  line_total: number;
  fabric_usage_sqm: number;
  options: Record<string, string>;
  spec_note: string | null;
  created_at: string;
  updated_at: string;
}

/** 3.9 mattii_order_costs — owner-only */
export interface MattiiOrderCost {
  id: string;
  org_id: string;
  order_id: string;
  cost_category: CostCategory;
  label: string;
  amount: number;
  source: "auto_stock" | "auto_shipping" | "manual";
  stock_movement_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** 3.10 mattii_design_jobs */
export interface MattiiDesignJob {
  id: string;
  org_id: string;
  order_id: string;
  job_no: string;
  design_source: DesignSource;
  status: DesignJobStatus;
  assigned_designer_id: string | null;
  brief: string | null;
  cf_status: CfStatus;
  revision_count: number;
  approved_version_id: string | null;
  due_at: string | null;
  started_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 3.11 mattii_design_versions */
export interface MattiiDesignVersion {
  id: string;
  org_id: string;
  design_job_id: string;
  version_no: number;
  file_name: string;
  file_url: string | null;
  preview_url: string | null;
  file_size_kb: number | null;
  dpi: number | null;
  uploaded_by_id: string;
  uploaded_by_role: StaffRole;
  cf_status: CfStatus;
  cf_sent_at: string | null;
  cf_responded_at: string | null;
  customer_feedback: string | null;
  is_print_ready: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** 3.12 mattii_machines */
export interface MattiiMachine {
  id: string;
  org_id: string;
  code: string;
  name: string;
  machine_kind: MachineKind;
  status: MachineStatus;
  capacity_per_day: number;
  hourly_cost: number; // owner-only
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** 3.13 mattii_print_jobs */
export interface MattiiPrintJob {
  id: string;
  org_id: string;
  order_id: string;
  job_no: string;
  machine_id: string | null;
  design_version_id: string | null;
  status: PrintJobStatus;
  queue_position: number;
  is_reprint: boolean;
  reprint_of_job_id: string | null;
  operator_id: string | null;
  planned_start_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  pieces: number;
  material_note: string | null;
  created_at: string;
  updated_at: string;
}

/** 3.14 mattii_qc_records */
export interface MattiiQcRecord {
  id: string;
  org_id: string;
  order_id: string;
  print_job_id: string | null;
  checked_by_id: string;
  checked_at: string;
  result: QcResult;
  defect_type: QcDefectType | null;
  defect_note: string | null;
  defect_qty: number;
  defect_cost: number; // owner-only
  photo_url: string | null;
  packing_status: PackingStatus;
  packed_by_id: string | null;
  packed_at: string | null;
  package_count: number;
  weight_kg: number | null;
  created_at: string;
  updated_at: string;
}

/** 3.15 mattii_shipments */
export interface MattiiShipment {
  id: string;
  org_id: string;
  order_id: string;
  carrier: ShipmentCarrier;
  tracking_no: string | null;
  status: ShipmentStatus;
  shipnity_order_ref: string | null;
  recipient_name: string;
  recipient_phone: string;
  address_snapshot: string;
  shipping_cost: number; // owner-only (auto order_cost)
  cod_amount: number;
  cod_collected: boolean;
  label_created_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  last_synced_at: string | null;
  tracking_events: { at: string; status: string; description: string }[];
  created_at: string;
  updated_at: string;
}

/** 3.16 mattii_payments */
export interface MattiiPayment {
  id: string;
  org_id: string;
  order_id: string;
  payment_no: string;
  payment_type: PaymentType;
  method: PaymentMethod;
  amount: number; // คืนเงิน = ค่าบวก แสดง − ที่ UI
  status: PaymentStatus;
  paid_at: string | null;
  slip_url: string | null;
  received_by_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** 3.17 mattii_materials — วัสดุ/สต๊อก */
export interface MattiiMaterial {
  id: string;
  org_id: string;
  code: string;
  name: string;
  category: MaterialCategory;
  unit: MaterialUnit;
  qty_on_hand: number;
  reorder_point: number;
  unit_cost: number; // owner-only
  stock_value: number; // owner-only
  supplier_name: string | null;
  location: string | null;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** 3.18 mattii_stock_movements */
export interface MattiiStockMovement {
  id: string;
  org_id: string;
  material_id: string;
  move_type: StockMoveType;
  qty_delta: number; // + รับเข้า/คืน · − ตัดออก/ของเสีย
  qty_after: number;
  unit_cost_at_move: number; // owner-only
  total_cost: number; // owner-only
  order_id: string | null;
  print_job_id: string | null;
  staff_id: string | null;
  reason: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

/** 3.19 mattii_staff */
export interface MattiiStaff {
  id: string;
  org_id: string;
  profile_id: string | null;
  display_name: string;
  role: StaffRole;
  phone: string | null;
  line_user_id: string | null;
  hourly_rate: number; // owner-only
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** 3.20 mattii_integrations */
export interface MattiiIntegration {
  id: string;
  org_id: string;
  kind: IntegrationKind;
  display_name: string;
  status: IntegrationStatus;
  account_label: string | null;
  connected_channels: ChatChannel[];
  last_sync_at: string | null;
  last_error: string | null;
  sync_count_today: number;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** 3.22 mattii_benchmarks — singleton ต่อ org (Contract v3) — ค่า "ก่อนมีระบบ" สำหรับพรีเซน before/after */
export interface MattiiBenchmark {
  id: string;
  org_id: string;
  lead_time_baseline_days: number;
  cf_wait_baseline_days: number;
  reprint_rate_baseline: number; // %
  late_rate_baseline: number; // %
  orders_per_month_baseline: number;
  reply_time_baseline_minutes: number;
  source_note: string;
  created_at: string;
  updated_at: string;
}

/** 3.21 mattii_activities — timeline */
export interface MattiiActivity {
  id: string;
  org_id: string;
  order_id: string | null;
  activity_type: ActivityType;
  actor_id: string | null;
  actor_label: string;
  from_status: string | null;
  to_status: string | null;
  message: string;
  meta: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}
