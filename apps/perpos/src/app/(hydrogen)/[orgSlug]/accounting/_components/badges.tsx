// badges.tsx (production) — map enum → StatusBadge (tone + ป้ายไทย) สำหรับสถานะ accounting
// type จาก lib/accounting/types.ts (contract เดียว) · tone จาก @/components/ui/badge
// หมายเหตุ: ตัด EntrySourceBadge ของ source "ai"/"line" ออกจากการเน้น — production ยังไม่เปิด AI/LINE
//   (B0 เลื่อนเฟส 2) แต่ enum ยังรองรับครบ (รายการ source=document/payroll = auto-post)

import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import type {
  AccEntryKind,
  AccEntrySource,
  AccDocStatus,
  AccDocType,
  AccJournalStatus,
} from "@/lib/accounting/types";

type Meta = { tone: BadgeTone; label: string };

// ─── entry_kind (รายรับ/รายจ่าย) ───
const ENTRY_KIND: Record<AccEntryKind, Meta> = {
  income: { tone: "success", label: "รายรับ" },
  expense: { tone: "danger", label: "รายจ่าย" },
};
export function EntryKindBadge({ kind }: { kind: AccEntryKind }) {
  const m = ENTRY_KIND[kind];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── entry_source (ที่มาของรายการ) ───
export const ENTRY_SOURCE_LABEL: Record<AccEntrySource, string> = {
  manual: "บันทึกเอง",
  document: "จากเอกสาร",
  payroll: "เงินเดือน",
  line: "LINE",
  ai: "AI",
};
const ENTRY_SOURCE_TONE: Record<AccEntrySource, BadgeTone> = {
  manual: "neutral",
  document: "info",
  payroll: "warning",
  line: "success",
  ai: "info",
};
/** ป้ายที่มาของรายการ */
export function EntrySourceBadge({ source }: { source: AccEntrySource }) {
  return <StatusBadge tone={ENTRY_SOURCE_TONE[source]}>{ENTRY_SOURCE_LABEL[source]}</StatusBadge>;
}

// ─── doc_status (เอกสารขาย) ───
const DOC_STATUS: Record<AccDocStatus, Meta> = {
  draft: { tone: "neutral", label: "ฉบับร่าง" },
  sent: { tone: "info", label: "ส่งแล้ว" },
  accepted: { tone: "warning", label: "ตอบรับ" },
  paid: { tone: "success", label: "รับชำระแล้ว" },
  void: { tone: "neutral", label: "ยกเลิก" },
  overdue: { tone: "danger", label: "เกินกำหนด" },
};
export function DocStatusBadge({ status }: { status: AccDocStatus }) {
  const m = DOC_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

export const DOC_TYPE_LABEL: Record<AccDocType, string> = {
  quotation: "ใบเสนอราคา",
  invoice: "ใบแจ้งหนี้",
  receipt: "ใบเสร็จรับเงิน",
  tax_invoice: "ใบกำกับภาษี",
  receipt_tax_invoice: "ใบเสร็จรับเงิน/ใบกำกับภาษี",
  credit_note: "ใบลดหนี้",
  debit_note: "ใบเพิ่มหนี้",
  billing_note: "ใบวางบิล",
  delivery_note: "ใบส่งของ",
};

// ─── journal_status (สมุดรายวัน) ───
const JOURNAL_STATUS: Record<AccJournalStatus, Meta> = {
  draft: { tone: "neutral", label: "ฉบับร่าง" },
  posted: { tone: "success", label: "ลงบัญชีแล้ว" },
  void: { tone: "neutral", label: "ยกเลิก" },
};
export function JournalStatusBadge({ status }: { status: AccJournalStatus }) {
  const m = JOURNAL_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}
