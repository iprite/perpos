"use client";

/**
 * _usage-tab.tsx — "ใช้จริง" ของโครงการ
 *   1. วัสดุที่เบิกจากคลังเข้าโครงการนี้ (`just_me_stock_movements` type `issue`)
 *   2. ต้นทุนนอกคลัง (ค่าแรง/ผู้รับเหมาช่วง/ขนส่ง)
 *   3. บันทึกความคืบหน้าหน้างาน
 *
 * ⛔ viewer เห็น **ปริมาณ** แต่ไม่เห็นมูลค่า (server ส่งแถวจาก view ที่ไม่มีคอลัมน์ต้นทุนมาแล้ว)
 * ⛔ ต้นทุนวัสดุคิดโดย trigger ของคลัง — หน้านี้แสดงอย่างเดียว ห้ามคำนวณเอง
 */

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { TablePager, usePagination } from "@/components/ui/table-pager";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { PROJECT_COST_KIND_LABEL, labelOf } from "@/lib/just-me/labels";
import type {
  JustMeProjectCost,
  JustMeProjectProgress,
  JustMeProjectUsageRow,
  ProjectCostKind,
} from "@/lib/just-me/types";
import { jmSend } from "../../_components/api-client";
import { money, qtyText, thaiDate } from "../../_components/format";

const COST_KIND_OPTIONS = (Object.keys(PROJECT_COST_KIND_LABEL) as ProjectCostKind[]).map((k) => ({
  value: k,
  label: PROJECT_COST_KIND_LABEL[k],
}));

