"use client";

// inbox/conversation-list.tsx — คอลัมน์ซ้ายของกล่องแชทรวม (รายการห้องแชท 3 ช่องทาง)
// ห้ามใช้ raw <button> → ใช้ <Button variant="ghost"> ปรับ layout ด้วย className

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
import { EMPTY_STATES } from "../_fixtures/empty-states";
import { CHAT_CHANNEL_LABEL } from "../_fixtures/labels";
import type { MattiiConversation, MattiiCustomer } from "../_fixtures/types";
import { ConversationStatusBadge } from "./status-badge";
import { MATTII_BASE, fmtDateTimeTH } from "../_components";

export function ConversationList({
  conversations,
  customers,
  selectedId,
  loading,
  filtered,
  onSelect,
  onClearFilters,
}: {
  conversations: MattiiConversation[];
  customers: MattiiCustomer[];
  selectedId: string | null;
  loading: boolean;
  filtered: boolean;
  onSelect: (id: string) => void;
  onClearFilters: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse space-y-2 rounded-lg p-2.5">
            <div className="h-3 w-24 rounded bg-gray-100" />
            <div className="h-3 w-full rounded bg-gray-100" />
            <div className="h-3 w-16 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-12 text-center shadow-sm">
        <div className="mb-3 rounded-full bg-gray-100 p-4">
          <MessageSquare className="h-7 w-7 text-gray-400" />
        </div>
        <Text className="text-sm font-medium text-gray-900">
          {filtered ? EMPTY_STATES.inbox.title : "ยังไม่มีแชทเข้ามา"}
        </Text>
        <Text className="mt-1 text-sm text-gray-500">
          {filtered
            ? EMPTY_STATES.inbox.description
            : "เมื่อลูกค้าทักเข้ามาทาง Facebook / LINE / TikTok ห้องแชทจะมารวมที่นี่"}
        </Text>
        {filtered ? (
          <Button size="sm" variant="outline" className="mt-4" onClick={onClearFilters}>
            {EMPTY_STATES.inbox.ctaLabel}
          </Button>
        ) : (
          <Button asChild size="sm" className="mt-4">
            <Link href={`${MATTII_BASE}/settings`}>ดูการเชื่อมต่อ ZAAPI</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="max-h-[70vh] space-y-1 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
      {conversations.map((c) => {
        const customer = customers.find((x) => x.id === c.customer_id);
        const active = c.id === selectedId;
        return (
          <Button
            key={c.id}
            variant="ghost"
            onClick={() => onSelect(c.id)}
            className={cn(
              "h-auto w-full flex-col items-start justify-start gap-1 whitespace-normal rounded-lg px-3 py-2.5 text-left",
              active ? "bg-primary/10 hover:bg-primary/10" : "hover:bg-gray-50",
            )}
          >
            <span className="flex w-full items-center gap-2">
              <span
                className={cn(
                  "truncate text-sm font-medium",
                  active ? "text-primary" : "text-gray-900",
                )}
              >
                {customer?.display_name ?? "ลูกค้ายังไม่ได้ผูกบัญชี"}
              </span>
              {c.unread_count > 0 && (
                <StatusBadge tone="danger">ยังไม่อ่าน {c.unread_count}</StatusBadge>
              )}
            </span>
            <span className="line-clamp-2 w-full text-xs font-normal text-gray-500">
              {c.subject_preview ?? "—"}
            </span>
            <span className="flex w-full items-center gap-2 text-[11px] font-normal text-gray-400">
              <span className="shrink-0">{CHAT_CHANNEL_LABEL[c.channel]}</span>
              <span className="shrink-0">·</span>
              <span className="truncate tabular-nums">{fmtDateTimeTH(c.last_message_at)}</span>
              <span className="ms-auto shrink-0">
                <ConversationStatusBadge status={c.status} />
              </span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}
