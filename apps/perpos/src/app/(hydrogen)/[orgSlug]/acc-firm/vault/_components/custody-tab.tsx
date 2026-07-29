"use client";

// custody-tab.tsx — ทะเบียนรับ-ส่งเอกสารตัวจริง (ใครเอาไป/คืนเมื่อไร) + ออกเลขที่ใบรับ

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/badge";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { SegmentedControl } from "@/components/ui/segmented";
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
import { TablePager, usePagination } from "@/components/ui/table-pager";
import { toast } from "@/lib/toast";
import {
  CUSTODY_DIRECTION_LABELS,
  CUSTODY_METHOD_LABELS,
  type CustodyDirection,
  type CustodyEntry,
  type CustodyMethod,
} from "@/lib/acc-firm/vault/types";
import { useVaultApi } from "./api";
import { fmtDateTime } from "./format";

const METHOD_OPTIONS = (Object.keys(CUSTODY_METHOD_LABELS) as CustodyMethod[]).map((m) => ({
  value: m,
  label: CUSTODY_METHOD_LABELS[m],
}));

const EMPTY_FORM = {
  method: "in_person" as CustodyMethod,
  itemSummary: "",
  itemCount: "",
  handedBy: "",
  occurredDate: "",
  note: "",
};

export function CustodyTab({
  orgId,
  clientId,
  canWrite,
  entries: initialEntries,
}: {
  orgId: string;
  clientId: string;
  canWrite: boolean;
  entries: CustodyEntry[];
}) {
  const api = useVaultApi(orgId);
  const [entries, setEntries] = useState(initialEntries);
  const pager = usePagination(entries);
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<CustodyDirection>("in");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function openDialog(dir: CustodyDirection) {
    setDirection(dir);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  async function submit() {
    if (!form.itemSummary.trim()) return;
    setSaving(true);
    try {
      const created = await api.createCustody({
        clientId,
        direction,
        method: form.method,
        itemSummary: form.itemSummary.trim(),
        itemCount: form.itemCount ? Number(form.itemCount) : undefined,
        handedBy: form.handedBy.trim() || undefined,
        occurredAt: form.occurredDate ? `${form.occurredDate}T00:00:00.000Z` : undefined,
        note: form.note.trim() || undefined,
      });
      const res = await api.fetchCustody(clientId);
      setEntries(res.entries as CustodyEntry[]);
      setOpen(false);
      toast.success(`บันทึกแล้ว — เลขที่ใบรับ ${created.receiptNo}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => openDialog("in")}>
            <ArrowDownLeft className="mr-1 h-4 w-4" /> บันทึกรับเอกสาร
          </Button>
          <Button size="sm" variant="outline" onClick={() => openDialog("out")}>
            <ArrowUpRight className="mr-1 h-4 w-4" /> บันทึกคืนเอกสาร
          </Button>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="mb-4 rounded-full bg-gray-100 p-4">
            <ClipboardList className="h-8 w-8 text-gray-400" />
          </div>
          <Text className="text-sm font-medium text-gray-900">ยังไม่มีประวัติรับ-ส่งเอกสาร</Text>
          <Text className="mt-1 text-sm text-gray-500">
            บันทึกทุกครั้งที่รับเอกสารตัวจริงจากลูกค้าหรือส่งคืน — ระบบออกเลขที่ใบรับให้อัตโนมัติ
          </Text>
          {canWrite && (
            <Button className="mt-4" size="sm" onClick={() => openDialog("in")}>
              <ArrowDownLeft className="mr-1 h-4 w-4" /> บันทึกรับเอกสาร
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>เลขที่ใบรับ</TableHead>
                <TableHead align="center">ทิศทาง</TableHead>
                <TableHead>รายการ</TableHead>
                <TableHead align="right">จำนวน</TableHead>
                <TableHead>ช่องทาง</TableHead>
                <TableHead>ผู้ส่งมอบ</TableHead>
                <TableHead>เมื่อ</TableHead>
                <TableHead>ผู้รับของสำนักงาน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableEmpty colSpan={8}>ยังไม่มีรายการ</TableEmpty>
              ) : (
                pager.rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell align="left" tabular className="text-gray-700">
                      {e.receiptNo ?? "—"}
                    </TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={e.direction === "in" ? "info" : "neutral"}>
                        {CUSTODY_DIRECTION_LABELS[e.direction]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-gray-800">
                      {e.itemSummary}
                      {e.note && (
                        <Text className="mt-0.5 text-xs text-gray-500">หมายเหตุ: {e.note}</Text>
                      )}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums text-gray-700">
                      {e.itemCount == null ? "—" : `${e.itemCount} รายการ`}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {CUSTODY_METHOD_LABELS[e.method]}
                    </TableCell>
                    <TableCell className="text-gray-600">{e.handedBy ?? "—"}</TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {fmtDateTime(e.occurredAt)}
                    </TableCell>
                    <TableCell className="text-gray-600">{e.receivedByName ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePager pager={pager} />
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {direction === "in" ? "บันทึกรับเอกสารจากลูกค้า" : "บันทึกคืนเอกสารให้ลูกค้า"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label>ทิศทาง *</Label>
                <div className="mt-1">
                  <SegmentedControl
                    value={direction}
                    onChange={setDirection}
                    size="md"
                    options={[
                      {
                        value: "in",
                        label: CUSTODY_DIRECTION_LABELS.in,
                        icon: <ArrowDownLeft className="h-4 w-4" />,
                      },
                      {
                        value: "out",
                        label: CUSTODY_DIRECTION_LABELS.out,
                        icon: <ArrowUpRight className="h-4 w-4" />,
                      },
                    ]}
                  />
                </div>
              </div>
              <div>
                <Label>ช่องทาง *</Label>
                <CustomSelect
                  value={form.method}
                  onChange={(v) => setForm((f) => ({ ...f, method: v as CustodyMethod }))}
                  options={METHOD_OPTIONS}
                  className="mt-1 w-full"
                />
              </div>
              <div>
                <Label htmlFor="custody-summary">รายการเอกสาร *</Label>
                <Textarea
                  id="custody-summary"
                  className="mt-1"
                  rows={3}
                  value={form.itemSummary}
                  onChange={(e) => setForm((f) => ({ ...f, itemSummary: e.target.value }))}
                  placeholder="เช่น แฟ้มใบกำกับซื้อ ม.ค.–มี.ค. 2569 จำนวน 3 แฟ้ม"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="custody-count">จำนวน (รายการ/แฟ้ม)</Label>
                  <Input
                    id="custody-count"
                    type="number"
                    min={0}
                    className="mt-1"
                    value={form.itemCount}
                    onChange={(e) => setForm((f) => ({ ...f, itemCount: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label htmlFor="custody-handed-by">ผู้ส่งมอบ / ผู้รับจากฝั่งลูกค้า</Label>
                  <Input
                    id="custody-handed-by"
                    className="mt-1"
                    value={form.handedBy}
                    onChange={(e) => setForm((f) => ({ ...f, handedBy: e.target.value }))}
                    placeholder="ชื่อผู้ส่งมอบ"
                  />
                </div>
              </div>
              <div>
                <Label>วันที่รับ-ส่ง</Label>
                <ThaiDatePicker
                  value={form.occurredDate}
                  onChange={(v) => setForm((f) => ({ ...f, occurredDate: v }))}
                  placeholder="ไม่ระบุ = วันนี้"
                />
              </div>
              <div>
                <Label htmlFor="custody-note">หมายเหตุ</Label>
                <Input
                  id="custody-note"
                  className="mt-1"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="รายละเอียดเพิ่มเติม"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={submit} disabled={saving || !form.itemSummary.trim()}>
              {saving ? "กำลังบันทึก…" : "บันทึกและออกเลขที่ใบรับ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