export function UsageTab({
  orgId,
  projectId,
  canWrite,
  canSeeCost,
  usage,
  itemNames,
  costs,
  progress,
  approvedItems,
  onChanged,
}: {
  orgId: string;
  projectId: string;
  canWrite: boolean;
  canSeeCost: boolean;
  usage: JustMeProjectUsageRow[];
  itemNames: Record<string, string>;
  costs: JustMeProjectCost[];
  progress: JustMeProjectProgress[];
  approvedItems: { id: string; name: string; unit: string; qty: number }[];
  onChanged: () => void;
}) {
  const issued = usage.filter((u) => u.movement_type === "issue");
  const usagePager = usePagination(issued, { pageSize: 10 });
  const costPager = usePagination(costs, { pageSize: 10 });
  const progressPager = usePagination(progress, { pageSize: 10 });

  const [costOpen, setCostOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* ── วัสดุที่เบิกใช้ ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Text className="px-1 text-sm font-semibold text-gray-900">วัสดุที่เบิกเข้าโครงการ</Text>
          <Text className="text-xs text-gray-500">
            เบิกของได้ที่หน้าคลัง → แท็บ &quot;เบิกโอน&quot; แล้วเลือกโครงการนี้
          </Text>
        </div>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>วันที่</TableHead>
              <TableHead>วัสดุ</TableHead>
              <TableHead align="right">จำนวน</TableHead>
              <TableHead>ผู้เบิก</TableHead>
              {canSeeCost && <TableHead align="right">มูลค่า</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {usagePager.rows.length === 0 ? (
              <TableEmpty colSpan={canSeeCost ? 5 : 4}>
                ยังไม่มีการเบิกวัสดุเข้าโครงการนี้
              </TableEmpty>
            ) : (
              usagePager.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{thaiDate(row.created_at?.slice(0, 10))}</TableCell>
                  <TableCell>{itemNames[row.item_id] ?? "—"}</TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {qtyText(row.quantity)}
                  </TableCell>
                  <TableCell>{row.requester_name || "—"}</TableCell>
                  {canSeeCost && (
                    <TableCell align="right" tabular>
                      {money(row.total_cost)}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePager pager={usagePager} unit="รายการ" />
      </div>

      {/* ── ต้นทุนนอกคลัง (เฉพาะผู้มีสิทธิ์เห็นต้นทุน) ── */}
      {canSeeCost && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Text className="px-1 text-sm font-semibold text-gray-900">
              ต้นทุนนอกคลัง (ค่าแรง/ผู้รับเหมาช่วง/ขนส่ง)
            </Text>
            {canWrite && (
              <Button size="sm" variant="outline" onClick={() => setCostOpen(true)}>
                <Plus className="h-4 w-4" /> บันทึกต้นทุน
              </Button>
            )}
          </div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>วันที่</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead>รายละเอียด</TableHead>
                <TableHead align="right">จำนวนเงิน</TableHead>
                {canWrite && <TableHead align="center">ลบ</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {costPager.rows.length === 0 ? (
                <TableEmpty colSpan={canWrite ? 5 : 4}>
                  ยังไม่มีต้นทุนนอกคลัง — ค่าแรงและผู้รับเหมาช่วงบันทึกที่นี่
                </TableEmpty>
              ) : (
                costPager.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{thaiDate(row.cost_date)}</TableCell>
                    <TableCell>{labelOf(PROJECT_COST_KIND_LABEL, row.cost_kind)}</TableCell>
                    <TableCell wrap>{row.description || "—"}</TableCell>
                    <TableCell align="right" tabular>
                      {money(row.amount)}
                    </TableCell>
                    {canWrite && (
                      <TableCell align="center">
                        <DeleteCostButton
                          orgId={orgId}
                          projectId={projectId}
                          costId={row.id}
                          onDone={onChanged}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePager pager={costPager} unit="รายการ" />
        </div>
      )}

      {/* ── ความคืบหน้า ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Text className="px-1 text-sm font-semibold text-gray-900">บันทึกความคืบหน้า</Text>
          {canWrite && (
            <Button size="sm" variant="outline" onClick={() => setProgressOpen(true)}>
              <Plus className="h-4 w-4" /> บันทึกความคืบหน้า
            </Button>
          )}
        </div>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>วันที่</TableHead>
              <TableHead>รายการงาน</TableHead>
              <TableHead align="right">ทำเสร็จ</TableHead>
              <TableHead align="right">%</TableHead>
              <TableHead>หมายเหตุ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {progressPager.rows.length === 0 ? (
              <TableEmpty colSpan={5}>
                ยังไม่ได้บันทึกความคืบหน้า — %คืบหน้าของโครงการจึงยังแสดงเป็น &quot;—&quot;
              </TableEmpty>
            ) : (
              progressPager.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{thaiDate(row.progress_date)}</TableCell>
                  <TableCell>
                    {row.boq_item_id
                      ? (approvedItems.find((i) => i.id === row.boq_item_id)?.name ?? "—")
                      : "ทั้งโครงการ"}
                  </TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {qtyText(row.done_qty)}
                  </TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {row.percent === null ? "—" : `${row.percent}%`}
                  </TableCell>
                  <TableCell wrap>{row.note || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePager pager={progressPager} unit="รายการ" />
      </div>

      <CostDialog
        open={costOpen}
        onOpenChange={setCostOpen}
        orgId={orgId}
        projectId={projectId}
        onSaved={onChanged}
      />
      <ProgressDialog
        open={progressOpen}
        onOpenChange={setProgressOpen}
        orgId={orgId}
        projectId={projectId}
        items={approvedItems}
        onSaved={onChanged}
      />
    </div>
  );
}

function DeleteCostButton({
  orgId,
  projectId,
  costId,
  onDone,
}: {
  orgId: string;
  projectId: string;
  costId: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await jmSend(orgId, `projects/${projectId}/costs?costId=${costId}`, "DELETE");
      notify.deleted("ลบรายการต้นทุนแล้ว");
      onDone();
    } catch (e) {
      notify.error(e, "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <Button
      size="sm"
      variant={confirm ? "destructive" : "ghost"}
      disabled={busy}
      onClick={() => (confirm ? remove() : setConfirm(true))}
    >
      {confirm ? "ยืนยันลบ" : "ลบ"}
    </Button>
  );
}

function CostDialog({
  open,
  onOpenChange,
  orgId,
  projectId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  projectId: string;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<ProjectCostKind>("labor");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setKind("labor");
      setDate(new Date().toISOString().slice(0, 10));
      setAmount("");
      setDescription("");
    }
  }, [open]);

  async function save() {
    setBusy(true);
    try {
      await jmSend(orgId, `projects/${projectId}/costs`, "POST", {
        cost_kind: kind,
        cost_date: date,
        amount,
        description: description.trim() || null,
      });
      notify.created("บันทึกต้นทุนแล้ว");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      notify.error(e, "บันทึกต้นทุนไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>บันทึกต้นทุนนอกคลัง</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label>ประเภท</Label>
              <div className="mt-1">
                <CustomSelect
                  value={kind}
                  onChange={(v) => setKind(v as ProjectCostKind)}
                  options={COST_KIND_OPTIONS}
                />
              </div>
            </div>
            <div>
              <Label>วันที่</Label>
              <div className="mt-1">
                <ThaiDatePicker value={date} onChange={setDate} />
              </div>
            </div>
            <div>
              <Label htmlFor="jm-cost-amount">จำนวนเงิน (฿) *</Label>
              <Input
                id="jm-cost-amount"
                className="mt-1"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="jm-cost-desc">รายละเอียด</Label>
              <Input
                id="jm-cost-desc"
                className="mt-1"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="เช่น ค่าแรงทีมเดินสาย 3 คน"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            ยกเลิก
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgressDialog({
  open,
  onOpenChange,
  orgId,
  projectId,
  items,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  projectId: string;
  items: { id: string; name: string; unit: string; qty: number }[];
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"qty" | "percent">("qty");
  const [itemId, setItemId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [doneQty, setDoneQty] = useState("");
  const [percent, setPercent] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(items.length > 0 ? "qty" : "percent");
      setItemId(items[0]?.id ?? "");
      setDate(new Date().toISOString().slice(0, 10));
      setDoneQty("");
      setPercent("");
      setNote("");
    }
  }, [open, items]);

  const selected = items.find((i) => i.id === itemId);

  async function save() {
    setBusy(true);
    try {
      await jmSend(orgId, `projects/${projectId}/progress`, "POST", {
        boq_item_id: mode === "qty" ? itemId || null : itemId || null,
        progress_date: date,
        done_qty: mode === "qty" ? doneQty : null,
        percent: mode === "percent" ? percent : null,
        note: note.trim() || null,
      });
      notify.created("บันทึกความคืบหน้าแล้ว");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      notify.error(e, "บันทึกความคืบหน้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>บันทึกความคืบหน้า</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {items.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <Text className="text-sm text-amber-800">
                  ยังไม่มี BOQ ที่อนุมัติ — บันทึกได้เฉพาะ % ของทั้งโครงการ และ
                  %คืบหน้าจะยังคิดถ่วงน้ำหนักไม่ได้จนกว่าจะมี BOQ
                </Text>
              </div>
            )}
            {items.length > 0 && (
              <div>
                <Label>รายการงาน</Label>
                <div className="mt-1">
                  <CustomSelect
                    value={itemId}
                    onChange={setItemId}
                    options={[
                      { value: "", label: "ทั้งโครงการ (ไม่ระบุรายการ)" },
                      ...items.map((i) => ({
                        value: i.id,
                        label: `${i.name} (${qtyText(i.qty)} ${i.unit})`,
                      })),
                    ]}
                  />
                </div>
              </div>
            )}
            <div>
              <Label>วิธีบันทึก</Label>
              <div className="mt-1">
                <SegmentedControl
                  value={mode}
                  onChange={(v) => setMode(v as "qty" | "percent")}
                  size="md"
                  options={[
                    { value: "qty", label: "ปริมาณที่ทำเสร็จ" },
                    { value: "percent", label: "% ความคืบหน้า" },
                  ]}
                />
              </div>
            </div>
            {mode === "qty" ? (
              <div>
                <Label htmlFor="jm-prog-qty">
                  ปริมาณที่ทำเสร็จสะสม {selected ? `(${selected.unit})` : ""}
                </Label>
                <Input
                  id="jm-prog-qty"
                  className="mt-1"
                  inputMode="decimal"
                  value={doneQty}
                  onChange={(e) => setDoneQty(e.target.value)}
                />
                {selected && (
                  <p className="mt-1 text-xs text-gray-500">
                    ปริมาณตาม BOQ = {qtyText(selected.qty)} {selected.unit}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <Label htmlFor="jm-prog-pct">% ความคืบหน้า (0–100)</Label>
                <Input
                  id="jm-prog-pct"
                  className="mt-1"
                  inputMode="decimal"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                />
              </div>
            )}
            <div>
              <Label>วันที่บันทึก</Label>
              <div className="mt-1">
                <ThaiDatePicker value={date} onChange={setDate} />
              </div>
            </div>
            <div>
              <Label htmlFor="jm-prog-note">หมายเหตุ</Label>
              <Input
                id="jm-prog-note"
                className="mt-1"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            ยกเลิก
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
