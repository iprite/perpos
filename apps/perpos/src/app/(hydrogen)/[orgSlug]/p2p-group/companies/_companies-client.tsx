"use client";

// ทะเบียนบริษัทในเครือ — ตาราง + dialog เพิ่ม/แก้ (คลิกที่แถวเพื่อแก้ ตาม DESIGN §5)
// หมายเหตุ: "ผูกกับองค์กรในระบบ" (org_ref_id) ตั้งได้เฉพาะ super_admin ผ่านฐานข้อมูล
// จึงไม่มีช่องให้แก้ในฟอร์มนี้ — หน้าแสดงสถานะการผูกอย่างเดียว (contract §4)

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { StatusBadge } from "@/components/ui/badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import { toast } from "@/lib/toast";
import type { P2pgCompany } from "@/lib/p2p-group/types";
import {
  COMPANY_STATUS_LABEL,
  COMPANY_TYPE_LABEL,
  formatMoney,
  formatThaiDate,
  toOptions,
} from "@/lib/p2p-group/labels";
import { p2pgMutate, withOrg } from "../_components/api";

type FormState = {
  name: string;
  legal_name: string;
  tax_id: string;
  company_type: string;
  company_status: string;
  ownership_pct: string;
  registered_capital: string;
  paid_up_capital: string;
  registered_date: string;
  fiscal_year_end_month: string;
  business_type: string;
  address: string;
  directors: string;
  note: string;
};

const EMPTY: FormState = {
  name: "",
  legal_name: "",
  tax_id: "",
  company_type: "subsidiary",
  company_status: "active",
  ownership_pct: "",
  registered_capital: "",
  paid_up_capital: "",
  registered_date: "",
  fiscal_year_end_month: "12",
  business_type: "",
  address: "",
  directors: "",
  note: "",
};

const MONTH_OPTIONS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
].map((label, i) => ({ value: String(i + 1), label }));

function toForm(c: P2pgCompany): FormState {
  return {
    name: c.name,
    legal_name: c.legal_name ?? "",
    tax_id: c.tax_id ?? "",
    company_type: c.company_type,
    company_status: c.company_status,
    ownership_pct: c.ownership_pct == null ? "" : String(c.ownership_pct),
    registered_capital: c.registered_capital == null ? "" : String(c.registered_capital),
    paid_up_capital: c.paid_up_capital == null ? "" : String(c.paid_up_capital),
    registered_date: c.registered_date ?? "",
    fiscal_year_end_month: c.fiscal_year_end_month == null ? "12" : String(c.fiscal_year_end_month),
    business_type: c.business_type ?? "",
    address: c.address ?? "",
    directors: (c.directors ?? []).join(", "),
    note: c.note ?? "",
  };
}

function toPayload(f: FormState): Record<string, unknown> {
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    name: f.name.trim(),
    legal_name: f.legal_name.trim() || null,
    tax_id: f.tax_id.trim() || null,
    company_type: f.company_type,
    company_status: f.company_status,
    ownership_pct: num(f.ownership_pct),
    registered_capital: num(f.registered_capital),
    paid_up_capital: num(f.paid_up_capital),
    registered_date: f.registered_date || null,
    fiscal_year_end_month: num(f.fiscal_year_end_month),
    business_type: f.business_type.trim() || null,
    address: f.address.trim() || null,
    directors: f.directors
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    note: f.note.trim() || null,
  };
}

