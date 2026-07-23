// badges.tsx — map enum → StatusBadge (tone + คำไทย) ของ mattii_ops
// คำไทยดึงจาก _fixtures/labels.ts เท่านั้น (แหล่งเดียว) — ห้ามพิมพ์คำแปลเองที่นี่/ในหน้า

import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import {
  CF_STATUS_LABEL,
  CHAT_CHANNEL_LABEL,
  DESIGN_JOB_STATUS_LABEL,
  DESIGN_SOURCE_LABEL,
  ORDER_PRIORITY_LABEL,
  ORDER_STAGE_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_TYPE_LABEL,
  PRINT_JOB_STATUS_LABEL,
  SHIPMENT_STATUS_LABEL,
} from "../_fixtures/labels";
import type {
  CfStatus,
  ChatChannel,
  DesignJobStatus,
  DesignSource,
  OrderPriority,
  OrderStage,
  OrderStatus,
  PaymentStatus,
  PaymentType,
  PrintJobStatus,
  ShipmentStatus,
} from "../_fixtures/types";

// ─── order_status (14) ───
const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  draft: "neutral",
  quoted: "neutral",
  confirmed: "info",
  designing: "info",
  awaiting_cf: "warning",
  cf_approved: "info",
  printing: "info",
  qc: "warning",
  packing: "info",
  ready_to_ship: "warning",
  shipped: "success",
  delivered: "success",
  cancelled: "neutral",
  on_hold: "danger",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <StatusBadge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</StatusBadge>;
}

// ─── order_stage (5 ช่วง — derived) ───
const ORDER_STAGE_TONE: Record<OrderStage, BadgeTone> = {
  receive: "neutral",
  design: "warning",
  produce: "info",
  ship: "success",
  paused: "danger",
};

export function OrderStageBadge({ stage }: { stage: OrderStage }) {
  return <StatusBadge tone={ORDER_STAGE_TONE[stage]}>{ORDER_STAGE_LABEL[stage]}</StatusBadge>;
}

// ─── priority ───
export function PriorityBadge({ priority }: { priority: OrderPriority }) {
  if (priority === "normal") return null;
  return <StatusBadge tone="danger">{ORDER_PRIORITY_LABEL[priority]}</StatusBadge>;
}

// ─── ช่องทางแชท ───
export function ChannelBadge({ channel }: { channel: ChatChannel }) {
  return <StatusBadge tone="neutral">{CHAT_CHANNEL_LABEL[channel]}</StatusBadge>;
}

// ─── แหล่งที่มาของลาย ───
export function DesignSourceBadge({ source }: { source: DesignSource }) {
  return <StatusBadge tone="neutral">{DESIGN_SOURCE_LABEL[source]}</StatusBadge>;
}

// ─── งานแบบ / CF ───
const DESIGN_JOB_TONE: Record<DesignJobStatus, BadgeTone> = {
  queued: "neutral",
  in_progress: "info",
  waiting_cf: "warning",
  revising: "warning",
  approved: "success",
  cancelled: "neutral",
};
export function DesignJobStatusBadge({ status }: { status: DesignJobStatus }) {
  return (
    <StatusBadge tone={DESIGN_JOB_TONE[status]}>{DESIGN_JOB_STATUS_LABEL[status]}</StatusBadge>
  );
}

const CF_TONE: Record<CfStatus, BadgeTone> = {
  not_sent: "neutral",
  sent: "warning",
  approved: "success",
  rejected: "danger",
};
export function CfStatusBadge({ status }: { status: CfStatus }) {
  return <StatusBadge tone={CF_TONE[status]}>{CF_STATUS_LABEL[status]}</StatusBadge>;
}

// ─── งานพิมพ์ ───
const PRINT_JOB_TONE: Record<PrintJobStatus, BadgeTone> = {
  queued: "neutral",
  printing: "info",
  done: "success",
  reprint: "danger",
  cancelled: "neutral",
};
export function PrintJobStatusBadge({ status }: { status: PrintJobStatus }) {
  return <StatusBadge tone={PRINT_JOB_TONE[status]}>{PRINT_JOB_STATUS_LABEL[status]}</StatusBadge>;
}

// ─── จัดส่ง ───
const SHIPMENT_TONE: Record<ShipmentStatus, BadgeTone> = {
  pending: "neutral",
  label_created: "info",
  picked_up: "info",
  in_transit: "info",
  delivered: "success",
  failed: "danger",
  returned: "danger",
};
export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return <StatusBadge tone={SHIPMENT_TONE[status]}>{SHIPMENT_STATUS_LABEL[status]}</StatusBadge>;
}

// ─── การเงิน ───
const PAYMENT_TYPE_TONE: Record<PaymentType, BadgeTone> = {
  deposit: "info",
  balance: "info",
  full: "success",
  refund: "danger",
};
export function PaymentTypeBadge({ type }: { type: PaymentType }) {
  return <StatusBadge tone={PAYMENT_TYPE_TONE[type]}>{PAYMENT_TYPE_LABEL[type]}</StatusBadge>;
}

const PAYMENT_STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  pending: "warning",
  paid: "success",
  failed: "danger",
  refunded: "neutral",
};
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <StatusBadge tone={PAYMENT_STATUS_TONE[status]}>{PAYMENT_STATUS_LABEL[status]}</StatusBadge>
  );
}
