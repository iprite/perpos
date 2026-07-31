"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { FilterSearch } from "@/components/ui/filter-bar";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ClipboardList } from "lucide-react";
import type { StockItem, StockLocation, StockBalance } from "./_types";

/** ตั้งยอดตั้งต้น / ปรับยอดตามที่นับได้ — กรอกทีเดียวหลายรายการต่อจุดเก็บ
 *  ระบบบันทึกเป็น movement 'adjust' ต่อรายการ (ยอดยังมาจาก movement ทางเดียวเสมอ)
 */
export function SetCountsDialog({
  orgId,
  open,
  onOpenChange,
  items,
  locations,
  balances,
  authHeader,
  onDone,
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: StockItem[];
  locations: StockLocation[];
  balances: StockBalance[];
  authHeader: () => Promise<Record<string, string>>;
  onDone: () => void;
}) {
  const [locationId, setLocationId] = useState("");

  // จุดเก็บโหลดมาทีหลัง (กล่องถูก mount ไว้ตั้งแต่หน้ายังไม่มีข้อมูล) → ตั้งค่าเริ่มต้นเมื่อมีของจริง
  useEffect(() => {
    if (!locationId && locations.length > 0) {
      setLocationId(locations.find((l) => l.is_default)?.id ?? locations[0].id);
    }
  }, [locations, locationId]);
  const [reason, setReason] = useState<"opening" | "count">("opening");
  const [cls, setCls] = useState<"all" | "consumable" | "reusable">("all");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const qtyAt = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of balances) if (b.location_id === locationId) m.set(b.item_id, Number(b.qty));
    return m;
  }, [balances, locationId]);

  /** ผ้าอยู่ได้แค่วงจรผ้า (ห้องผ้าสะอาด / ผ้าเปื้อนรอส่ง / ร้านซัก)
   *  ถ้าเลือกจุดเก็บอื่นแล้วยังใส่ยอดผ้าได้ ยอดจะไปกองผิดที่แล้วหน้าเบิกของจะเห็นเป็น 0 */
  const isLinenLoc = useMemo(() => {
    const kind = locations.find((l) => l.id === locationId)?.kind;
    return ["linen_room", "soiled", "laundry"].includes(kind ?? "");
  }, [locations, locationId]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (
      items
        .filter((i) => (cls === "all" ? true : i.stock_class === cls))
        // วงจรผ้า = ผ้าเท่านั้น · ที่อื่น = ทุกอย่างยกเว้นผ้า (ด่านเดียวกันนี้บังคับที่ DB ด้วย)
        .filter((i) =>
          ["linen", "bedding"].includes(i.item_group ?? "") ? isLinenLoc : !isLinenLoc,
        )
        .filter((i) => (term ? i.name.toLowerCase().includes(term) : true))
        .map((i) => ({ item: i, current: qtyAt.get(i.id) ?? 0 }))
    );
  }, [items, cls, q, qtyAt, isLinenLoc]);

  /** ส่งเฉพาะแถวที่กรอกและค่าต่างจากเดิม — ไม่ต้องกรอกครบทุกรายการ */
  const changed = useMemo(
    () =>
      rows
        .map((r) => ({ ...r, typed: draft[r.item.id] }))
        .filter((r) => r.typed !== undefined && r.typed !== "" && Number(r.typed) !== r.current)
        .map((r) => ({ item_id: r.item.id, qty: Number(r.typed) }))
        .filter((r) => Number.isFinite(r.qty) && r.qty >= 0),
    [rows, draft],
  );

  async function submit() {
    setSaving(true);
    try {
      const h = await authHeader();
      const res = await fetch("/api/tmc/stock/movements", {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          orgId,
          action: "set_counts",
          locationId,
          reason,
          note: reason === "opening" ? "ตั้งยอดตั้งต้น" : "ปรับตามที่นับได้",
          lines: changed,
        }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        toast.error(data.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      toast.success(`ตั้งยอดแล้ว ${data.updated} รายการ`);
      setDraft({});
      onOpenChange(false);
      onDone();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setSaving(false);
    }
  }

  const locName = locations.find((l) => l.id === locationId)?.name ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-1.5">
              <ClipboardList className="h-4 w-4" /> ตั้งยอดคงเหลือ
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody fixedHeight className="flex flex-col overflow-hidden">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>จุดเก็บ *</Label>
                <CustomSelect
                  value={locationId}
                  onChange={(v) => {
                    setLocationId(v);
                    setDraft({});
                  }}
                  options={locations.map((l) => ({ value: l.id, label: l.name }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>บันทึกเป็น</Label>
                <SegmentedControl
                  value={reason}
                  onChange={setReason}
                  size="md"
                  fullWidth
                  options={[
                    { value: "opening", label: "ยอดตั้งต้น" },
                    { value: "count", label: "นับสต๊อก" },
                  ]}
                />
              </div>
            </div>

            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
              {isLinenLoc
                ? "จุดเก็บในวงจรผ้า — เห็นเฉพาะผ้า/เครื่องนอน (ของอื่นเก็บที่นี่ไม่ได้)"
                : "จุดเก็บนี้ไม่ใช่ที่เก็บผ้า — รายการผ้า/เครื่องนอนถูกซ่อนไว้ (ผ้าอยู่ได้เฉพาะ ห้องผ้าสะอาด · ผ้าเปื้อนรอส่ง · ร้านซัก)"}
            </p>
            {/* กติกาเดียวกันนี้บังคับที่ trigger ของ DB ด้วย — ทุกทางเข้าจึงเจอกฎเดียวกัน */}

            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                value={cls}
                onChange={setCls}
                options={[
                  { value: "all", label: "ทั้งหมด" },
                  { value: "consumable", label: "ใช้แล้วหมดไป" },
                  { value: "reusable", label: "ใช้ซ้ำ" },
                ]}
              />
              <FilterSearch value={q} onChange={setQ} placeholder="ค้นหาชื่อรายการ" />
            </div>
          </div>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            <Table className="rounded-none border-0 shadow-none">
              <TableHeader sticky>
                <TableRow>
                  <TableHead>รายการ</TableHead>
                  <TableHead align="right">ในระบบตอนนี้</TableHead>
                  <TableHead align="right">ยอดจริง</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const typed = draft[r.item.id];
                  const diff =
                    typed !== undefined && typed !== "" ? Number(typed) - r.current : null;
                  return (
                    <TableRow key={r.item.id}>
                      <TableCell className="font-medium text-gray-900">
                        {r.item.name}
                        {diff !== null && diff !== 0 && (
                          <span
                            className={
                              diff > 0 ? "ml-2 text-xs text-green-600" : "ml-2 text-xs text-red-600"
                            }
                          >
                            {diff > 0 ? `+${diff}` : `−${Math.abs(diff)}`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell align="right" className="tabular-nums text-gray-400">
                        {r.current} {r.item.unit}
                      </TableCell>
                      <TableCell align="right">
                        <Input
                          type="number"
                          min={0}
                          className="ml-auto h-8 w-24 text-right"
                          placeholder={String(r.current)}
                          value={typed ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, [r.item.id]: e.target.value }))}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && <TableEmpty colSpan={3}>ไม่พบรายการ</TableEmpty>}
              </TableBody>
            </Table>
          </div>
        </DialogBody>
        <DialogFooter>
          <span className="mr-auto text-sm text-gray-500">
            {changed.length > 0
              ? `จะตั้งยอดที่ "${locName}" ${changed.length} รายการ`
              : `กรอกเฉพาะรายการที่ต้องการตั้งยอด (${locName})`}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={saving || changed.length === 0}>
            {saving ? "กำลังบันทึก…" : "บันทึกยอด"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
