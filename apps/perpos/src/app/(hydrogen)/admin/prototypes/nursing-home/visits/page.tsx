"use client";

// การเยี่ยม — ตารางนัด/บันทึกการเยี่ยม + check-in/out + สร้างนัด + filter (interactive)
// visits = ทุก role = W → ปุ่มเปิดทุก role

import { useMemo, useState } from "react";
import { UserPlus, Plus, LogIn, LogOut, CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
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

import { VISITS, RESIDENTS } from "../_fixtures";
import type { Visit, VisitStatus, Relationship } from "../_fixtures/types";
import {
  NursingShell,
  useNursingRole,
  VisitStatusBadge,
  fmtDateTimeTH,
  fmtTimeTH,
  fullName,
} from "../_components";

const TODAY = "2026-06-22";
const REL_LABEL: Record<Relationship, string> = {
  child: "บุตร",
  spouse: "คู่สมรส",
  sibling: "พี่น้อง",
  relative: "ญาติ",
  guardian: "ผู้ปกครอง",
  other: "อื่นๆ",
};
const STATUS_FILTER = [
  { value: "", label: "ทุกสถานะ" },
  { value: "scheduled", label: "นัดแล้ว" },
  { value: "checked_in", label: "กำลังเยี่ยม" },
  { value: "completed", label: "เยี่ยมเสร็จ" },
  { value: "cancelled", label: "ยกเลิก" },
];

export default function VisitsPage() {
  const { can } = useNursingRole();
  const canWrite = can("write", "visits");

  const [visits, setVisits] = useState<Visit[]>(VISITS);
  const [status, setStatus] = useState("");
  const [todayOnly, setTodayOnly] = useState(false);
  const [createDlg, setCreateDlg] = useState(false);

  const residentName = (id: string) => {
    const r = RESIDENTS.find((x) => x.id === id);
    return r ? fullName(r) : id;
  };

  const filtered = useMemo(() => {
    return visits
      .filter((v) => (status ? v.status === status : true))
      .filter((v) => (todayOnly ? v.scheduled_at.startsWith(TODAY) : true))
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }, [visits, status, todayOnly]);

  const kpi = useMemo(() => {
    const today = visits.filter((v) => v.scheduled_at.startsWith(TODAY));
    return {
      today: today.length,
      checkedIn: visits.filter((v) => v.status === "checked_in").length,
      scheduled: visits.filter((v) => v.status === "scheduled").length,
    };
  }, [visits]);

  function checkIn(id: string) {
    setVisits((prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, status: "checked_in", checked_in_at: new Date().toISOString() } : v,
      ),
    );
    toast.success("เช็คอินผู้มาเยี่ยมแล้ว");
  }
  function checkOut(id: string) {
    setVisits((prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, status: "completed", checked_out_at: new Date().toISOString() } : v,
      ),
    );
    toast.success("เช็คเอาท์ — เยี่ยมเสร็จสิ้น");
  }
  function addVisit(v: Visit) {
    setVisits((prev) => [v, ...prev]);
    toast.success("สร้างนัดเยี่ยมแล้ว");
  }

  return (
    <NursingShell
      title="การเยี่ยม"
      icon={<UserPlus className="h-6 w-6" />}
      description="นัดและบันทึกการเข้าเยี่ยมของญาติ — เช็คอิน/เอาท์ คลิกเดียว มีหลักฐานเวลาเข้า-ออกชัดเจน"
      actions={
        canWrite ? (
          <Button onClick={() => setCreateDlg(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> สร้างนัดเยี่ยม
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="นัดเยี่ยมวันนี้"
          value={String(kpi.today)}
          sub="22 มิ.ย. 2569"
          tone="info"
          valueColored
        />
        <StatCard
          icon={<LogIn className="h-4 w-4" />}
          label="กำลังเยี่ยมอยู่"
          value={String(kpi.checkedIn)}
          sub="ยังไม่เช็คเอาท์"
          tone="warning"
          valueColored
        />
        <StatCard
          icon={<UserPlus className="h-4 w-4" />}
          label="รอเข้าเยี่ยม"
          value={String(kpi.scheduled)}
          sub="นัดล่วงหน้า"
          tone="primary"
        />
      </div>

      {/* filter */}
      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          className="w-40"
          value={status}
          onChange={setStatus}
          options={STATUS_FILTER}
        />
        <Button
          size="sm"
          variant={todayOnly ? "secondary" : "outline"}
          onClick={() => setTodayOnly((v) => !v)}
        >
          วันนี้
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ผู้พัก</TableHead>
            <TableHead>ผู้มาเยี่ยม</TableHead>
            <TableHead>ความสัมพันธ์</TableHead>
            <TableHead>เวลานัด</TableHead>
            <TableHead>เข้า / ออก</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead align="right">จัดการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={7}>
              <div className="flex flex-col items-center gap-2 py-8">
                <UserPlus className="h-8 w-8 text-gray-300" />
                <span>ไม่พบนัดเยี่ยมตามเงื่อนไข</span>
                {canWrite && (
                  <Button size="sm" className="mt-1" onClick={() => setCreateDlg(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> สร้างนัดเยี่ยม
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            filtered.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium text-gray-900">
                  {residentName(v.resident_id)}
                </TableCell>
                <TableCell>{v.visitor_name}</TableCell>
                <TableCell>{v.relationship ? REL_LABEL[v.relationship] : "—"}</TableCell>
                <TableCell>{fmtDateTimeTH(v.scheduled_at)}</TableCell>
                <TableCell className="text-gray-500">
                  {v.checked_in_at ? fmtTimeTH(v.checked_in_at) : "—"}
                  {" / "}
                  {v.checked_out_at ? fmtTimeTH(v.checked_out_at) : "—"}
                </TableCell>
                <TableCell align="center">
                  <VisitStatusBadge status={v.status} />
                </TableCell>
                <TableCell align="right">
                  {canWrite && v.status === "scheduled" && (
                    <Button size="sm" variant="outline" onClick={() => checkIn(v.id)}>
                      <LogIn className="mr-1 h-3.5 w-3.5" /> เช็คอิน
                    </Button>
                  )}
                  {canWrite && v.status === "checked_in" && (
                    <Button size="sm" variant="outline" onClick={() => checkOut(v.id)}>
                      <LogOut className="mr-1 h-3.5 w-3.5" /> เช็คเอาท์
                    </Button>
                  )}
                  {(v.status === "completed" || v.status === "cancelled" || !canWrite) && (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <CreateVisitDialog open={createDlg} onOpenChange={setCreateDlg} onAdd={addVisit} />
    </NursingShell>
  );
}

function CreateVisitDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (v: Visit) => void;
}) {
  const activeResidents = RESIDENTS.filter((r) => r.status === "active");
  const [residentId, setResidentId] = useState("");
  const [visitor, setVisitor] = useState("");
  const [rel, setRel] = useState<Relationship>("child");
  const [date, setDate] = useState(TODAY);
  const [time, setTime] = useState("10:00");
  const [purpose, setPurpose] = useState("");

  function submit() {
    if (!residentId) {
      toast.error("กรุณาเลือกผู้พัก");
      return;
    }
    if (!visitor.trim()) {
      toast.error("กรุณากรอกชื่อผู้มาเยี่ยม");
      return;
    }
    onAdd({
      id: `vis-new-${Date.now()}`,
      resident_id: residentId,
      visitor_name: visitor.trim(),
      relationship: rel,
      scheduled_at: `${date}T${time}:00`,
      checked_in_at: null,
      checked_out_at: null,
      status: "scheduled" as VisitStatus,
      purpose: purpose.trim() || null,
      note: null,
    });
    setResidentId("");
    setVisitor("");
    setRel("child");
    setPurpose("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>สร้างนัดเยี่ยม</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="vs-res">ผู้พัก *</Label>
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
                <Label htmlFor="vs-visitor">ชื่อผู้มาเยี่ยม *</Label>
                <Input
                  id="vs-visitor"
                  className="mt-1"
                  value={visitor}
                  onChange={(e) => setVisitor(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="vs-rel">ความสัมพันธ์</Label>
                <CustomSelect
                  className="mt-1"
                  value={rel}
                  onChange={(v) => setRel(v as Relationship)}
                  options={Object.entries(REL_LABEL).map(([value, label]) => ({ value, label }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="vs-date">วันที่นัด</Label>
                <ThaiDatePicker
                  className="mt-1"
                  value={date}
                  onChange={setDate}
                  placeholder="เลือกวันที่"
                />
              </div>
              <div>
                <Label htmlFor="vs-time">เวลา</Label>
                <Input
                  id="vs-time"
                  type="time"
                  className="mt-1"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="vs-purpose">วัตถุประสงค์</Label>
              <Input
                id="vs-purpose"
                className="mt-1"
                placeholder="เช่น เยี่ยมประจำสัปดาห์"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
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
