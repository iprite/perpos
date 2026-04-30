"use client";

import React from "react";
import { Button, Input } from "rizzui";
import AppSelect from "@core/ui/app-select";
import { Modal } from "@core/modal-views/modal";

import type { CrmActivityType, CrmDeal } from "../crm-types";
import { crmNormalizeDueInput } from "../crm-data";

export function CrmActivityModal({
  open,
  onClose,
  customerName,
  deals,
  loading,
  canEdit,
  initialType,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  customerName: string;
  deals: CrmDeal[];
  loading: boolean;
  canEdit: boolean;
  initialType: CrmActivityType;
  onSave: (payload: {
    type: CrmActivityType;
    subject: string;
    notes: string | null;
    deal_id: string | null;
    due_at: string | null;
    reminder_at: string | null;
  }) => Promise<void>;
}) {
  const [type, setType] = React.useState<CrmActivityType>("call");
  const [subject, setSubject] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [dealId, setDealId] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [dueTime, setDueTime] = React.useState("");
  const [reminderDate, setReminderDate] = React.useState("");
  const [reminderTime, setReminderTime] = React.useState("");

  React.useEffect(() => {
    setType(initialType);
    setSubject("");
    setNotes("");
    setDealId("");
    setDueDate("");
    setDueTime("");
    setReminderDate("");
    setReminderTime("");
  }, [initialType, open]);

  const dealOptions = React.useMemo(() => deals.map((d) => ({ label: d.title, value: d.id })), [deals]);

  const typeOptions = [
    { label: "Call", value: "call" },
    { label: "Email", value: "email" },
    { label: "Meeting", value: "meeting" },
    { label: "Task", value: "task" },
  ];

  return (
    <Modal isOpen={open} onClose={onClose} size="md" rounded="md">
      <div className="border-b border-gray-200 px-5 py-4">
        <div className="text-sm font-semibold text-gray-900">เพิ่ม Activity</div>
        <div className="mt-1 text-xs text-gray-600">ลูกค้า: {customerName}</div>
      </div>
      <div className="grid gap-3 px-5 py-4">
        <div>
          <AppSelect
            label="ประเภท"
            placeholder="-"
            options={typeOptions}
            value={type}
            onChange={(v: string) => setType(v as CrmActivityType)}
            getOptionValue={(o) => o.value}
            displayValue={(selected) => typeOptions.find((o) => o.value === selected)?.label ?? ""}
            inPortal={false}
          />
        </div>
        <Input label="หัวข้อ" value={subject} onChange={(e) => setSubject(e.target.value)} />

        <div>
          <div className="text-sm font-medium text-gray-700">รายละเอียด</div>
          <textarea
            className="mt-2 min-h-[88px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div>
          <AppSelect
            label="ผูกกับดีล (optional)"
            placeholder="-"
            options={[{ label: "-", value: "" }, ...dealOptions]}
            value={dealId}
            onChange={(v: string) => setDealId(v)}
            getOptionValue={(o) => o.value}
            displayValue={(selected) => [{ label: "-", value: "" }, ...dealOptions].find((o) => o.value === selected)?.label ?? ""}
            inPortal={false}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Input label="Due time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Reminder date" type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} />
          <Input label="Reminder time" type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-5 py-4">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          ยกเลิก
        </Button>
        <Button
          onClick={async () => {
            if (!canEdit) return;
            const s = subject.trim();
            if (!s) return;
            const due_at = crmNormalizeDueInput(dueDate, dueTime);
            const reminder_at = crmNormalizeDueInput(reminderDate, reminderTime);
            await onSave({
              type,
              subject: s,
              notes: notes.trim() || null,
              deal_id: dealId.trim() || null,
              due_at,
              reminder_at,
            });
          }}
          disabled={!canEdit || loading || subject.trim().length === 0}
        >
          บันทึก
        </Button>
      </div>
    </Modal>
  );
}
