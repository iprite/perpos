"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatusBadge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PackageCheck, Trash2, Plus, BedDouble, Printer } from "lucide-react";
import { IssuePrintDialog } from "./_issue-print";
import type { StockItem, StockLocation, StockBalance, StockPreset, StockIssue } from "./_types";

/** เตียงเสริมที่เลือกไว้ 1 แถว — ต้องบอกว่าเสริมที่ห้องไหน และเพิ่มกี่คน */
type ExtraBed = { key: string; presetId: string; room: string; guests: string };

export function IssueView({
  orgId,
  presets,
  items,
  locations,
  balances,
  issues,
  authHeader,
  onDone,
  canWrite,
}: {
  orgId: string;
  presets: StockPreset[];
  items: StockItem[];
  locations: StockLocation[];
  balances: StockBalance[];
  issues: StockIssue[];
  authHeader: () => Promise<Record<string, string>>;
  onDone: () => void;
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [propertyCode, setPropertyCode] = useState("");
  const [note, setNote] = useState("");
  const [qtyOverride, setQtyOverride] = useState<Record<string, string>>({});
  const [extraBeds, setExtraBeds] = useState<ExtraBed[]>([]);
  const [lineView, setLineView] = useState<"summary" | "rooms">("summary");
  // ตัวกรองชั้นของ — ดูอย่างเดียว ไม่กระทบของที่เบิกจริง (submit ใช้ groups เต็มเสมอ)
  const [clsFilter, setClsFilter] = useState<"all" | "reusable" | "consumable">("all");
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState<StockIssue | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  /** ยอดคงเหลือ ณ จุดเก็บประจำของของชิ้นนั้น = ที่ที่ระบบจะไปหักจริง */
  const homeQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of balances) m.set(`${b.item_id}|${b.location_id}`, Number(b.qty));
    return (item: StockItem) =>
      item.default_location_id ? (m.get(`${item.id}|${item.default_location_id}`) ?? 0) : 0;
  }, [balances]);

  const properties = useMemo(() => locations.filter((l) => l.kind === "property"), [locations]);

  /** ชุดของ "ห้อง" ในหลังที่เลือก (เรียงตามลำดับห้อง) */
  const roomPresets = useMemo(
    () =>
      presets
        .filter(
          (p) => p.is_active && p.preset_kind === "checkout" && p.property_code === propertyCode,
        )
        .sort((a, b) => a.sort_order - b.sort_order),
    [presets, propertyCode],
  );

  /** ชุดเตียงเสริม — ใช้ได้ทุกหลัง */
  const bedPresets = useMemo(
    () => presets.filter((p) => p.is_active && p.preset_kind === "custom" && !p.property_code),
    [presets],
  );

  /** ห้องนอนที่เสริมเตียงได้ (ไม่รวมพื้นที่ร่วม เช่น ครัว/โต๊ะกินข้าว) */
  const bedroomNames = useMemo(
    () =>
      roomPresets
        .filter((p) =>
          (p.tmc_stock_preset_lines ?? []).some((l) =>
            (itemById.get(l.item_id)?.name ?? "").startsWith("ผ้าปูที่นอน"),
          ),
        )
        .map((p) => p.room_name ?? ""),
    [roomPresets, itemById],
  );

  /** จำนวนห้องน้ำของหลังนี้ = ห้องนอน + 1 (ห้องน้ำกลาง) — กติกาจากเจ้าของ
   *  ใช้คูณบรรทัดที่ตั้ง qty_basis = per_bathroom (ทิชชูม้วน · คัตเติลบัด · หมวกอาบน้ำ · ถุงขยะห้องน้ำ) */
  const bathrooms = bedroomNames.length > 0 ? bedroomNames.length + 1 : 1;

  // เปลี่ยนหลังแล้วล้างของที่แก้ไว้ ไม่งั้นค่าค้างข้ามหลัง
  useEffect(() => {
    setQtyOverride({});
    setExtraBeds([]);
  }, [propertyCode]);

  /** รวมทุกบรรทัดที่จะเบิก แยกตามห้อง (ห้องประจำ + เตียงเสริม) */
  const groups = useMemo(() => {
    const rows: {
      key: string;
      presetId: string;
      room: string;
      label: string;
      guests: number;
      lines: {
        key: string;
        itemId: string;
        name: string;
        unit: string;
        hint: string;
        cls: string;
        qty: number;
        available: number;
        short: boolean;
      }[];
    }[] = [];

    const build = (
      keyPrefix: string,
      preset: StockPreset,
      room: string,
      label: string,
      guests: number,
    ) => {
      const lines = [...(preset.tmc_stock_preset_lines ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((l) => {
          const item = itemById.get(l.item_id);
          const base =
            l.qty_basis === "per_guest"
              ? Number(l.qty) * Math.max(guests, 1)
              : l.qty_basis === "per_bathroom"
                ? Number(l.qty) * bathrooms
                : Number(l.qty);
          const key = `${keyPrefix}|${l.id}`;
          const raw = qtyOverride[key];
          const qty = raw === undefined ? (l.is_optional ? 0 : base) : Number(raw || 0);
          const available = item ? homeQty(item) : 0;
          return {
            key,
            itemId: l.item_id,
            name: item?.name ?? "—",
            unit: item?.unit ?? "",
            // บอกที่มาของจำนวนไว้ข้างชื่อ จะได้รู้ว่าทำไมเลขนี้ (แก้ทับได้เสมอ)
            hint:
              l.qty_basis === "per_guest"
                ? `${l.qty}/คน`
                : l.qty_basis === "per_bathroom"
                  ? `${l.qty}/ห้องน้ำ × ${bathrooms}`
                  : l.is_optional
                    ? "เบิกเมื่อต้องการ"
                    : "",
            cls: item?.stock_class ?? "consumable",
            qty,
            available,
            short: qty > available,
          };
        });
      rows.push({ key: keyPrefix, presetId: preset.id, room, label, guests, lines });
    };

    for (const p of roomPresets) build(`room:${p.id}`, p, p.room_name ?? "", p.room_name ?? "", 1);

    for (const b of extraBeds) {
      const preset = bedPresets.find((p) => p.id === b.presetId);
      if (!preset || !b.room) continue;
      build(
        `bed:${b.key}`,
        preset,
        b.room,
        `${preset.name} — ${b.room} (${b.guests || 1} คน)`,
        Number(b.guests) || 1,
      );
    }
    return rows;
  }, [roomPresets, bedPresets, extraBeds, qtyOverride, itemById, homeQty, bathrooms]);

  /** ของชิ้นเดียวกันถูกเบิกจากหลายห้อง → ต้องรวมก่อนเทียบคงเหลือ ไม่งั้นเช็คทีละห้องผ่านแต่รวมแล้วไม่พอ */
  const shortByItem = useMemo(() => {
    const need = new Map<string, number>();
    for (const g of groups)
      for (const l of g.lines) need.set(l.itemId, (need.get(l.itemId) ?? 0) + l.qty);
    const out = new Map<string, { need: number; available: number }>();
    for (const [itemId, n] of Array.from(need.entries())) {
      const item = itemById.get(itemId);
      const available = item ? homeQty(item) : 0;
      if (n > available) out.set(itemId, { need: n, available });
    }
    return out;
  }, [groups, itemById, homeQty]);

  /** ยอดรวมทั้งหลังต่อรายการ — ใช้เป็น "ใบหยิบของ" (หยิบทีเดียวจบ ไม่ต้องไล่ทีละห้อง) */
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups)
      for (const l of g.lines) if (l.qty > 0) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.qty);
    return Array.from(m.entries())
      .map(([itemId, qty]) => {
        const item = itemById.get(itemId);
        const available = item ? homeQty(item) : 0;
        return {
          itemId,
          name: item?.name ?? "—",
          unit: item?.unit ?? "",
          cls: item?.stock_class ?? "consumable",
          qty,
          available,
          short: qty > available,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [groups, itemById, homeQty]);

  /** มุมมองที่ผ่านตัวกรอง — ใช้เรนเดอร์เท่านั้น (ห้ามเอาไปคิดยอด/ส่งเบิก) */
  const shownTotals = useMemo(
    () => (clsFilter === "all" ? totals : totals.filter((t) => t.cls === clsFilter)),
    [totals, clsFilter],
  );
  const shownGroups = useMemo(() => {
    if (clsFilter === "all") return groups;
    return groups
      .map((g) => ({ ...g, lines: g.lines.filter((l) => l.cls === clsFilter) }))
      .filter((g) => g.lines.length > 0);
  }, [groups, clsFilter]);

  const anyShort = shortByItem.size > 0;
  const totalQty = groups.reduce((s, g) => s + g.lines.reduce((t, l) => t + l.qty, 0), 0);
  const totalLines = groups.reduce((s, g) => s + g.lines.filter((l) => l.qty > 0).length, 0);

  async function submit() {
    setSaving(true);
    try {
      const h = await authHeader();
      const res = await fetch("/api/tmc/stock/issues", {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          orgId,
          propertyCode,
          note: note || null,
          groups: groups
            .map((g) => ({
              preset_id: g.presetId,
              room_name: g.room,
              lines: g.lines
                .filter((l) => l.qty > 0)
                .map((l) => ({ item_id: l.itemId, qty: l.qty })),
            }))
            .filter((g) => g.lines.length > 0),
        }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        toast.error(data.error ?? "เบิกไม่สำเร็จ");
        return;
      }
      toast.success(`เบิกแล้ว ${data.line_count} รายการ / ${data.total_qty} ชิ้น`);
      setOpen(false);
      setNote("");
      setQtyOverride({});
      setExtraBeds([]);
      onDone();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setSaving(false);
    }
  }

  async function voidIssue(id: string) {
    const h = await authHeader();
    const res = await fetch("/api/tmc/stock/issues", {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ orgId, id, reason: "ยกเลิกจากหน้าคลัง" }),
    });
    const data = await res.json().catch(() => ({}) as { error?: string });
    if (!res.ok) toast.error(data.error ?? "ยกเลิกไม่สำเร็จ");
    else {
      toast.success("ยกเลิกใบเบิกแล้ว — คืนของกลับที่เดิม");
      onDone();
    }
  }

  const pager = usePagination(issues, { pageSize: 15 });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          เบิกทีเดียวทั้งหลัง — แก้จำนวนรายห้องก่อนยืนยันได้เสมอ
        </p>
        <Button onClick={() => setOpen(true)} disabled={!canWrite}>
          <PackageCheck className="h-4 w-4" /> เบิกชุด
        </Button>
      </div>

      <Table stickyHeader fillViewport>
        <TableHeader sticky>
          <TableRow>
            <TableHead>วันที่</TableHead>
            <TableHead>หลัง</TableHead>
            <TableHead>หมายเหตุ</TableHead>
            <TableHead align="right">รายการ</TableHead>
            <TableHead align="right">รวม</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pager.rows.map((is) => (
            <TableRow key={is.id}>
              <TableCell className="text-gray-500">
                {new Date(is.created_at).toLocaleDateString("th-TH", {
                  day: "2-digit",
                  month: "short",
                })}
              </TableCell>
              <TableCell className="font-medium">
                {is.property_code ?? is.tmc_stock_presets?.name ?? "—"}
                {is.room_name ? ` · ${is.room_name}` : ""}
              </TableCell>
              <TableCell className="text-xs text-gray-400">{is.note ?? "—"}</TableCell>
              <TableCell align="right" className="tabular-nums">
                {is.line_count}
              </TableCell>
              <TableCell align="right" className="tabular-nums">
                {is.total_qty}
              </TableCell>
              <TableCell align="center">
                {is.status === "voided" ? (
                  <StatusBadge tone="neutral">ยกเลิกแล้ว</StatusBadge>
                ) : (
                  <StatusBadge tone="success">เบิกแล้ว</StatusBadge>
                )}
              </TableCell>
              <TableCell align="right">
                <span className="inline-flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    title="พิมพ์ใบเช็คของ"
                    className="text-gray-400 hover:text-gray-900"
                    onClick={() => setPrinting(is)}
                  >
                    <Printer className="h-3.5 w-3.5" /> พิมพ์
                  </Button>
                  {is.status === "posted" && canWrite && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => void voidIssue(is.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> ยกเลิก
                    </Button>
                  )}
                </span>
              </TableCell>
            </TableRow>
          ))}
          {issues.length === 0 && (
            <TableEmpty colSpan={7}>
              ยังไม่มีใบเบิก — กด &ldquo;เบิกชุด&rdquo; เพื่อเบิกของทั้งหลัง
            </TableEmpty>
          )}
        </TableBody>
      </Table>
      <TablePager pager={pager} unit="ใบ" />

      <IssuePrintDialog
        orgId={orgId}
        issue={printing}
        onClose={() => setPrinting(null)}
        authHeader={authHeader}
      />

      {/* ── กล่องเบิกชุด ─────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>
              <span className="inline-flex items-center gap-1.5">
                <PackageCheck className="h-4 w-4" /> เบิกชุด
              </span>
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>หลัง *</Label>
                <CustomSelect
                  value={propertyCode}
                  onChange={setPropertyCode}
                  options={[
                    { value: "", label: "— เลือกหลัง —" },
                    ...properties.map((l) => ({ value: l.code, label: l.name })),
                  ]}
                />
              </div>

              {/* เตียงเสริม — เลือกชนิดเตียง + ห้องที่เสริม + จำนวนคนที่เพิ่ม */}
              {propertyCode && (
                <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700">
                      <BedDouble className="h-4 w-4" /> เตียงเสริม
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setExtraBeds((b) => [
                          ...b,
                          {
                            key: `bed-${Date.now()}-${b.length}`,
                            presetId: bedPresets[0]?.id ?? "",
                            room: bedroomNames[0] ?? "",
                            guests: "1",
                          },
                        ])
                      }
                      disabled={bedPresets.length === 0}
                    >
                      <Plus className="h-4 w-4" /> เพิ่มเตียง
                    </Button>
                  </div>
                  {extraBeds.map((b, idx) => (
                    <div key={b.key} className="flex flex-wrap items-center gap-2">
                      <CustomSelect
                        value={b.presetId}
                        onChange={(v) =>
                          setExtraBeds((s) =>
                            s.map((x, i) => (i === idx ? { ...x, presetId: v } : x)),
                          )
                        }
                        className="w-40"
                        options={bedPresets.map((p) => ({ value: p.id, label: p.name }))}
                      />
                      <CustomSelect
                        value={b.room}
                        onChange={(v) =>
                          setExtraBeds((s) => s.map((x, i) => (i === idx ? { ...x, room: v } : x)))
                        }
                        className="w-44"
                        options={bedroomNames.map((r) => ({ value: r, label: r }))}
                      />
                      <Input
                        type="number"
                        className="h-8 w-20 text-right"
                        value={b.guests}
                        onChange={(e) =>
                          setExtraBeds((s) =>
                            s.map((x, i) => (i === idx ? { ...x, guests: e.target.value } : x)),
                          )
                        }
                      />
                      <span className="text-xs text-gray-500">คน</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-300 hover:bg-red-50 hover:text-red-500"
                        onClick={() => setExtraBeds((s) => s.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {extraBeds.length === 0 && (
                    <p className="text-xs text-gray-400">ไม่มีเตียงเสริม</p>
                  )}
                </div>
              )}

              {/* สลับมุมมอง: ใบหยิบของ (รวมทั้งหลัง) ↔ รายห้อง (แก้จำนวน) */}
              {propertyCode && groups.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedControl
                    value={lineView}
                    onChange={setLineView}
                    options={[
                      { value: "summary", label: "สรุปรวมทั้งหลัง" },
                      { value: "rooms", label: "แยกรายห้อง (แก้จำนวน)" },
                    ]}
                  />
                  {/* กรองชั้นของ — ของใช้ซ้ำต้องเก็บกลับ ของใช้แล้วหมดไปไม่ต้อง จึงหยิบคนละรอบ */}
                  <SegmentedControl
                    value={clsFilter}
                    onChange={setClsFilter}
                    ariaLabel="ชั้นของ"
                    options={[
                      { value: "all", label: "ทั้งหมด" },
                      { value: "reusable", label: "ของใช้ซ้ำ" },
                      { value: "consumable", label: "ใช้แล้วหมดไป" },
                    ]}
                  />
                </div>
              )}

              {/* ใบหยิบของ — รวมทุกห้อง + เตียงเสริมแล้ว */}
              {propertyCode && lineView === "summary" && (
                <Table className="rounded-none border-0 shadow-none">
                  <TableHeader>
                    <TableRow>
                      <TableHead>รายการ</TableHead>
                      <TableHead align="right">คงเหลือ</TableHead>
                      <TableHead align="right">ต้องหยิบ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shownTotals.map((t) => (
                      <TableRow key={t.itemId}>
                        <TableCell className="font-medium text-gray-900">{t.name}</TableCell>
                        <TableCell
                          align="right"
                          className={
                            t.short ? "tabular-nums text-red-600" : "tabular-nums text-gray-400"
                          }
                        >
                          {t.available} {t.unit}
                        </TableCell>
                        <TableCell
                          align="right"
                          className={
                            t.short
                              ? "font-semibold tabular-nums text-red-600"
                              : "font-semibold tabular-nums text-gray-900"
                          }
                        >
                          {t.qty} {t.unit}
                        </TableCell>
                      </TableRow>
                    ))}
                    {shownTotals.length === 0 && (
                      <TableEmpty colSpan={3}>
                        {totals.length === 0 ? "ยังไม่มีรายการ" : "ไม่มีรายการในหมวดที่กรอง"}
                      </TableEmpty>
                    )}
                  </TableBody>
                </Table>
              )}

              {/* รายการที่จะเบิก แยกตามห้อง */}
              {propertyCode && lineView === "rooms" && (
                <Table className="rounded-none border-0 shadow-none">
                  <TableHeader>
                    <TableRow>
                      <TableHead>รายการ</TableHead>
                      <TableHead align="right">คงเหลือ</TableHead>
                      <TableHead align="right">เบิก</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shownGroups.map((g) => (
                      <Fragment key={g.key}>
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="bg-gray-50 text-sm font-semibold text-gray-900"
                          >
                            {g.label}
                          </TableCell>
                        </TableRow>
                        {g.lines.map((l) => (
                          <TableRow key={l.key}>
                            <TableCell className="pl-6 text-gray-700">
                              {l.name}
                              {l.hint && (
                                <span className="ml-1.5 text-xs text-gray-400">({l.hint})</span>
                              )}
                            </TableCell>
                            <TableCell
                              align="right"
                              className={
                                shortByItem.has(l.itemId)
                                  ? "tabular-nums text-red-600"
                                  : "tabular-nums text-gray-400"
                              }
                            >
                              {l.available} {l.unit}
                            </TableCell>
                            <TableCell align="right">
                              <Input
                                type="number"
                                className="ml-auto h-8 w-20 text-right"
                                value={qtyOverride[l.key] ?? String(l.qty)}
                                onChange={(e) =>
                                  setQtyOverride((o) => ({ ...o, [l.key]: e.target.value }))
                                }
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
                    {shownGroups.length === 0 && (
                      <TableEmpty colSpan={3}>
                        {groups.length === 0
                          ? "หลังนี้ยังไม่มีชุดของประจำห้อง"
                          : "ไม่มีรายการในหมวดที่กรอง"}
                      </TableEmpty>
                    )}
                  </TableBody>
                </Table>
              )}

              {anyShort && (
                <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-2.5">
                  <p className="text-xs font-medium text-red-700">
                    ของไม่พอ (นับรวมทุกห้องในใบนี้แล้ว) — ลดจำนวนหรือใส่ 0 เพื่อข้าม
                  </p>
                  {Array.from(shortByItem.entries()).map(([itemId, s]) => (
                    <p key={itemId} className="text-xs text-red-600">
                      {itemById.get(itemId)?.name} — ต้องใช้ {s.need} มี {s.available}
                    </p>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>หมายเหตุ</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <span className="mr-auto text-sm text-gray-500">
              รวม {totalQty} ชิ้น / {totalLines} รายการ
            </span>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              onClick={submit}
              disabled={saving || !propertyCode || totalQty === 0 || anyShort}
            >
              {saving ? "กำลังเบิก…" : "ยืนยันเบิก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
