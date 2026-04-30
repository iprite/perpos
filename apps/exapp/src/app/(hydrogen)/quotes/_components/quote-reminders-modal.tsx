"use client";

import React from "react";
import { Button } from "rizzui";
import { Title, Text } from "rizzui/typography";
import { CalendarClock, X } from "lucide-react";

import { Modal } from "@core/modal-views/modal";

import type { SalesFollowupRow } from "../quote-types";
import { quoteFormatDueLabel, quoteGroupDueAt } from "../quote-data";

export function QuoteRemindersModal({
  open,
  onClose,
  tasks,
  quoteNoById,
  onOpenQuote,
}: {
  open: boolean;
  onClose: () => void;
  tasks: SalesFollowupRow[];
  quoteNoById: Record<string, string>;
  onOpenQuote: (quoteId: string) => void;
}) {
  const overdue = tasks.filter((t) => t.due_at && quoteGroupDueAt(t.due_at) === "overdue");
  const today = tasks.filter((t) => t.due_at && quoteGroupDueAt(t.due_at) === "today");
  const next7 = tasks.filter((t) => t.due_at && quoteGroupDueAt(t.due_at) === "next7");

  const Section = ({ label, items }: { label: string; items: SalesFollowupRow[] }) => {
    if (items.length === 0) return null;
    return (
      <div className="mt-4">
        <div className="text-xs font-semibold text-gray-600">{label}</div>
        <div className="mt-2 space-y-2">
          {items.map((t) => (
            <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-900">{t.subject}</div>
                <div className="mt-0.5 text-xs text-gray-600">{(quoteNoById[t.quote_id] ?? t.quote_id).trim()}</div>
                {t.due_at ? (
                  <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                    <CalendarClock className="h-3.5 w-3.5" />
                    <span>{quoteFormatDueLabel(t.due_at)}</span>
                  </div>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onOpenQuote(t.quote_id);
                  onClose();
                }}
              >
                เปิด
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Modal isOpen={open} onClose={onClose} size="lg" rounded="md">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div>
          <Title as="h3" className="text-base font-semibold text-gray-900">
            งานติดตาม (Task Reminder)
          </Title>
          <Text className="mt-0.5 text-sm text-gray-600">รายการงานที่ใกล้ถึงกำหนดภายใน 7 วัน</Text>
        </div>
        <button className="rounded-md p-2 text-gray-500 hover:bg-gray-100" onClick={onClose}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-auto px-5 py-4">
        {tasks.length === 0 ? <div className="py-10 text-center text-sm text-gray-600">ยังไม่มีงานใกล้ถึงกำหนด</div> : null}
        <Section label="เกินกำหนด" items={overdue} />
        <Section label="วันนี้" items={today} />
        <Section label="ภายใน 7 วัน" items={next7} />
      </div>
      <div className="border-t border-gray-200 px-5 py-4">
        <Button variant="outline" onClick={onClose}>
          ปิด
        </Button>
      </div>
    </Modal>
  );
}

