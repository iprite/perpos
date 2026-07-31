"use client";

/**
 * _price-book-client.tsx — ตารางราคามาตรฐาน + กล่องแก้ไข + ตั้งค่าบริษัท
 *
 * กติกา:
 *  - ต้นทุนวัสดุโหมด `auto` = ต้นทุนเฉลี่ยจากคลัง (`avg_cost`) · `manual` = ค่าที่ตั้งเอง
 *  - ยังไม่เคยซื้อเข้าคลัง → ต้นทุน/ราคาขายเป็น "—" (**ห้ามแสดง 0** — ราคาขาย 0 คือราคาผิด)
 *  - แถวที่ราคาซื้อขยับเกินเกณฑ์ต้องเห็นชัด + กด "รับทราบราคาใหม่" เพื่อตั้งฐานเทียบใหม่
 *  - ทุกตัวเลขคิดมาจาก `project-metrics.ts` ผ่าน `computePriceBookRow` แล้ว — ที่นี่แค่แสดง
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Settings2, Tags } from "lucide-react";
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
import { FilterBar, FilterClear, FilterSearch } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import { PageShell } from "@/components/ui/page-shell";
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
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { MARGIN_SOURCE_LABEL } from "@/lib/just-me/labels";
import type { InventoryItemOption, PriceBookComputed } from "@/lib/just-me/price-book";
import type { JustMeSettings, JustMeWorkCategory, MaterialCostMode } from "@/lib/just-me/types";
import { jmSend } from "../_components/api-client";
import { money, pctValue } from "../_components/format";

const MODE_OPTIONS: { value: MaterialCostMode; label: string }[] = [
  { value: "auto", label: "จากคลัง" },
  { value: "manual", label: "กำหนดเอง" },
];

interface RowForm {
  name: string;
  unit: string;
  category_id: string;
  item_id: string;
  material_cost_mode: MaterialCostMode;
  material_unit_cost_manual: string;
  labor_unit_cost: string;
  overhead_unit_cost: string;
  margin_pct: string;
  cost_alert_pct: string;
  is_active: boolean;
}

const EMPTY_ROW: RowForm = {
  name: "",
  unit: "",
  category_id: "",
  item_id: "",
  material_cost_mode: "manual",
  material_unit_cost_manual: "",
  labor_unit_cost: "0",
  overhead_unit_cost: "0",
  margin_pct: "",
  cost_alert_pct: "",
  is_active: true,
};

export function PriceBookClient({
  orgId,
  isOwner,
  canWrite,
  rows,
  categories,
  settings,
  items,
}: {
  orgId: string;
  isOwner: boolean;
  canWrite: boolean;
  rows: PriceBookComputed[];
  categories: JustMeWorkCategory[];
  settings: JustMeSettings;
  items: InventoryItemOption[];
}) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [onlyAlert, setOnlyAlert] = useState(false);
  const [editing, setEditing] = useState<PriceBookComputed | null>(null);
  const [form, setForm] = useState<RowForm>(EMPTY_ROW);
  const [rowOpen, setRowOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (category && r.category_id !== category) return false;
      if (onlyAlert && !r.cost_alert) return false;
      return true;
    });
  }, [rows, term, category, onlyAlert]);

  const pager = usePagination(filtered, {
    pageSize: 20,
    resetKey: `${term}|${category}|${onlyAlert}`,
  });
  const alertCount = useMemo(() => rows.filter((r) => r.cost_alert).length, [rows]);
  const missingCost = useMemo(
    () => rows.filter((r) => r.effective_material_cost === null).length,
    [rows],
  );
  const hasFilter = Boolean(term || category || onlyAlert);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_ROW);
    setRowOpen(true);
  }

  function openEdit(row: PriceBookComputed) {
    setEditing(row);
    setForm({
      name: row.name,
      unit: row.unit,
      category_id: row.category_id ?? "",
      item_id: row.item_id ?? "",
      material_cost_mode: row.material_cost_mode,
      material_unit_cost_manual:
        row.material_unit_cost_manual === null ? "" : String(row.material_unit_cost_manual),
      labor_unit_cost: String(row.labor_unit_cost ?? 0),
      overhead_unit_cost: String(row.overhead_unit_cost ?? 0),
      margin_pct: row.margin_pct === null ? "" : String(row.margin_pct),
      cost_alert_pct: row.cost_alert_pct === null ? "" : String(row.cost_alert_pct),
      is_active: row.is_active,
    });
    setRowOpen(true);
  }

  async function saveRow() {
    if (!form.name.trim()) return notify.error("กรุณาระบุชื่อรายการ");
    if (!form.unit.trim()) return notify.error("กรุณาระบุหน่วยนับ");
    if (form.material_cost_mode === "manual" && form.material_unit_cost_manual.trim() === "") {
      return notify.error("โหมดกำหนดเองต้องระบุต้นทุนวัสดุต่อหน่วย");
    }
    // โหมด "จากคลัง" ต้องผูกวัสดุ ไม่งั้นไม่มีต้นทุนให้ดึง → ราคาขายจะว่างตลอด
    if (form.material_cost_mode === "auto" && !form.item_id) {
      return notify.error("โหมดจากคลังต้องเลือกวัสดุในคลังที่จะใช้ต้นทุนเฉลี่ย");
    }
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      unit: form.unit.trim(),
      category_id: form.category_id || null,
      item_id: form.material_cost_mode === "auto" ? form.item_id : null,
      material_cost_mode: form.material_cost_mode,
      material_unit_cost_manual: form.material_unit_cost_manual.trim() || null,
      labor_unit_cost: form.labor_unit_cost.trim() || 0,
      overhead_unit_cost: form.overhead_unit_cost.trim() || 0,
      margin_pct: form.margin_pct.trim() || null,
      cost_alert_pct: form.cost_alert_pct.trim() || null,
      is_active: form.is_active,
    };
    setBusy(true);
    try {
      if (editing) {
        await jmSend(orgId, "price-book", "PATCH", { id: editing.id, ...payload });
        notify.updated("บันทึกรายการราคาแล้ว");
      } else {
        await jmSend(orgId, "price-book", "POST", payload);
        notify.created("เพิ่มรายการราคาแล้ว");
      }
      setRowOpen(false);
      router.refresh();
    } catch (e) {
      notify.error(e, "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function ackBaseline(row: PriceBookComputed) {
    setBusy(true);
    try {
      await jmSend(orgId, "price-book", "PATCH", { id: row.id, action: "ack-baseline" });
      notify.success(`รับทราบราคาใหม่ของ "${row.name}" แล้ว`);
      setRowOpen(false);
      router.refresh();
    } catch (e) {
      notify.error(e, "ตั้งฐานเทียบราคาใหม่ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!editing) return;
    setBusy(true);
    try {
      await jmSend(orgId, `price-book?id=${editing.id}`, "DELETE");
      notify.success("ปิดใช้งานรายการแล้ว (ประวัติ BOQ เดิมยังอยู่ครบ)");
      setRowOpen(false);
      router.refresh();
    } catch (e) {
      notify.error(e, "ปิดใช้งานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      title="ราคามาตรฐาน"
      description="ต้นทุนวัสดุ/ค่าแรง/ค่าดำเนินการ + %กำไร ที่ใช้เป็นฐานของทุก BOQ"
      icon={<Tags className="h-6 w-6" />}
      width="full"
      actions={
        <>
          {isOwner && (
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-4 w-4" /> ตั้งค่าบริษัท
            </Button>
          )}
          {canWrite && (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> เพิ่มรายการ
            </Button>
          )}
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="รายการทั้งหมด"
          value={rows.length.toLocaleString("th-TH")}
          sub={`ใช้งานอยู่ ${rows.filter((r) => r.is_active).length.toLocaleString("th-TH")} รายการ`}
          tone="neutral"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="ราคาซื้อขยับเกินเกณฑ์"
          value={alertCount.toLocaleString("th-TH")}
          sub={`เกณฑ์บริษัท ${pctValue(settings.cost_alert_pct)} · กด "รับทราบราคาใหม่" เพื่อตั้งฐานใหม่`}
          tone={alertCount > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="ยังไม่รู้ต้นทุนวัสดุ"
          value={missingCost.toLocaleString("th-TH")}
          sub="ยังไม่เคยซื้อเข้าคลัง หรือยังไม่ได้กรอกต้นทุนเอง"
          tone={missingCost > 0 ? "warning" : "neutral"}
        />
      </div>

      <div className="space-y-3">
        <FilterBar>
          <FilterSearch value={term} onChange={setTerm} placeholder="ค้นหาชื่อรายการ" />
          <CustomSelect
            value={category}
            onChange={setCategory}
            className="w-44"
            options={[
              { value: "", label: "ทุกหมวดงาน" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <SegmentedControl
            value={onlyAlert ? "alert" : "all"}
            onChange={(v) => setOnlyAlert(v === "alert")}
            ariaLabel="กรองเฉพาะราคาที่ขยับ"
            options={[
              { value: "all", label: "ทั้งหมด" },
              { value: "alert", label: `ราคาขยับ (${alertCount})` },
            ]}
          />
          <FilterClear
            onClick={() => {
              setTerm("");
              setCategory("");
              setOnlyAlert(false);
            }}
            disabled={!hasFilter}
          />
        </FilterBar>

        <Table stickyHeader fillViewport>
          <TableHeader sticky>
            <TableRow>
              <TableHead>รายการ</TableHead>
              <TableHead>หน่วย</TableHead>
              <TableHead>หมวดงาน</TableHead>
              <TableHead align="center">ต้นทุนวัสดุ</TableHead>
              <TableHead align="right">วัสดุ/หน่วย</TableHead>
              <TableHead align="right">ค่าแรง</TableHead>
              <TableHead align="right">ค่าดำเนินการ</TableHead>
              <TableHead align="right">%กำไร</TableHead>
              <TableHead align="right">ราคาขาย</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.rows.length === 0 ? (
              <TableEmpty colSpan={9}>
                <div className="flex flex-col items-center gap-2 py-6">
                  <div className="rounded-full bg-gray-100 p-4">
                    <Tags className="h-8 w-8 text-gray-400" />
                  </div>
                  <Text className="text-sm font-medium text-gray-900">
                    {hasFilter ? "ไม่พบรายการตามเงื่อนไข" : "ยังไม่มีราคามาตรฐาน"}
                  </Text>
                  <Text className="text-sm text-gray-500">
                    {hasFilter
                      ? "ลองล้างตัวกรองหรือเปลี่ยนคำค้น"
                      : "ตั้งราคามาตรฐานไว้ครั้งเดียว แล้วถอด BOQ ได้เร็วขึ้นทุกโครงการ"}
                  </Text>
                  {!hasFilter && canWrite && (
                    <Button size="sm" onClick={openNew}>
                      <Plus className="h-4 w-4" /> เพิ่มรายการแรก
                    </Button>
                  )}
                </div>
              </TableEmpty>
            ) : (
              pager.rows.map((row) => (
                <TableRow
                  key={row.id}
                  clickable={canWrite}
                  onClick={canWrite ? () => openEdit(row) : undefined}
                >
                  <TableCell className="font-medium text-gray-900">
                    {row.name}
                    {!row.is_active && (
                      <StatusBadge tone="neutral" className="ms-2">
                        ปิดใช้งาน
                      </StatusBadge>
                    )}
                    {row.cost_alert && (
                      <StatusBadge tone="warning" className="ms-2">
                        ราคาขยับ {pctValue(row.cost_drift_pct, 1)}
                      </StatusBadge>
                    )}
                  </TableCell>
                  <TableCell>{row.unit}</TableCell>
                  <TableCell>
                    {row.category_id ? (categoryName.get(row.category_id) ?? "—") : "—"}
                  </TableCell>
                  <TableCell align="center">
                    <StatusBadge tone={row.material_cost_mode === "auto" ? "info" : "neutral"}>
                      {row.material_cost_mode === "auto" ? "จากคลัง" : "กำหนดเอง"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell align="right" tabular>
                    {money(row.effective_material_cost)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {money(row.labor_unit_cost)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {money(row.overhead_unit_cost)}
                  </TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {pctValue(row.margin_used_pct)}
                    <span className="ms-1 text-xs text-gray-400">
                      {MARGIN_SOURCE_LABEL[row.margin_used_source]}
                    </span>
                  </TableCell>
                  <TableCell align="right" tabular>
                    {money(row.unit_price)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePager pager={pager} unit="รายการ" />
      </div>

      <RowDialog
        open={rowOpen}
        onOpenChange={setRowOpen}
        editing={editing}
        form={form}
        setForm={setForm}
        categories={categories}
        items={items}
        busy={busy}
        onSave={saveRow}
        onAck={ackBaseline}
        onDeactivate={deactivate}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        orgId={orgId}
        settings={settings}
      />
    </PageShell>
  );
}

function RowDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  categories,
  items,
  busy,
  onSave,
  onAck,
  onDeactivate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: PriceBookComputed | null;
  form: RowForm;
  setForm: React.Dispatch<React.SetStateAction<RowForm>>;
  categories: JustMeWorkCategory[];
  items: InventoryItemOption[];
  busy: boolean;
  onSave: () => void;
  onAck: (row: PriceBookComputed) => void;
  onDeactivate: () => void;
}) {
  const set = (patch: Partial<RowForm>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{editing ? "แก้ไขรายการราคา" : "เพิ่มรายการราคา"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {editing?.cost_alert && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <Text className="text-sm text-amber-800">
                    ต้นทุนวัสดุตอนนี้ {money(editing.effective_material_cost)}{" "}
                    ต่างจากฐานที่รับทราบไว้ {money(editing.baseline_material_cost)} (
                    {pctValue(editing.cost_drift_pct, 1)})
                  </Text>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={busy}
                    onClick={() => onAck(editing)}
                  >
                    รับทราบราคาใหม่
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="jm-pb-name">ชื่อรายการ *</Label>
                <Input
                  id="jm-pb-name"
                  className="mt-1"
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="เช่น กล้อง IP 4MP พร้อมติดตั้ง"
                />
              </div>
              <div>
                <Label htmlFor="jm-pb-unit">หน่วยนับ *</Label>
                <Input
                  id="jm-pb-unit"
                  className="mt-1"
                  value={form.unit}
                  onChange={(e) => set({ unit: e.target.value })}
                  placeholder="ตัว / เมตร / จุด"
                />
              </div>
              <div>
                <Label>หมวดงาน</Label>
                <div className="mt-1">
                  <CustomSelect
                    value={form.category_id}
                    onChange={(v) => set({ category_id: v })}
                    options={[
                      { value: "", label: "— ไม่ระบุ —" },
                      ...categories.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                  />
                </div>
              </div>
              <div>
                <Label>ต้นทุนวัสดุมาจาก</Label>
                <div className="mt-1">
                  <SegmentedControl
                    value={form.material_cost_mode}
                    onChange={(v) => set({ material_cost_mode: v as MaterialCostMode })}
                    options={MODE_OPTIONS}
                    size="md"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  &quot;จากคลัง&quot; = ใช้ต้นทุนเฉลี่ยของวัสดุที่ผูกไว้ · &quot;กำหนดเอง&quot; =
                  ใส่ตัวเลขเอง
                </p>
              </div>
              {form.material_cost_mode === "auto" && (
                <div>
                  <Label>วัสดุในคลังที่ผูกไว้ *</Label>
                  <div className="mt-1">
                    <CustomSelect
                      value={form.item_id}
                      onChange={(v) => {
                        const picked = items.find((i) => i.id === v);
                        set({
                          item_id: v,
                          // เติมหน่วยให้ตรงกับคลังถ้ายังไม่ได้กรอก (กันหน่วยไม่ตรงกันแล้วต้นทุนเพี้ยน)
                          ...(picked && !form.unit.trim() ? { unit: picked.unit } : {}),
                        });
                      }}
                      options={[
                        { value: "", label: "— เลือกวัสดุในคลัง —" },
                        ...items.map((i) => ({
                          value: i.id,
                          label: `${i.name} (${i.code})${
                            i.avg_cost === null
                              ? " · ยังไม่มีต้นทุน"
                              : ` · ${money(i.avg_cost)} ฿/${i.unit}`
                          }`,
                        })),
                      ]}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    ระบบจะใช้ต้นทุนเฉลี่ยถ่วงน้ำหนักของวัสดุนี้เป็นค่าวัสดุ
                    และอัปเดตตามราคาซื้อจริงให้เอง
                  </p>
                </div>
              )}
              <div>
                <Label htmlFor="jm-pb-material">ต้นทุนวัสดุ/หน่วย (฿)</Label>
                <Input
                  id="jm-pb-material"
                  className="mt-1"
                  inputMode="decimal"
                  value={form.material_unit_cost_manual}
                  onChange={(e) => set({ material_unit_cost_manual: e.target.value })}
                  disabled={form.material_cost_mode === "auto"}
                  placeholder={form.material_cost_mode === "auto" ? "ใช้ต้นทุนเฉลี่ยจากคลัง" : ""}
                />
              </div>
              <div>
                <Label htmlFor="jm-pb-labor">ค่าแรง/หน่วย (฿)</Label>
                <Input
                  id="jm-pb-labor"
                  className="mt-1"
                  inputMode="decimal"
                  value={form.labor_unit_cost}
                  onChange={(e) => set({ labor_unit_cost: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="jm-pb-overhead">ค่าดำเนินการ/หน่วย (฿)</Label>
                <Input
                  id="jm-pb-overhead"
                  className="mt-1"
                  inputMode="decimal"
                  value={form.overhead_unit_cost}
                  onChange={(e) => set({ overhead_unit_cost: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="jm-pb-margin">%กำไรของรายการนี้</Label>
                <Input
                  id="jm-pb-margin"
                  className="mt-1"
                  inputMode="decimal"
                  value={form.margin_pct}
                  onChange={(e) => set({ margin_pct: e.target.value })}
                  placeholder="เว้นว่าง = ใช้ตามหมวดงาน/บริษัท"
                />
              </div>
              <div>
                <Label htmlFor="jm-pb-alert">เกณฑ์เตือนราคาขยับ (%)</Label>
                <Input
                  id="jm-pb-alert"
                  className="mt-1"
                  inputMode="decimal"
                  value={form.cost_alert_pct}
                  onChange={(e) => set({ cost_alert_pct: e.target.value })}
                  placeholder="เว้นว่าง = ใช้เกณฑ์ของบริษัท"
                />
              </div>
              <div>
                <Label>สถานะการใช้งาน</Label>
                <div className="mt-1">
                  <SegmentedControl
                    value={form.is_active ? "active" : "inactive"}
                    onChange={(v) => set({ is_active: v === "active" })}
                    size="md"
                    options={[
                      { value: "active", label: "ใช้งาน" },
                      { value: "inactive", label: "ปิดใช้งาน" },
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          {editing && (
            <Button
              variant="destructive"
              className="mr-auto"
              disabled={busy || !editing.is_active}
              onClick={onDeactivate}
            >
              ปิดใช้งานรายการ
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            ยกเลิก
          </Button>
          <Button onClick={onSave} disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  orgId,
  settings,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  settings: JustMeSettings;
}) {
  const router = useRouter();
  const [margin, setMargin] = useState(String(settings.default_margin_pct));
  const [alert, setAlert] = useState(String(settings.cost_alert_pct));
  const [prApproval, setPrApproval] = useState(settings.pr_approval_required);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMargin(String(settings.default_margin_pct));
    setAlert(String(settings.cost_alert_pct));
    setPrApproval(settings.pr_approval_required);
  }, [open, settings]);

  async function save() {
    setSaving(true);
    try {
      await jmSend(orgId, "settings", "PUT", {
        default_margin_pct: margin,
        cost_alert_pct: alert,
        pr_approval_required: prApproval,
      });
      notify.saved("บันทึกค่าตั้งต้นของบริษัทแล้ว");
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      notify.error(e, "บันทึกค่าตั้งต้นไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>ตั้งค่าบริษัท</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="jm-set-margin">%กำไรเริ่มต้น *</Label>
              <Input
                id="jm-set-margin"
                className="mt-1"
                inputMode="decimal"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                ใช้เมื่อรายการ/หมวดงาน/โครงการไม่ได้ตั้ง %กำไรไว้เอง
              </p>
            </div>
            <div>
              <Label htmlFor="jm-set-alert">เกณฑ์เตือนราคาซื้อขยับ (%) *</Label>
              <Input
                id="jm-set-alert"
                className="mt-1"
                inputMode="decimal"
                value={alert}
                onChange={(e) => setAlert(e.target.value)}
              />
            </div>
            <div>
              <Label>ใบขอซื้อ (PR) ต้องให้เจ้าของอนุมัติ</Label>
              <div className="mt-1">
                <SegmentedControl
                  value={prApproval ? "yes" : "no"}
                  onChange={(v) => setPrApproval(v === "yes")}
                  size="md"
                  options={[
                    { value: "yes", label: "ต้องอนุมัติ" },
                    { value: "no", label: "ไม่ต้อง" },
                  ]}
                />
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
