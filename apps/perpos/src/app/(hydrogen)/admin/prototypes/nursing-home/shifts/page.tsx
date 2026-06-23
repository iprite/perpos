"use client";

// ตารางเวร — กริดสัปดาห์ (วัน × กะ) + จัดเวร/ยืนยัน + gap + AI สรุปส่งเวร A6 (interactive)
// shifts = owner/admin_staff = W·A (approve = ยืนยันเวร)

import { useMemo, useState } from "react";
import { CalendarClock, Plus, Sparkles, Check, ClipboardCheck, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";

import { SHIFTS, STAFF, MOCK_SHIFT_HANDOVER_A6 } from "../_fixtures";
import type { Shift, ShiftType, ShiftStatus } from "../_fixtures/types";
import { NursingShell, useNursingRole, ShiftStatusBadge, fullName } from "../_components";

// สัปดาห์ 16–22 มิ.ย. 2569
const WEEK = [
  "2026-06-16",
  "2026-06-17",
  "2026-06-18",
  "2026-06-19",
  "2026-06-20",
  "2026-06-21",
  "2026-06-22",
];
const DOW = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const SHIFT_TYPES: { type: ShiftType; label: string; time: string }[] = [
  { type: "morning", label: "เช้า", time: "07:00–15:00" },
  { type: "afternoon", label: "บ่าย", time: "15:00–23:00" },
  { type: "night", label: "ดึก", time: "23:00–07:00" },
];
const TODAY = "2026-06-22";

export default function ShiftsPage() {
  const { can } = useNursingRole();
  const canWrite = can("write", "shifts");
  const canApprove = can("approve", "shifts");

  const [shifts, setShifts] = useState<Shift[]>(SHIFTS);
  const [assignDlg, setAssignDlg] = useState<{ open: boolean; date: string; type: ShiftType }>({
    open: false,
    date: TODAY,
    type: "morning",
  });
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReady, setAiReady] = useState(false);

  const staffName = (id: string) => {
    const s = STAFF.find((x) => x.id === id);
    return s ? `${s.first_name} ${s.last_name}` : id;
  };

  // index: date|type → shifts[]
  const grid = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    for (const s of shifts) (map[`${s.shift_date}|${s.shift_type}`] ??= []).push(s);
    return map;
  }, [shifts]);

  const gapCount = useMemo(() => {
    let gaps = 0;
    for (const d of WEEK)
      for (const st of SHIFT_TYPES) {
        if (!grid[`${d}|${st.type}`]?.length) gaps += 1;
      }
    return gaps;
  }, [grid]);

  function addShift(date: string, type: ShiftType, staffId: string) {
    const meta = SHIFT_TYPES.find((s) => s.type === type)!;
    const [start, end] = meta.time.split("–");
    setShifts((prev) => [
      ...prev,
      {
        id: `shf-new-${Date.now()}`,
        staff_id: staffId,
        shift_date: date,
        shift_type: type,
        start_time: start,
        end_time: end,
        status: "scheduled" as ShiftStatus,
        note: null,
      },
    ]);
    toast.success(`จัดเวร ${meta.label} ${staffName(staffId)} แล้ว`);
  }
  function confirmShift(id: string) {
    setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, status: "confirmed" } : s)));
    toast.success("ยืนยันเวรแล้ว");
  }

  function runAi() {
    setAiOpen(true);
    setAiLoading(true);
    setAiReady(false);
    setTimeout(() => {
      setAiLoading(false);
      setAiReady(true);
    }, 1400);
  }

  return (
    <NursingShell
      title="ตารางเวร"
      icon={<CalendarClock className="h-6 w-6" />}
      description="ตารางเวรรายสัปดาห์ (วัน × กะ) — เห็นกะที่ยังขาดคนทันที ลดความเสี่ยงเวรว่าง"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={runAi}>
            <Sparkles className="mr-1.5 h-4 w-4" /> สรุปส่งเวร (AI)
          </Button>
          {canWrite && (
            <Button onClick={() => setAssignDlg({ open: true, date: TODAY, type: "morning" })}>
              <Plus className="mr-1.5 h-4 w-4" /> จัดเวร
            </Button>
          )}
        </div>
      }
    >
      {/* แถบ legend + gap */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span>สัปดาห์ 16–22 มิ.ย. 2569</span>
        {gapCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" /> {gapCount} กะยังไม่มีคน
          </span>
        )}
      </div>

      {/* กริดเวร */}
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">กะ</TableHead>
            {WEEK.map((d, i) => (
              <TableHead key={d} align="center">
                <div className="font-medium normal-case tracking-normal">{DOW[i]}</div>
                <div className={d === TODAY ? "font-semibold text-primary" : "text-gray-400"}>
                  {Number(d.slice(8))}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {SHIFT_TYPES.map((st) => (
            <TableRow key={st.type}>
              <TableCell className="align-top">
                <div className="text-sm font-medium text-gray-900">{st.label}</div>
                <div className="text-[11px] text-gray-400">{st.time}</div>
              </TableCell>
              {WEEK.map((d) => {
                const cell = grid[`${d}|${st.type}`] ?? [];
                return (
                  <TableCell key={d} className="px-1.5 align-top">
                    {cell.length === 0 ? (
                      canWrite ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAssignDlg({ open: true, date: d, type: st.type })}
                          className="w-full justify-center border border-dashed border-amber-300 bg-amber-50/60 py-2 text-[11px] text-amber-600 hover:bg-amber-100"
                        >
                          + จัด
                        </Button>
                      ) : (
                        <div className="rounded-md border border-dashed border-gray-200 py-2 text-center text-[11px] text-gray-300">
                          —
                        </div>
                      )
                    ) : (
                      <div className="space-y-1">
                        {cell.map((s) => (
                          <div
                            key={s.id}
                            className="rounded-md border border-gray-100 bg-gray-50 px-2 py-1"
                          >
                            <div className="truncate text-[12px] font-medium text-gray-800">
                              {staffName(s.staff_id)}
                            </div>
                            <div className="mt-0.5 flex items-center justify-between gap-1">
                              <ShiftStatusBadge status={s.status} />
                              {canApprove && s.status === "scheduled" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => confirmShift(s.id)}
                                  title="ยืนยันเวร"
                                  className="h-6 w-6 text-primary"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AssignShiftDialog
        state={assignDlg}
        onClose={() => setAssignDlg((s) => ({ ...s, open: false }))}
        onAssign={addShift}
      />

      <HandoverDialog open={aiOpen} onOpenChange={setAiOpen} loading={aiLoading} ready={aiReady} />
    </NursingShell>
  );
}

function AssignShiftDialog({
  state,
  onClose,
  onAssign,
}: {
  state: { open: boolean; date: string; type: ShiftType };
  onClose: () => void;
  onAssign: (date: string, type: ShiftType, staffId: string) => void;
}) {
  const activeStaff = STAFF.filter((s) => s.employment_status === "active");
  const [date, setDate] = useState(state.date);
  const [type, setType] = useState<ShiftType>(state.type);
  const [staffId, setStaffId] = useState("");

  const key = `${state.open}-${state.date}-${state.type}`;
  const [lastKey, setLastKey] = useState("");
  if (state.open && key !== lastKey) {
    setLastKey(key);
    setDate(state.date);
    setType(state.type);
    setStaffId("");
  }

  function submit() {
    if (!staffId) {
      toast.error("กรุณาเลือกพนักงาน");
      return;
    }
    onAssign(date, type, staffId);
    onClose();
  }

  return (
    <Dialog open={state.open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>จัดเวร</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="sh-date">วันที่</Label>
              <CustomSelect
                className="mt-1"
                value={date}
                onChange={setDate}
                options={WEEK.map((d, i) => ({
                  value: d,
                  label: `${DOW[i]} ${Number(d.slice(8))} มิ.ย.`,
                }))}
              />
            </div>
            <div>
              <Label htmlFor="sh-type">กะ</Label>
              <CustomSelect
                className="mt-1"
                value={type}
                onChange={(v) => setType(v as ShiftType)}
                options={SHIFT_TYPES.map((s) => ({
                  value: s.type,
                  label: `${s.label} (${s.time})`,
                }))}
              />
            </div>
            <div>
              <Label htmlFor="sh-staff">พนักงาน *</Label>
              <CustomSelect
                className="mt-1"
                value={staffId}
                onChange={setStaffId}
                options={[
                  { value: "", label: "— เลือกพนักงาน —" },
                  ...activeStaff.map((s) => ({ value: s.id, label: fullName(s) })),
                ]}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={submit}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HandoverDialog({
  open,
  onOpenChange,
  loading,
  ready,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loading: boolean;
  ready: boolean;
}) {
  const h = MOCK_SHIFT_HANDOVER_A6;
  function copy() {
    void navigator.clipboard?.writeText(h.handover_summary);
    toast.success("คัดลอกสรุปส่งเวรแล้ว");
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-blue-600" />
              สรุปส่งเวร — {h.handover_from}
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {loading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 w-1/3 rounded bg-gray-100" />
              <div className="h-24 rounded bg-gray-100" />
              <div className="h-4 w-1/4 rounded bg-gray-100" />
              <div className="h-16 rounded bg-gray-100" />
              <p className="text-center text-sm text-gray-400">AI กำลังเรียบเรียงสรุปส่งเวร…</p>
            </div>
          ) : ready ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                <div className="mb-1 text-xs font-medium text-gray-500">
                  ส่งต่อให้: {h.handover_to}
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                  {h.handover_summary}
                </p>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-gray-700">
                  รายชื่อต้องเฝ้าระวัง ({h.watch_list.length})
                </div>
                <ul className="space-y-2">
                  {h.watch_list.map((w) => (
                    <li
                      key={w.resident_id}
                      className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                    >
                      <span
                        className={
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full " +
                          (w.priority === "high" ? "bg-red-500" : "bg-amber-500")
                        }
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">{w.resident_name}</div>
                        <div className="text-sm text-gray-500">{w.reason}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-gray-700">
                  งานที่ต้องตามต่อ ({h.pending_actions.length})
                </div>
                <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
                  {h.pending_actions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-gray-400">
                ตัวเลขสรุปคำนวณจากข้อมูลจริงก่อนส่งให้ AI เรียบเรียง (กัน AI นับเลขคลาดเคลื่อน) —
                โปรดตรวจทานก่อนส่งต่อ
              </p>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          <Button onClick={copy} disabled={!ready}>
            คัดลอกสรุป
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
