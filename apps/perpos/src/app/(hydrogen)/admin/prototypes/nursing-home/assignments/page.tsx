"use client";

// มอบหมายดูแล — care_assignments (พนักงาน↔ผู้พัก) + มอบหมาย/สิ้นสุด + filter (interactive)
// care_assignments = owner/nurse/admin_staff = W

import { useMemo, useState } from "react";
import { ListChecks, Plus, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

import { CARE_ASSIGNMENTS, STAFF, RESIDENTS } from "../_fixtures";
import type { CareAssignment, ShiftType, AssignmentStatus } from "../_fixtures/types";
import {
  NursingShell,
  useNursingRole,
  AssignmentStatusBadge,
  fmtDateTH,
  fullName,
} from "../_components";

const SHIFT_LABEL: Record<ShiftType, string> = {
  morning: "เช้า",
  afternoon: "บ่าย",
  night: "ดึก",
};
const STATUS_FILTER = [
  { value: "", label: "ทุกสถานะ" },
  { value: "active", label: "กำลังดูแล" },
  { value: "ended", label: "สิ้นสุด" },
];

export default function AssignmentsPage() {
  const { can } = useNursingRole();
  const canWrite = can("write", "care_assignments");

  const [rows, setRows] = useState<CareAssignment[]>(CARE_ASSIGNMENTS);
  const [staffFilter, setStaffFilter] = useState("");
  const [status, setStatus] = useState("");
  const [dlg, setDlg] = useState(false);

  const staffName = (id: string) => {
    const s = STAFF.find((x) => x.id === id);
    return s ? fullName(s) : id;
  };
  const residentName = (id: string) => {
    const r = RESIDENTS.find((x) => x.id === id);
    return r ? fullName(r) : id;
  };

  const filtered = useMemo(
    () =>
      rows
        .filter((a) => (staffFilter ? a.staff_id === staffFilter : true))
        .filter((a) => (status ? a.status === status : true)),
    [rows, staffFilter, status],
  );

  const kpi = useMemo(() => {
    const active = rows.filter((a) => a.status === "active");
    const staffWithLoad = new Set(active.map((a) => a.staff_id)).size;
    const residentsCovered = new Set(active.map((a) => a.resident_id)).size;
    return { active: active.length, staffWithLoad, residentsCovered };
  }, [rows]);

  const activeStaff = STAFF.filter((s) => s.employment_status === "active");

  function addAssignment(a: CareAssignment) {
    setRows((prev) => [a, ...prev]);
    toast.success("มอบหมายการดูแลแล้ว");
  }
  function endAssignment(id: string) {
    setRows((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              status: "ended" as AssignmentStatus,
              end_date: new Date().toISOString().slice(0, 10),
            }
          : a,
      ),
    );
    toast.success("สิ้นสุดการมอบหมายแล้ว");
  }

  return (
    <NursingShell
      title="มอบหมายดูแล"
      icon={<ListChecks className="h-6 w-6" />}
      description="จับคู่พนักงานกับผู้พักที่รับผิดชอบ — รู้ทันทีว่าใครดูแลใคร ไม่มีผู้พักตกหล่น"
      actions={
        canWrite ? (
          <Button onClick={() => setDlg(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> มอบหมาย
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<ListChecks className="h-4 w-4" />}
          label="การมอบหมายที่ดำเนินอยู่"
          value={String(kpi.active)}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<UserCheck className="h-4 w-4" />}
          label="พนักงานที่มีผู้ดูแล"
          value={String(kpi.staffWithLoad)}
          tone="primary"
        />
        <StatCard
          icon={<UserCheck className="h-4 w-4" />}
          label="ผู้พักที่มีผู้ดูแล"
          value={String(kpi.residentsCovered)}
          sub="ครอบคลุม"
          tone="positive"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          className="w-52"
          value={staffFilter}
          onChange={setStaffFilter}
          options={[
            { value: "", label: "พนักงานทั้งหมด" },
            ...activeStaff.map((s) => ({ value: s.id, label: fullName(s) })),
          ]}
        />
        <CustomSelect
          className="w-36"
          value={status}
          onChange={setStatus}
          options={STATUS_FILTER}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>พนักงาน</TableHead>
            <TableHead>ผู้พักที่ดูแล</TableHead>
            <TableHead align="center">กะ</TableHead>
            <TableHead>เริ่ม</TableHead>
            <TableHead>สิ้นสุด</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead align="right">จัดการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={7}>
              <div className="flex flex-col items-center gap-2 py-8">
                <ListChecks className="h-8 w-8 text-gray-300" />
                <span>ไม่พบการมอบหมายตามเงื่อนไข</span>
                {canWrite && (
                  <Button size="sm" className="mt-1" onClick={() => setDlg(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> มอบหมายการดูแล
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            filtered.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium text-gray-900">{staffName(a.staff_id)}</TableCell>
                <TableCell>{residentName(a.resident_id)}</TableCell>
                <TableCell align="center">
                  {a.shift_type ? SHIFT_LABEL[a.shift_type] : "ทุกกะ"}
                </TableCell>
                <TableCell className="text-gray-500">{fmtDateTH(a.start_date)}</TableCell>
                <TableCell className="text-gray-500">
                  {a.end_date ? fmtDateTH(a.end_date) : "—"}
                </TableCell>
                <TableCell align="center">
                  <AssignmentStatusBadge status={a.status} />
                </TableCell>
                <TableCell align="right">
                  {canWrite && a.status === "active" ? (
                    <Button size="sm" variant="outline" onClick={() => endAssignment(a.id)}>
                      สิ้นสุด
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <AssignDialog
        open={dlg}
        onOpenChange={setDlg}
        activeStaffOpts={activeStaff.map((s) => ({ value: s.id, label: fullName(s) }))}
        onAdd={addAssignment}
      />
    </NursingShell>
  );
}

function AssignDialog({
  open,
  onOpenChange,
  activeStaffOpts,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activeStaffOpts: { value: string; label: string }[];
  onAdd: (a: CareAssignment) => void;
}) {
  const activeResidents = RESIDENTS.filter((r) => r.status === "active");
  const [staffId, setStaffId] = useState("");
  const [residentId, setResidentId] = useState("");
  const [shiftType, setShiftType] = useState<string>("");
  const [startDate, setStartDate] = useState("2026-06-22");

  function submit() {
    if (!staffId) {
      toast.error("กรุณาเลือกพนักงาน");
      return;
    }
    if (!residentId) {
      toast.error("กรุณาเลือกผู้พัก");
      return;
    }
    onAdd({
      id: `ca-new-${Date.now()}`,
      staff_id: staffId,
      resident_id: residentId,
      shift_type: (shiftType || null) as ShiftType | null,
      start_date: startDate,
      end_date: null,
      status: "active",
      note: null,
    });
    setStaffId("");
    setResidentId("");
    setShiftType("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>มอบหมายการดูแล</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="as-staff">พนักงาน *</Label>
              <CustomSelect
                className="mt-1"
                value={staffId}
                onChange={setStaffId}
                options={[{ value: "", label: "— เลือกพนักงาน —" }, ...activeStaffOpts]}
              />
            </div>
            <div>
              <Label htmlFor="as-res">ผู้พักที่ดูแล *</Label>
              <CustomSelect
                className="mt-1"
                value={residentId}
                onChange={setResidentId}
                options={[
                  { value: "", label: "— เลือกผู้พัก —" },
                  ...activeResidents.map((r) => ({ value: r.id, label: fullName(r) })),
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="as-shift">กะที่ดูแล</Label>
                <CustomSelect
                  className="mt-1"
                  value={shiftType}
                  onChange={setShiftType}
                  options={[
                    { value: "", label: "ทุกกะ" },
                    { value: "morning", label: "เช้า" },
                    { value: "afternoon", label: "บ่าย" },
                    { value: "night", label: "ดึก" },
                  ]}
                />
              </div>
              <div>
                <Label>วันที่เริ่ม</Label>
                <div className="mt-1">
                  <ThaiDatePicker
                    value={startDate}
                    onChange={setStartDate}
                    placeholder="เลือกวันที่"
                  />
                </div>
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={submit}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
