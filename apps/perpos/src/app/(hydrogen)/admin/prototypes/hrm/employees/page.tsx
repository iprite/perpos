"use client";

// พนักงาน (employees list) — prototype interactive
// guard super_admin อยู่ที่ layout.tsx แล้ว → หน้านี้เป็น client interactive
// KPI จาก fixtures จริง · filter/search · เพิ่มพนักงาน dialog (workflow §11) · gate ตาม role matrix §5

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, UserPlus, Search, Wallet, CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { StatCard } from "@/components/ui/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
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
  TableEmpty,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";

import { MOCK_EMPLOYEES } from "../_fixtures";
import type { Employee, EmployeeStatus, EmploymentType } from "../_fixtures/types";
import {
  HrmShell,
  useHrmRole,
  fmtMoney,
  fmtNum,
  fullName,
  EmployeeStatusBadge,
  EmploymentTypeBadge,
} from "../_components";

const BASE = "/admin/prototypes/hrm";

const STATUS_OPTS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "active", label: "ทำงานอยู่" },
  { value: "inactive", label: "พักงาน" },
  { value: "terminated", label: "ออกแล้ว" },
];
const TYPE_OPTS = [
  { value: "", label: "ทุกประเภทจ้าง" },
  { value: "monthly", label: "รายเดือน" },
  { value: "daily", label: "รายวัน" },
  { value: "contract", label: "สัญญาจ้าง" },
];
const TYPE_FORM_OPTS = TYPE_OPTS.slice(1);

type EmployeeForm = {
  employee_code: string;
  first_name: string;
  last_name: string;
  department_tag: string;
  position: string;
  employment_type: EmploymentType;
  base_salary: string;
  phone: string;
  start_date: string;
};

const EMPTY_FORM: EmployeeForm = {
  employee_code: "",
  first_name: "",
  last_name: "",
  department_tag: "",
  position: "",
  employment_type: "monthly",
  base_salary: "",
  phone: "",
  start_date: "",
};

