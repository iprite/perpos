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
import Link from "next/link";
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
  orgSlug,
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
  orgSlug: string;
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
  const [costDetail, setCostDetail] = useState<JustMeProjectCost | null>(null);

  return (
    <div className="space-y-6">
      {/* ── วัสดุที่เบิกใช้ ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Text className="px-1 text-sm font-semibold text-gray-900">วัสดุที่เบิกเข้าโครงการ</Text>
          <Text className="text-xs text-gray-500">
            เบิกของที่{" "}
            <Link
              className="font-medium text-blue-600 hover:underline"
              href={`/${orgSlug}/just-me/inventory`}
            >
              หน้าคลัง → แท็บ &quot;เบิกโอน&quot;
            </Link>{" "}
            แล้วเลือกโครงการนี้ — ถ้าไม่เลือกโครงการ ของที่เบิกจะไม่ถูกนับเป็นต้นทุนของงานนี้
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {costPager.rows.length === 0 ? (
                <TableEmpty colSpan={4}>
                  ยังไม่มีต้นทุนนอกคลัง — ค่าแรงและผู้รับเหมาช่วงบันทึกที่นี่
                </TableEmpty>
              ) : (
                costPager.rows.map((row) => (
                  <TableRow
                    key={row.id}
                    clickable={canWrite}
                    onClick={canWrite ? () => setCostDetail(row) : undefined}
                  >
                    <TableCell>{thaiDate(row.cost_date)}</TableCell>
                    <TableCell>{labelOf(PROJECT_COST_KIND_LABEL, row.cost_kind)}</TableCell>
                    <TableCell wrap>{row.description || "—"}</TableCell>
                    <TableCell align="right" tabular>
                      {money(row.amount)}
                    </TableCell>
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

      <CostDetailDialog
        row={costDetail}
        orgId={orgId}
        projectId={projectId}
        onClose={() => setCostDetail(null)}
        onDeleted={onChanged}
      />
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

/**
 * รายละเอียดต้นทุนนอกคลังหนึ่งรายการ (เปิดจากการคลิกแถว — DESIGN §5 ข้อ 3 ห้ามมีคอลัมน์ปุ่มในแถว)
 * ⚠️ API ยังไม่มี PATCH ของ `projects/[id]/costs` → รายการที่บันทึกแล้วยัง "แก้ไม่ได้"
 *    ที่ทำได้คือลบแล้วบันทึกใหม่ — หน้าจึงบอกทางไว้ตรง ๆ แทนที่จะโชว์ฟอร์มที่กดแล้วไม่มีผล
 */
function CostDetailDialog({
  row,
  orgId,
  projectId,
  onClose,
  onDeleted,
}: {
  row: JustMeProjectCost | null;
  orgId: string;
  projectId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (row) setConfirm(false);
  }, [row]);

  async function remove() {
    if (!row) return;
    setBusy(true);
    try {
      await jmSend(orgId, `projects/${projectId}/costs?costId=${row.id}`, "DELETE");
      notify.deleted("ลบรายการต้นทุนแล้ว");
      onDeleted();
      onClose();
    } catch (e) {
      notify.error(e, "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>รายการต้นทุนนอกคลัง</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-3">
            <DetailRow label="วันที่" value={thaiDate(row?.cost_date)} />
            <DetailRow
              label="ประเภท"
              value={row ? labelOf(PROJECT_COST_KIND_LABEL, row.cost_kind) : "—"}
            />
            <DetailRow label="รายละเอียด" value={row?.description || "—"} />
            <DetailRow label="จำนวนเงิน" value={money(row?.amount ?? null)} />
            <Text className="text-xs text-gray-500">
              รายการที่บันทึกแล้วยังแก้ตัวเลขไม่ได้ (ต้นทุนถูกนับเข้ายอดสรุปของโครงการไปแล้ว) —
              ถ้ากรอกผิด ให้ลบรายการนี้แล้วบันทึกใหม่
            </Text>
            {confirm && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <Text className="text-sm text-red-700">
                  ลบแล้วยอด &quot;ต้นทุนจริง&quot; และกำไรคาดการณ์ของโครงการจะเปลี่ยนทันที
                  และกู้คืนไม่ได้ — กด &quot;ยืนยันลบ&quot; อีกครั้งถ้าแน่ใจ
                </Text>
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant={confirm ? "destructive" : "outline"}
            className="mr-auto"
            disabled={busy}
            onClick={() => (confirm ? remove() : setConfirm(true))}
          >
            {busy ? "กำลังลบ…" : confirm ? "ยืนยันลบ" : "ลบรายการนี้"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <Text className="text-xs text-gray-500">{label}</Text>
      <Text className="text-right text-sm text-gray-900">{value}</Text>
    </div>
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
