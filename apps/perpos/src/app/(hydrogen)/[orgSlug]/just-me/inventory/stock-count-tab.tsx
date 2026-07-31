"use client";

/**
 * แท็บ "ตรวจนับสต๊อก" ของหน้าคลัง — เปิดใบนับต่อคลัง → กรอกยอดนับจริง → ลงบัญชีปรับยอด
 *
 * ⛔ ตัวเลขทุกช่อง (ผลต่าง/มูลค่า/จำนวนบรรทัดที่ต่าง) มาจาก `lib/just-me/stock-count.ts`
 *    หน้าไม่คิดสูตรเอง (ยกเว้นผลต่างต่อบรรทัดที่เรียก `lineDiff` ตัวเดียวกับ server)
 * ⛔ ลงบัญชีแล้วย้อนไม่ได้ → ต้องมี dialog ยืนยันที่สรุปเป็นประโยคก่อนเสมอ
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatusBadge } from "@/components/ui/badge";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "@/lib/toast";
import { ArrowLeft, ClipboardCheck, Loader2, Plus } from "lucide-react";
import { lineDiff, type StockCountSummary } from "@/lib/just-me/stock-count";

interface CountRow {
  id: string;
  count_code: string;
  warehouse_id: string;
  status: "draft" | "posted" | "cancelled";
  counted_date: string;
  note: string | null;
  posted_at: string | null;
  summary: StockCountSummary;
}

interface DetailLine {
  id: string;
  item_id: string;
  item_name: string;
  unit: string;
  system_qty: number;
  counted_qty: number | null;
  note: string | null;
  avg_cost: number | null;
}

interface Props {
  orgId: string;
  authToken: string;
  warehouses: { id: string; name: string; type: string }[];
  items: { id: string; name: string; code: string }[];
  /** เรียกเมื่อยอดคลังเปลี่ยน (ลงบัญชีปรับยอด) เพื่อให้หน้าโหลดข้อมูลคลังใหม่ */
  onStockChanged: () => void | Promise<void>;
}

const fmtQty = (v: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(v);
const fmtMoney = (v: number) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });

const STATUS: Record<CountRow["status"], { label: string; tone: "neutral" | "success" | "info" }> =
  {
    draft: { label: "กำลังนับ", tone: "info" },
    posted: { label: "ลงบัญชีแล้ว", tone: "success" },
    cancelled: { label: "ยกเลิก", tone: "neutral" },
  };

