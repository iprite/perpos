"use client";

/**
 * _boq-tab.tsx — ถอด BOQ ของโครงการ (หัวใจของหน้ารายละเอียด)
 *
 * กติกาที่ห้ามพลาด:
 *  - BOQ ที่ `approved` **แก้ไม่ได้** → ล็อกทั้งตาราง + บอกเหตุผล + ปุ่มสร้าง revision ใหม่จากฉบับนี้
 *  - margin ของทุกบรรทัดต้องบอก **ที่มา** (`margin_source`) ไม่งั้นผู้ใช้ไม่รู้ว่าทำไมราคาเป็นแบบนี้
 *  - ยอดรวมใช้ `boqTotals()` จาก `project-metrics.ts` — **ห้ามบวกเอง**
 *  - viewer เห็นเฉพาะฝั่งราคาขาย (API/RLS ตัดคอลัมน์ต้นทุนออกให้แล้ว)
 */

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, CopyPlus, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableLoading,
  TableRow,
} from "@/components/ui/table";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { BOQ_ITEM_KIND_LABEL, BOQ_STATUS_LABEL, MARGIN_SOURCE_LABEL } from "@/lib/just-me/labels";
import { boqTotals } from "@/lib/just-me/project-metrics";
import type {
  BoqItemKind,
  JustMeBoq,
  JustMeBoqItem,
  JustMeWorkCategory,
} from "@/lib/just-me/types";
import { jmGet, jmSend } from "../../_components/api-client";
import { money, pctValue, qtyText } from "../../_components/format";
import type { BoqPriceOption } from "./_types";

const KIND_OPTIONS = (Object.keys(BOQ_ITEM_KIND_LABEL) as BoqItemKind[]).map((k) => ({
  value: k,
  label: BOQ_ITEM_KIND_LABEL[k],
}));

const BOQ_STATUS_TONE = {
  draft: "warning",
  approved: "success",
  superseded: "neutral",
} as const;

interface LineForm {
  price_book_id: string;
  name: string;
  unit: string;
  qty: string;
  item_kind: BoqItemKind;
  category_id: string;
  material_unit_cost: string;
  labor_unit_cost: string;
  overhead_unit_cost: string;
  margin_pct: string;
}

const EMPTY_LINE: LineForm = {
  price_book_id: "",
  name: "",
  unit: "",
  qty: "1",
  item_kind: "material",
  category_id: "",
  material_unit_cost: "",
  labor_unit_cost: "",
  overhead_unit_cost: "",
  margin_pct: "",
};

