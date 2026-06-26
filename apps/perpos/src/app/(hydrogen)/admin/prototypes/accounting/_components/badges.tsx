// badges.tsx — map enum → StatusBadge (tone + ป้ายไทย) สำหรับสถานะ accounting
// ทุก enum ยึดตาม _fixtures/types.ts · tone จาก @/components/ui/badge (neutral|info|success|warning|danger)
// shared foundation — import: import { EntryKindBadge, EntrySourceBadge } from "../_components";

import { Bot } from "lucide-react";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import type {
  AccEntryKind,
  AccEntrySource,
  AccDocStatus,
  AccDocType,
  AccJournalStatus,
} from "../_fixtures/types";

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
/** ป้ายที่มา — แสดงไอคอน AI เมื่อ source = ai */
export function EntrySourceBadge({ source }: { source: AccEntrySource }) {
  return (
    <StatusBadge tone={ENTRY_SOURCE_TONE[source]}>
      {source === "ai" && <Bot className="mr-1 h-3 w-3" />}
      {ENTRY_SOURCE_LABEL[source]}
    </StatusBadge>
  );
}

// ─── doc_status (เอกสารขาย — เผื่อ A3 P4b) ───
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
};

// ─── journal_status (สมุดรายวัน — เผื่อ B1 P4b) ───
const JOURNAL_STATUS: Record<AccJournalStatus, Meta> = {
  draft: { tone: "neutral", label: "ฉบับร่าง" },
  posted: { tone: "success", label: "ลงบัญชีแล้ว" },
  void: { tone: "neutral", label: "ยกเลิก" },
};
export function JournalStatusBadge({ status }: { status: AccJournalStatus }) {
  const m = JOURNAL_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}
