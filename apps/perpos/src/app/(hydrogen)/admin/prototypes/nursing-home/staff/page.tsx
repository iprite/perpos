"use client";

// พนักงาน — ทะเบียนพนักงาน + filter/search + เพิ่ม/แก้ (Dialog) + KPI ตาม role (interactive)
// staff = owner/admin_staff = W

import { useMemo, useState } from "react";
import { UserCog, Plus, Search, Stethoscope, HandHeart, Briefcase } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

import { STAFF } from "../_fixtures";
import type { Staff, ModuleRole, StaffRole, EmploymentStatus } from "../_fixtures/types";
import {
  NursingShell,
  useNursingRole,
  ModuleRoleBadge,
  EmploymentStatusBadge,
  MODULE_ROLE_LABEL,
  fullName,
} from "../_components";

const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  nurse: "พยาบาล",
  caregiver: "ผู้ช่วยดูแล",
  admin: "ธุรการ",
  therapist: "นักกายภาพ",
  housekeeping: "แม่บ้าน",
  other: "อื่นๆ",
};
const ROLE_FILTER = [
  { value: "", label: "ทุกบทบาท" },
  ...(["owner", "nurse", "caregiver", "admin_staff"] as ModuleRole[]).map((r) => ({
    value: r,
    label: MODULE_ROLE_LABEL[r],
  })),
];
const STATUS_FILTER = [
  { value: "", label: "ทุกสถานะ" },
  { value: "active", label: "ทำงานอยู่" },
  { value: "on_leave", label: "ลาพัก" },
  { value: "resigned", label: "ลาออก" },
];

