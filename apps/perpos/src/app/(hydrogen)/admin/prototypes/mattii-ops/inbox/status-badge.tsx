// inbox/status-badge.tsx — ป้ายสถานะห้องแชท (conversation_status)
// _components/badges.tsx ยังไม่มีตัวนี้ (foundation ล็อกแล้ว) จึงประกาศไว้ที่หน้าที่ใช้จริง
// คำไทยดึงจาก _fixtures/labels.ts เท่านั้น — ห้ามพิมพ์คำแปลเอง

import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { CONVERSATION_STATUS_LABEL } from "../_fixtures/labels";
import type { ConversationStatus } from "../_fixtures/types";

const TONE: Record<ConversationStatus, BadgeTone> = {
  open: "warning", // ยังต้องตอบ
  pending: "info", // รอลูกค้าตอบกลับ
  closed: "neutral",
};

export function ConversationStatusBadge({ status }: { status: ConversationStatus }) {
  return <StatusBadge tone={TONE[status]}>{CONVERSATION_STATUS_LABEL[status]}</StatusBadge>;
}
