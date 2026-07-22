"use client";

// inbox/message-thread.tsx — คอลัมน์ขวาของกล่องแชทรวม: บทสนทนา + ช่องพิมพ์ตอบ
// AI §5.4 (MUST-3): "ร่างข้อความตอบลูกค้า" 3 เจตนา × 3 โทน → เติมลงช่องพิมพ์ให้คนแก้ก่อนส่ง (ไม่ส่งเอง)
// evidence จากร่างออเดอร์ (§5.1) จะเลื่อนมาไฮไลต์ข้อความต้นฉบับที่นี่

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Image as ImageIcon, Paperclip, Send, Sparkles } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import {
  AI_MOCK_LATENCY_MS,
  AI_REPLY_INTENT_LABEL,
  AI_REPLY_TONE_LABEL,
  aiReplyDraft,
  type AiReplyIntent,
  type AiReplyTone,
} from "../_fixtures/ai-mocks";
import { CHAT_CHANNEL_LABEL } from "../_fixtures/labels";
import type {
  ConversationStatus,
  MattiiConversation,
  MattiiCustomer,
  MattiiMessage,
  MattiiStaff,
} from "../_fixtures/types";
import { MATTII_BASE, fmtDateTimeTH } from "../_components";
import { CONVERSATION_STATUS_CHOICES } from "./filters";
import { ConversationStatusBadge } from "./status-badge";

const INTENT_OPTIONS = (Object.keys(AI_REPLY_INTENT_LABEL) as AiReplyIntent[]).map((k) => ({
  value: k as string,
  label: AI_REPLY_INTENT_LABEL[k],
}));

const TONE_OPTIONS = (Object.keys(AI_REPLY_TONE_LABEL) as AiReplyTone[]).map((k) => ({
  value: k,
  label: AI_REPLY_TONE_LABEL[k],
}));

