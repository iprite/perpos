"use client";

/**
 * _vendors-client.tsx — ตาราง + กล่องเพิ่ม/แก้ผู้ขาย
 * ข้อมูลมาจาก server component (searchParams-driven) · ที่นี่แค่กดแล้วยิง mutation
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Truck } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterBar, FilterClear, FilterSearch } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePagination, TablePager } from "@/components/ui/table-pager";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { jmSend } from "../_components/api-client";

export interface VendorRow {
  id: string;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contact_name: string | null;
  note: string | null;
  is_active: boolean;
  /** null = ผู้ใช้ไม่มีสิทธิ์เห็นข้อมูลจัดซื้อ */
  win_count: number | null;
}

interface VendorForm {
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  tax_id: string;
  address: string;
  note: string;
  is_active: boolean;
}

const EMPTY: VendorForm = {
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  tax_id: "",
  address: "",
  note: "",
  is_active: true,
};

export function VendorsClient({
  orgId,
  canWrite,
  canSeeCost,
  rows,
  q,
  includeInactive,
}: {
  orgId: string;
  canWrite: boolean;
  canSeeCost: boolean;
  rows: VendorRow[];
  q: string;
  includeInactive: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [term, setTerm] = useState(q);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VendorRow | null>(null);
  const [form, setForm] = useState<VendorForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const pager = usePagination(rows, { pageSize: 20 });

  useEffect(() => setTerm(q), [q]);

  function apply(next: { q?: string; inactive?: boolean }) {
    const params = new URLSearchParams();
    const nextQ = next.q ?? term;
    const nextInactive = next.inactive ?? includeInactive;
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (nextInactive) params.set("inactive", "1");
    const s = params.toString();
    startTransition(() => router.push(s ? `?${s}` : "?"));
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(row: VendorRow) {
    if (!canWrite) return;
    setEditing(row);
    setForm({
      name: row.name,
      contact_name: row.contact_name ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      tax_id: row.tax_id ?? "",
      address: row.address ?? "",
      note: row.note ?? "",
      is_active: row.is_active,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      notify.error("กรุณาระบุชื่อผู้ขาย");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        tax_id: form.tax_id.trim() || null,
        address: form.address.trim() || null,
        note: form.note.trim() || null,
        is_active: form.is_active,
      };
      if (editing) {
        await jmSend(orgId, "vendors", "PATCH", { ...body, id: editing.id });
        notify.updated("บันทึกข้อมูลผู้ขายแล้ว");
      } else {
        await jmSend(orgId, "vendors", "POST", body);
        notify.created("เพิ่มผู้ขายแล้ว");
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      notify.error(e, "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const colSpan = canSeeCost ? 6 : 5;

  return (
    <div className="space-y-3">
      <FilterBar>
        <FilterSearch
          value={term}
          onChange={setTerm}
          onEnter={() => apply({ q: term })}
          placeholder="ค้นหา ชื่อผู้ขาย / ผู้ติดต่อ / เบอร์ (กด Enter)"
        />
        <SegmentedControl
          value={includeInactive ? "all" : "active"}
          onChange={(v) => apply({ inactive: v === "all" })}
          ariaLabel="สถานะผู้ขาย"
          options={[
            { value: "active", label: "ใช้งานอยู่" },
            { value: "all", label: "รวมที่เลิกใช้" },
          ]}
        />
        <FilterClear
          onClick={() => apply({ q: "", inactive: false })}
          disabled={!q && !includeInactive && !term}
        />
        {canWrite && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> เพิ่มผู้ขาย
          </Button>
        )}
      </FilterBar>

      <Table stickyHeader fillViewport>
        <TableHeader sticky>
          <TableRow>
            <TableHead>ชื่อผู้ขาย</TableHead>
            <TableHead>ผู้ติดต่อ</TableHead>
            <TableHead>เบอร์โทร</TableHead>
            <TableHead>เลขผู้เสียภาษี</TableHead>
            {canSeeCost && <TableHead align="right">ชนะราคา (ครั้ง)</TableHead>}
            <TableHead align="center">สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pager.rows.length === 0 ? (
            <TableEmpty colSpan={colSpan}>
              <div className="flex flex-col items-center gap-2 py-6">
                <div className="rounded-full bg-gray-100 p-4">
                  <Truck className="h-8 w-8 text-gray-400" />
                </div>
                <Text className="text-sm font-medium text-gray-900">ยังไม่มีผู้ขายในทะเบียน</Text>
                <Text className="text-sm text-gray-500">
                  เพิ่มร้าน/ซัพพลายเออร์ที่ใช้ประจำ แล้วนำไปเทียบราคาในใบขอซื้อได้ทันที
                </Text>
                {canWrite && (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> เพิ่มผู้ขายรายแรก
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            pager.rows.map((row) => (
              <TableRow key={row.id} clickable={canWrite} onClick={() => openEdit(row)}>
                <TableCell className="font-medium text-gray-900">{row.name}</TableCell>
                <TableCell>{row.contact_name || "—"}</TableCell>
                <TableCell>{row.phone || "—"}</TableCell>
                <TableCell className="font-mono text-xs text-gray-500">
                  {row.tax_id || "—"}
                </TableCell>
                {canSeeCost && (
                  <TableCell align="right" className="tabular-nums">
                    {row.win_count === null ? "—" : row.win_count.toLocaleString("th-TH")}
                  </TableCell>
                )}
                <TableCell align="center">
                  <StatusBadge tone={row.is_active ? "success" : "neutral"}>
                    {row.is_active ? "ใช้งาน" : "เลิกใช้"}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <TablePager pager={pager} unit="ราย" />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขข้อมูลผู้ขาย" : "เพิ่มผู้ขาย"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="jm-vendor-name">ชื่อผู้ขาย *</Label>
                <Input
                  id="jm-vendor-name"
                  className="mt-1"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="เช่น ร้านไฟฟ้าเจริญพาณิชย์"
                />
              </div>
              <div>
                <Label htmlFor="jm-vendor-contact">ผู้ติดต่อ</Label>
                <Input
                  id="jm-vendor-contact"
                  className="mt-1"
                  value={form.contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="jm-vendor-phone">เบอร์โทร</Label>
                <Input
                  id="jm-vendor-phone"
                  className="mt-1"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="jm-vendor-email">อีเมล</Label>
                <Input
                  id="jm-vendor-email"
                  className="mt-1"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="jm-vendor-tax">เลขประจำตัวผู้เสียภาษี</Label>
                <Input
                  id="jm-vendor-tax"
                  className="mt-1"
                  value={form.tax_id}
                  onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="jm-vendor-address">ที่อยู่</Label>
                <Input
                  id="jm-vendor-address"
                  className="mt-1"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="jm-vendor-note">หมายเหตุ</Label>
                <Input
                  id="jm-vendor-note"
                  className="mt-1"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="เงื่อนไขเครดิต / ของที่ถนัด"
                />
              </div>
              <div>
                <Label>สถานะการใช้งาน</Label>
                <div className="mt-1">
                  <SegmentedControl
                    size="md"
                    value={form.is_active ? "active" : "inactive"}
                    onChange={(v) => setForm((f) => ({ ...f, is_active: v === "active" }))}
                    ariaLabel="สถานะการใช้งานผู้ขาย"
                    options={[
                      { value: "active", label: "ใช้งาน" },
                      { value: "inactive", label: "เลิกใช้" },
                    ]}
                  />
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={saving || !canWrite}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
