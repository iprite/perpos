"use client";

// item-dialog.tsx — Dialog "ตรวจรายการ" (หัวใจของ workflow ตรวจ 84 แถว)
//
// กติกาที่ล็อกไว้ (contract §5.9 B-B3 / N7 / A-4):
//  - **auto-save ทุกทางออก** (ถัดไป/ก่อนหน้า/ปิด/Esc/คลิกนอก) + ตัวบ่งชี้ "✓ บันทึกแล้ว"
//    → **ไม่มี ConfirmDialog "ทิ้งการแก้ไข?"**
//  - **dirty-check เทียบค่าจริงกับ snapshot ตอนเปิด** (ไม่ใช่ event onChange/focus)
//    → เปิด-ปิดเฉย ๆ จะไม่ยิง PATCH เลย สถานะ "ยืนยันแล้ว" จึงไม่หลุด (A-4 ย้อน source='manual')
//  - คิว freeze ตอนเปิด (parent ส่ง queue มาแล้ว) · รายการสุดท้าย → "ยืนยัน & ปิด"
//  - คีย์ลัด ← → เปลี่ยนรายการ · ⌘/Ctrl+Enter ยืนยัน&ถัดไป · Esc ปิด (บันทึกให้)
//    (ปิด ←/→ ชั่วคราวเมื่อโฟกัสอยู่ในช่องกรอก)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, ImageOff, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import type { CatalogItem } from "@/lib/gov-procure/catalog";
import { govApi } from "../../_components/api";
import { ConfidenceBadge, SourceBadge } from "./badges";
import { fmtDateTime, fmtMoney, isItemLocked, priceEstimateLabel } from "./format";

interface Draft {
  name: string;
  brand_model: string;
  spec_line: string;
  size_line: string;
  bullets: string;
  care_notes: string;
  caution_notes: string;
  category: string;
  qty: string;
  unit: string;
  unit_price_ref: string;
  price_min: string;
  price_max: string;
}

function linesToText(v: string[]): string {
  return v.join("\n");
}

