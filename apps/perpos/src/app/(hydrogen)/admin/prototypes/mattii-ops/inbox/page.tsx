"use client";

// inbox/page.tsx — กล่องแชทรวม 3 ช่องทาง (จำลอง ZAAPI) — Contract v3 §4 หน้า 2
// 2 คอลัมน์: รายการห้องแชท (ซ้าย) + บทสนทนา/ช่องพิมพ์ตอบ (ขวา) — ทั้งสองคอลัมน์ min-w-0 (DESIGN §5 ข้อ 6)
// AI: §5.1 ปุ่มเดียว "สร้างออเดอร์จากแชท" (พรีฟิล + evidence) · §5.4 ร่างข้อความตอบลูกค้า
// mock: แชท/ข้อความอยู่ใน client state ของหน้านี้ (data-context ยังไม่มี setter ของแชท) —
//       ส่วนออเดอร์ที่สร้างเขียนเข้า data-context จริง หน้าอื่นจึงเห็นทันที

import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { notify } from "@/lib/toast";
import type {
  ChatChannel,
  ConversationStatus,
  MattiiConversation,
  MattiiMessage,
  MattiiOrder,
} from "../_fixtures/types";
import {
  FilterBar,
  MattiiShell,
  NoAccess,
  fmtNum,
  useMattiiData,
  useMattiiRole,
} from "../_components";
import {
  CHANNEL_FILTER_OPTIONS,
  CONVERSATION_STATUS_OPTIONS,
  EMPTY_INBOX_FILTERS,
  filterConversations,
  hasActiveInboxFilter,
  sortByLatest,
  type InboxFilters,
} from "./filters";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { AiOrderDialog } from "./ai-order-dialog";

let msgSeq = 1;

