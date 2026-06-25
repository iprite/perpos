"use client";

// ตั้งค่า (settings) — 5 แท็บ ตั้งค่าครั้งเดียวสำหรับงาน HR/เงินเดือน (prototype)
// guard super_admin อยู่ที่ layout.tsx แล้ว → หน้านี้เป็น client interactive
// แท็บ: ประเภทการลา · เงินเพิ่ม/เงินหัก · กองทุน&ปกส. · การบันทึกบัญชี · แจ้งเตือน LINE (จุดขาย §7)
// reuse foundation (_components/_fixtures) เท่านั้น — ทุก mutation อยู่ใน useState

import { useMemo, useState } from "react";
import {
  Settings,
  CalendarOff,
  Coins,
  Landmark,
  BookOpen,
  MessageSquare,
  Plus,
  Lock,
  Check,
  Bell,
  BellOff,
} from "lucide-react";
import cn from "@core/utils/class-names";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
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
} from "@/components/ui/table";
import { toast } from "@/lib/toast";

import {
  MOCK_LEAVE_TYPES,
  MOCK_PAY_ITEMS,
  MOCK_FUNDS,
  MOCK_ACCOUNT_SETTINGS,
  ALL_LINE_CARD_PREVIEWS,
  LINE_DEFAULT_SETTINGS,
} from "../_fixtures";
import type { LeaveType, PayItem, PayItemType, Fund, AccountSetting } from "../_fixtures/types";
import type { LineCardPreviewData } from "../_fixtures/line-mocks";
import { HrmShell, useHrmRole, fmtMoney, PayItemTypeBadge, FundTypeBadge } from "../_components";

// ─── ป้ายชื่อ tab ───
type TabKey = "leave" | "payitem" | "fund" | "account" | "line";
const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: "leave", label: "ประเภทการลา & โควตา", icon: <CalendarOff className="h-4 w-4" /> },
  { key: "payitem", label: "เงินเพิ่ม/เงินหัก", icon: <Coins className="h-4 w-4" /> },
  { key: "fund", label: "กองทุน & ประกันสังคม", icon: <Landmark className="h-4 w-4" /> },
  { key: "account", label: "การบันทึกบัญชี", icon: <BookOpen className="h-4 w-4" /> },
  { key: "line", label: "แจ้งเตือน LINE", icon: <MessageSquare className="h-4 w-4" /> },
];

// ป้ายชื่อ setting_key บัญชี
const ACCOUNT_KEY_LABEL: Record<string, string> = {
  payroll_expense: "ค่าใช้จ่ายเงินเดือน (Dr)",
  sso_payable: "ประกันสังคมค้างจ่าย (Cr)",
  wht_payable: "ภาษีหัก ณ ที่จ่ายค้างจ่าย (Cr)",
  pvd_payable: "กองทุนสำรองเลี้ยงชีพค้างจ่าย (Cr)",
  bank_payable: "เจ้าหนี้เงินเดือน/ธนาคาร (Cr)",
};

const RECEIVER_OPTS = [
  { value: "owner", label: "เจ้าของ/ผู้ดูแล" },
  { value: "hr", label: "ฝ่ายบุคคล" },
  { value: "employee", label: "พนักงานที่เกี่ยวข้อง" },
  { value: "owner_hr", label: "เจ้าของ + ฝ่ายบุคคล" },
];

