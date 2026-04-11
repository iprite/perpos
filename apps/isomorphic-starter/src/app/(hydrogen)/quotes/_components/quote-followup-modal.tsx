"use client";

import React from "react";
import { Button, Input } from "rizzui";
import dayjs from "dayjs";
import { DatePicker } from "@core/ui/datepicker";
import AppSelect from "@core/ui/app-select";
import { Modal } from "@core/modal-views/modal";

import type { QuoteFollowupType, SalesFollowupRow } from "../quote-types";

function normalizeDueInput(date: string, time: string) {
  const d = date.trim();
  const t = time.trim();
  if (!d) return null;
  const iso = `${d}T${t || "00:00"}:00.000Z`;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function splitDateTime(iso: string | null) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

export function QuoteFollowupModal({
  open,
  onClose,
  canEdit,
  editing,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  editing: SalesFollowupRow | null;
  onSave: (payload: {
    id?: string;
    type: QuoteFollowupType;
    subject: string;
    notes: string | null;
    due_at: string | null;
    reminder_at: string | null;
  }) => Promise<void>;
}) {
  const [loading, setLoading] = React.useState(false);
  const [type, setType] = React.useState<QuoteFollowupType>(editing?.type ?? "call");
  const [subject, setSubject] = React.useState(editing?.subject ?? "");
  const [notes, setNotes] = React.useState(editing?.notes ?? "");

  const due0 = React.useMemo(() => splitDateTime(editing?.due_at ?? null), [editing?.due_at]);
  const rem0 = React.useMemo(() => splitDateTime(editing?.reminder_at ?? null), [editing?.reminder_at]);

  const [dueDate, setDueDate] = React.useState(due0.date);
  const [dueTime, setDueTime] = React.useState(due0.time);
  const [remDate, setRemDate] = React.useState(rem0.date);
  const [remTime, setRemTime] = React.useState(rem0.time);

  React.useEffect(() => {
    setType(editing?.type ?? "call");
    setSubject(editing?.subject ?? "");
    setNotes(editing?.notes ?? "");
    const d0 = splitDateTime(editing?.due_at ?? null);
    const r0 = splitDateTime(editing?.reminder_at ?? null);
    setDueDate(d0.date);
    setDueTime(d0.time);
    setRemDate(r0.date);
    setRemTime(r0.time);
  }, [editing?.due_at, editing?.id, editing?.notes, editing?.reminder_at, editing?.subject, editing?.type]);

  const typeOptions = [
    { label: "Call", value: "call" },
    { label: "Email", value: "email" },
    { label: "Meeting", value: "meeting" },
    { label: "Task", value: "task" },
  ];

  return (
    <Modal isOpen={open} onClose={onClose} size="md" rounded="md">
      <div className="border-b border-gray-200 px-5 py-4">
        <div className="text-sm font-semibold text-gray-900">{editing ? "แก้ไขกิจกรรมติดตาม" : "เพิ่มกิจกรรมติดตาม"}</div>
      </div>
      <div className="grid gap-3 px-5 py-4">
        <div>
          <AppSelect
            label="ประเภท"
            placeholder="-"
            options={typeOptions}
            value={type}
            onChange={(v: string) => setType(v as QuoteFollowupType)}
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

        <div className="grid grid-cols-2 gap-3">
          <DatePicker
            selected={dueDate ? dayjs(dueDate).toDate() : null}
            onChange={(date: Date | null) => setDueDate(date ? dayjs(date).format("YYYY-MM-DD") : "")}
            placeholderText="Select Date"
            disabled={loading}
            inputProps={{ label: "Due date" }}
          />
          <Input label="Due time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DatePicker
            selected={remDate ? dayjs(remDate).toDate() : null}
            onChange={(date: Date | null) => setRemDate(date ? dayjs(date).format("YYYY-MM-DD") : "")}
            placeholderText="Select Date"
            disabled={loading}
            inputProps={{ label: "Reminder date" }}
          />
          <Input label="Reminder time" type="time" value={remTime} onChange={(e) => setRemTime(e.target.value)} />
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
            setLoading(true);
            await onSave({
              id: editing?.id,
              type,
              subject: s,
              notes: notes.trim() ? notes.trim() : null,
              due_at: normalizeDueInput(dueDate, dueTime),
              reminder_at: normalizeDueInput(remDate, remTime),
            });
            setLoading(false);
            onClose();
          }}
          disabled={!canEdit || loading || subject.trim().length === 0}
        >
          บันทึก
        </Button>
      </div>
    </Modal>
  );
}
