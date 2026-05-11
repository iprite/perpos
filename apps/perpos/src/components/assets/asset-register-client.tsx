"use client";

import React, { useState } from "react";
import cn from "@core/utils/class-names";
import { MoreVertical, PencilLine, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { upsertAssetAction, type AssetRow } from "@/lib/assets/actions";

const STATUS_LABELS: Record<string, string> = {
  active:   "ใช้งานอยู่",
  disposed: "จำหน่ายแล้ว",
  idle:     "ไม่ได้ใช้งาน",
};

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-teal-50 text-teal-700",
  disposed: "bg-red-50 text-red-600",
  idle:     "bg-slate-100 text-slate-600",
};

const ASSET_TYPES = [
  { value: "land",        label: "ที่ดิน" },
  { value: "building",    label: "อาคาร" },
  { value: "equipment",   label: "เครื่องจักร/อุปกรณ์" },
  { value: "vehicle",     label: "ยานพาหนะ" },
  { value: "furniture",   label: "เครื่องตกแต่ง/เฟอร์นิเจอร์" },
  { value: "it",          label: "คอมพิวเตอร์/IT" },
  { value: "other",       label: "อื่นๆ" },
];

const DEPR_METHODS = [
  { value: "straight_line",     label: "เส้นตรง (Straight-line)" },
  { value: "declining_balance", label: "ยอดคงเหลือลดลง (Declining Balance)" },
  { value: "none",              label: "ไม่คิดค่าเสื่อมราคา" },
];

const STATUS_OPTIONS = [
  { value: "active",   label: "ใช้งานอยู่" },
  { value: "idle",     label: "ไม่ได้ใช้งาน" },
  { value: "disposed", label: "จำหน่ายแล้ว" },
];

type FormState = {
  asset_code:              string;
  name:                    string;
  asset_type:              string;
  purchase_date:           string;
  cost:                    string;
  residual_value:          string;
  useful_life_months:      string;
  depreciation_method:     string;
  accumulated_depreciation: string;
  notes:                   string;
  status:                  string;
};

const emptyForm: FormState = {
  asset_code:              "",
  name:                    "",
  asset_type:              "equipment",
  purchase_date:           "",
  cost:                    "",
  residual_value:          "0",
  useful_life_months:      "60",
  depreciation_method:     "straight_line",
  accumulated_depreciation: "0",
  notes:                   "",
  status:                  "active",
};