export default function EmployeesPage() {
  const router = useRouter();
  const { can } = useHrmRole();
  const canWrite = can("write", "employees");

  const [employees, setEmployees] = useState<Employee[]>(MOCK_EMPLOYEES);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // ── KPI ──
  const kpi = useMemo(() => {
    const active = employees.filter((e) => e.status === "active");
    const monthlyCost = active
      .filter((e) => e.employment_type === "monthly" || e.employment_type === "contract")
      .reduce((s, e) => s + e.base_salary, 0);
    const dailyCount = active.filter((e) => e.employment_type === "daily").length;
    return {
      activeCount: active.length,
      monthlyCost,
      dailyCount,
    };
  }, [employees]);

  // ── filter ──
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return employees.filter((e) => {
      if (status && e.status !== status) return false;
      if (type && e.employment_type !== type) return false;
      if (term) {
        const hay =
          `${e.first_name} ${e.last_name} ${e.employee_code} ${e.position ?? ""} ${e.department_tag ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [employees, q, status, type]);

  // ── submit เพิ่มพนักงาน (workflow §11) ──
  function submitEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error("กรุณากรอกชื่อ-นามสกุล");
      return;
    }
    const salary = Number(form.base_salary);
    if (!form.base_salary || Number.isNaN(salary) || salary <= 0) {
      toast.error("กรุณากรอกเงินเดือน/ค่าจ้างฐานให้ถูกต้อง");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      const seq = employees.length + 1;
      const code = form.employee_code.trim() || `EMP-${String(seq).padStart(3, "0")}`;
      const newEmployee: Employee = {
        id: `emp-new-${seq}`,
        org_id: "org-demo",
        employee_code: code,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        department_tag: form.department_tag.trim() || null,
        position: form.position.trim() || null,
        employment_type: form.employment_type,
        base_salary: salary,
        tax_id: null,
        ssn: null,
        bank_name: null,
        bank_account: null,
        phone: form.phone.trim() || null,
        birth_date: null,
        start_date: form.start_date || null,
        probation_end_date: null,
        contract_end_date: null,
        end_date: null,
        status: "active",
        created_at: new Date().toISOString(),
      };
      setEmployees((prev) => [newEmployee, ...prev]);
      setSaving(false);
      setOpen(false);
      setForm(EMPTY_FORM);
      toast.success(`เพิ่มพนักงาน ${newEmployee.first_name} (${code}) เรียบร้อย`);
    }, 700);
  }

  return (
    <HrmShell
      title="พนักงาน"
      description="แฟ้มพนักงานทั้งหมด — ข้อมูลส่วนตัว ตำแหน่ง เงินเดือน และสถานะการจ้าง"
      icon={<Users className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={() => setOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            เพิ่มพนักงาน
          </Button>
        ) : null
      }
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="พนักงานที่ทำงานอยู่"
          value={fmtNum(kpi.activeCount)}
          sub="คนในความดูแลขณะนี้"
          tone="info"
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="ฐานเงินเดือนรวม/เดือน"
          value={fmtMoney(kpi.monthlyCost)}
          sub="เฉพาะรายเดือน + สัญญาจ้าง"
          tone="primary"
        />
        <StatCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="พนักงานรายวัน"
          value={fmtNum(kpi.dailyCount)}
          sub="คิดค่าจ้างตามวันทำงาน"
          tone="neutral"
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ รหัส ตำแหน่ง หรือแผนก…"
            className="pl-9"
          />
        </div>
        <CustomSelect
          value={status}
          onChange={setStatus}
          options={STATUS_OPTS}
          className="sm:w-40"
        />
        <CustomSelect value={type} onChange={setType} options={TYPE_OPTS} className="sm:w-44" />
      </div>

      {/* Table — เป็นการ์ดในตัว ไม่ห่อใน card อีกชั้น */}
      <div>
        <Table stickyHeader maxHeight="62vh" className="shadow-sm">
          <TableHeader sticky>
            <TableRow>
              <TableHead>รหัส</TableHead>
              <TableHead>ชื่อ-สกุล</TableHead>
              <TableHead align="center">แผนก</TableHead>
              <TableHead>ตำแหน่ง</TableHead>
              <TableHead align="center">ประเภทจ้าง</TableHead>
              <TableHead align="right">เงินเดือนฐาน</TableHead>
              <TableHead align="center">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={7}>
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="mb-3 rounded-full bg-gray-100 p-4">
                    <Users className="h-7 w-7 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">ไม่พบพนักงานตามเงื่อนไข</p>
                  <p className="mt-1 text-sm text-gray-500">
                    ลองปรับตัวกรอง หรือเพิ่มพนักงานใหม่เข้าระบบ
                  </p>
                  {canWrite && (
                    <Button size="sm" className="mt-4" onClick={() => setOpen(true)}>
                      <UserPlus className="mr-1.5 h-4 w-4" />
                      เพิ่มพนักงาน
                    </Button>
                  )}
                </div>
              </TableEmpty>
            ) : (
              rows.map((e) => (
                <TableRow
                  key={e.id}
                  clickable
                  onClick={() => router.push(`${BASE}/employees/${e.id}`)}
                >
                  <TableCell className="font-mono text-xs text-gray-500">
                    {e.employee_code}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={fullName(e)} className="h-8 w-8 text-xs" />
                      <span className="font-medium text-gray-900">{fullName(e)}</span>
                    </div>
                  </TableCell>
                  <TableCell align="center">
                    {e.department_tag ? (
                      <StatusBadge tone="neutral">{e.department_tag}</StatusBadge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{e.position ?? "—"}</TableCell>
                  <TableCell align="center">
                    <EmploymentTypeBadge type={e.employment_type} />
                  </TableCell>
                  <TableCell align="right" tabular>
                    {e.employment_type === "daily"
                      ? `${fmtMoney(e.base_salary)}/วัน`
                      : fmtMoney(e.base_salary)}
                  </TableCell>
                  <TableCell align="center">
                    <EmployeeStatusBadge status={e.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-gray-400">
        แสดง {fmtNum(rows.length)} จาก {fmtNum(employees.length)} คน · คลิกแถวเพื่อดูแฟ้มพนักงาน
        360°
      </p>

      {/* เพิ่มพนักงาน dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>เพิ่มพนักงานใหม่</DialogTitle>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitEmployee}>
            <DialogBody>
              <div className="space-y-5">
                <div>
                  <div className="mb-2 text-sm font-semibold text-gray-900">ข้อมูลพนักงาน</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="code">รหัสพนักงาน</Label>
                      <Input
                        id="code"
                        className="mt-1"
                        value={form.employee_code}
                        onChange={(e) => setForm((f) => ({ ...f, employee_code: e.target.value }))}
                        placeholder="เว้นว่าง = สร้างอัตโนมัติ"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">เบอร์โทร</Label>
                      <Input
                        id="phone"
                        className="mt-1"
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="08x-xxx-xxxx"
                      />
                    </div>
                    <div>
                      <Label htmlFor="fn">ชื่อ *</Label>
                      <Input
                        id="fn"
                        className="mt-1"
                        value={form.first_name}
                        onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                        placeholder="เช่น สมชาย"
                      />
                    </div>
                    <div>
                      <Label htmlFor="ln">นามสกุล *</Label>
                      <Input
                        id="ln"
                        className="mt-1"
                        value={form.last_name}
                        onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                        placeholder="เช่น ใจดี"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-gray-900">ตำแหน่ง & การจ้าง</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="dept">แผนก</Label>
                      <Input
                        id="dept"
                        className="mt-1"
                        value={form.department_tag}
                        onChange={(e) => setForm((f) => ({ ...f, department_tag: e.target.value }))}
                        placeholder="เช่น การตลาด"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pos">ตำแหน่ง</Label>
                      <Input
                        id="pos"
                        className="mt-1"
                        value={form.position}
                        onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                        placeholder="เช่น นักการตลาด"
                      />
                    </div>
                    <div>
                      <Label htmlFor="etype">ประเภทจ้าง</Label>
                      <CustomSelect
                        value={form.employment_type}
                        onChange={(v) =>
                          setForm((f) => ({ ...f, employment_type: v as EmploymentType }))
                        }
                        options={TYPE_FORM_OPTS}
                        className="mt-1 w-full"
                      />
                    </div>
                    <div>
                      <Label htmlFor="salary">
                        {form.employment_type === "daily"
                          ? "ค่าจ้างรายวัน (฿) *"
                          : "เงินเดือนฐาน (฿) *"}
                      </Label>
                      <Input
                        id="salary"
                        type="number"
                        className="mt-1"
                        value={form.base_salary}
                        onChange={(e) => setForm((f) => ({ ...f, base_salary: e.target.value }))}
                        placeholder="เช่น 25000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="start">วันเริ่มงาน</Label>
                      <div className="mt-1">
                        <ThaiDatePicker
                          value={form.start_date}
                          onChange={(iso) => setForm((f) => ({ ...f, start_date: iso }))}
                          placeholder="เลือกวันเริ่มงาน"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก…" : "เพิ่มพนักงาน"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </HrmShell>
  );
}
