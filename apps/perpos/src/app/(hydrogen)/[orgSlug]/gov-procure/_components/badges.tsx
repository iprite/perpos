// badges.tsx — map enum → StatusBadge (tone + ป้ายไทย) สำหรับ gov_procure
// StageBadge (stage/tone จาก STAGE_TONE) + OverdueBadge (icon + "เกินกำหนด N วัน" — P2-a
// ไม่พึ่งสีเดียว) + CompanyBadge (split 89/P2P ด้วย label ไม่พึ่งสี — P2-f)
// import: import { StageBadge, OverdueBadge, CompanyBadge } from "../_components/badges";

import { AlertTriangle } from "lucide-react";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { STAGE_LABELS, STAGE_TONE } from "@/lib/gov-procure/stage";
import type { Stage, Company } from "@/lib/gov-procure/types";

// STAGE_TONE ให้ neutral|info|warning|success — map ตรงกับ BadgeTone ได้เลย
const STAGE_BADGE_TONE: Record<Stage, BadgeTone> = STAGE_TONE;

/**
 * ป้ายสถานะ stage — overdue (delivered เกิน SLA) แสดง tone danger + icon (ผ่าน OverdueBadge แยก)
 * StageBadge เองแสดงเฉพาะ stage ปกติ · overdue = แสดง OverdueBadge ควบข้าง (P2-a)
 */
export function StageBadge({ stage }: { stage: Stage }) {
  return <StatusBadge tone={STAGE_BADGE_TONE[stage]}>{STAGE_LABELS[stage]}</StatusBadge>;
}

/**
 * ป้ายเกินกำหนด — icon AlertTriangle + "เกินกำหนด N วัน" (ไม่พึ่งพื้นแดงล้วน · a11y P2-a)
 * ใช้กับงาน delivered ที่ aging > SLA
 */
export function OverdueBadge({ days }: { days: number }) {
  return (
    <StatusBadge tone="danger" className="gap-1">
      <AlertTriangle className="h-3 w-3" />
      เกินกำหนด {days} วัน
    </StatusBadge>
  );
}

/**
 * ป้ายจำนวนวันค้างรับ (ยังไม่เกิน SLA) — tone warning + "ค้าง N วัน" (แยกจาก overdue)
 */
export function AgingBadge({ days }: { days: number }) {
  return <StatusBadge tone="warning">ค้าง {days} วัน</StatusBadge>;
}

/** ป้ายบริษัท (89/P2P) — split ด้วย label ไม่พึ่งสีเดียว (P2-f) */
export function CompanyBadge({ company }: { company: Company | null }) {
  if (!company) return <StatusBadge tone="neutral">ไม่ระบุบริษัท</StatusBadge>;
  return <StatusBadge tone="neutral">{company}</StatusBadge>;
}
