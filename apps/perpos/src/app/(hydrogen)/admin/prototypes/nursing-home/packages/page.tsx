"use client";

// packages/page.tsx — จัดการแพ็กเกจค่าบริการ (interactive prototype)
// gate §4: service_packages = owner/admin_staff เขียนได้ · nurse/caregiver ไม่เห็น

import { useMemo, useState } from "react";
import { Package, Plus, ShieldX, Repeat, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatCard } from "@/components/ui/stat-card";
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
import {
  NursingShell,
  useNursingRole,
  fmtMoney,
  CareLevelBadge,
  careLevelLabel,
} from "../_components";
import { SERVICE_PACKAGES, RESIDENT_SUBSCRIPTIONS } from "../_fixtures";
import type { ServicePackage, CareLevel, PackageBillingCycle } from "../_fixtures/types";

const CARE_LEVEL_OPTS: { value: CareLevel; label: string }[] = [
  { value: "independent", label: careLevelLabel("independent") },
  { value: "assisted", label: careLevelLabel("assisted") },
  { value: "full_care", label: careLevelLabel("full_care") },
  { value: "memory_care", label: careLevelLabel("memory_care") },
];

type FormState = {
  name: string;
  care_level: CareLevel;
  billing_cycle: PackageBillingCycle;
  price: string;
  description: string;
};

const emptyForm: FormState = {
  name: "",
  care_level: "assisted",
  billing_cycle: "monthly",
  price: "",
  description: "",
};

