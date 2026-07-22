// inbox/filters.ts — ตัวกรองกล่องแชทรวม (ช่องทาง · สถานะห้อง · ค้นหา) — ตรรกะแยกจาก UI
// คำไทยของ enum ดึงจาก _fixtures/labels.ts เท่านั้น

import { CHAT_CHANNEL_LABEL, CONVERSATION_STATUS_LABEL } from "../_fixtures/labels";
import type {
  ChatChannel,
  ConversationStatus,
  MattiiConversation,
  MattiiCustomer,
} from "../_fixtures/types";

export interface InboxFilters {
  search: string;
  channel: ChatChannel | "";
  status: ConversationStatus | "";
  /** true = เฉพาะห้องที่ยังไม่อ่าน */
  unreadOnly: boolean;
}

export const EMPTY_INBOX_FILTERS: InboxFilters = {
  search: "",
  channel: "",
  status: "",
  unreadOnly: false,
};

export const CHANNEL_FILTER_OPTIONS = [
  { value: "", label: "ทุกช่องทาง" },
  ...(Object.keys(CHAT_CHANNEL_LABEL) as ChatChannel[]).map((c) => ({
    value: c as string,
    label: CHAT_CHANNEL_LABEL[c],
  })),
];

export const CONVERSATION_STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  ...(Object.keys(CONVERSATION_STATUS_LABEL) as ConversationStatus[]).map((s) => ({
    value: s as string,
    label: CONVERSATION_STATUS_LABEL[s],
  })),
];

/** ตัวเลือกสถานะห้องแบบ 3 ค่า (ใช้กับ SegmentedControl ในหัวห้องแชท) */
export const CONVERSATION_STATUS_CHOICES = (
  Object.keys(CONVERSATION_STATUS_LABEL) as ConversationStatus[]
).map((s) => ({ value: s, label: CONVERSATION_STATUS_LABEL[s] }));

export function hasActiveInboxFilter(f: InboxFilters): boolean {
  return !!(f.search || f.channel || f.status || f.unreadOnly);
}

export function filterConversations(
  rows: MattiiConversation[],
  f: InboxFilters,
  customers: MattiiCustomer[],
): MattiiConversation[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((c) => {
    if (f.channel && c.channel !== f.channel) return false;
    if (f.status && c.status !== f.status) return false;
    if (f.unreadOnly && c.unread_count === 0) return false;
    if (q) {
      const customer = customers.find((x) => x.id === c.customer_id);
      const hay = [c.subject_preview ?? "", customer?.display_name ?? "", c.external_thread_id]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** ห้องล่าสุดอยู่บนสุด */
export function sortByLatest(rows: MattiiConversation[]): MattiiConversation[] {
  return [...rows].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
}