export function CompaniesClient({
  initial,
  orgId,
  canWrite,
  canSeeMoney,
}: {
  initial: P2pgCompany[];
  orgId: string;
  canWrite: boolean;
  canSeeMoney: boolean;
}) {
  const pager = usePagination(initial);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<P2pgCompany | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(c: P2pgCompany) {
    setEditing(c);
    setForm(toForm(c));
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("กรุณากรอกชื่อบริษัท");
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(form);
      if (editing) {
        await p2pgMutate(
          withOrg(`/api/p2p-group/companies/${editing.id}`, orgId),
          "PATCH",
          payload,
        );
        toast.success("บันทึกการแก้ไขแล้ว");
      } else {
        await p2pgMutate(withOrg("/api/p2p-group/companies", orgId), "POST", payload);
        toast.success("เพิ่มบริษัทแล้ว");
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setSaving(true);
    try {
      await p2pgMutate(withOrg(`/api/p2p-group/companies/${editing.id}`, orgId), "DELETE");
      toast.success("ลบบริษัทแล้ว");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      title="บริษัทในเครือ"
      description="ทะเบียนบริษัทของกลุ่ม — สัดส่วนการถือหุ้น ทุนจดทะเบียน และข้อมูลนิติบุคคล"
      icon={<Building2 className="h-6 w-6" />}
      width="wide"
      actions={
        canWrite ? (
          <Button onClick={openCreate}>
            <Plus className="me-1 h-4 w-4" />
            เพิ่มบริษัท
          </Button>
        ) : undefined
      }
    >
      <Table className="shadow-sm" stickyHeader fillViewport>
        <TableHeader sticky>
          <TableRow>
            <TableHead>บริษัท</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead align="right">ถือหุ้น</TableHead>
            {canSeeMoney && <TableHead align="right">ทุนจดทะเบียน</TableHead>}
            <TableHead>เลขนิติบุคคล</TableHead>
            <TableHead align="center">จดทะเบียน</TableHead>
            <TableHead align="center">เชื่อมระบบบัญชี</TableHead>
            <TableHead align="center">สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {initial.length === 0 ? (
            <TableEmpty colSpan={canSeeMoney ? 8 : 7}>
              ยังไม่มีบริษัทในทะเบียน — กด &quot;เพิ่มบริษัท&quot; เพื่อเริ่มต้น
            </TableEmpty>
          ) : (
            pager.rows.map((c) => (
              <TableRow
                key={c.id}
                clickable={canWrite}
                onClick={canWrite ? () => openEdit(c) : undefined}
              >
                <TableCell>
                  <div className="font-medium text-gray-900">{c.name}</div>
                  {c.legal_name && <div className="text-xs text-gray-500">{c.legal_name}</div>}
                </TableCell>
                <TableCell>{COMPANY_TYPE_LABEL[c.company_type]}</TableCell>
                <TableCell align="right" className="tabular-nums">
                  {c.ownership_pct == null ? "—" : `${c.ownership_pct}%`}
                </TableCell>
                {canSeeMoney && (
                  <TableCell align="right" tabular>
                    {formatMoney(c.registered_capital)}
                  </TableCell>
                )}
                <TableCell tabular>{c.tax_id ?? "—"}</TableCell>
                <TableCell align="center" className="tabular-nums">
                  {formatThaiDate(c.registered_date)}
                </TableCell>
                <TableCell align="center">
                  {c.org_ref_id ? (
                    <StatusBadge tone="success">เชื่อมแล้ว</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">ยังไม่เชื่อม</StatusBadge>
                  )}
                </TableCell>
                <TableCell align="center">
                  <StatusBadge
                    tone={
                      c.company_status === "active"
                        ? "success"
                        : c.company_status === "dormant"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {COMPANY_STATUS_LABEL[c.company_status]}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <TablePager pager={pager} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขบริษัท" : "เพิ่มบริษัทในเครือ"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="c-name">ชื่อบริษัท (ชื่อย่อที่ใช้เรียก) *</Label>
                <Input
                  id="c-name"
                  className="mt-1"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="เช่น พีทูพี ซัพพลาย"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="c-legal">ชื่อนิติบุคคลเต็ม</Label>
                <Input
                  id="c-legal"
                  className="mt-1"
                  value={form.legal_name}
                  onChange={(e) => set("legal_name", e.target.value)}
                  placeholder="เช่น บริษัท พีทูพี ซัพพลาย จำกัด"
                />
              </div>
              <div>
                <Label htmlFor="c-type">ประเภท</Label>
                <CustomSelect
                  value={form.company_type}
                  onChange={(v) => set("company_type", v)}
                  options={toOptions(COMPANY_TYPE_LABEL)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="c-status">สถานะ</Label>
                <CustomSelect
                  value={form.company_status}
                  onChange={(v) => set("company_status", v)}
                  options={toOptions(COMPANY_STATUS_LABEL)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="c-pct">สัดส่วนการถือหุ้น (%)</Label>
                <Input
                  id="c-pct"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  className="mt-1"
                  value={form.ownership_pct}
                  onChange={(e) => set("ownership_pct", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="c-tax">เลขประจำตัวผู้เสียภาษี (13 หลัก)</Label>
                <Input
                  id="c-tax"
                  className="mt-1"
                  inputMode="numeric"
                  value={form.tax_id}
                  onChange={(e) => set("tax_id", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="c-cap">ทุนจดทะเบียน (฿)</Label>
                <Input
                  id="c-cap"
                  type="number"
                  min={0}
                  className="mt-1"
                  value={form.registered_capital}
                  onChange={(e) => set("registered_capital", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="c-paid">ทุนชำระแล้ว (฿)</Label>
                <Input
                  id="c-paid"
                  type="number"
                  min={0}
                  className="mt-1"
                  value={form.paid_up_capital}
                  onChange={(e) => set("paid_up_capital", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="c-regdate">วันที่จดทะเบียน</Label>
                <div className="mt-1">
                  <ThaiDatePicker
                    value={form.registered_date}
                    onChange={(iso) => set("registered_date", iso)}
                    placeholder="เลือกวันที่"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="c-fy">เดือนสิ้นรอบบัญชี</Label>
                <CustomSelect
                  value={form.fiscal_year_end_month}
                  onChange={(v) => set("fiscal_year_end_month", v)}
                  options={MONTH_OPTIONS}
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="c-biz">ประเภทธุรกิจ</Label>
                <Input
                  id="c-biz"
                  className="mt-1"
                  value={form.business_type}
                  onChange={(e) => set("business_type", e.target.value)}
                  placeholder="เช่น จำหน่ายวัสดุก่อสร้าง"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="c-dir">กรรมการ (คั่นด้วยจุลภาค)</Label>
                <Input
                  id="c-dir"
                  className="mt-1"
                  value={form.directors}
                  onChange={(e) => set("directors", e.target.value)}
                  placeholder="สมชาย ใจดี, สมหญิง รักงาน"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="c-addr">ที่อยู่</Label>
                <Input
                  id="c-addr"
                  className="mt-1"
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="c-note">หมายเหตุ</Label>
                <Input
                  id="c-note"
                  className="mt-1"
                  value={form.note}
                  onChange={(e) => set("note", e.target.value)}
                />
              </div>
              {editing && (
                <p className="text-xs text-gray-500 sm:col-span-2">
                  การเชื่อมบริษัทนี้กับองค์กรในระบบ (เพื่อดึงตัวเลขจากระบบบัญชีอัตโนมัติ)
                  ตั้งได้โดยผู้ดูแลระบบเท่านั้น
                </p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            {editing && (
              <Button variant="destructive" className="mr-auto" disabled={saving} onClick={remove}>
                ลบ
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