export default function PackagesPage() {
  const { can } = useNursingRole();
  const canWrite = can("write", "service_packages");

  const [packages, setPackages] = useState<ServicePackage[]>(SERVICE_PACKAGES);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServicePackage | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  // นับผู้พักที่ผูกแต่ละแพ็กเกจ (active) — โชว์คุณค่า
  const subCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of RESIDENT_SUBSCRIPTIONS) {
      if (!s.is_active) continue;
      m.set(s.package_id, (m.get(s.package_id) ?? 0) + 1);
    }
    return m;
  }, []);

  const activeCount = packages.filter((p) => p.is_active).length;
  const mrr = useMemo(
    () =>
      RESIDENT_SUBSCRIPTIONS.filter((s) => s.is_active).reduce(
        (sum, s) => sum + s.monthly_price,
        0,
      ),
    [],
  );

  if (!canWrite && !can("view", "service_packages")) {
    return <NoAccess />;
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(pkg: ServicePackage) {
    setEditing(pkg);
    setForm({
      name: pkg.name,
      care_level: (pkg.care_level ?? "assisted") as CareLevel,
      billing_cycle: pkg.billing_cycle,
      price: String(pkg.price),
      description: pkg.description ?? "",
    });
    setDialogOpen(true);
  }

  function handleSave() {
    const price = Number(form.price);
    if (!form.name.trim()) {
      toast.error("กรุณากรอกชื่อแพ็กเกจ");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("กรุณากรอกราคาให้ถูกต้อง");
      return;
    }
    if (editing) {
      setPackages((prev) =>
        prev.map((p) =>
          p.id === editing.id
            ? {
                ...p,
                name: form.name.trim(),
                care_level: form.care_level,
                billing_cycle: form.billing_cycle,
                price,
                description: form.description.trim() || null,
              }
            : p,
        ),
      );
      toast.success("แก้ไขแพ็กเกจแล้ว");
    } else {
      const id = `pkg-${Date.now()}`;
      setPackages((prev) => [
        ...prev,
        {
          id,
          name: form.name.trim(),
          care_level: form.care_level,
          billing_cycle: form.billing_cycle,
          price,
          description: form.description.trim() || null,
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ]);
      toast.success("เพิ่มแพ็กเกจใหม่แล้ว");
    }
    setDialogOpen(false);
  }

  function toggleActive(pkg: ServicePackage) {
    setPackages((prev) =>
      prev.map((p) => (p.id === pkg.id ? { ...p, is_active: !p.is_active } : p)),
    );
    toast.success(pkg.is_active ? "ปิดใช้งานแพ็กเกจแล้ว" : "เปิดใช้งานแพ็กเกจแล้ว");
  }

  return (
    <NursingShell
      title="แพ็กเกจค่าบริการ"
      description="กำหนดราคาและระดับการดูแลของแต่ละแพ็กเกจ — ใช้สร้างบิลรอบเดือนอัตโนมัติ"
      icon={<Package className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มแพ็กเกจ
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Package className="h-4 w-4" />}
          label="แพ็กเกจที่เปิดใช้"
          value={`${activeCount} แพ็กเกจ`}
          sub={`ทั้งหมด ${packages.length} รายการ`}
          tone="info"
        />
        <StatCard
          icon={<Repeat className="h-4 w-4" />}
          label="ผู้พักที่สมัครแพ็กเกจ"
          value={`${RESIDENT_SUBSCRIPTIONS.filter((s) => s.is_active).length} คน`}
          sub="กำลังพักอาศัย"
          tone="primary"
        />
        <StatCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="รายได้ประจำต่อเดือน (MRR)"
          value={fmtMoney(mrr)}
          sub="รวมแพ็กเกจที่ active ทั้งหมด"
          tone="positive"
          valueColored
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อแพ็กเกจ</TableHead>
            <TableHead align="center">ระดับการดูแล</TableHead>
            <TableHead align="center">รอบบิล</TableHead>
            <TableHead align="center">ผู้พัก</TableHead>
            <TableHead align="right">ราคา</TableHead>
            <TableHead align="center">สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {packages.length === 0 ? (
            <TableEmpty colSpan={6}>ยังไม่มีแพ็กเกจ</TableEmpty>
          ) : (
            packages.map((pkg) => (
              <TableRow
                key={pkg.id}
                clickable={canWrite}
                onClick={canWrite ? () => openEdit(pkg) : undefined}
              >
                <TableCell>
                  <div className="font-medium text-gray-900">{pkg.name}</div>
                  {pkg.description && (
                    <div className="mt-0.5 max-w-md truncate text-xs text-gray-400">
                      {pkg.description}
                    </div>
                  )}
                </TableCell>
                <TableCell align="center">
                  {pkg.care_level ? <CareLevelBadge level={pkg.care_level} /> : "—"}
                </TableCell>
                <TableCell align="center">
                  <StatusBadge tone="neutral">
                    {pkg.billing_cycle === "monthly" ? "รายเดือน" : "รายวัน"}
                  </StatusBadge>
                </TableCell>
                <TableCell align="center" tabular>
                  {subCount.get(pkg.id) ?? 0}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(pkg.price)}
                </TableCell>
                <TableCell align="center">
                  <StatusBadge tone={pkg.is_active ? "success" : "neutral"}>
                    {pkg.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Dialog เพิ่ม/แก้ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขแพ็กเกจ" : "เพิ่มแพ็กเกจใหม่"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label htmlFor="pkg-name">ชื่อแพ็กเกจ *</Label>
                <Input
                  id="pkg-name"
                  className="mt-1"
                  placeholder="เช่น แพ็กเกจดูแลช่วยเหลือ"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pkg-level">ระดับการดูแล</Label>
                  <CustomSelect
                    className="mt-1"
                    value={form.care_level}
                    onChange={(v) => setForm((f) => ({ ...f, care_level: v as CareLevel }))}
                    options={CARE_LEVEL_OPTS}
                  />
                </div>
                <div>
                  <Label htmlFor="pkg-cycle">รอบบิล</Label>
                  <CustomSelect
                    className="mt-1"
                    value={form.billing_cycle}
                    onChange={(v) =>
                      setForm((f) => ({ ...f, billing_cycle: v as PackageBillingCycle }))
                    }
                    options={[
                      { value: "monthly", label: "รายเดือน" },
                      { value: "daily", label: "รายวัน" },
                    ]}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="pkg-price">ราคา (฿) *</Label>
                <Input
                  id="pkg-price"
                  type="number"
                  className="mt-1"
                  placeholder="28000"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="pkg-desc">รายละเอียด</Label>
                <Input
                  id="pkg-desc"
                  className="mt-1"
                  placeholder="สิ่งที่รวมในแพ็กเกจ"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            {editing && (
              <Button
                variant={editing.is_active ? "destructive" : "secondary"}
                className="mr-auto"
                onClick={() => {
                  toggleActive(editing);
                  setDialogOpen(false);
                }}
              >
                {editing.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={handleSave}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NursingShell>
  );
}

function NoAccess() {
  return (
    <NursingShell title="แพ็กเกจค่าบริการ" icon={<Package className="h-6 w-6" />}>
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
        <div className="mb-4 rounded-full bg-gray-100 p-4">
          <ShieldX className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-sm font-medium text-gray-900">ไม่มีสิทธิ์เข้าถึง</h3>
        <p className="mt-1 text-sm text-gray-500">
          เฉพาะเจ้าของ/ผู้จัดการ และฝ่ายธุรการ/การเงิน เท่านั้น
        </p>
      </div>
    </NursingShell>
  );
}
