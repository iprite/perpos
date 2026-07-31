"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
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
import { PackageCheck, Trash2 } from "lucide-react";
import type { StockItem, StockLocation, StockBalance, StockPreset, StockIssue } from "./_types";

/** คำนวณจำนวนจริงของบรรทัด: fixed = ตามที่ตั้งไว้ · per_guest/per_night = คูณตัวคูณ */
function lineQty(qty: number, basis: string, guests: number, nights: number) {
  if (basis === "per_guest") return qty * Math.max(guests, 1);
  if (basis === "per_night") return qty * Math.max(nights, 1);
  return qty;
}

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
  const [presetId, setPresetId] = useState("");
  const [guests, setGuests] = useState("2");
  const [nights, setNights] = useState("1");
  const [note, setNote] = useState("");
  const [qtyOverride, setQtyOverride] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  /** ยอดคงเหลือ ณ จุดเก็บประจำของของชิ้นนั้น = ที่ที่ระบบจะไปหักจริง */
  const homeQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of balances) m.set(`${b.item_id}|${b.location_id}`, Number(b.qty));
    return (item: StockItem) =>
      item.default_location_id ? (m.get(`${item.id}|${item.default_location_id}`) ?? 0) : 0;
  }, [balances]);

  const properties = useMemo(() => locations.filter((l) => l.kind === "property"), [locations]);

  const scopedPresets = useMemo(
    () =>
      presets.filter(
        (p) =>
          p.is_active && (!p.property_code || !propertyCode || p.property_code === propertyCode),
      ),
    [presets, propertyCode],
  );

  const preset = presets.find((p) => p.id === presetId);

  // เปลี่ยนหลัง/ชุดแล้วล้างจำนวนที่แก้ไว้ ไม่งั้นค่าค้างข้ามชุด
  useEffect(() => setQtyOverride({}), [presetId]);

  const rows = useMemo(() => {
    if (!preset) return [];
    const g = Number(guests) || 1;
    const n = Number(nights) || 1;
    return [...(preset.tmc_stock_preset_lines ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => {
        const item = itemById.get(l.item_id);
        const suggested = lineQty(Number(l.qty), l.qty_basis, g, n);
        const raw = qtyOverride[l.id];
        const qty = raw === undefined ? (l.is_optional ? 0 : suggested) : Number(raw || 0);
        const available = item ? homeQty(item) : 0;
        return { line: l, item, suggested, qty, available, short: qty > available };
      });
  }, [preset, guests, nights, qtyOverride, itemById, homeQty]);

  const anyShort = rows.some((r) => r.short);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);

  async function submit() {
    if (!preset) return;
    setSaving(true);
    try {
      const h = await authHeader();
      const res = await fetch("/api/tmc/stock/issues", {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          orgId,
          presetId: preset.id,
          propertyCode: propertyCode || preset.property_code || null,
          guests: Number(guests) || null,
          nights: Number(nights) || null,
          note: note || null,
          lines: rows
            .filter((r) => r.qty > 0)
            .map((r) => ({ item_id: r.line.item_id, qty: r.qty })),
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
        <p className="text-sm text-gray-500">เบิกของตามชุดประจำห้อง — แก้จำนวนก่อนยืนยันได้เสมอ</p>
        <Button onClick={() => setOpen(true)} disabled={!canWrite}>
          <PackageCheck className="h-4 w-4" /> เบิกชุด
        </Button>
      </div>

      <Table stickyHeader fillViewport>
        <TableHeader sticky>
          <TableRow>
            <TableHead>วันที่</TableHead>
            <TableHead>ชุด</TableHead>
            <TableHead>หลัง / ห้อง</TableHead>
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
              <TableCell className="font-medium">{is.tmc_stock_presets?.name ?? "—"}</TableCell>
              <TableCell className="text-gray-500">
                {is.property_code ?? "—"}
                {is.room_name ? ` · ${is.room_name}` : ""}
              </TableCell>
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
              </TableCell>
            </TableRow>
          ))}
          {issues.length === 0 && (
            <TableEmpty colSpan={7}>
              ยังไม่มีใบเบิก — กด &ldquo;เบิกชุด&rdquo; เพื่อเบิกของตามชุดประจำห้อง
            </TableEmpty>
          )}
        </TableBody>
      </Table>
      <TablePager pager={pager} unit="ใบ" />

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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>หลัง</Label>
                  <CustomSelect
                    value={propertyCode}
                    onChange={(v) => {
                      setPropertyCode(v);
                      setPresetId("");
                    }}
                    options={[
                      { value: "", label: "— ทุกหลัง —" },
                      ...properties.map((l) => ({ value: l.code, label: l.name })),
                    ]}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>ชุด *</Label>
                  <CustomSelect
                    value={presetId}
                    onChange={setPresetId}
                    options={[
                      { value: "", label: "— เลือกชุด —" },
                      ...scopedPresets.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>จำนวนแขก</Label>
                  <Input
                    type="number"
                    value={guests}
                    onChange={(e) => setGuests(e.target.value)}
                    min={1}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>จำนวนคืน</Label>
                  <Input
                    type="number"
                    value={nights}
                    onChange={(e) => setNights(e.target.value)}
                    min={1}
                  />
                </div>
              </div>

              {preset && (
                <Table className="rounded-none border-0 shadow-none">
                  <TableHeader>
                    <TableRow>
                      <TableHead>รายการ</TableHead>
                      <TableHead align="right">คงเหลือ</TableHead>
                      <TableHead align="right">เบิก</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.line.id}>
                        <TableCell className="font-medium text-gray-900">
                          {r.item?.name ?? "—"}
                          {r.line.qty_basis !== "fixed" && (
                            <span className="ml-1 text-xs text-gray-400">
                              ({r.line.qty_basis === "per_guest" ? "ต่อคน" : "ต่อคืน"})
                            </span>
                          )}
                        </TableCell>
                        <TableCell
                          align="right"
                          className={
                            r.short ? "tabular-nums text-red-600" : "tabular-nums text-gray-400"
                          }
                        >
                          {r.available} {r.item?.unit}
                        </TableCell>
                        <TableCell align="right">
                          <Input
                            type="number"
                            className="ml-auto h-8 w-20 text-right"
                            value={qtyOverride[r.line.id] ?? String(r.qty)}
                            onChange={(e) =>
                              setQtyOverride((o) => ({ ...o, [r.line.id]: e.target.value }))
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && <TableEmpty colSpan={3}>ชุดนี้ยังไม่มีรายการ</TableEmpty>}
                  </TableBody>
                </Table>
              )}

              {anyShort && (
                <p className="text-xs text-red-600">
                  มีรายการที่ของไม่พอ — ลดจำนวนหรือใส่ 0 เพื่อข้ามบรรทัดนั้น (ระบบเบิกทั้งใบพร้อมกัน
                  ถ้าบรรทัดใดไม่พอจะไม่เบิกทั้งใบ)
                </p>
              )}

              <div className="space-y-1.5">
                <Label>หมายเหตุ</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <span className="mr-auto text-sm text-gray-500">
              รวม {totalQty} ชิ้น / {rows.filter((r) => r.qty > 0).length} รายการ
            </span>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={submit} disabled={saving || !preset || totalQty === 0 || anyShort}>
              {saving ? "กำลังเบิก…" : "ยืนยันเบิก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