export default function StaffPage() {
  const { can } = useNursingRole();
  const canWrite = can("write", "staff");

  const [staff, setStaff] = useState<Staff[]>(STAFF);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [dlg, setDlg] = useState<{ open: boolean; edit: Staff | null }>({
    open: false,
    edit: null,
  });

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return staff
      .filter((s) => (role ? s.module_role === role : true))
      .filter((s) => (status ? s.employment_status === status : true))
      .filter((s) =>
        kw
          ? fullName(s).toLowerCase().includes(kw) ||
            s.code.toLowerCase().includes(kw) ||
            (s.phone ?? "").includes(kw)
          : true,
      );
  }, [staff, q, role, status]);

  const kpi = useMemo(() => {
    const active = staff.filter((s) => s.employment_status === "active");
    return {
      nurse: active.filter((s) => s.module_role === "nurse").length,
      caregiver: active.filter((s) => s.module_role === "caregiver").length,
      admin: active.filter((s) => s.module_role === "admin_staff" || s.module_role === "owner")
        .length,
    };
  }, [staff]);

  function upsert(s: Staff) {
    setStaff((prev) => {
      const exists = prev.some((x) => x.id === s.id);
      return exists ? prev.map((x) => (x.id === s.id ? s : x)) : [...prev, s];
    });
    toast.success(dlg.edit ? "แก้ไขพนักงานแล้ว" : "เพิ่มพนักงานแล้ว");
  }

  return (
    <NursingShell
      title="พนักงาน"
      icon={<UserCog className="h-6 w-6" />}
      description="ทะเบียนพนักงานและบทบาท/ใบประกอบวิชาชีพ — ค้นหาเร็ว คุมสิทธิ์ตามบทบาทได้แม่นยำ"
      actions={
        canWrite ? (
          <Button onClick={() => setDlg({ open: true, edit: null })}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มพนักงาน
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Stethoscope className="h-4 w-4" />}
          label="พยาบาล (ทำงานอยู่)"
          value={String(kpi.nurse)}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<HandHeart className="h-4 w-4" />}
          label="ผู้ช่วยดูแล"
          value={String(kpi.caregiver)}
          tone="primary"
        />
        <StatCard
          icon={<Briefcase className="h-4 w-4" />}
          label="ผู้จัดการ/ธุรการ"
          value={String(kpi.admin)}
          tone="neutral"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-8"
            placeholder="ค้นหาชื่อ/รหัส/เบอร์"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <CustomSelect className="w-44" value={role} onChange={setRole} options={ROLE_FILTER} />
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
            <TableHead>รหัส</TableHead>
            <TableHead>ชื่อ-สกุล</TableHead>
            <TableHead>ตำแหน่ง</TableHead>
            <TableHead>บทบาทระบบ</TableHead>
            <TableHead>เบอร์โทร</TableHead>
            <TableHead>ใบประกอบฯ</TableHead>
            <TableHead align="center">สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={7}>
              <div className="flex flex-col items-center gap-2 py-8">
                <UserCog className="h-8 w-8 text-gray-300" />
                <span>ไม่พบพนักงานตามเงื่อนไข</span>
                {canWrite && (
                  <Button
                    size="sm"
                    className="mt-1"
                    onClick={() => setDlg({ open: true, edit: null })}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> เพิ่มพนักงาน
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            filtered.map((s) => (
              <TableRow
                key={s.id}
                clickable={canWrite}
                onClick={canWrite ? () => setDlg({ open: true, edit: s }) : undefined}
              >
                <TableCell className="font-mono text-xs text-gray-500">{s.code}</TableCell>
                <TableCell className="font-medium text-gray-900">{fullName(s)}</TableCell>
                <TableCell>{STAFF_ROLE_LABEL[s.staff_role]}</TableCell>
                <TableCell>
                  <ModuleRoleBadge role={s.module_role} />
                </TableCell>
                <TableCell className="text-gray-500">{s.phone ?? "—"}</TableCell>
                <TableCell className="text-gray-500">{s.license_no ?? "—"}</TableCell>
                <TableCell align="center">
                  <EmploymentStatusBadge status={s.employment_status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <StaffDialog
        state={dlg}
        onClose={() => setDlg({ open: false, edit: null })}
        count={staff.length}
        onSave={upsert}
      />
    </NursingShell>
  );
}

function StaffDialog({
  state,
  onClose,
  count,
  onSave,
}: {
  state: { open: boolean; edit: Staff | null };
  onClose: () => void;
  count: number;
  onSave: (s: Staff) => void;
}) {
  const edit = state.edit;
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRole>("caregiver");
  const [moduleRole, setModuleRole] = useState<ModuleRole>("caregiver");
  const [phone, setPhone] = useState("");
  const [license, setLicense] = useState("");
  const [empStatus, setEmpStatus] = useState<EmploymentStatus>("active");

  // sync เมื่อเปิด dialog (edit/new)
  const key = `${state.open}-${edit?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState("");
  if (state.open && key !== lastKey) {
    setLastKey(key);
    setFirst(edit?.first_name ?? "");
    setLast(edit?.last_name ?? "");
    setStaffRole(edit?.staff_role ?? "caregiver");
    setModuleRole(edit?.module_role ?? "caregiver");
    setPhone(edit?.phone ?? "");
    setLicense(edit?.license_no ?? "");
    setEmpStatus(edit?.employment_status ?? "active");
  }

  function submit() {
    if (!first.trim() || !last.trim()) {
      toast.error("กรุณากรอกชื่อ-สกุล");
      return;
    }
    onSave({
      id: edit?.id ?? `stf-new-${count + 1}`,
      code: edit?.code ?? `S-${String(count + 1).padStart(3, "0")}`,
      first_name: first.trim(),
      last_name: last.trim(),
      staff_role: staffRole,
      module_role: moduleRole,
      phone: phone.trim() || null,
      email: edit?.email ?? null,
      license_no: license.trim() || null,
      employment_status: empStatus,
      hired_date: edit?.hired_date ?? new Date().toISOString().slice(0, 10),
      profile_id: edit?.profile_id ?? null,
    });
    onClose();
  }

  return (
    <Dialog open={state.open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{edit ? "แก้ไขพนักงาน" : "เพิ่มพนักงาน"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="st-first">ชื่อ *</Label>
              <Input
                id="st-first"
                className="mt-1"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="st-last">นามสกุล *</Label>
              <Input
                id="st-last"
                className="mt-1"
                value={last}
                onChange={(e) => setLast(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="st-srole">ตำแหน่งงาน</Label>
              <CustomSelect
                className="mt-1"
                value={staffRole}
                onChange={(v) => setStaffRole(v as StaffRole)}
                options={Object.entries(STAFF_ROLE_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </div>
            <div>
              <Label htmlFor="st-mrole">บทบาทในระบบ</Label>
              <CustomSelect
                className="mt-1"
                value={moduleRole}
                onChange={(v) => setModuleRole(v as ModuleRole)}
                options={Object.entries(MODULE_ROLE_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </div>
            <div>
              <Label htmlFor="st-phone">เบอร์โทร</Label>
              <Input
                id="st-phone"
                className="mt-1"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="st-license">เลขใบประกอบวิชาชีพ</Label>
              <Input
                id="st-license"
                className="mt-1"
                placeholder="เช่น PN-12345"
                value={license}
                onChange={(e) => setLicense(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="st-emp">สถานะการจ้าง</Label>
              <CustomSelect
                className="mt-1"
                value={empStatus}
                onChange={(v) => setEmpStatus(v as EmploymentStatus)}
                options={STATUS_FILTER.filter((o) => o.value)}
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