export function BoqTab({
  orgId,
  projectId,
  canWrite,
  canSeeCost,
  boqs,
  activeBoqId,
  activeItems,
  categories,
  priceOptions,
  onChanged,
}: {
  orgId: string;
  projectId: string;
  canWrite: boolean;
  canSeeCost: boolean;
  boqs: JustMeBoq[];
  activeBoqId: string | null;
  activeItems: JustMeBoqItem[];
  categories: JustMeWorkCategory[];
  priceOptions: BoqPriceOption[];
  onChanged: () => void;
}) {
  const [boqId, setBoqId] = useState<string | null>(activeBoqId);
  const [items, setItems] = useState<JustMeBoqItem[]>(activeItems);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lineOpen, setLineOpen] = useState(false);
  const [editing, setEditing] = useState<JustMeBoqItem | null>(null);
  const [form, setForm] = useState<LineForm>(EMPTY_LINE);
  const [approveOpen, setApproveOpen] = useState(false);

  // SSR ส่งของใหม่มา (หลัง router.refresh) → รับมาแทนของเดิม
  useEffect(() => {
    setBoqId(activeBoqId);
    setItems(activeItems);
  }, [activeBoqId, activeItems]);

  const boq = useMemo(() => boqs.find((b) => b.id === boqId) ?? null, [boqs, boqId]);
  const editable = canWrite && canSeeCost && boq?.status === "draft";
  const totals = useMemo(() => boqTotals(items), [items]);
  const pager = usePagination(items, { pageSize: 20, resetKey: boqId });
  const colSpan = canSeeCost ? 9 : 5;

  async function loadItems(nextId: string) {
    setBoqId(nextId);
    setLoading(true);
    try {
      const res = await jmGet<{ items: JustMeBoqItem[] }>(orgId, `boq/${nextId}/items`);
      setItems(res.items ?? []);
    } catch (e) {
      notify.error(e, "โหลดรายการ BOQ ไม่สำเร็จ");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function refreshItems(id: string) {
    try {
      const res = await jmGet<{ items: JustMeBoqItem[] }>(orgId, `boq/${id}/items`);
      setItems(res.items ?? []);
    } catch (e) {
      notify.error(e, "โหลดรายการ BOQ ไม่สำเร็จ");
    }
  }

  async function createRevision(copyFrom: string | null) {
    setBusy(true);
    try {
      const res = await jmSend<{ boq: JustMeBoq }>(orgId, `projects/${projectId}/boq`, "POST", {
        copy_from_boq_id: copyFrom,
      });
      notify.created(`สร้างฉบับร่างที่ ${res.boq.revision_no} แล้ว`);
      onChanged();
    } catch (e) {
      notify.error(e, "สร้าง BOQ ฉบับใหม่ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function openNewLine() {
    setEditing(null);
    setForm(EMPTY_LINE);
    setLineOpen(true);
  }

  function openEditLine(item: JustMeBoqItem) {
    if (!editable) return;
    setEditing(item);
    setForm({
      price_book_id: item.price_book_id ?? "",
      name: item.name,
      unit: item.unit,
      qty: String(item.qty),
      item_kind: item.item_kind,
      category_id: item.category_id ?? "",
      material_unit_cost: String(item.material_unit_cost ?? 0),
      labor_unit_cost: String(item.labor_unit_cost ?? 0),
      overhead_unit_cost: String(item.overhead_unit_cost ?? 0),
      margin_pct: item.margin_pct === null ? "" : String(item.margin_pct),
    });
    setLineOpen(true);
  }

  function pickPriceOption(id: string) {
    const opt = priceOptions.find((p) => p.id === id);
    if (!opt) {
      setForm((f) => ({ ...f, price_book_id: "" }));
      return;
    }
    setForm((f) => ({
      ...f,
      price_book_id: id,
      name: opt.name,
      unit: opt.unit,
      category_id: opt.category_id ?? "",
      material_unit_cost: opt.material_unit_cost === null ? "" : String(opt.material_unit_cost),
      labor_unit_cost: String(opt.labor_unit_cost ?? 0),
      overhead_unit_cost: String(opt.overhead_unit_cost ?? 0),
    }));
  }

  async function saveLine() {
    if (!boqId) return;
    if (!form.name.trim()) return notify.error("กรุณาระบุชื่อรายการ");
    if (!form.unit.trim()) return notify.error("กรุณาระบุหน่วยนับ");
    const qty = Number(form.qty);
    if (!Number.isFinite(qty) || qty <= 0) return notify.error("ปริมาณต้องมากกว่า 0");

    const payload: Record<string, unknown> = {
      price_book_id: form.price_book_id || null,
      category_id: form.category_id || null,
      item_kind: form.item_kind,
      name: form.name.trim(),
      unit: form.unit.trim(),
      qty,
      material_unit_cost: form.material_unit_cost === "" ? null : Number(form.material_unit_cost),
      labor_unit_cost: form.labor_unit_cost === "" ? null : Number(form.labor_unit_cost),
      overhead_unit_cost: form.overhead_unit_cost === "" ? null : Number(form.overhead_unit_cost),
      margin_pct: form.margin_pct === "" ? null : Number(form.margin_pct),
    };

    setBusy(true);
    try {
      if (editing) {
        await jmSend(orgId, `boq/${boqId}/items`, "PATCH", {
          items: [{ ...payload, id: editing.id }],
        });
        notify.updated("แก้ไขรายการแล้ว");
      } else {
        await jmSend(orgId, `boq/${boqId}/items`, "POST", { items: [payload] });
        notify.created("เพิ่มรายการแล้ว");
      }
      setLineOpen(false);
      await refreshItems(boqId);
    } catch (e) {
      notify.error(e, "บันทึกรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function deleteLine() {
    if (!boqId || !editing) return;
    setBusy(true);
    try {
      await jmSend(orgId, `boq/${boqId}/items?itemId=${editing.id}`, "DELETE");
      notify.deleted("ลบรายการแล้ว");
      setLineOpen(false);
      await refreshItems(boqId);
    } catch (e) {
      notify.error(e, "ลบรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!boqId) return;
    setBusy(true);
    try {
      await jmSend(orgId, `boq/${boqId}`, "PATCH", { action: "approve" });
      notify.success("อนุมัติ BOQ แล้ว — ระบบบันทึกงบต้นทุนของโครงการให้เรียบร้อย");
      setApproveOpen(false);
      onChanged();
    } catch (e) {
      notify.error(e, "อนุมัติ BOQ ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (boqs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
        <div className="rounded-full bg-gray-100 p-4">
          <ClipboardList className="h-8 w-8 text-gray-400" />
        </div>
        <Text className="text-sm font-medium text-gray-900">ยังไม่มี BOQ ของโครงการนี้</Text>
        <Text className="max-w-md text-sm text-gray-500">
          สร้างฉบับร่างแล้วใส่รายการจากราคามาตรฐาน ระบบจะเติมต้นทุนและคิดราคาขายให้อัตโนมัติ
        </Text>
        {canWrite && canSeeCost && (
          <Button size="sm" className="mt-2" disabled={busy} onClick={() => createRevision(null)}>
            <Plus className="h-4 w-4" /> สร้าง BOQ ฉบับร่าง
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          value={boqId ?? ""}
          onChange={(v) => loadItems(v)}
          options={boqs.map((b) => ({
            value: b.id,
            label: `ฉบับที่ ${b.revision_no}${b.title ? ` · ${b.title}` : ""} — ${BOQ_STATUS_LABEL[b.status]}`,
          }))}
          className="w-72"
        />
        {boq && (
          <StatusBadge tone={BOQ_STATUS_TONE[boq.status]}>
            {BOQ_STATUS_LABEL[boq.status]}
          </StatusBadge>
        )}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {canWrite && canSeeCost && boq && boq.status !== "draft" && (
            <Button variant="outline" disabled={busy} onClick={() => createRevision(boq.id)}>
              <CopyPlus className="h-4 w-4" /> สร้าง revision ใหม่จากฉบับนี้
            </Button>
          )}
          {editable && (
            <>
              <Button variant="outline" onClick={openNewLine}>
                <Plus className="h-4 w-4" /> เพิ่มรายการ
              </Button>
              <Button disabled={busy || items.length === 0} onClick={() => setApproveOpen(true)}>
                อนุมัติ BOQ
              </Button>
            </>
          )}
        </div>
      </div>

      {boq && boq.status !== "draft" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <Text className="text-sm text-amber-800">
            {boq.status === "approved"
              ? "ฉบับนี้อนุมัติแล้ว จึงแก้ไขไม่ได้ (งบต้นทุนของโครงการอ้างอิงฉบับนี้อยู่) — ถ้าหน้างานเปลี่ยน ให้สร้าง revision ใหม่จากฉบับนี้"
              : "ฉบับนี้ถูกแทนที่ด้วย revision ใหม่แล้ว จึงแก้ไขไม่ได้ — เก็บไว้เป็นประวัติเท่านั้น"}
          </Text>
        </div>
      )}

      <Table stickyHeader fillViewport>
        <TableHeader sticky>
          <TableRow>
            <TableHead>รายการ</TableHead>
            <TableHead>หน่วย</TableHead>
            <TableHead align="right">ปริมาณ</TableHead>
            {canSeeCost && (
              <>
                <TableHead align="right">วัสดุ/หน่วย</TableHead>
                <TableHead align="right">ค่าแรง/หน่วย</TableHead>
                <TableHead align="right">ดำเนินการ/หน่วย</TableHead>
                <TableHead align="right">%กำไร</TableHead>
              </>
            )}
            <TableHead align="right">ราคาขาย/หน่วย</TableHead>
            <TableHead align="right">จำนวนเงิน</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoading colSpan={colSpan} />
          ) : pager.rows.length === 0 ? (
            <TableEmpty colSpan={colSpan}>
              <div className="flex flex-col items-center gap-2 py-6">
                <div className="rounded-full bg-gray-100 p-4">
                  <ClipboardList className="h-8 w-8 text-gray-400" />
                </div>
                <Text className="text-sm font-medium text-gray-900">ฉบับนี้ยังไม่มีรายการ</Text>
                <Text className="text-sm text-gray-500">
                  เพิ่มรายการจากราคามาตรฐาน แล้วระบบจะเติมต้นทุน 3 ก้อนและคิดราคาขายให้
                </Text>
                {editable && (
                  <Button size="sm" onClick={openNewLine}>
                    <Plus className="h-4 w-4" /> เพิ่มรายการแรก
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            pager.rows.map((item) => (
              <TableRow
                key={item.id}
                clickable={editable}
                onClick={editable ? () => openEditLine(item) : undefined}
              >
                <TableCell className="font-medium text-gray-900">
                  {item.name}
                  <span className="ms-2 text-xs font-normal text-gray-400">
                    {BOQ_ITEM_KIND_LABEL[item.item_kind] ?? ""}
                  </span>
                </TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell align="right" className="tabular-nums">
                  {qtyText(item.qty)}
                </TableCell>
                {canSeeCost && (
                  <>
                    <TableCell align="right" tabular>
                      {money(item.material_unit_cost)}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {money(item.labor_unit_cost)}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {money(item.overhead_unit_cost)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {pctValue(item.margin_pct)}
                      <span className="ms-1 text-xs text-gray-400">
                        {item.margin_source ? MARGIN_SOURCE_LABEL[item.margin_source] : ""}
                      </span>
                    </TableCell>
                  </>
                )}
                <TableCell align="right" tabular>
                  {money(item.unit_price)}
                </TableCell>
                <TableCell align="right" tabular>
                  {money(item.amount)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {items.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={canSeeCost ? 7 : 3}>
                รวม {totals.counted.toLocaleString("th-TH")} รายการ
                {canSeeCost && ` · ต้นทุนรวม ${money(totals.total_cost)}`}
              </TableCell>
              <TableCell align="right">ยอดขายรวม</TableCell>
              <TableCell align="right" tabular>
                {money(totals.total_amount)}
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
      <TablePager pager={pager} unit="รายการ" />

      <Dialog open={lineOpen} onOpenChange={setLineOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขรายการ BOQ" : "เพิ่มรายการ BOQ"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label>เลือกจากราคามาตรฐาน</Label>
                <div className="mt-1">
                  <CustomSelect
                    value={form.price_book_id}
                    onChange={pickPriceOption}
                    options={[
                      { value: "", label: "— กรอกเอง (ไม่อิงราคามาตรฐาน) —" },
                      ...priceOptions.map((p) => ({
                        value: p.id,
                        label: `${p.name} (${p.unit})`,
                      })),
                    ]}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  เลือกแล้วระบบเติมต้นทุนวัสดุ/ค่าแรง/ค่าดำเนินการให้ แก้ทับได้
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="jm-line-name">ชื่อรายการ *</Label>
                  <Input
                    id="jm-line-name"
                    className="mt-1"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="jm-line-unit">หน่วยนับ *</Label>
                  <Input
                    id="jm-line-unit"
                    className="mt-1"
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="ตัว / เมตร / งาน"
                  />
                </div>
                <div>
                  <Label htmlFor="jm-line-qty">ปริมาณ *</Label>
                  <Input
                    id="jm-line-qty"
                    className="mt-1"
                    inputMode="decimal"
                    value={form.qty}
                    onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>ชนิดรายการ</Label>
                  <div className="mt-1">
                    <SegmentedControl
                      value={form.item_kind}
                      onChange={(v) => setForm((f) => ({ ...f, item_kind: v as BoqItemKind }))}
                      options={KIND_OPTIONS}
                      size="md"
                    />
                  </div>
                </div>
                <div>
                  <Label>หมวดงาน</Label>
                  <div className="mt-1">
                    <CustomSelect
                      value={form.category_id}
                      onChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
                      options={[
                        { value: "", label: "— ไม่ระบุ —" },
                        ...categories.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="jm-line-material">ต้นทุนวัสดุ/หน่วย (฿)</Label>
                  <Input
                    id="jm-line-material"
                    className="mt-1"
                    inputMode="decimal"
                    value={form.material_unit_cost}
                    onChange={(e) => setForm((f) => ({ ...f, material_unit_cost: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="jm-line-labor">ค่าแรง/หน่วย (฿)</Label>
                  <Input
                    id="jm-line-labor"
                    className="mt-1"
                    inputMode="decimal"
                    value={form.labor_unit_cost}
                    onChange={(e) => setForm((f) => ({ ...f, labor_unit_cost: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="jm-line-overhead">ค่าดำเนินการ/หน่วย (฿)</Label>
                  <Input
                    id="jm-line-overhead"
                    className="mt-1"
                    inputMode="decimal"
                    value={form.overhead_unit_cost}
                    onChange={(e) => setForm((f) => ({ ...f, overhead_unit_cost: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="jm-line-margin">%กำไรของบรรทัดนี้</Label>
                  <Input
                    id="jm-line-margin"
                    className="mt-1"
                    inputMode="decimal"
                    value={form.margin_pct}
                    onChange={(e) => setForm((f) => ({ ...f, margin_pct: e.target.value }))}
                    placeholder="เว้นว่าง = ใช้ตามรายการ/หมวด/โครงการ/บริษัท"
                  />
                </div>
              </div>
              <Text className="text-xs text-gray-500">
                ราคาขายและยอดรวมคิดจากต้นทุน 3 ก้อน × (1 + %กำไร) ที่ฝั่งเซิร์ฟเวอร์ —
                บันทึกแล้วจะเห็นค่าจริงในตาราง
              </Text>
            </div>
          </DialogBody>
          <DialogFooter>
            {editing && (
              <Button
                variant="destructive"
                className="mr-auto"
                disabled={busy}
                onClick={deleteLine}
              >
                ลบรายการ
              </Button>
            )}
            <Button variant="outline" onClick={() => setLineOpen(false)} disabled={busy}>
              ยกเลิก
            </Button>
            <Button onClick={saveLine} disabled={busy}>
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>ยืนยันอนุมัติ BOQ</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-2">
              <Text className="text-sm text-gray-700">
                อนุมัติแล้ว <span className="font-semibold text-gray-900">แก้ไขไม่ได้อีก</span> —
                ถ้าหน้างานเปลี่ยนต้องสร้าง revision ใหม่จากฉบับนี้
              </Text>
              <Text className="text-sm text-gray-700">
                ระบบจะบันทึกงบต้นทุน {money(totals.total_cost)} และมูลค่าสัญญาตั้งต้น{" "}
                {money(totals.total_amount)} ให้โครงการนี้ (ถ้ายังไม่เคยมีมูลค่าสัญญา)
              </Text>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={busy}>
              ยกเลิก
            </Button>
            <Button onClick={approve} disabled={busy}>
              {busy ? "กำลังอนุมัติ…" : "อนุมัติ BOQ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
