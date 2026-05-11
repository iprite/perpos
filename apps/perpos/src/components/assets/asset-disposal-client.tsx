"use client";

import React, { useState } from "react";
import cn from "@core/utils/class-names";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
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

import { disposeAssetAction, type AssetRow } from "@/lib/assets/actions";

type FormState = {
  disposal_date:   string;
  disposal_amount: string;
  notes:           string;
};

const emptyForm: FormState = {
  disposal_date:   "",
  disposal_amount: "0",
  notes:           "",
};

export function AssetDisposalClient({
  organizationId,
  activeAssets,
}: {
  organizationId: string;
  activeAssets: AssetRow[];
}) {
  const [rows, setRows] = useState<AssetRow[]>(activeAssets);
  const [selected, setSelected] = useState<AssetRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function openDispose(row: AssetRow) {
    setSelected(row);
    setForm({ disposal_date: new Date().toISOString().slice(0, 10), disposal_amount: String(row.cost - row.accumulated_depreciation), notes: "" });
    setErr(null);
  }

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!selected || !form.disposal_date) {
      setErr("กรุณาระบุวันที่จำหน่ายสินทรัพย์");
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await disposeAssetAction({
      organizationId,
      id:              selected.id,
      disposal_date:   form.disposal_date,
      disposal_amount: parseFloat(form.disposal_amount) || 0,
      notes:           form.notes.trim() || null,
    });
    setSaving(false);
    if (!res.ok) { setErr((res as any).error ?? "บันทึกไม่สำเร็จ"); return; }

    setRows((prev) => prev.filter((r) => r.id !== selected.id));
    setSelected(null);
  }

  const netValue = (row: AssetRow) => row.cost - row.accumulated_depreciation;

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>รหัส</TableHead>
            <TableHead>ชื่อสินทรัพย์</TableHead>
            <TableHead>วันที่ซื้อ</TableHead>
            <TableHead className="text-right">ราคาทุน</TableHead>
            <TableHead className="text-right">มูลค่าสุทธิ</TableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">
                ไม่มีสินทรัพย์ที่พร้อมจำหน่าย
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-slate-50">
                <TableCell className="font-mono text-sm">{row.asset_code}</TableCell>
                <TableCell className="text-sm font-medium text-slate-900">{row.name}</TableCell>
                <TableCell className="text-sm text-slate-600">
                  {row.purchase_date
                    ? new Date(row.purchase_date).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
                    : "—"}
                </TableCell>
                <TableCell className="text-right text-sm text-slate-700">
                  {row.cost.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right text-sm font-semibold text-slate-900">
                  {netValue(row).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => openDispose(row)}>
                    บันทึกจำหน่าย
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={!!selected} onOpenChange={(v) => { if (!v) setSelected(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>บันทึกจำหน่ายสินทรัพย์</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="grid gap-4 py-2">
              <p className="text-sm text-slate-600">
                สินทรัพย์: <span className="font-medium text-slate-900">{selected.name}</span>
              </p>
              <div className="space-y-1.5">
                <Label>วันที่จำหน่าย <span className="text-red-500">*</span></Label>
                <ThaiDatePicker value={form.disposal_date} onChange={(v) => set("disposal_date", v)} />
              </div>
              <div className="space-y-1.5">
                <Label>มูลค่าที่จำหน่าย (บาท)</Label>
                <Input type="number" value={form.disposal_amount} onChange={(e) => set("disposal_amount", e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>หมายเหตุ</Label>
                <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="หมายเหตุ" />
              </div>
              {err && <p className="text-sm text-red-500">{err}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึกจำหน่าย"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