export default function HrmSettingsPage() {
  const { can } = useHrmRole();
  const canWrite = can("write", "settings");

  const [tab, setTab] = useState<TabKey>("leave");

  return (
    <HrmShell
      title="ตั้งค่า"
      description="ตั้งค่าครั้งเดียวสำหรับงาน HR/เงินเดือน — ประเภทการลา เงินเพิ่ม/หัก กองทุน บัญชี และแจ้งเตือน LINE"
      icon={<Settings className="h-6 w-6" />}
    >
      {/* Tab navigation */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
        {TABS.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? "secondary" : "ghost"}
            size="sm"
            className={cn(tab === t.key && "bg-gray-100 text-gray-900")}
            onClick={() => setTab(t.key)}
          >
            <span className="mr-1.5">{t.icon}</span>
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "leave" && <LeaveTab canWrite={canWrite} />}
      {tab === "payitem" && <PayItemTab canWrite={canWrite} />}
      {tab === "fund" && <FundTab canWrite={canWrite} />}
      {tab === "account" && <AccountTab canWrite={canWrite} />}
      {tab === "line" && <LineTab canWrite={canWrite} />}
    </HrmShell>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 1 — ประเภทการลา & โควตา
// ════════════════════════════════════════════════════════════
type LeaveForm = {
  code: string;
  name: string;
  quota_days_per_year: string;
  is_paid: boolean;
  active: boolean;
};
const EMPTY_LEAVE: LeaveForm = {
  code: "",
  name: "",
  quota_days_per_year: "",
  is_paid: true,
  active: true,
};

function LeaveTab({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<LeaveType[]>(MOCK_LEAVE_TYPES);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [form, setForm] = useState<LeaveForm>(EMPTY_LEAVE);
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_LEAVE);
    setOpen(true);
  }
  function openEdit(lt: LeaveType) {
    setEditing(lt);
    setForm({
      code: lt.code,
      name: lt.name,
      quota_days_per_year: String(lt.quota_days_per_year),
      is_paid: lt.is_paid,
      active: lt.active,
    });
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("กรุณากรอกชื่อประเภทการลา");
      return;
    }
    const quota = Number(form.quota_days_per_year);
    if (form.quota_days_per_year !== "" && (Number.isNaN(quota) || quota < 0)) {
      toast.error("โควตาต้องเป็นตัวเลขไม่ติดลบ (0 = ไม่จำกัด)");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      if (editing) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === editing.id
              ? {
                  ...r,
                  code: form.code.trim() || r.code,
                  name: form.name.trim(),
                  quota_days_per_year: quota || 0,
                  is_paid: form.is_paid,
                  active: form.active,
                }
              : r,
          ),
        );
        toast.success(`แก้ไขประเภทการลา "${form.name.trim()}" เรียบร้อย`);
      } else {
        const seq = rows.length + 1;
        const lt: LeaveType = {
          id: `lt-new-${seq}`,
          org_id: "org-demo",
          code: form.code.trim() || `custom_${seq}`,
          name: form.name.trim(),
          quota_days_per_year: quota || 0,
          is_paid: form.is_paid,
          active: form.active,
          created_at: new Date().toISOString(),
        };
        setRows((prev) => [...prev, lt]);
        toast.success(`เพิ่มประเภทการลา "${lt.name}" เรียบร้อย`);
      }
      setSaving(false);
      setOpen(false);
    }, 500);
  }

  return (
    <SectionCard
      title="ประเภทการลา & โควตา"
      description="กำหนดประเภทการลาและจำนวนวันต่อปี — ใช้ตรวจสอบโควตาตอนพนักงานยื่นลา"
      action={
        canWrite ? (
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            เพิ่มประเภทการลา
          </Button>
        ) : null
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อประเภท</TableHead>
            <TableHead>รหัส</TableHead>
            <TableHead align="right">โควตา (วัน/ปี)</TableHead>
            <TableHead align="center">ลามีเงิน</TableHead>
            <TableHead align="center">สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((lt) => (
            <TableRow
              key={lt.id}
              clickable={canWrite}
              onClick={canWrite ? () => openEdit(lt) : undefined}
            >
              <TableCell className="font-medium text-gray-900">{lt.name}</TableCell>
              <TableCell className="font-mono text-xs text-gray-500">{lt.code}</TableCell>
              <TableCell align="right" tabular>
                {lt.quota_days_per_year === 0 ? "ไม่จำกัด" : lt.quota_days_per_year}
              </TableCell>
              <TableCell align="center">
                <StatusBadge tone={lt.is_paid ? "success" : "neutral"}>
                  {lt.is_paid ? "มีเงิน" : "ไม่มีเงิน"}
                </StatusBadge>
              </TableCell>
              <TableCell align="center">
                <StatusBadge tone={lt.active ? "success" : "neutral"}>
                  {lt.active ? "ใช้งาน" : "ปิด"}
                </StatusBadge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขประเภทการลา" : "เพิ่มประเภทการลา"}</DialogTitle>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <DialogBody>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="lt-name">ชื่อประเภท *</Label>
                    <Input
                      id="lt-name"
                      className="mt-1"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="เช่น ลาคลอด"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lt-code">รหัส</Label>
                    <Input
                      id="lt-code"
                      className="mt-1"
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                      placeholder="เว้นว่าง = สร้างอัตโนมัติ"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="lt-quota">โควตา (วัน/ปี)</Label>
                  <Input
                    id="lt-quota"
                    type="number"
                    className="mt-1"
                    value={form.quota_days_per_year}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, quota_days_per_year: e.target.value }))
                    }
                    placeholder="ใส่ 0 = ไม่จำกัด"
                  />
                  <p className="mt-1 text-xs text-gray-500">ใส่ 0 หมายถึงลาได้ไม่จำกัดวัน</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ToggleField
                    label="ลามีเงิน"
                    hint="ลาประเภทนี้ยังได้รับค่าจ้าง"
                    checked={form.is_paid}
                    onChange={(v) => setForm((f) => ({ ...f, is_paid: v }))}
                  />
                  <ToggleField
                    label="เปิดใช้งาน"
                    hint="ให้พนักงานเลือกประเภทนี้ได้"
                    checked={form.active}
                    onChange={(v) => setForm((f) => ({ ...f, active: v }))}
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มประเภทการลา"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 2 — เงินเพิ่ม/เงินหัก (pay_items)
// ════════════════════════════════════════════════════════════
type PayItemForm = {
  code: string;
  name: string;
  item_type: PayItemType;
  is_recurring: boolean;
  account_label: string;
  active: boolean;
};
const EMPTY_PAYITEM: PayItemForm = {
  code: "",
  name: "",
  item_type: "earning",
  is_recurring: false,
  account_label: "",
  active: true,
};
const ITEM_TYPE_OPTS = [
  { value: "earning", label: "เงินเพิ่ม (Earning)" },
  { value: "deduction", label: "เงินหัก (Deduction)" },
];