export function StockCountTab({ orgId, authToken, warehouses, items, onStockChanged }: Props) {
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  // ใบใหม่
  const [newOpen, setNewOpen] = useState(false);
  const [newWarehouse, setNewWarehouse] = useState("");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  const pager = usePagination(counts);
  const headers = useMemo(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }),
    [authToken],
  );

  const loadList = useCallback(async () => {
    if (!orgId || !authToken) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/just-me/inventory/stock-counts?orgId=${orgId}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "โหลดรายการใบตรวจนับไม่สำเร็จ");
      setCounts(json.counts ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "โหลดรายการใบตรวจนับไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [orgId, authToken, headers]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const createCount = async () => {
    if (!newWarehouse) {
      toast.error("กรุณาเลือกคลังที่จะตรวจนับ");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/just-me/inventory/stock-counts?orgId=${orgId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ warehouseId: newWarehouse, countedDate: newDate, note: newNote }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "เปิดใบตรวจนับไม่สำเร็จ");
      toast.success(`เปิดใบตรวจนับ ${json.count.count_code} แล้ว (${json.lines} รายการ)`);
      setNewOpen(false);
      setNewNote("");
      await loadList();
      setOpenId(json.count.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เปิดใบตรวจนับไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "—";

  if (openId) {
    return (
      <StockCountDetail
        countId={openId}
        orgId={orgId}
        headers={headers}
        items={items}
        warehouseName={warehouseName}
        onBack={async () => {
          setOpenId(null);
          await loadList();
        }}
        onStockChanged={onStockChanged}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          นับของจริงที่หน้างานแล้วปรับยอดในระบบให้ตรง — ผลต่างทุกบรรทัดต้องมีเหตุผลกำกับ
        </p>
        <Button size="sm" onClick={() => setNewOpen(true)} disabled={warehouses.length === 0}>
          <Plus className="h-4 w-4" /> เปิดใบนับใหม่
        </Button>
      </div>

      <Table stickyHeader fillViewport>
        <TableHeader sticky>
          <TableRow>
            <TableHead>เลขที่ใบนับ</TableHead>
            <TableHead>คลัง</TableHead>
            <TableHead>วันที่นับ</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead align="right">รายการที่ต่าง</TableHead>
            <TableHead align="right">มูลค่าผลต่าง (฿)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableEmpty colSpan={6}>กำลังโหลด…</TableEmpty>
          ) : counts.length === 0 ? (
            <TableEmpty colSpan={6}>
              ยังไม่มีใบตรวจนับ — กด “เปิดใบนับใหม่” เพื่อเริ่มนับของจริงในคลัง
            </TableEmpty>
          ) : (
            pager.rows.map((c) => (
              <TableRow key={c.id} clickable onClick={() => setOpenId(c.id)}>
                <TableCell className="font-medium text-gray-900">{c.count_code}</TableCell>
                <TableCell>{warehouseName(c.warehouse_id)}</TableCell>
                <TableCell>{fmtDate(c.counted_date)}</TableCell>
                <TableCell align="center">
                  <StatusBadge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</StatusBadge>
                </TableCell>
                <TableCell align="right" className="tabular-nums">
                  {c.summary.diffLines} / {c.summary.totalLines} รายการ
                </TableCell>
                <TableCell align="right" tabular>
                  {c.summary.diffValue === null ? (
                    "—"
                  ) : (
                    <span
                      className={
                        c.summary.diffValue < 0
                          ? "text-red-600"
                          : c.summary.diffValue > 0
                            ? "text-green-600"
                            : ""
                      }
                    >
                      {c.summary.diffValue < 0 ? "−" : ""}
                      {fmtMoney(Math.abs(c.summary.diffValue))}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <TablePager pager={pager} unit="ใบ" />

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>เปิดใบตรวจนับใหม่</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label htmlFor="sc-wh">คลังที่จะตรวจนับ *</Label>
                <CustomSelect
                  value={newWarehouse}
                  onChange={setNewWarehouse}
                  className="mt-1"
                  options={[
                    { value: "", label: "— เลือกคลัง —" },
                    ...warehouses.map((w) => ({
                      value: w.id,
                      label: `${w.name} (${w.type === "central" ? "คลังกลาง" : "ไซต์งาน"})`,
                    })),
                  ]}
                />
              </div>
              <div>
                <Label>วันที่นับ</Label>
                <div className="mt-1">
                  <ThaiDatePicker value={newDate} onChange={setNewDate} />
                </div>
              </div>
              <div>
                <Label htmlFor="sc-note">หมายเหตุ</Label>
                <Input
                  id="sc-note"
                  className="mt-1"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="เช่น นับประจำเดือน / ก่อนปิดไซต์"
                />
              </div>
              <p className="text-xs text-gray-500">
                ระบบจะบันทึก “ยอดตามระบบ” ของวัสดุทุกตัวที่มีอยู่ในคลังนี้ไว้เป็นตัวตั้งต้น
                แล้วให้กรอกยอดที่นับได้จริง
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={createCount} disabled={saving}>
              {saving ? "กำลังเปิดใบ…" : "เปิดใบนับ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── รายละเอียดใบนับ ─────────────────────────────────────────────────────────

interface DetailProps {
  countId: string;
  orgId: string;
  headers: Record<string, string>;
  items: { id: string; name: string; code: string }[];
  warehouseName: (id: string) => string;
  onBack: () => void | Promise<void>;
  onStockChanged: () => void | Promise<void>;
}

function StockCountDetail({
  countId,
  orgId,
  headers,
  items,
  warehouseName,
  onBack,
  onStockChanged,
}: DetailProps) {
  const [count, setCount] = useState<CountRow | null>(null);
  const [lines, setLines] = useState<DetailLine[]>([]);
  const [draft, setDraft] = useState<Record<string, { counted: string; note: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addItemId, setAddItemId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/just-me/inventory/stock-counts/${countId}?orgId=${orgId}`, {
        headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "โหลดใบตรวจนับไม่สำเร็จ");
      setCount(json.count);
      setLines(json.lines ?? []);
      const next: Record<string, { counted: string; note: string }> = {};
      for (const l of json.lines ?? []) {
        next[l.id] = {
          counted: l.counted_qty === null ? "" : String(l.counted_qty),
          note: l.note ?? "",
        };
      }
      setDraft(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "โหลดใบตรวจนับไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [countId, orgId, headers]);

  useEffect(() => {
    load();
  }, [load]);

  const editable = count?.status === "draft";

  /** ผลต่างของบรรทัดตามที่กำลังกรอกอยู่ (ใช้กฎเดียวกับ server) */
  const diffOf = (line: DetailLine): number | null =>
    lineDiff({
      system_qty: line.system_qty,
      counted_qty: draft[line.id]?.counted === "" ? null : Number(draft[line.id]?.counted),
    });

  const pending = useMemo(() => {
    let diffLines = 0;
    let value = 0;
    let hasValue = false;
    let missingReason = 0;
    for (const line of lines) {
      const entry = draft[line.id];
      const d = lineDiff({
        system_qty: line.system_qty,
        counted_qty: !entry || entry.counted === "" ? null : Number(entry.counted),
      });
      if (d === null || d === 0) continue;
      diffLines += 1;
      if (!entry?.note.trim()) missingReason += 1;
      if (line.avg_cost !== null) {
        value += d * line.avg_cost;
        hasValue = true;
      }
    }
    return { diffLines, value: hasValue ? value : null, missingReason };
  }, [lines, draft]);

  const patch = async (body: Record<string, unknown>, okMessage: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/just-me/inventory/stock-counts/${countId}?orgId=${orgId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "บันทึกไม่สำเร็จ");
      toast.success(okMessage);
      return json;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const payload = lines.map((l) => ({
      id: l.id,
      counted_qty: draft[l.id]?.counted === "" ? null : Number(draft[l.id]?.counted),
      note: draft[l.id]?.note ?? "",
    }));
    const json = await patch({ action: "save", lines: payload }, "บันทึกยอดนับแล้ว");
    if (json) await load();
  };

  const post = async () => {
    // บันทึกที่กรอกค้างก่อนเสมอ ไม่งั้น server ปรับยอดจากค่าที่ยังไม่ถูกบันทึก
    await save();
    const json = await patch({ action: "post" }, "ลงบัญชีปรับยอดเรียบร้อย");
    setConfirmOpen(false);
    if (json) {
      await load();
      await onStockChanged();
    }
  };

  const cancelCount = async () => {
    const json = await patch({ action: "cancel" }, "ยกเลิกใบตรวจนับแล้ว");
    if (json) await onBack();
  };

  const addItem = async () => {
    if (!addItemId) return;
    const json = await patch({ action: "add_item", itemId: addItemId }, "เพิ่มวัสดุเข้าใบนับแล้ว");
    if (json) {
      setAddItemId("");
      await load();
    }
  };

  if (loading || !count) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onBack()}>
          <ArrowLeft className="h-4 w-4" /> กลับ
        </Button>
        <span className="text-sm font-semibold text-gray-900">{count.count_code}</span>
        <span className="text-sm text-gray-500">
          {warehouseName(count.warehouse_id)} · {fmtDate(count.counted_date)}
        </span>
        <StatusBadge tone={STATUS[count.status].tone}>{STATUS[count.status].label}</StatusBadge>
        <div className="ms-auto flex items-center gap-2">
          {editable && (
            <>
              <Button variant="outline" size="sm" onClick={cancelCount} disabled={busy}>
                ยกเลิกใบนี้
              </Button>
              <Button variant="secondary" size="sm" onClick={save} disabled={busy}>
                {busy ? "กำลังบันทึก…" : "บันทึกยอดนับ"}
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={busy || pending.diffLines === 0}
              >
                <ClipboardCheck className="h-4 w-4" /> ลงบัญชีปรับยอด
              </Button>
            </>
          )}
        </div>
      </div>

      {editable && pending.missingReason > 0 && (
        <p className="text-xs text-amber-700">
          มี {pending.missingReason} รายการที่ยอดไม่ตรงแต่ยังไม่ได้ระบุเหตุผล — ต้องกรอกก่อนลงบัญชี
        </p>
      )}

      {editable && (
        <div className="flex items-end gap-2">
          <div className="w-72">
            <Label>เพิ่มวัสดุที่ไม่มีในใบ (เจอของจริงแต่ระบบไม่มียอด)</Label>
            <CustomSelect
              className="mt-1"
              value={addItemId}
              onChange={setAddItemId}
              options={[
                { value: "", label: "— เลือกวัสดุ —" },
                ...items
                  .filter((i) => !lines.some((l) => l.item_id === i.id))
                  .map((i) => ({ value: i.id, label: `${i.name} (${i.code})` })),
              ]}
            />
          </div>
          <Button variant="outline" size="sm" onClick={addItem} disabled={!addItemId || busy}>
            เพิ่ม
          </Button>
        </div>
      )}

      <Table stickyHeader fillViewport>
        <TableHeader sticky>
          <TableRow>
            <TableHead>วัสดุ</TableHead>
            <TableHead align="right">ยอดตามระบบ</TableHead>
            <TableHead align="right">ยอดนับจริง</TableHead>
            <TableHead align="right">ผลต่าง</TableHead>
            <TableHead>เหตุผล (บังคับเมื่อยอดไม่ตรง)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 ? (
            <TableEmpty colSpan={5}>ใบนี้ยังไม่มีวัสดุ — เพิ่มวัสดุที่จะนับด้านบน</TableEmpty>
          ) : (
            lines.map((line) => {
              const d = diffOf(line);
              return (
                <TableRow key={line.id}>
                  <TableCell className="font-medium text-gray-900">{line.item_name}</TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {fmtQty(line.system_qty)} {line.unit}
                  </TableCell>
                  <TableCell align="right">
                    {editable ? (
                      <Input
                        type="number"
                        className="w-28 text-right"
                        value={draft[line.id]?.counted ?? ""}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [line.id]: {
                              counted: e.target.value,
                              note: prev[line.id]?.note ?? "",
                            },
                          }))
                        }
                        placeholder="—"
                      />
                    ) : (
                      <span className="tabular-nums">
                        {line.counted_qty === null ? "—" : fmtQty(line.counted_qty)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {d === null ? (
                      <span className="text-gray-400">ยังไม่นับ</span>
                    ) : d === 0 ? (
                      <span className="text-gray-500">0</span>
                    ) : (
                      <span className={d < 0 ? "text-red-600" : "text-green-600"}>
                        {d < 0 ? "−" : "+"}
                        {fmtQty(Math.abs(d))} {line.unit}
                      </span>
                    )}
                  </TableCell>
                  <TableCell wrap>
                    {editable ? (
                      <Input
                        value={draft[line.id]?.note ?? ""}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [line.id]: {
                              counted: prev[line.id]?.counted ?? "",
                              note: e.target.value,
                            },
                          }))
                        }
                        placeholder={d !== null && d !== 0 ? "เช่น ของหายที่ไซต์" : ""}
                        className={
                          d !== null && d !== 0 && !draft[line.id]?.note.trim()
                            ? "border-amber-400"
                            : ""
                        }
                      />
                    ) : (
                      <span className="text-xs text-gray-600">{line.note || "—"}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>ยืนยันการลงบัญชีปรับยอด</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm leading-relaxed text-gray-700">
              ระบบจะปรับยอดคงเหลือของคลัง <b>{warehouseName(count.warehouse_id)}</b> จำนวน{" "}
              <b>{pending.diffLines} รายการ</b>
              {pending.value !== null && (
                <>
                  {" "}
                  คิดเป็นมูลค่ารวม{" "}
                  <b className={pending.value < 0 ? "text-red-600" : "text-green-600"}>
                    {pending.value < 0 ? "−" : "+"}
                    {fmtMoney(Math.abs(pending.value))} ฿
                  </b>
                </>
              )}{" "}
              ตามยอดที่นับได้จริง โดยจะบันทึกเป็นรายการรับเข้า/เบิกออกในประวัติคลัง
            </p>
            <p className="mt-3 text-sm font-medium text-red-600">
              เมื่อลงบัญชีแล้วใบนี้จะแก้ไขไม่ได้อีก และย้อนกลับไม่ได้
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={post} disabled={busy}>
              {busy ? "กำลังลงบัญชี…" : "ยืนยันลงบัญชี"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