function textToLines(v: string): string[] {
  return v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function numToText(v: number | null): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

function textToNum(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function toDraft(item: CatalogItem): Draft {
  return {
    name: item.name ?? "",
    brand_model: item.brand_model ?? "",
    spec_line: item.spec_line ?? "",
    size_line: item.size_line ?? "",
    bullets: linesToText(item.bullets),
    care_notes: linesToText(item.care_notes),
    caution_notes: linesToText(item.caution_notes),
    category: item.category ?? "",
    qty: numToText(item.qty),
    unit: item.unit ?? "",
    unit_price_ref: numToText(item.unit_price_ref),
    price_min: numToText(item.price_min),
    price_max: numToText(item.price_max),
  };
}

/** payload เฉพาะฟิลด์ที่ "ค่าเปลี่ยนจริง" เทียบ snapshot ตอนเปิด (deep-equal) */
function buildPatch(base: Draft, next: Draft): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const text = ["name", "brand_model", "spec_line", "size_line", "category", "unit"] as const;
  for (const k of text) {
    if (base[k] !== next[k]) patch[k] = next[k].trim();
  }
  const lists = ["bullets", "care_notes", "caution_notes"] as const;
  for (const k of lists) {
    if (base[k] !== next[k]) patch[k] = textToLines(next[k]);
  }
  const nums = ["qty", "unit_price_ref", "price_min", "price_max"] as const;
  for (const k of nums) {
    if (base[k] !== next[k]) patch[k] = textToNum(next[k]);
  }
  return patch;
}

export function ItemReviewDialog({
  open,
  item,
  queueIndex,
  queueSize,
  totalItems,
  canWrite,
  orgId,
  catalogId,
  imageUrl,
  onItemUpdated,
  onNavigate,
  onClose,
}: {
  open: boolean;
  item: CatalogItem | null;
  /** ตำแหน่งในคิวที่ freeze ไว้ตอนเปิด (0-based) */
  queueIndex: number;
  queueSize: number;
  totalItems: number;
  canWrite: boolean;
  orgId: string;
  catalogId: string;
  imageUrl?: string;
  onItemUpdated: (item: CatalogItem) => void;
  onNavigate: (dir: -1 | 1) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [snapshot, setSnapshot] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const busyRef = useRef(false);
  /** รายการที่ฟอร์มโหลดไว้แล้ว — กันรีเซ็ต draft ตอน parent อัปเดต object เดิม */
  const loadedIdRef = useRef<string | null>(null);
  /** รายการที่ประทับ "เปิดอ่านแล้ว" ไปแล้วใน session นี้ */
  const viewedRef = useRef<Set<string>>(new Set());

  const locked = item ? isItemLocked(item) : false;
  const editable = canWrite && !locked;

  // เปลี่ยนรายการ → รีเซ็ตฟอร์ม + snapshot ค่าเริ่มต้น (deep-equal baseline ของ B-B3)
  useEffect(() => {
    if (!item) {
      loadedIdRef.current = null;
      setDraft(null);
      setSnapshot(null);
      return;
    }
    if (loadedIdRef.current === item.id) return;
    loadedIdRef.current = item.id;
    const d = toDraft(item);
    setDraft(d);
    setSnapshot(d);
    setSavedAt(0);
  }, [item]);

  // B-B1 — เปิดอ่านแล้ว (server-set) · ยิงครั้งเดียวต่อรายการ
  useEffect(() => {
    if (!open || !item || item.viewed_at) return;
    if (viewedRef.current.has(item.id)) return;
    viewedRef.current.add(item.id);
    govApi<{ item: CatalogItem }>(
      `/api/gov-procure/catalogs/${catalogId}/items/${item.id}?orgId=${encodeURIComponent(orgId)}`,
      "PATCH",
      { action: "mark-viewed" },
    )
      .then((res) => {
        if (res.item) onItemUpdated(res.item);
      })
      .catch(() => {
        /* ธง "เปิดอ่าน" พลาดได้ — ไม่รบกวนผู้ใช้ */
      });
  }, [open, item, catalogId, orgId, onItemUpdated]);

  const dirty = useMemo(() => {
    if (!draft || !snapshot) return false;
    return JSON.stringify(draft) !== JSON.stringify(snapshot);
  }, [draft, snapshot]);

  const set = useCallback((key: keyof Draft, value: string) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }, []);

  /** บันทึกเมื่อ "ค่าเปลี่ยนจริง" เท่านั้น — คืน true ถ้าไม่มี error */
  const saveIfDirty = useCallback(async (): Promise<boolean> => {
    if (!item || !draft || !snapshot || !editable) return true;
    const patch = buildPatch(snapshot, draft);
    if (Object.keys(patch).length === 0) return true;

    setSaving(true);
    try {
      const res = await govApi<{ item: CatalogItem }>(
        `/api/gov-procure/catalogs/${catalogId}/items/${item.id}?orgId=${encodeURIComponent(orgId)}`,
        "PATCH",
        patch,
      );
      if (res.item) {
        onItemUpdated(res.item);
        setSnapshot(toDraft(res.item));
      }
      setSavedAt(Date.now());
      return true;
    } catch (e) {
      toast.error((e as Error).message || "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setSaving(false);
    }
  }, [item, draft, snapshot, editable, catalogId, orgId, onItemUpdated]);

  const go = useCallback(
    async (dir: -1 | 1) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const ok = await saveIfDirty();
      busyRef.current = false;
      if (ok) onNavigate(dir);
    },
    [saveIfDirty, onNavigate],
  );

  const close = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    await saveIfDirty();
    busyRef.current = false;
    onClose();
  }, [saveIfDirty, onClose]);

  const isLast = queueIndex >= queueSize - 1;

  const verifyAndNext = useCallback(async () => {
    if (!item || !editable || busyRef.current) return;
    busyRef.current = true;
    try {
      const ok = await saveIfDirty();
      if (!ok) return;
      const res = await govApi<{ item: CatalogItem }>(
        `/api/gov-procure/catalogs/${catalogId}/items/${item.id}/verify?orgId=${encodeURIComponent(orgId)}`,
        "POST",
      );
      if (res.item) onItemUpdated(res.item);
      if (isLast) {
        toast.success(`ตรวจครบคิวแล้ว ${queueSize} รายการ`);
        onClose();
      } else {
        onNavigate(1);
      }
    } catch (e) {
      toast.error((e as Error).message || "ยืนยันไม่สำเร็จ");
    } finally {
      busyRef.current = false;
    }
  }, [
    item,
    editable,
    saveIfDirty,
    catalogId,
    orgId,
    onItemUpdated,
    isLast,
    queueSize,
    onClose,
    onNavigate,
  ]);

  // N7 — คีย์ลัด (ปิด ←/→ เมื่อโฟกัสอยู่ในช่องกรอก)
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void verifyAndNext();
        return;
      }
      if (typing) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        void go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        void go(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go, verifyAndNext]);

  const bulletCount = draft ? textToLines(draft.bullets).length : 0;
  const estimateLabel = item ? priceEstimateLabel(item) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) void close();
      }}
    >
      <DialogContent size="3xl">
        <DialogHeader>
          <DialogTitle>{item ? `#${item.seq_no} · ${item.name}` : "ตรวจรายการ"}</DialogTitle>
          {item && (
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge source={item.source} detailed />
              <ConfidenceBadge value={item.confidence} />
              {locked && (
                <StatusBadge tone="info" className="gap-1">
                  <Sparkles className="h-3 w-3 animate-pulse" /> AI กำลังเติมข้อมูล
                </StatusBadge>
              )}
              <Text as="span" className="text-xs text-gray-500">
                {item.seq_no} / {totalItems} · คิวที่กรองอยู่ {queueIndex + 1}/{queueSize}
              </Text>
            </div>
          )}
        </DialogHeader>

        <DialogBody>
          {!item || !draft ? (
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-1/3 rounded bg-gray-100" />
              <div className="h-24 rounded bg-gray-100" />
              <div className="h-24 rounded bg-gray-100" />
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-5">
              {/* ซ้าย — เนื้อหา */}
              <div className="min-w-0 space-y-4 lg:col-span-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="cat-item-name">ชื่อสินค้า</Label>
                    <Input
                      id="cat-item-name"
                      className="mt-1"
                      value={draft.name}
                      readOnly={!editable}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cat-item-brand">ยี่ห้อ / รุ่น</Label>
                    <Input
                      id="cat-item-brand"
                      className="mt-1"
                      value={draft.brand_model}
                      readOnly={!editable}
                      placeholder="เช่น Pentel EnerGel BL77"
                      onChange={(e) => set("brand_model", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="cat-item-spec">สเปกรุ่นเต็ม</Label>
                  <Textarea
                    id="cat-item-spec"
                    className="mt-1"
                    rows={2}
                    value={draft.spec_line}
                    readOnly={!editable}
                    onChange={(e) => set("spec_line", e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="cat-item-size">ขนาด / บรรจุ</Label>
                  <Textarea
                    id="cat-item-size"
                    className="mt-1"
                    rows={2}
                    value={draft.size_line}
                    readOnly={!editable}
                    onChange={(e) => set("size_line", e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="cat-item-bullets">รายละเอียดสินค้า (บรรทัดละ 1 ข้อ)</Label>
                  <Textarea
                    id="cat-item-bullets"
                    className="mt-1"
                    rows={7}
                    value={draft.bullets}
                    readOnly={!editable}
                    onChange={(e) => set("bullets", e.target.value)}
                  />
                  <Text
                    className={`mt-1 text-xs ${
                      bulletCount < 5 || bulletCount > 12 ? "text-amber-600" : "text-gray-500"
                    }`}
                  >
                    {bulletCount} ข้อ (แนะนำ 5–12 ข้อ)
                  </Text>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="cat-item-care">วิธีดูแลรักษา (บรรทัดละ 1 ข้อ)</Label>
                    <Textarea
                      id="cat-item-care"
                      className="mt-1"
                      rows={3}
                      value={draft.care_notes}
                      readOnly={!editable}
                      onChange={(e) => set("care_notes", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cat-item-caution">ข้อควรระวัง (ขึ้นเอกสาร)</Label>
                    <Textarea
                      id="cat-item-caution"
                      className="mt-1"
                      rows={3}
                      value={draft.caution_notes}
                      readOnly={!editable}
                      onChange={(e) => set("caution_notes", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="cat-item-category">หมวดหมู่</Label>
                    <Input
                      id="cat-item-category"
                      className="mt-1"
                      value={draft.category}
                      readOnly={!editable}
                      onChange={(e) => set("category", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cat-item-qty">จำนวน</Label>
                    <Input
                      id="cat-item-qty"
                      type="number"
                      className="mt-1 text-right tabular-nums"
                      value={draft.qty}
                      readOnly={!editable}
                      onChange={(e) => set("qty", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cat-item-unit">หน่วยนับ</Label>
                    <Input
                      id="cat-item-unit"
                      className="mt-1"
                      value={draft.unit}
                      readOnly={!editable}
                      onChange={(e) => set("unit", e.target.value)}
                    />
                  </div>
                </div>

                {/* ข้อความจาก AI — แสดงที่นี่ที่เดียว ห้ามขึ้น PDF (C-B1) */}
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <Text className="text-xs font-semibold text-gray-700">ข้อความจาก AI</Text>
                  {item.ai_warnings.length > 0 ? (
                    <ul className="mt-1.5 space-y-1">
                      {item.ai_warnings.map((w, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Text className="mt-1 text-xs text-gray-500">
                      ไม่มีหมายเหตุจาก AI สำหรับรายการนี้
                    </Text>
                  )}
                  <Text className="mt-2 text-xs text-gray-500">
                    ตีความจากข้อความที่วางมา: {item.name_raw || "—"}
                  </Text>
                </div>
              </div>

              {/* ขวา — รูป + ราคา + ที่มา */}
              <div className="min-w-0 space-y-4 lg:col-span-2">
                <div>
                  <Text className="mb-1.5 text-xs font-semibold text-gray-700">รูปสินค้า</Text>
                  {imageUrl ? (
                    /* signed URL ของ Supabase Storage (อายุ 5 นาที) — ใช้ next/image ไม่ได้
                       (pattern เดียวกับ acc-firm/ocr + ui/image-upload) */
                    <img
                      src={imageUrl}
                      alt={item.name}
                      className="h-40 w-full rounded-lg border border-gray-200 object-contain"
                    />
                  ) : (
                    <div className="flex h-40 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 text-gray-400">
                      <ImageOff className="h-6 w-6" />
                      <Text className="text-xs text-gray-500">รอรูปสินค้า</Text>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Text className="text-xs font-semibold text-gray-700">ราคา</Text>
                    {estimateLabel && (
                      <StatusBadge tone="warning">ประมาณการ ต้องตรวจสอบ</StatusBadge>
                    )}
                  </div>
                  <div className="mt-2 space-y-3">
                    <div>
                      <Label htmlFor="cat-item-price">ราคา/หน่วย (฿)</Label>
                      <Input
                        id="cat-item-price"
                        type="number"
                        className="mt-1 text-right tabular-nums"
                        value={draft.unit_price_ref}
                        readOnly={!editable}
                        onChange={(e) => set("unit_price_ref", e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="cat-item-pmin">ต่ำสุด (฿)</Label>
                        <Input
                          id="cat-item-pmin"
                          type="number"
                          className="mt-1 text-right tabular-nums"
                          value={draft.price_min}
                          readOnly={!editable}
                          onChange={(e) => set("price_min", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="cat-item-pmax">สูงสุด (฿)</Label>
                        <Input
                          id="cat-item-pmax"
                          type="number"
                          className="mt-1 text-right tabular-nums"
                          value={draft.price_max}
                          readOnly={!editable}
                          onChange={(e) => set("price_max", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <Text className="mt-2 text-xs text-gray-500">
                    ที่มา: {item.price_basis ?? "ยังไม่ระบุ"}
                  </Text>
                  {item.price_updated_at && (
                    <Text className="text-xs text-gray-500">
                      แก้ล่าสุด {fmtDateTime(item.price_updated_at)}
                    </Text>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 p-3">
                  <Text className="text-xs font-semibold text-gray-700">ที่มาข้อมูล</Text>
                  <ul className="mt-1.5 space-y-1 text-xs text-gray-600">
                    <li>วางเข้ามา · {fmtDateTime(item.created_at)}</li>
                    {item.source === "ai_draft" && (
                      <li>AI เติมข้อมูล · {fmtDateTime(item.updated_at)}</li>
                    )}
                    {item.verified_at && <li>ยืนยันแล้ว · {fmtDateTime(item.verified_at)}</li>}
                  </ul>
                  {item.price_history.length > 0 && (
                    <>
                      <Text className="mt-3 text-xs font-semibold text-gray-700">ประวัติราคา</Text>
                      <ul className="mt-1.5 space-y-1 text-xs text-gray-600">
                        {item.price_history
                          .slice(-5)
                          .reverse()
                          .map((h, i) => (
                            <li key={i} className="tabular-nums">
                              {fmtDateTime(h.at)} · {fmtMoney(h.from.ref)} → {fmtMoney(h.to.ref)}
                              {h.by_name ? ` · ${h.by_name}` : ""}
                            </li>
                          ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="flex-wrap justify-end gap-2">
          <div className="mr-auto flex flex-col">
            <Text className="text-[11px] text-gray-500">
              ← → เปลี่ยนรายการ · ⌘+Enter ยืนยันแล้วไปต่อ
            </Text>
            {savedAt > 0 && !dirty && <Text className="text-xs text-green-600">✓ บันทึกแล้ว</Text>}
          </div>

          <Button
            variant="outline"
            onClick={() => void go(-1)}
            disabled={queueIndex <= 0 || saving}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> ก่อนหน้า
          </Button>
          <Button variant="ghost" onClick={() => void close()} disabled={saving}>
            ปิด
          </Button>

          {!editable || !item ? (
            <Button onClick={() => void go(1)} disabled={isLast || saving}>
              ถัดไป <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : item.source === "human_verified" ? (
            <Button onClick={() => void go(1)} disabled={isLast || saving}>
              ถัดไป <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => void verifyAndNext()} disabled={saving}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {saving ? "กำลังบันทึก…" : isLast ? "ยืนยัน & ปิด" : "ยืนยัน & ถัดไป"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