function PayItemTab({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<PayItem[]>(MOCK_PAY_ITEMS);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PayItem | null>(null);
  const [form, setForm] = useState<PayItemForm>(EMPTY_PAYITEM);
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => [...rows].sort((a, b) => a.sort_order - b.sort_order), [rows]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_PAYITEM);
    setOpen(true);
  }
  function openEdit(pi: PayItem) {
    if (pi.is_system) {
      toast.error("รายการระบบแก้ไขไม่ได้ (ปกส./ภาษี/เงินเดือน ระบบจัดการให้อัตโนมัติ)");
      return;
    }
    setEditing(pi);
    setForm({
      code: pi.code,
      name: pi.name,
      item_type: pi.item_type,
      is_recurring: pi.is_recurring,
      account_label: pi.account_label ?? "",
      active: pi.active,
    });
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("กรุณากรอกชื่อรายการ");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      if (editing) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === editing.id
              ? {
                  ...r,
                  code: form.code.trim() || r.code,
                  name: form.name.trim(),
                  item_type: form.item_type,
                  is_recurring: form.is_recurring,
                  account_label: form.account_label.trim() || null,
                  active: form.active,
                }
              : r,
          ),
        );
        toast.success(`แก้ไขรายการ "${form.name.trim()}" เรียบร้อย`);
      } else {
        const seq = rows.length + 1;
        const pi: PayItem = {
          id: `pi-new-${seq}`,
          org_id: "org-demo",
          code: form.code.trim() || `CUSTOM${seq}`,
          name: form.name.trim(),
          item_type: form.item_type,
          is_recurring: form.is_recurring,
          account_label: form.account_label.trim() || null,
          ytd_type: form.item_type === "earning" ? "income40_1" : "none",
          is_system: false,
          active: form.active,
          sort_order: 50 + seq,
          created_at: new Date().toISOString(),
        };
        setRows((prev) => [...prev, pi]);
        toast.success(`เพิ่มรายการ "${pi.name}" เรียบร้อย`);
      }
      setSaving(false);
      setOpen(false);
    }, 500);
  }

  return (
    <SectionCard
      title="เงินเพิ่ม/เงินหัก"
      description="กำหนดรายการเงินเพิ่ม (OT เบี้ยขยัน) และเงินหัก ที่ใช้ในรอบเงินเดือน — รายการระบบแก้ไม่ได้"
      action={
        canWrite ? (
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            เพิ่มรายการ
          </Button>
        ) : null
      }
    >
      <Table stickyHeader maxHeight="58vh">
        <TableHeader sticky>
          <TableRow>
            <TableHead>ชื่อรายการ</TableHead>
            <TableHead align="center">ประเภท</TableHead>
            <TableHead align="center">ประจำทุกเดือน</TableHead>
            <TableHead>ผูกบัญชี</TableHead>
            <TableHead align="center">รายการระบบ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((pi) => (
            <TableRow
              key={pi.id}
              clickable={canWrite && !pi.is_system}
              onClick={canWrite && !pi.is_system ? () => openEdit(pi) : undefined}
            >
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-gray-900">{pi.name}</span>
                  <span className="font-mono text-xs text-gray-400">{pi.code}</span>
                </div>
              </TableCell>
              <TableCell align="center">
                <PayItemTypeBadge type={pi.item_type} />
              </TableCell>
              <TableCell align="center">
                {pi.is_recurring ? (
                  <Check className="mx-auto h-4 w-4 text-green-600" />
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-gray-600">{pi.account_label ?? "—"}</TableCell>
              <TableCell align="center">
                {pi.is_system ? (
                  <StatusBadge tone="neutral">
                    <Lock className="mr-1 h-3 w-3" />
                    ระบบ
                  </StatusBadge>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "แก้ไขรายการเงินเพิ่ม/หัก" : "เพิ่มรายการเงินเพิ่ม/หัก"}
            </DialogTitle>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <DialogBody>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="pi-name">ชื่อรายการ *</Label>
                    <Input
                      id="pi-name"
                      className="mt-1"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="เช่น ค่าเดินทาง"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pi-code">รหัส</Label>
                    <Input
                      id="pi-code"
                      className="mt-1"
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                      placeholder="เว้นว่าง = สร้างอัตโนมัติ"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pi-type">ประเภท</Label>
                    <CustomSelect
                      value={form.item_type}
                      onChange={(v) => setForm((f) => ({ ...f, item_type: v as PayItemType }))}
                      options={ITEM_TYPE_OPTS}
                      className="mt-1 w-full"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pi-acc">ผูกบัญชี</Label>
                    <Input
                      id="pi-acc"
                      className="mt-1"
                      value={form.account_label}
                      onChange={(e) => setForm((f) => ({ ...f, account_label: e.target.value }))}
                      placeholder="เช่น 5105 ค่าเดินทาง"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ToggleField
                    label="ประจำทุกเดือน"
                    hint="รายการนี้ใส่ให้อัตโนมัติทุกรอบ"
                    checked={form.is_recurring}
                    onChange={(v) => setForm((f) => ({ ...f, is_recurring: v }))}
                  />
                  <ToggleField
                    label="เปิดใช้งาน"
                    hint="ให้เลือกใช้ในรอบเงินเดือนได้"
                    checked={form.active}
                    onChange={(v) => setForm((f) => ({ ...f, active: v }))}
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 3 — กองทุน & ประกันสังคม (funds)
// ════════════════════════════════════════════════════════════
type FundForm = {
  employee_rate: string;
  employer_rate: string;
  ceiling_wage: string;
};

function FundTab({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<Fund[]>(MOCK_FUNDS);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Fund | null>(null);
  const [form, setForm] = useState<FundForm>({
    employee_rate: "",
    employer_rate: "",
    ceiling_wage: "",
  });
  const [saving, setSaving] = useState(false);

  function openEdit(fund: Fund) {
    setEditing(fund);
    setForm({
      employee_rate: String(fund.employee_rate),
      employer_rate: String(fund.employer_rate),
      ceiling_wage: fund.ceiling_wage != null ? String(fund.ceiling_wage) : "",
    });
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const empRate = Number(form.employee_rate);
    const erRate = Number(form.employer_rate);
    if (Number.isNaN(empRate) || empRate < 0 || Number.isNaN(erRate) || erRate < 0) {
      toast.error("อัตราต้องเป็นตัวเลขไม่ติดลบ");
      return;
    }
    const ceiling = form.ceiling_wage.trim() === "" ? null : Number(form.ceiling_wage);
    if (ceiling != null && (Number.isNaN(ceiling) || ceiling < 0)) {
      toast.error("เพดานฐานคำนวณต้องเป็นตัวเลขไม่ติดลบ");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? { ...r, employee_rate: empRate, employer_rate: erRate, ceiling_wage: ceiling }
            : r,
        ),
      );
      setSaving(false);
      setOpen(false);
      toast.success(`อัปเดตอัตรา "${editing.name}" เรียบร้อย`);
    }, 500);
  }

  return (
    <SectionCard
      title="กองทุน & ประกันสังคม"
      description="อัตราเงินสมทบของลูกจ้าง/นายจ้าง และเพดานฐานคำนวณ — ใช้คำนวณยอดหักในรอบเงินเดือน"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อกองทุน</TableHead>
            <TableHead align="center">ประเภท</TableHead>
            <TableHead align="right">อัตราลูกจ้าง (%)</TableHead>
            <TableHead align="right">อัตรานายจ้าง (%)</TableHead>
            <TableHead align="right">เพดานฐานคำนวณ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((fund) => (
            <TableRow
              key={fund.id}
              clickable={canWrite}
              onClick={canWrite ? () => openEdit(fund) : undefined}
            >
              <TableCell className="font-medium text-gray-900">{fund.name}</TableCell>
              <TableCell align="center">
                <FundTypeBadge type={fund.fund_type} />
              </TableCell>
              <TableCell align="right" tabular>
                {fund.employee_rate}%
              </TableCell>
              <TableCell align="right" tabular>
                {fund.employer_rate}%
              </TableCell>
              <TableCell align="right" tabular>
                {fund.ceiling_wage != null ? fmtMoney(fund.ceiling_wage) : "ไม่มีเพดาน"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>แก้ไขอัตรา — {editing?.name ?? ""}</DialogTitle>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <DialogBody>
              <div className="space-y-4">
                {editing?.notes ? (
                  <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    {editing.notes}
                  </p>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="fund-emp">อัตราลูกจ้าง (%)</Label>
                    <Input
                      id="fund-emp"
                      type="number"
                      className="mt-1"
                      value={form.employee_rate}
                      onChange={(e) => setForm((f) => ({ ...f, employee_rate: e.target.value }))}
                      placeholder="เช่น 5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="fund-er">อัตรานายจ้าง (%)</Label>
                    <Input
                      id="fund-er"
                      type="number"
                      className="mt-1"
                      value={form.employer_rate}
                      onChange={(e) => setForm((f) => ({ ...f, employer_rate: e.target.value }))}
                      placeholder="เช่น 5"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="fund-ceil">เพดานฐานคำนวณ (฿)</Label>
                  <Input
                    id="fund-ceil"
                    type="number"
                    className="mt-1"
                    value={form.ceiling_wage}
                    onChange={(e) => setForm((f) => ({ ...f, ceiling_wage: e.target.value }))}
                    placeholder="เว้นว่าง = ไม่มีเพดาน"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    เช่น ประกันสังคมเพดาน 15,000 บาท → หักสูงสุด 750 บาท/เดือน
                  </p>
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก…" : "บันทึกอัตรา"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 4 — การบันทึกบัญชี (account_settings)
// ════════════════════════════════════════════════════════════
function AccountTab({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<AccountSetting[]>(MOCK_ACCOUNT_SETTINGS);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccountSetting | null>(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  function openEdit(as: AccountSetting) {
    setEditing(as);
    setLabel(as.account_label ?? "");
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!label.trim()) {
      toast.error("กรุณากรอกบัญชีที่ผูก");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      setRows((prev) =>
        prev.map((r) => (r.id === editing.id ? { ...r, account_label: label.trim() } : r)),
      );
      setSaving(false);
      setOpen(false);
      toast.success("อัปเดตบัญชีที่ผูกเรียบร้อย");
    }, 500);
  }

  return (
    <SectionCard
      title="การบันทึกบัญชี"
      description="ผูกบัญชีในผังบัญชีกับแต่ละรายการเงินเดือน — ใช้ตอนระบบลงบัญชีอัตโนมัติเมื่อปิดรอบ"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รายการ</TableHead>
            <TableHead>บัญชีที่ผูก</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((as) => (
            <TableRow
              key={as.id}
              clickable={canWrite}
              onClick={canWrite ? () => openEdit(as) : undefined}
            >
              <TableCell>
                <div className="font-medium text-gray-900">
                  {ACCOUNT_KEY_LABEL[as.setting_key] ?? as.setting_key}
                </div>
                <div className="font-mono text-xs text-gray-400">{as.setting_key}</div>
              </TableCell>
              <TableCell className="text-sm text-gray-600">{as.account_label ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              แก้ไขบัญชี —{" "}
              {editing ? (ACCOUNT_KEY_LABEL[editing.setting_key] ?? editing.setting_key) : ""}
            </DialogTitle>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <DialogBody>
              <div>
                <Label htmlFor="acc-label">บัญชีที่ผูก *</Label>
                <Input
                  id="acc-label"
                  className="mt-1"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="เช่น 5101 ค่าแรงงาน"
                />
                <p className="mt-1 text-xs text-gray-500">ใส่เลขที่บัญชีและชื่อบัญชีจากผังบัญชี</p>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 5 — แจ้งเตือน LINE (จุดขาย §7)
// ════════════════════════════════════════════════════════════
function LineTab({ canWrite }: { canWrite: boolean }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(LINE_DEFAULT_SETTINGS);
  const [receivers, setReceivers] = useState<Record<string, string>>(() =>
    Object.fromEntries(ALL_LINE_CARD_PREVIEWS.map((c) => [c.id, defaultReceiver(c.id)])),
  );
  const [previewCard, setPreviewCard] = useState<LineCardPreviewData>(ALL_LINE_CARD_PREVIEWS[0]);

  function toggle(id: string, label: string) {
    if (!canWrite) {
      toast.error("คุณมีสิทธิ์ดูอย่างเดียว ไม่สามารถแก้การแจ้งเตือนได้");
      return;
    }
    const next = !enabled[id];
    setEnabled((prev) => ({ ...prev, [id]: next }));
    toast.success(`${next ? "เปิด" : "ปิด"}การแจ้งเตือน "${label}" แล้ว`);
  }

  return (
    <SectionCard
      title="แจ้งเตือน LINE"
      description="เปิด/ปิดการแจ้งเตือนอัตโนมัติทาง LINE และเลือกผู้รับ — ดูตัวอย่างการ์ดที่จะส่งทางขวา (จำลอง)"
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* ── รายการ event + toggle ── */}
        <div className="min-w-0 space-y-2.5 lg:col-span-7">
          {ALL_LINE_CARD_PREVIEWS.map((card) => {
            const on = enabled[card.id];
            const selected = previewCard.id === card.id;
            return (
              <div
                key={card.id}
                className={cn(
                  "rounded-xl border bg-white p-3.5 shadow-sm transition-colors",
                  selected ? "border-primary ring-1 ring-primary" : "border-gray-200",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    role="button"
                    tabIndex={0}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                    onClick={() => setPreviewCard(card)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setPreviewCard(card);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                          on ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400",
                        )}
                      >
                        {on ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                      </span>
                      <span className="truncate text-sm font-medium text-gray-900">
                        {card.event}
                      </span>
                    </div>
                    <p className="mt-1 pl-9 text-xs text-gray-500">ดูตัวอย่างการ์ด: {card.title}</p>
                  </div>
                  <Button
                    variant={on ? "secondary" : "outline"}
                    size="sm"
                    disabled={!canWrite}
                    onClick={() => toggle(card.id, card.event)}
                  >
                    {on ? "เปิดอยู่" : "ปิดอยู่"}
                  </Button>
                </div>

                <div className="mt-3 flex items-center gap-2 pl-9">
                  <span className="shrink-0 text-xs text-gray-500">ผู้รับ</span>
                  <CustomSelect
                    value={receivers[card.id]}
                    onChange={(v) => setReceivers((prev) => ({ ...prev, [card.id]: v }))}
                    options={RECEIVER_OPTS}
                    className="w-56"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Flex card preview (mock) ── */}
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <MessageSquare className="h-3.5 w-3.5" />
              ตัวอย่างการ์ดที่ส่งทาง LINE (จำลอง)
            </div>
            <FlexCardPreview card={previewCard} />
            <p className="mt-2 text-xs text-gray-400">
              นี่คือภาพจำลองในหน้าเว็บ — การ์ดจริงเรนเดอร์เป็น Flex Message บน LINE
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function defaultReceiver(id: string): string {
  switch (id) {
    case "line-payslip":
      return "employee";
    case "line-leave-approval":
      return "owner_hr";
    case "line-leave-submit":
      return "employee";
    case "line-leave-balance":
      return "employee";
    default:
      return "owner";
  }
}

// ─── การ์ด LINE จำลอง (เรนเดอร์ในหน้าเว็บด้วย Tailwind token — ไม่ใช่ Flex JSON, ห้าม hex) ───
// header ใช้ bg-primary (= CHARCOAL token ตาม DESIGN.md §2) แทน hex
function FlexCardPreview({ card }: { card: LineCardPreviewData }) {
  return (
    <div className="w-full max-w-[320px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-md">
      {/* header — bg-primary (charcoal token) */}
      <div className="bg-primary px-4 py-3 text-white">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold leading-snug">{card.title}</span>
          {/* pill นี้เป็น decoration จำลองป้ายบนการ์ด LINE Flex (ไม่ใช่ StatusBadge ของระบบ) —
              ตั้งใจเรนเดอร์เองเพื่อให้หน้าตาตรงกับการ์ดที่จะส่งจริงทาง LINE */}
          {card.badge ? (
            <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white">
              {card.badge}
            </span>
          ) : null}
        </div>
      </div>

      {/* lines */}
      <div className="space-y-2 px-4 py-3.5">
        {card.lines.map((line, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="shrink-0 text-gray-400">{line.label}</span>
            <span
              className={cn(
                "text-right tabular-nums",
                line.highlight ? "font-semibold text-gray-900" : "text-gray-700",
              )}
            >
              {line.value}
            </span>
          </div>
        ))}
      </div>

      {/* footer CTA */}
      <div className="border-t border-gray-100 px-4 py-3">
        <p className="mb-2.5 text-[11px] leading-relaxed text-gray-500">{card.footer}</p>
        <div className="rounded-lg bg-primary py-2 text-center text-xs font-medium text-white">
          เปิดดูใน PERPOS
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Shared bits
// ════════════════════════════════════════════════════════════
function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-gray-100 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ToggleField — แทน raw checkbox/switch ด้วย Button toggle (มาตรฐาน @/components/ui)
function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <div className="text-xs text-gray-500">{hint}</div>
      </div>
      <Button
        type="button"
        variant={checked ? "secondary" : "outline"}
        size="sm"
        className="shrink-0"
        onClick={() => onChange(!checked)}
      >
        {checked ? (
          <>
            <Check className="mr-1 h-3.5 w-3.5" />
            เปิด
          </>
        ) : (
          "ปิด"
        )}
      </Button>
    </div>
  );
}
