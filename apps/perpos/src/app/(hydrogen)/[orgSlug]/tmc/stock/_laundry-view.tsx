"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatusBadge } from "@/components/ui/badge";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
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
import { Shirt, PackageOpen, Undo2 } from "lucide-react";
import type { StockItem, StockLocation, StockBalance, LaundryBatch, LaundryPrice } from "./_types";

const today = () => new Date().toISOString().slice(0, 10);
const thDate = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { day: "2-digit", month: "short" });

export function LaundryView({
  orgId,
  items,
  locations,
  balances,
  batches,
  prices,
  accounts,
  authHeader,
  onDone,
}: {
  orgId: string;
  items: StockItem[];
  locations: StockLocation[];
  balances: StockBalance[];
  batches: LaundryBatch[];
  prices: LaundryPrice[];
  accounts: { id: string; name: string }[];
  authHeader: () => Promise<Record<string, string>>;
  onDone: () => void;
}) {
  const [sendOpen, setSendOpen] = useState(false);
  const [closing, setClosing] = useState<LaundryBatch | null>(null);
  const [saving, setSaving] = useState(false);

  // ── ฟอร์มส่งซัก ────────────────────────────────────────────────
  const vendors = useMemo(() => locations.filter((l) => l.kind === "laundry"), [locations]);
  const sources = useMemo(() => locations.filter((l) => l.kind !== "laundry"), [locations]);
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [sourceId, setSourceId] = useState(
    locations.find((l) => l.kind === "soiled")?.id ??
      locations.find((l) => l.kind === "linen_room")?.id ??
      "",
  );
  const [sentAt, setSentAt] = useState(today());
  const [refNo, setRefNo] = useState("");
  const [sendQty, setSendQty] = useState<Record<string, string>>({});

  const priceOf = useMemo(() => {
    const m = new Map(prices.map((p) => [p.item_id, Number(p.price_per_piece)]));
    return (id: string) => m.get(id) ?? null;
  }, [prices]);

  /** ผ้าที่อยู่ ณ จุดที่เลือกเป็นต้นทาง — ส่งซักได้เฉพาะของที่อยู่ตรงนั้นจริง */
  const sendable = useMemo(() => {
    const q = new Map<string, number>();
    for (const b of balances) if (b.location_id === sourceId) q.set(b.item_id, Number(b.qty));
    return items
      .filter((i) => i.stock_class === "reusable" && (q.get(i.id) ?? 0) > 0)
      .map((i) => ({ item: i, available: q.get(i.id) ?? 0 }));
  }, [items, balances, sourceId]);

  const sendLines = sendable
    .map((s) => ({ ...s, qty: Number(sendQty[s.item.id] || 0) }))
    .filter((s) => s.qty > 0);
  const sendTotal = sendLines.reduce((s, l) => s + l.qty, 0);
  const sendOver = sendLines.some((l) => l.qty > l.available);

  async function submitSend() {
    setSaving(true);
    try {
      const h = await authHeader();
      const res = await fetch("/api/tmc/stock/laundry", {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          orgId,
          vendorId,
          sourceId,
          sentAt,
          refNo: refNo || null,
          lines: sendLines.map((l) => ({ item_id: l.item.id, qty: l.qty })),
        }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        toast.error(data.error ?? "ส่งซักไม่สำเร็จ");
        return;
      }
      toast.success(`ส่งซักแล้ว ${data.total_sent} ผืน`);
      setSendOpen(false);
      setSendQty({});
      setRefNo("");
      onDone();
    } finally {
      setSaving(false);
    }
  }

  // ── ฟอร์มรับคืน (แบ่งรับได้หลายครั้ง) ──────────────────────────
  const [ret, setRet] = useState<Record<string, { returned: string; damaged: string }>>({});
  const [returnedAt, setReturnedAt] = useState(today());
  const [accountId, setAccountId] = useState("");
  const [costOverride, setCostOverride] = useState("");

  const returnLoc = locations.find((l) => l.kind === "linen_room");
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const readOnly = closing?.status === "closed";

  /** ค้างที่ร้าน = ส่งไป − คืนสะสม − เสียสะสม · ช่อง "คืนครั้งนี้" ตั้งต้นเท่าที่ยังค้าง */
  const closeRows = useMemo(() => {
    if (!closing) return [];
    return (closing.tmc_laundry_batch_lines ?? []).map((l) => {
      const already = Number(l.qty_returned) + Number(l.qty_damaged);
      const pending = Number(l.qty_sent) - already;
      const v = ret[l.id];
      const returned = v ? Number(v.returned || 0) : pending;
      const damaged = v ? Number(v.damaged || 0) : 0;
      return {
        line: l,
        item: itemById.get(l.item_id),
        pending,
        returned,
        damaged,
        left: pending - returned - damaged,
        price: l.unit_price ?? priceOf(l.item_id),
      };
    });
  }, [closing, ret, itemById, priceOf]);

  const closeInvalid = closeRows.some((r) => r.left < 0);
  const autoCost = closeRows.reduce((s, r) => s + r.returned * (r.price ?? 0), 0);
  const lotReturned = closeRows.reduce((s, r) => s + r.returned, 0);
  const lotDamaged = closeRows.reduce((s, r) => s + r.damaged, 0);
  const stillOut = closeRows.reduce((s, r) => s + Math.max(r.left, 0), 0);
  const receipts = useMemo(
    () => [...(closing?.tmc_laundry_receipts ?? [])].sort((a, b) => a.seq - b.seq),
    [closing],
  );

  function resetCloseForm() {
    setClosing(null);
    setRet({});
    setCostOverride("");
  }

  /** close = true → ส่วนที่ยังไม่กลับมาถือว่า "ขาด" แล้วปิดรอบ */
  async function submitReceive(close: boolean) {
    if (!closing) return;
    if (close && stillOut > 0) {
      const ok = window.confirm(
        `ยังมีผ้าค้างอยู่ที่ร้าน ${stillOut} ผืน — ปิดรอบตอนนี้จะถือว่าผ้าจำนวนนี้ "ขาด" ` +
          `และตัดออกจากทรัพย์สิน\n\nถ้าร้านจะทยอยส่งคืน ให้กด "บันทึกรับคืน" แทน`,
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      const h = await authHeader();
      const res = await fetch("/api/tmc/stock/laundry", {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({
          orgId,
          batchId: closing.id,
          close,
          returnLocationId: returnLoc?.id ?? null,
          returnedAt,
          accountId: accountId || null,
          cost: costOverride === "" ? null : Number(costOverride),
          lines: closeRows
            .filter((r) => r.returned > 0 || r.damaged > 0)
            .map((r) => ({ line_id: r.line.id, returned: r.returned, damaged: r.damaged })),
        }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        toast.error(data.error ?? (close ? "ปิดรอบไม่สำเร็จ" : "บันทึกรับคืนไม่สำเร็จ"));
        return;
      }
      toast.success(
        close
          ? `ปิดรอบแล้ว — คืน ${data.returned} · เสีย ${data.damaged} · ขาด ${data.missing} ผืน`
          : `รับคืนแล้ว ${data.returned} ผืน — ยังค้างที่ร้าน ${data.remaining} ผืน`,
      );
      resetCloseForm();
      onDone();
    } finally {
      setSaving(false);
    }
  }

  /** ยกเลิกปิดรอบ — ผ้าที่ถูกตัดเป็น "ขาด" กลับไปอยู่ที่ร้านตามเดิม */
  async function submitReopen() {
    if (!closing) return;
    const ok = window.confirm(
      `ยกเลิกปิดรอบนี้? ผ้าที่ถูกบันทึกว่า "ขาด" ${closing.total_missing} ผืน ` +
        `จะกลับไปอยู่ที่ร้านซัก แล้วรับคืนต่อได้\n\n(ผ้าที่บันทึกว่า "เสีย" จะไม่ถูกดึงกลับ)`,
    );
    if (!ok) return;
    setSaving(true);
    try {
      const h = await authHeader();
      const res = await fetch("/api/tmc/stock/laundry", {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({ orgId, batchId: closing.id, action: "reopen" }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        toast.error(data.error ?? "ยกเลิกปิดรอบไม่สำเร็จ");
        return;
      }
      toast.success(`ยกเลิกปิดรอบแล้ว — ผ้ากลับไปอยู่ที่ร้าน ${data.restored} ผืน`);
      resetCloseForm();
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const pager = usePagination(batches, { pageSize: 15 });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          ผ้าที่ส่งซักยังเป็นของเรา — ร้านทยอยส่งคืนได้หลายครั้ง ปิดรอบเมื่อ ส่งไป = คืน + เสีย +
          ขาด
        </p>
        <Button onClick={() => setSendOpen(true)} disabled={vendors.length === 0}>
          <Shirt className="h-4 w-4" /> ส่งซัก
        </Button>
      </div>

      <Table stickyHeader fillViewport>
        <TableHeader sticky>
          <TableRow>
            <TableHead>ส่งเมื่อ</TableHead>
            <TableHead>ร้าน</TableHead>
            <TableHead align="right">ส่งไป</TableHead>
            <TableHead align="right">คืนแล้ว</TableHead>
            <TableHead align="right">ค้างที่ร้าน</TableHead>
            <TableHead align="right">เสีย</TableHead>
            <TableHead align="right">ขาด</TableHead>
            <TableHead align="right">ค่าซัก</TableHead>
            <TableHead align="center">สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pager.rows.map((b) => {
            const pending =
              Number(b.total_sent) -
              Number(b.total_returned) -
              Number(b.total_damaged) -
              Number(b.total_missing);
            return (
              <TableRow key={b.id} clickable onClick={() => setClosing(b)}>
                <TableCell className="text-gray-500">{thDate(b.sent_at)}</TableCell>
                <TableCell className="font-medium">{b.vendor_name ?? "—"}</TableCell>
                <TableCell align="right" className="tabular-nums">
                  {b.total_sent}
                </TableCell>
                <TableCell align="right" className="tabular-nums">
                  {Number(b.total_returned) > 0 ? b.total_returned : "—"}
                </TableCell>
                <TableCell align="right" className="tabular-nums text-gray-500">
                  {b.status !== "closed" && pending > 0 ? pending : "—"}
                </TableCell>
                <TableCell align="right" className="tabular-nums text-amber-700">
                  {Number(b.total_damaged) > 0 ? b.total_damaged : "—"}
                </TableCell>
                <TableCell align="right" className="tabular-nums text-red-600">
                  {Number(b.total_missing) > 0 ? b.total_missing : "—"}
                </TableCell>
                <TableCell align="right" className="tabular-nums">
                  {b.laundry_cost ? `${Number(b.laundry_cost).toLocaleString("th-TH")} ฿` : "—"}
                </TableCell>
                <TableCell align="center">
                  {b.status === "closed" ? (
                    <StatusBadge tone="success">ปิดรอบแล้ว</StatusBadge>
                  ) : b.status === "partial" ? (
                    <StatusBadge tone="info">รับคืนบางส่วน</StatusBadge>
                  ) : (
                    <StatusBadge tone="warning">อยู่ที่ร้าน</StatusBadge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {batches.length === 0 && (
            <TableEmpty colSpan={9}>
              ยังไม่มีรอบซัก — กด &ldquo;ส่งซัก&rdquo; เพื่อเปิดรอบแรก
            </TableEmpty>
          )}
        </TableBody>
      </Table>
      <TablePager pager={pager} unit="รอบ" />

      {/* ── ส่งซัก ────────────────────────────────────────────────── */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>
              <span className="inline-flex items-center gap-1.5">
                <Shirt className="h-4 w-4" /> ส่งผ้าไปซัก
              </span>
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>ร้านซัก *</Label>
                  <CustomSelect
                    value={vendorId}
                    onChange={setVendorId}
                    options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>เก็บผ้าเปื้อนจาก *</Label>
                  <CustomSelect
                    value={sourceId}
                    onChange={(v) => {
                      setSourceId(v);
                      setSendQty({});
                    }}
                    options={sources.map((l) => ({ value: l.id, label: l.name }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>วันที่ส่ง</Label>
                  <ThaiDatePicker value={sentAt} onChange={setSentAt} />
                </div>
                <div className="space-y-1.5">
                  <Label>เลขที่ใบส่ง</Label>
                  <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} />
                </div>
              </div>

              <Table className="rounded-none border-0 shadow-none">
                <TableHeader>
                  <TableRow>
                    <TableHead>รายการ</TableHead>
                    <TableHead align="right">อยู่ที่นี่</TableHead>
                    <TableHead align="right">ส่งซัก</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sendable.map((s) => (
                    <TableRow key={s.item.id}>
                      <TableCell className="font-medium text-gray-900">{s.item.name}</TableCell>
                      <TableCell align="right" className="tabular-nums text-gray-400">
                        {s.available} {s.item.unit}
                      </TableCell>
                      <TableCell align="right">
                        <Input
                          type="number"
                          className="ml-auto h-8 w-20 text-right"
                          value={sendQty[s.item.id] ?? ""}
                          onChange={(e) =>
                            setSendQty((q) => ({ ...q, [s.item.id]: e.target.value }))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {sendable.length === 0 && (
                    <TableEmpty colSpan={3}>ไม่มีผ้าอยู่ที่จุดเก็บนี้</TableEmpty>
                  )}
                </TableBody>
              </Table>
              {sendOver && <p className="text-xs text-red-600">ส่งเกินจำนวนที่มีอยู่ที่จุดนี้</p>}
            </div>
          </DialogBody>
          <DialogFooter>
            <span className="mr-auto text-sm text-gray-500">
              รวม {sendTotal} ผืน / {sendLines.length} รายการ
            </span>
            <Button variant="outline" onClick={() => setSendOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              onClick={submitSend}
              disabled={saving || sendTotal === 0 || sendOver || !vendorId || !sourceId}
            >
              {saving ? "กำลังบันทึก…" : "ส่งซัก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── รับคืน (แบ่งรับได้) + ปิดรอบ ───────────────────────────── */}
      <Dialog open={!!closing} onOpenChange={(v) => !v && resetCloseForm()}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>
              <span className="inline-flex items-center gap-1.5">
                <PackageOpen className="h-4 w-4" />
                {readOnly ? "รอบซักที่ปิดแล้ว" : "รับผ้าคืน"} — {closing?.vendor_name}
              </span>
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              {readOnly ? (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  รอบนี้ปิดแล้วเมื่อ {closing?.returned_at ? thDate(closing.returned_at) : "—"} —
                  ผ้าที่ขาด {closing?.total_missing} ผืนถูกตัดออกจากทรัพย์สิน ·
                  ถ้าร้านส่งคืนมาทีหลัง ให้กด &ldquo;ยกเลิกปิดรอบ&rdquo; แล้วรับคืนต่อได้
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>วันที่รับคืน</Label>
                    <ThaiDatePicker value={returnedAt} onChange={setReturnedAt} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>รับเข้าที่</Label>
                    <p className="pt-2 text-sm text-gray-500">{returnLoc?.name ?? "—"}</p>
                  </div>
                </div>
              )}

              <Table className="rounded-none border-0 shadow-none">
                <TableHeader>
                  <TableRow>
                    <TableHead>รายการ</TableHead>
                    <TableHead align="right">ส่งไป</TableHead>
                    <TableHead align="right">คืนแล้ว</TableHead>
                    <TableHead align="right">ค้างที่ร้าน</TableHead>
                    {!readOnly && <TableHead align="right">คืนครั้งนี้</TableHead>}
                    {!readOnly && <TableHead align="right">เสีย</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closeRows.map((r) => (
                    <TableRow key={r.line.id}>
                      <TableCell className="font-medium text-gray-900">
                        {r.item?.name ?? "—"}
                      </TableCell>
                      <TableCell align="right" className="tabular-nums text-gray-400">
                        {r.line.qty_sent}
                      </TableCell>
                      <TableCell align="right" className="tabular-nums text-gray-500">
                        {Number(r.line.qty_returned) > 0 ? r.line.qty_returned : "—"}
                      </TableCell>
                      <TableCell
                        align="right"
                        className={
                          r.pending > 0
                            ? "font-semibold tabular-nums text-amber-700"
                            : "tabular-nums text-gray-400"
                        }
                      >
                        {r.pending > 0 ? r.pending : "—"}
                      </TableCell>
                      {!readOnly && (
                        <TableCell align="right">
                          <Input
                            type="number"
                            className="ml-auto h-8 w-16 text-right"
                            value={ret[r.line.id]?.returned ?? String(r.pending)}
                            onChange={(e) =>
                              setRet((s) => ({
                                ...s,
                                [r.line.id]: {
                                  returned: e.target.value,
                                  damaged: s[r.line.id]?.damaged ?? "0",
                                },
                              }))
                            }
                          />
                        </TableCell>
                      )}
                      {!readOnly && (
                        <TableCell align="right">
                          <Input
                            type="number"
                            className="ml-auto h-8 w-16 text-right"
                            value={ret[r.line.id]?.damaged ?? "0"}
                            onChange={(e) =>
                              setRet((s) => ({
                                ...s,
                                [r.line.id]: {
                                  returned: s[r.line.id]?.returned ?? String(r.pending),
                                  damaged: e.target.value,
                                },
                              }))
                            }
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {closeInvalid && (
                <p className="text-xs text-red-600">
                  คืน + เสีย มากกว่าที่ยังค้างอยู่ที่ร้าน — แก้จำนวนก่อน
                </p>
              )}
              {!readOnly && !closeInvalid && stillOut > 0 && (
                <p className="text-xs text-amber-700">
                  บันทึกครั้งนี้แล้วจะยังมีผ้าค้างที่ร้านอีก {stillOut} ผืน — กด
                  &ldquo;บันทึกรับคืน&rdquo; เพื่อเก็บไว้รับต่อ (ปิดรอบ = ถือว่าจำนวนนี้ขาด)
                </p>
              )}

              {receipts.length > 0 && (
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-gray-900">ประวัติการรับคืน</p>
                  <ul className="space-y-1 text-xs text-gray-600">
                    {receipts.map((rc) => (
                      <li key={rc.id} className="flex items-center justify-between gap-3">
                        <span>
                          ครั้งที่ {rc.seq} · {thDate(rc.received_at)}
                        </span>
                        <span className="tabular-nums">
                          คืน {rc.qty_returned}
                          {Number(rc.qty_damaged) > 0 ? ` · เสีย ${rc.qty_damaged}` : ""}
                          {rc.cost ? ` · ${Number(rc.cost).toLocaleString("th-TH")} ฿` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!readOnly && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>ค่าซักครั้งนี้ (บาท)</Label>
                    <Input
                      type="number"
                      value={costOverride}
                      placeholder={String(autoCost)}
                      onChange={(e) => setCostOverride(e.target.value)}
                    />
                    <p className="text-xs text-gray-400">
                      เว้นว่าง = คิดจากราคาต่อผืนของที่คืนครั้งนี้ (
                      {autoCost.toLocaleString("th-TH")} ฿)
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>จ่ายจากบัญชี</Label>
                    <CustomSelect
                      value={accountId}
                      onChange={setAccountId}
                      options={[
                        { value: "", label: "— ยังไม่บันทึกค่าใช้จ่าย —" },
                        ...accounts.map((a) => ({ value: a.id, label: a.name })),
                      ]}
                    />
                  </div>
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            {readOnly ? (
              <>
                <Button
                  variant="outline"
                  className="mr-auto"
                  onClick={submitReopen}
                  disabled={saving}
                >
                  <Undo2 className="h-4 w-4" />
                  {saving ? "กำลังยกเลิก…" : "ยกเลิกปิดรอบ"}
                </Button>
                <Button variant="outline" onClick={resetCloseForm}>
                  ปิด
                </Button>
              </>
            ) : (
              <>
                <span className="mr-auto text-sm text-gray-500">
                  ครั้งนี้ คืน {lotReturned}
                  {lotDamaged > 0 ? ` · เสีย ${lotDamaged}` : ""} ผืน
                </span>
                <Button variant="outline" onClick={resetCloseForm}>
                  ยกเลิก
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => submitReceive(false)}
                  disabled={saving || closeInvalid || lotReturned + lotDamaged === 0}
                >
                  {saving ? "กำลังบันทึก…" : "บันทึกรับคืน"}
                </Button>
                <Button onClick={() => submitReceive(true)} disabled={saving || closeInvalid}>
                  {saving ? "กำลังปิดรอบ…" : "ปิดรอบ"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
