// badges.tsx — ป้ายของฟีเจอร์แคตตาล็อก (StatusBadge เท่านั้น — ห้าม span pill มือ, DESIGN §6)
// ทุกใบมี icon + คำไทยควบ (สถานะไม่พึ่งสีเดียว) · pattern เดียวกับ ../_components/badges.tsx
// N1 — คำเดียวกันทุกที่: ตาราง/การ์ด = "AI เดา" · header ของ Dialog = "AI เดา — ยังไม่ผ่านตรวจ"

import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileEdit,
  ImageOff,
  Info,
  Library,
  ListX,
  PenLine,
  Sparkles,
} from "lucide-react";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import type { CatalogItemSource, CatalogStatus } from "@/lib/gov-procure/catalog";
import { ISSUE_LABELS, type IssueKey } from "./format";

const SOURCE_TONE: Record<CatalogItemSource, BadgeTone> = {
  ai_draft: "warning",
  human_verified: "success",
  library: "info",
  manual: "neutral",
};

const SOURCE_LABEL: Record<CatalogItemSource, string> = {
  ai_draft: "AI เดา",
  human_verified: "ยืนยันแล้ว",
  library: "จากคลัง",
  manual: "กรอกเอง",
};

function SourceIcon({ source }: { source: CatalogItemSource }) {
  const cls = "h-3 w-3";
  if (source === "ai_draft") return <Sparkles className={cls} />;
  if (source === "human_verified") return <CheckCircle2 className={cls} />;
  if (source === "library") return <Library className={cls} />;
  return <PenLine className={cls} />;
}

/** ที่มาข้อมูลรายแถว — `detailed` = โหมด header ของ Dialog (N1) */
export function SourceBadge({
  source,
  detailed = false,
}: {
  source: CatalogItemSource;
  detailed?: boolean;
}) {
  const label =
    detailed && source === "ai_draft" ? "AI เดา — ยังไม่ผ่านตรวจ" : SOURCE_LABEL[source];
  return (
    <StatusBadge tone={SOURCE_TONE[source]} className="gap-1">
      <SourceIcon source={source} />
      {label}
    </StatusBadge>
  );
}

const STATUS_TONE: Record<CatalogStatus, BadgeTone> = {
  draft: "neutral",
  enriching: "info",
  review: "warning",
  approved: "success",
};

const STATUS_LABEL: Record<CatalogStatus, string> = {
  draft: "ร่าง",
  enriching: "AI กำลังเติมข้อมูล",
  review: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
};

/** สถานะชุดแคตตาล็อก */
export function CatalogStatusBadge({ status }: { status: CatalogStatus }) {
  const cls = "h-3 w-3";
  return (
    <StatusBadge tone={STATUS_TONE[status]} className="gap-1">
      {status === "draft" && <FileEdit className={cls} />}
      {status === "enriching" && <Sparkles className={`${cls} animate-pulse`} />}
      {status === "review" && <ClipboardCheck className={cls} />}
      {status === "approved" && <CheckCircle2 className={cls} />}
      {STATUS_LABEL[status]}
    </StatusBadge>
  );
}

const ISSUE_TONE: Record<IssueKey, BadgeTone> = {
  no_bullets: "warning",
  no_image: "warning",
  no_price: "warning",
  low_price_conf: "warning",
  low_conf: "warning",
  ai_note: "neutral",
};

function IssueIcon({ issue }: { issue: IssueKey }) {
  const cls = "h-3 w-3";
  if (issue === "no_bullets") return <ListX className={cls} />;
  if (issue === "no_image") return <ImageOff className={cls} />;
  if (issue === "no_price") return <CircleDollarSign className={cls} />;
  if (issue === "ai_note") return <Info className={cls} />;
  return <AlertTriangle className={cls} />;
}

/** ป้ายเดี่ยว "ต้องตรวจ" — tone warning/neutral เท่านั้น (แดงสงวนไว้กับความผิดพลาด DESIGN §2) */
export function IssueChip({ issue }: { issue: IssueKey }) {
  return (
    <StatusBadge tone={ISSUE_TONE[issue]} className="gap-1">
      <IssueIcon issue={issue} />
      {ISSUE_LABELS[issue]}
    </StatusBadge>
  );
}

/** กลุ่มป้าย "ต้องตรวจ" — สูงสุด `max` ใบ + `+n` · ไม่มี issue = ว่างสนิท (ความว่าง = ผ่าน) */
export function IssueChips({ issues, max = 2 }: { issues: IssueKey[]; max?: number }) {
  if (issues.length === 0) return null;
  const shown = issues.slice(0, max);
  const rest = issues.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((k) => (
        <IssueChip key={k} issue={k} />
      ))}
      {rest > 0 && <StatusBadge tone="neutral">+{rest}</StatusBadge>}
    </div>
  );
}

/** ความเชื่อมั่นเนื้อหา (ใช้ใน Dialog) */
export function ConfidenceBadge({ value }: { value: number | null }) {
  if (typeof value !== "number")
    return <StatusBadge tone="neutral">ไม่มีค่าความเชื่อมั่น</StatusBadge>;
  const pct = Math.round(value * 100);
  const tone: BadgeTone = pct >= 80 ? "success" : pct >= 60 ? "info" : "warning";
  return <StatusBadge tone={tone}>ความเชื่อมั่น {pct}%</StatusBadge>;
}