function ActionMenu({ onEdit }: { onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-28 overflow-hidden rounded-md border border-slate-200 bg-white shadow-md">
            <button
              type="button"
              onClick={() => { setOpen(false); onEdit(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <PencilLine className="h-3.5 w-3.5" />
              แก้ไข
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function AssetRegisterClient({
  organizationId,
  initialRows,
}: {
  organizationId: string;
  initialRows: AssetRow[];
}) {
  const [rows, setRows] = useState<AssetRow[]>(initialRows);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErr(null);
    setDialogOpen(true);
  }

  function openEdit(row: AssetRow) {
    setEditing(row);
    setForm({
      asset_code:              row.asset_code,
      name:                    row.name,
      asset_type:              row.asset_type,
      purchase_date:           row.purchase_date ?? "",
      cost:                    String(row.cost),
      residual_value:          String(row.residual_value),
      useful_life_months:      String(row.useful_life_months),
      depreciation_method:     row.depreciation_method,
      accumulated_depreciation: String(row.accumulated_depreciation),
      notes:                   row.notes ?? "",
      status:                  row.status,
    });
    setErr(null);
    setDialogOpen(true);
  }

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.asset_code.trim() || !form.name.trim()) {
      setErr("กรุณากรอกรหัสและชื่อสินทรัพย์");
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await upsertAssetAction({
      organizationId,
      id:                      editing?.id,
      asset_code:              form.asset_code.trim(),
      name:                    form.name.trim(),
      asset_type:              form.asset_type,
      purchase_date:           form.purchase_date || null,
      cost:                    parseFloat(form.cost) || 0,
      residual_value:          parseFloat(form.residual_value) || 0,
      useful_life_months:      parseInt(form.useful_life_months) || 60,
      depreciation_method:     form.depreciation_method,
      accumulated_depreciation: parseFloat(form.accumulated_depreciation) || 0,
      notes:                   form.notes.trim() || null,
      status:                  form.status as AssetRow["status"],
    });
    setSaving(false);
    if (!res.ok) { setErr((res as any).error ?? "บันทึกไม่สำเร็จ"); return; }

    const updated: AssetRow = {
      id:                      editing?.id ?? String(Date.now()),
      organization_id:         organizationId,
      asset_code:              form.asset_code.trim(),
      name:                    form.name.trim(),
      asset_type:              form.asset_type,
      purchase_date:           form.purchase_date || null,
      cost:                    parseFloat(form.cost) || 0,
      residual_value:          parseFloat(form.residual_value) || 0,
      useful_life_months:      parseInt(form.useful_life_months) || 60,
      depreciation_method:     form.depreciation_method,
      accumulated_depreciation: parseFloat(form.accumulated_depreciation) || 0,
      asset_account_id:        editing?.asset_account_id ?? null,
      depreciation_account_id: editing?.depreciation_account_id ?? null,
      accum_depr_account_id:   editing?.accum_depr_account_id ?? null,
      disposal_date:           editing?.disposal_date ?? null,
      disposal_amount:         editing?.disposal_amount ?? null,
      notes:                   form.notes.trim() || null,
      status:                  form.status as AssetRow["status"],
    };
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === editing?.id);
      if (idx >= 0) { const c = [...prev]; c[idx] = updated; return c; }
      return [...prev, updated];
    });
    setDialogOpen(false);
  }

  const netValue = (row: AssetRow) => row.cost - row.accumulated_depreciation;

  const assetTypeLabel = (type: string) =>
    ASSET_TYPES.find((t) => t.value === type)?.label ?? type;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1 h-4 w-4" /> เพิ่มสินทรัพย์
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>รหัส</TableHead>
            <TableHead>ชื่อสินทรัพย์</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead>วันที่ซื้อ</TableHead>
            <TableHead className="text-right">ราคาทุน</TableHead>
            <TableHead className="text-right">ค่าเสื่อมราคาสะสม</TableHead>
            <TableHead className="text-right">มูลค่าสุทธิ</TableHead>
            <TableHead className="w-32 text-center">สถานะ</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center text-sm text-slate-400">
                ยังไม่มีข้อมูลสินทรัพย์ — กดปุ่ม &ldquo;เพิ่มสินทรัพย์&rdquo; เพื่อเริ่มต้น
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-slate-50">
                <TableCell className="font-mono text-sm">{row.asset_code}</TableCell>
                <TableCell className="text-sm font-medium text-slate-900">{row.name}</TableCell>
                <TableCell className="text-sm text-slate-600">{assetTypeLabel(row.asset_type)}</TableCell>
                <TableCell className="text-sm text-slate-600">
                  {row.purchase_date
                    ? new Date(row.purchase_date).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
                    : "—"}
                </TableCell>
                <TableCell className="text-right text-sm text-slate-700">
                  {row.cost.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right text-sm text-slate-700">
                  {row.accumulated_depreciation.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right text-sm font-semibold text-slate-900">
                  {netValue(row).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-center">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_COLORS[row.status] ?? "bg-slate-100 text-slate-600")}>
                    {STATUS_LABELS[row.status] ?? row.status}
                  </span>
                </TableCell>
                <TableCell>
                  <ActionMenu onEdit={() => openEdit(row)} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setDialogOpen(false); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขข้อมูลสินทรัพย์" : "เพิ่มสินทรัพย์ใหม่"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>รหัสสินทรัพย์ <span className="text-red-500">*</span></Label>
                <Input value={form.asset_code} onChange={(e) => set("asset_code", e.target.value)} placeholder="FA001" />
              </div>
              <div className="space-y-1.5">
                <Label>ประเภทสินทรัพย์</Label>
                <CustomSelect value={form.asset_type} onChange={(v) => set("asset_type", v)} options={ASSET_TYPES} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>ชื่อสินทรัพย์ <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="ชื่อสินทรัพย์" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>วันที่ซื้อ</Label>
                <ThaiDatePicker value={form.purchase_date} onChange={(v) => set("purchase_date", v)} />
              </div>
              <div className="space-y-1.5">
                <Label>ราคาทุน (บาท)</Label>
                <Input type="number" value={form.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>มูลค่าซาก (บาท)</Label>
                <Input type="number" value={form.residual_value} onChange={(e) => set("residual_value", e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>อายุการใช้งาน (เดือน)</Label>
                <Input type="number" value={form.useful_life_months} onChange={(e) => set("useful_life_months", e.target.value)} placeholder="60" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>วิธีคิดค่าเสื่อมราคา</Label>
                <CustomSelect value={form.depreciation_method} onChange={(v) => set("depreciation_method", v)} options={DEPR_METHODS} />
              </div>
              <div className="space-y-1.5">
                <Label>ค่าเสื่อมราคาสะสม (บาท)</Label>
                <Input type="number" value={form.accumulated_depreciation} onChange={(e) => set("accumulated_depreciation", e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>สถานะ</Label>
                <CustomSelect value={form.status} onChange={(v) => set("status", v)} options={STATUS_OPTIONS} />
              </div>
              <div className="space-y-1.5">
                <Label>หมายเหตุ</Label>
                <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="หมายเหตุ" />
              </div>
            </div>
            {err && <p className="text-sm text-red-500">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
