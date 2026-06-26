// backstage-badges.tsx — map enum หลังบ้าน → StatusBadge + ป้ายไทย/glossary
// ใช้ร่วม B3/B4/B5 · tax_kind, tax_status, period_status, journal_source, account_type

import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import type {
  AccTaxKind,
  AccTaxStatus,
  AccPeriodStatus,
  AccJournalSource,
  AccAccountType,
} from "../_fixtures/types";

// ─── tax_kind (แบบภาษี — โชว์รหัสราชการ + glossary) ───
export const TAX_KIND_LABEL: Record<AccTaxKind, string> = {
  pp30: "ภ.พ.30",
  pnd1: "ภ.ง.ด.1",
  pnd3: "ภ.ง.ด.3",
  pnd53: "ภ.ง.ด.53",
};
/** glossary ภาษาคน (owner-facing — A5) */
export const TAX_KIND_PLAIN: Record<AccTaxKind, string> = {
  pp30: "ภาษีมูลค่าเพิ่ม (VAT)",
  pnd1: "ภาษีเงินเดือนพนักงาน",
  pnd3: "ภาษีหัก ค่าจ้างบุคคล",
  pnd53: "ภาษีหัก ค่าจ้างบริษัท",
};

// ─── tax_status ───
const TAX_STATUS: Record<AccTaxStatus, { tone: BadgeTone; label: string }> = {
  draft: { tone: "neutral", label: "ฉบับร่าง" },
  ready: { tone: "warning", label: "พร้อมยื่น" },
  filed: { tone: "success", label: "ยื่นแล้ว" },
};
export function TaxStatusBadge({ status }: { status: AccTaxStatus }) {
  const m = TAX_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── period_status ───
const PERIOD_STATUS: Record<AccPeriodStatus, { tone: BadgeTone; label: string }> = {
  open: { tone: "info", label: "เปิดอยู่" },
  closed: { tone: "neutral", label: "ปิดงวดแล้ว" },
};
export function PeriodStatusBadge({ status }: { status: AccPeriodStatus }) {
  const m = PERIOD_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── journal_source (ที่มา journal) ───
export const JOURNAL_SOURCE_LABEL: Record<AccJournalSource, string> = {
  manual: "บันทึกเอง",
  document: "จากเอกสาร",
  payroll: "เงินเดือน",
  depreciation: "ค่าเสื่อม",
  ai: "AI",
};
const JOURNAL_SOURCE_TONE: Record<AccJournalSource, BadgeTone> = {
  manual: "neutral",
  document: "info",
  payroll: "warning",
  depreciation: "info",
  ai: "info",
};
/** แสดงเฉพาะที่มาอัตโนมัติ (payroll/depreciation/document) ที่ควรรู้ที่มา */
export function JournalSourceBadge({ source }: { source: AccJournalSource }) {
  if (source === "manual") return null;
  return (
    <StatusBadge tone={JOURNAL_SOURCE_TONE[source]}>{JOURNAL_SOURCE_LABEL[source]}</StatusBadge>
  );
}

// ─── account_type ───
export const ACCOUNT_TYPE_LABEL: Record<AccAccountType, string> = {
  asset: "สินทรัพย์",
  liability: "หนี้สิน",
  equity: "ส่วนของเจ้าของ",
  income: "รายได้",
  expense: "ค่าใช้จ่าย",
};
const ACCOUNT_TYPE_TONE: Record<AccAccountType, BadgeTone> = {
  asset: "info",
  liability: "warning",
  equity: "neutral",
  income: "success",
  expense: "danger",
};
export function AccountTypeBadge({ type }: { type: AccAccountType }) {
  return <StatusBadge tone={ACCOUNT_TYPE_TONE[type]}>{ACCOUNT_TYPE_LABEL[type]}</StatusBadge>;
}