export function MessageThread({
  conversation,
  customer,
  messages,
  saleStaff,
  canWrite,
  linkedOrderNo,
  highlightMessageId,
  onChangeStatus,
  onAssign,
  onSend,
  onCreateOrder,
}: {
  conversation: MattiiConversation;
  customer: MattiiCustomer | undefined;
  messages: MattiiMessage[];
  saleStaff: MattiiStaff[];
  canWrite: boolean;
  linkedOrderNo: string | null;
  highlightMessageId: string | null;
  onChangeStatus: (status: ConversationStatus) => void;
  onAssign: (staffId: string) => void;
  onSend: (body: string) => void;
  onCreateOrder: () => void;
}) {
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<AiReplyIntent>("ask_cf");
  const [tone, setTone] = useState<AiReplyTone>("friendly");
  const [drafting, setDrafting] = useState(false);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!highlightMessageId) return;
    itemRefs.current[highlightMessageId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightMessageId]);

  useEffect(() => {
    setText("");
  }, [conversation.id]);

  function handleDraft() {
    setDrafting(true);
    window.setTimeout(() => {
      setText(
        aiReplyDraft(intent, tone, {
          customerName: customer?.display_name ?? null,
          orderNo: linkedOrderNo,
          trackingNo: null,
        }),
      );
      setDrafting(false);
      notify.info("AI ร่างข้อความให้แล้ว — ตรวจและแก้ก่อนกดส่ง");
    }, AI_MOCK_LATENCY_MS);
  }

  function handleSend() {
    const body = text.trim();
    if (!body) {
      notify.error("พิมพ์ข้อความก่อนกดส่ง");
      return;
    }
    onSend(body);
    setText("");
    notify.success("ส่งข้อความให้ลูกค้าแล้ว");
  }

  const staffOptions = [
    { value: "", label: "— ยังไม่มอบหมาย —" },
    ...saleStaff.map((s) => ({ value: s.id, label: s.display_name })),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* หัวห้องแชท */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Text className="truncate text-base font-medium text-gray-900">
                {customer?.display_name ?? "ลูกค้ายังไม่ได้ผูกบัญชี"}
              </Text>
              <StatusBadge tone="neutral">{CHAT_CHANNEL_LABEL[conversation.channel]}</StatusBadge>
              <ConversationStatusBadge status={conversation.status} />
            </div>
            <Text className="mt-1 text-xs text-gray-500">
              ห้องแชท {conversation.external_thread_id} · ข้อความล่าสุด{" "}
              <span className="tabular-nums">{fmtDateTimeTH(conversation.last_message_at)}</span>
            </Text>
          </div>
          {canWrite && (
            <Button onClick={onCreateOrder}>
              <Sparkles className="mr-1.5 h-4 w-4" /> สร้างออเดอร์จากแชท
            </Button>
          )}
        </div>

        {linkedOrderNo && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
            <Text className="text-xs text-green-700">
              ห้องนี้ผูกกับออเดอร์ <span className="font-medium">{linkedOrderNo}</span> แล้ว
            </Text>
            <Button asChild size="sm" variant="ghost" className="ms-auto text-green-700">
              <Link href={`${MATTII_BASE}/orders`}>
                เปิดหน้าออเดอร์ <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        )}

        {canWrite && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <Label>สถานะห้องแชท</Label>
              <div className="mt-1">
                <SegmentedControl
                  value={conversation.status}
                  onChange={onChangeStatus}
                  size="sm"
                  fullWidth
                  options={CONVERSATION_STATUS_CHOICES}
                />
              </div>
            </div>
            <div className="min-w-0">
              <Label>ผู้รับผิดชอบ (ฝ่ายขาย)</Label>
              <CustomSelect
                value={conversation.assigned_staff_id ?? ""}
                onChange={onAssign}
                options={staffOptions}
                className="mt-1"
              />
            </div>
          </div>
        )}
      </div>

      {/* บทสนทนา */}
      <div className="max-h-[46vh] min-w-0 space-y-3 overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        {messages.map((m) => {
          const inbound = m.direction === "inbound";
          const highlighted = m.id === highlightMessageId;
          return (
            <div
              key={m.id}
              ref={(el) => {
                itemRefs.current[m.id] = el;
              }}
              className={cn("flex w-full", inbound ? "justify-start" : "justify-end")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-xl border px-3 py-2 transition-colors duration-300 sm:max-w-[75%]",
                  inbound ? "border-gray-200 bg-gray-50" : "border-primary/20 bg-primary/5",
                  highlighted && "border-amber-300 bg-amber-50 ring-2 ring-amber-200",
                )}
              >
                <Text className="text-[11px] text-gray-500">
                  {m.sender_name} · <span className="tabular-nums">{fmtDateTimeTH(m.sent_at)}</span>
                </Text>
                {m.body && (
                  <Text className="mt-0.5 whitespace-pre-wrap text-sm text-gray-900">{m.body}</Text>
                )}
                {m.attachment_url && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
                    {m.attachment_kind === "image" ? (
                      <ImageIcon className="h-4 w-4 shrink-0 text-gray-400" />
                    ) : (
                      <Paperclip className="h-4 w-4 shrink-0 text-gray-400" />
                    )}
                    <Text className="truncate text-xs text-gray-600">
                      {m.attachment_url.split("/").pop()}
                    </Text>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ช่องพิมพ์ตอบ + ร่างข้อความด้วย AI */}
      {canWrite && (
        <div className="min-w-0 space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-4">
              <Label>ร่างข้อความ — เรื่องที่จะตอบ</Label>
              <CustomSelect
                value={intent}
                onChange={(v) => setIntent(v as AiReplyIntent)}
                options={INTENT_OPTIONS}
                className="mt-1"
              />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <Label>โทนข้อความ</Label>
              <div className="mt-1">
                <SegmentedControl
                  value={tone}
                  onChange={setTone}
                  size="sm"
                  fullWidth
                  options={TONE_OPTIONS}
                />
              </div>
            </div>
            <div className="flex min-w-0 items-end lg:col-span-3">
              <Button
                variant="outline"
                className="w-full"
                disabled={drafting}
                onClick={handleDraft}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                {drafting ? "AI กำลังร่าง…" : "ร่างข้อความด้วย AI"}
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="mt-inbox-reply">ข้อความที่จะส่ง</Label>
            <Input
              id="mt-inbox-reply"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="พิมพ์ข้อความตอบลูกค้า หรือกด “ร่างข้อความด้วย AI” แล้วแก้ก่อนส่ง"
              className="mt-1"
            />
            <Text className="mt-1 text-xs text-gray-400">
              AI ร่างให้เท่านั้น — ตรวจและแก้ข้อความก่อนกดส่งทุกครั้ง ระบบไม่ส่งอัตโนมัติ
            </Text>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSend} disabled={drafting}>
              <Send className="mr-1.5 h-4 w-4" /> ส่งข้อความ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
