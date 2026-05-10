"use client";

import React, { useState, useTransition } from "react";
import { Plus, Pencil, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { upsertContactAction, toggleContactActiveAction, type ContactRow } from "@/lib/contacts/actions";
import cn from "@core/utils/class-names";

type Props = {
  organizationId: string;
  contactType: "customer" | "vendor";
  initialRows: ContactRow[];
};

const EMPTY_FORM = {
  name: "", taxId: "", email: "", phone: "", address: "", notes: "",
};

export function ContactsClient({ organizationId, contactType, initialRows }: Props) {
  const [rows, setRows]           = useState<ContactRow[]>(initialRows);
  const [open, setOpen]           = useState(false);
  const [editing, setEditing]     = useState<ContactRow | null>(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [pending, startTransition] = useTransition();

  const label = contactType === "customer" ? "ลูกค้า" : "ผู้ขาย";

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (row: ContactRow) => {
    setEditing(row);
    setForm({
      name:    row.name,
      taxId:   row.taxId   ?? "",
      email:   row.email   ?? "",
      phone:   row.phone   ?? "",
      address: row.address ?? "",
      notes:   row.notes   ?? "",
    });
    setOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) { toast.error("กรุณากรอกชื่อ"); return; }
    startTransition(async () => {
      const res = await upsertContactAction({
        organizationId,
        id:          editing?.id,
        name:        form.name,
        contactType,
        taxId:       form.taxId   || undefined,
        email:       form.email   || undefined,
        phone:       form.phone   || undefined,
        address:     form.address || undefined,
        notes:       form.notes   || undefined,
        isActive:    editing?.isActive ?? true,
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(editing ? "แก้ไขแล้ว" : `เพิ่ม${label}แล้ว`);
      setOpen(false);
      // Optimistic update
      const newRow: ContactRow = {
        id:          res.id,
        name:        form.name,
        contactType,
        taxId:       form.taxId   || null,
        email:       form.email   || null,
        phone:       form.phone   || null,
        address:     form.address || null,
        notes:       form.notes   || null,
        isActive:    editing?.isActive ?? true,
      };
      setRows((prev) =>
        editing ? prev.map((r) => (r.id === editing.id ? newRow : r)) : [newRow, ...prev]
      );
    });
  };

  const toggleActive = (row: ContactRow) => {
    startTransition(async () => {
      const res = await toggleContactActiveAction({ organizationId, id: row.id, isActive: !row.isActive });
      if (!res.ok) { toast.error(res.error); return; }
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, isActive: !r.isActive } : r));
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button className="gap-2" onClick={openNew}>
          <Plus className="h-4 w-4" />
          เพิ่ม{label}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อ</TableHead>
              <TableHead>เลขประจำตัวผู้เสียภาษี</TableHead>
              <TableHead>โทรศัพท์</TableHead>
              <TableHead>อีเมล</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">ยังไม่มี{label}</TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className={cn(!row.isActive && "opacity-50")}>
                  <TableCell className="font-medium text-sm">{row.name}</TableCell>
                  <TableCell className="font-mono text-sm">{row.taxId || "-"}</TableCell>
                  <TableCell className="text-sm">{row.phone || "-"}</TableCell>
                  <TableCell className="text-sm">{row.email || "-"}</TableCell>
                  <TableCell>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
                      row.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                      {row.isActive ? "ใช้งาน" : "ปิดใช้"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(row)}
                        className="rounded p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => toggleActive(row)}
                        className="rounded p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                        title={row.isActive ? "ปิดใช้" : "เปิดใช้"}
                      >
                        {row.isActive
                          ? <ToggleRight className="h-4 w-4 text-emerald-600" />
                          : <ToggleLeft  className="h-4 w-4" />}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `แก้ไข${label}` : `เพิ่ม${label}ใหม่`}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>ชื่อ <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={`ชื่อ${label}`} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>เลขประจำตัวผู้เสียภาษี</Label>
                <Input value={form.taxId} onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))} placeholder="0-0000-00000-00-0" />
              </div>
              <div className="grid gap-2">
                <Label>โทรศัพท์</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="0x-xxx-xxxx" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>อีเมล</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="example@email.com" />
            </div>
            <div className="grid gap-2">
              <Label>ที่อยู่</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="ที่อยู่" />
            </div>
            <div className="grid gap-2">
              <Label>หมายเหตุ</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="(ไม่บังคับ)" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>ยกเลิก</Button>
              <Button onClick={save} disabled={pending}>{editing ? "บันทึกการแก้ไข" : `เพิ่ม${label}`}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