export default function MattiiInboxPage() {
  const { can } = useMattiiRole();
  const {
    conversations: seedConversations,
    messages: seedMessages,
    customers,
    staff,
    orders,
  } = useMattiiData();

  const [rooms, setRooms] = useState<MattiiConversation[]>(() => seedConversations);
  const [msgs, setMsgs] = useState<MattiiMessage[]>(() => seedMessages);
  const [filters, setFilters] = useState<InboxFilters>(EMPTY_INBOX_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // จำลองการโหลดครั้งแรก → โชว์ skeleton (DESIGN §9)
  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const visible = useMemo(
    () => sortByLatest(filterConversations(rooms, filters, customers)),
    [rooms, filters, customers],
  );

  const selected = selectedId ? (rooms.find((r) => r.id === selectedId) ?? null) : null;
  const threadMessages = useMemo(
    () =>
      selected
        ? msgs
            .filter((m) => m.conversation_id === selected.id)
            .sort((a, b) => a.sent_at.localeCompare(b.sent_at))
        : [],
    [msgs, selected],
  );

  function setF<K extends keyof InboxFilters>(key: K, value: InboxFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function patchRoom(id: string, patch: Partial<MattiiConversation>) {
    setRooms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch, updated_at: new Date().toISOString() } : r)),
    );
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    setHighlightId(null);
    patchRoom(id, { unread_count: 0 });
  }

  function handleStatus(status: ConversationStatus) {
    if (!selected) return;
    patchRoom(selected.id, { status });
    notify.updated("อัปเดตสถานะห้องแชทแล้ว");
  }

  function handleAssign(staffId: string) {
    if (!selected) return;
    patchRoom(selected.id, { assigned_staff_id: staffId || null });
    notify.updated(staffId ? "มอบหมายผู้รับผิดชอบแล้ว" : "ยกเลิกการมอบหมายแล้ว");
  }

  function handleSend(body: string) {
    if (!selected) return;
    const now = new Date().toISOString();
    const row: MattiiMessage = {
      id: `msg-new-${Date.now()}-${msgSeq++}`,
      org_id: selected.org_id,
      conversation_id: selected.id,
      direction: "outbound",
      sender_name: "ฝ่ายขาย (คุณ)",
      body,
      attachment_url: null,
      attachment_kind: null,
      sent_at: now,
      created_at: now,
      updated_at: now,
    };
    setMsgs((prev) => [...prev, row]);
    patchRoom(selected.id, {
      last_message_at: now,
      subject_preview: body.slice(0, 60),
      status: "pending",
    });
  }

  function handleEvidence(messageId: string) {
    setAiOpen(false);
    setHighlightId(messageId);
  }

  function handleCreated(order: MattiiOrder) {
    if (!selected) return;
    patchRoom(selected.id, { linked_order_id: order.id, status: "pending" });
  }

  if (!can("view", "inbox")) {
    return (
      <NoAccess title="กล่องแชทรวม" icon={<MessageSquare className="h-6 w-6" />}>
        กล่องแชทรวมเป็นงานของฝ่ายขายและเจ้าของร้าน — ลองสลับบทบาทเป็นฝ่ายขาย หรือเจ้าของ/ผู้จัดการ
      </NoAccess>
    );
  }

  const canWrite = can("write", "inbox");
  const saleStaff = staff.filter((s) => s.is_active && (s.role === "sale" || s.role === "owner"));
  const linkedOrder = selected?.linked_order_id
    ? (orders.find((o) => o.id === selected.linked_order_id) ?? null)
    : null;
  const unreadTotal = rooms.reduce((s, r) => s + r.unread_count, 0);

  return (
    <MattiiShell
      title="กล่องแชทรวม"
      description="รวมแชท Facebook · LINE · TikTok ไว้ที่เดียว ตอบลูกค้าและเปิดออเดอร์ได้จากหน้าเดียวกัน"
      icon={<MessageSquare className="h-6 w-6" />}
    >
      <FilterBar
        onClear={hasActiveInboxFilter(filters) ? () => setFilters(EMPTY_INBOX_FILTERS) : undefined}
        resultText={`พบ ${fmtNum(visible.length)} ห้อง จากทั้งหมด ${fmtNum(rooms.length)} ห้อง · ยังไม่อ่าน ${fmtNum(unreadTotal)}`}
      >
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={filters.search}
            onChange={(e) => setF("search", e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า / ข้อความ"
            className="pl-9"
          />
        </div>
        <CustomSelect
          value={filters.channel}
          onChange={(v) => setF("channel", v as ChatChannel | "")}
          options={CHANNEL_FILTER_OPTIONS}
          className="w-40"
        />
        <CustomSelect
          value={filters.status}
          onChange={(v) => setF("status", v as ConversationStatus | "")}
          options={CONVERSATION_STATUS_OPTIONS}
          className="w-40"
        />
        <SegmentedControl
          value={filters.unreadOnly ? "unread" : "all"}
          onChange={(v) => setF("unreadOnly", v === "unread")}
          size="sm"
          ariaLabel="กรองห้องที่ยังไม่อ่าน"
          options={[
            { value: "all", label: "ทุกห้อง" },
            { value: "unread", label: "ยังไม่อ่าน" },
          ]}
        />
      </FilterBar>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-4">
          <ConversationList
            conversations={visible}
            customers={customers}
            selectedId={selectedId}
            loading={loading}
            filtered={hasActiveInboxFilter(filters)}
            onSelect={handleSelect}
            onClearFilters={() => setFilters(EMPTY_INBOX_FILTERS)}
          />
        </div>

        <div className="min-w-0 lg:col-span-8">
          {selected ? (
            <MessageThread
              conversation={selected}
              customer={customers.find((c) => c.id === selected.customer_id)}
              messages={threadMessages}
              saleStaff={saleStaff}
              canWrite={canWrite}
              linkedOrderNo={linkedOrder?.order_no ?? null}
              highlightMessageId={highlightId}
              onChangeStatus={handleStatus}
              onAssign={handleAssign}
              onSend={handleSend}
              onCreateOrder={() => setAiOpen(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-16 text-center shadow-sm">
              <div className="mb-3 rounded-full bg-gray-100 p-4">
                <MessageSquare className="h-8 w-8 text-gray-400" />
              </div>
              <div className="text-sm font-medium text-gray-900">
                เลือกห้องแชทเพื่อเริ่มตอบลูกค้า
              </div>
              <div className="mt-1 text-sm text-gray-500">
                เลือกห้องจากรายการด้านซ้าย แล้วกด “สร้างออเดอร์จากแชท” เพื่อให้ AI
                ร่างสเปกออเดอร์ให้
              </div>
              {visible.length > 0 && (
                <Button size="sm" className="mt-4" onClick={() => handleSelect(visible[0].id)}>
                  เปิดห้องแชทล่าสุด
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <AiOrderDialog
          open={aiOpen}
          onOpenChange={setAiOpen}
          conversation={selected}
          onEvidence={handleEvidence}
          onCreated={handleCreated}
        />
      )}
    </MattiiShell>
  );
}
