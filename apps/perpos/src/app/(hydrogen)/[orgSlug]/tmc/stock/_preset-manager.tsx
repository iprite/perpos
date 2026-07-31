"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { toast } from "@/lib/toast";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import type { StockItem, StockPreset } from "./_types";

const BASIS_OPTIONS = [
  { value: "fixed", label: "คงที่" },
  { value: "per_guest", label: "ต่อคน" },
  { value: "per_night", label: "ต่อคืน" },
];

/** จัดการชุดเบิกของ — หัวหน้าแก้เองได้ ไม่ต้องรอ dev (specs/tmc-stock-v2.md §4.5 ข้อ 1) */
export function PresetManager({
  orgId,
  presets,
  items,
  properties,
  authHeader,
  onChanged,
}: {
  orgId: string;
  presets: StockPreset[];
  items: StockItem[];
  properties: { code: string; name: string }[];
  authHeader: () => Promise<Record<string, string>>;
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newItemId, setNewItemId] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newBasis, setNewBasis] = useState("fixed");
  const [creating, setCreating] = useState(false);
  const [newPreset, setNewPreset] = useState({ name: "", propertyCode: "", roomName: "" });

  const selected = presets.find((p) => p.id === selectedId) ?? null;
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const h = await authHeader();
      const res = await fetch("/api/tmc/stock/presets", {
        method: "POST",
        headers: h,
        body: JSON.stringify({ orgId, ...body }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        toast.error(data.error ?? "บันทึกไม่สำเร็จ");
        return null;
      }
      onChanged();
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const h = await authHeader();
      const res = await fetch("/api/tmc/stock/presets", {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({ orgId, ...body }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) toast.error(data.error ?? "บันทึกไม่สำเร็จ");
      else onChanged();
    } finally {
      setBusy(false);
    }
  }

  // ── รายการชุด ────────────────────────────────────────────────────
  if (!selected) {
    return (
      <div className="space-y-1">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedId(p.id)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-gray-50"
          >
            <span
              className={
                p.is_active
                  ? "flex-1 text-sm text-gray-700"
                  : "flex-1 text-sm text-gray-400 line-through"
              }
            >
              {p.name}
            </span>
            <span className="text-xs text-gray-400">
              {p.tmc_stock_preset_lines?.length ?? 0} รายการ
            </span>
          </button>
        ))}
        {presets.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-400">ยังไม่มีชุดเบิกของ</p>
        )}

        {/* สร้างชุดใหม่ */}
        <div className="mt-2 space-y-2 border-t pt-2">
          {creating ? (
            <>
              <Input
                value={newPreset.name}
                onChange={(e) => setNewPreset((f) => ({ ...f, name: e.target.value }))}
                placeholder="ชื่อชุด เช่น TMC5 — ห้องนอนใหญ่"
                className="h-8 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <CustomSelect
                  value={newPreset.propertyCode}
                  onChange={(v) => setNewPreset((f) => ({ ...f, propertyCode: v }))}
                  options={[
                    { value: "", label: "— ทุกหลัง —" },
                    ...properties.map((p) => ({ value: p.code, label: p.name })),
                  ]}
                />
                <Input
                  value={newPreset.roomName}
                  onChange={(e) => setNewPreset((f) => ({ ...f, roomName: e.target.value }))}
                  placeholder="ห้อง (ถ้ามี)"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setCreating(false)}>
                  ยกเลิก
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !newPreset.name.trim()}
                  onClick={async () => {
                    const created = await post({
                      action: "create",
                      name: newPreset.name.trim(),
                      propertyCode: newPreset.propertyCode || null,
                      roomName: newPreset.roomName.trim() || null,
                    });
                    if (created) {
                      setCreating(false);
                      setNewPreset({ name: "", propertyCode: "", roomName: "" });
                    }
                  }}
                >
                  สร้างชุด
                </Button>
              </div>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-4 w-4" /> สร้างชุดใหม่
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── แก้บรรทัดในชุด ───────────────────────────────────────────────
  const lines = [...(selected.tmc_stock_preset_lines ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
          <ChevronLeft className="h-4 w-4" /> ชุดทั้งหมด
        </Button>
        <span className="flex-1 truncate text-sm font-medium text-gray-900">{selected.name}</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => patch({ id: selected.id, isActive: !selected.is_active })}
        >
          {selected.is_active ? "ปิดใช้" : "เปิดใช้"}
        </Button>
      </div>

      <div className="space-y-1">
        {lines.map((l) => (
          <div
            key={l.id}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50"
          >
            <span className="flex-1 truncate text-sm text-gray-700">
              {itemById.get(l.item_id)?.name ?? "(ไม่พบรายการ)"}
            </span>
            <Input
              type="number"
              defaultValue={String(l.qty)}
              className="h-7 w-16 text-right text-sm"
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v > 0 && v !== Number(l.qty)) {
                  void post({
                    action: "save_line",
                    presetId: selected.id,
                    itemId: l.item_id,
                    qty: v,
                    qtyBasis: l.qty_basis,
                    sortOrder: l.sort_order,
                  });
                }
              }}
            />
            <span className="w-14 text-xs text-gray-400">
              {BASIS_OPTIONS.find((b) => b.value === l.qty_basis)?.label}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-300 hover:bg-red-50 hover:text-red-500"
              disabled={busy}
              onClick={() => post({ action: "delete_line", lineId: l.id })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {lines.length === 0 && (
          <p className="py-3 text-center text-sm text-gray-400">ชุดนี้ยังไม่มีรายการ</p>
        )}
      </div>

      {/* เพิ่มรายการเข้าชุด */}
      <div className="space-y-2 border-t pt-2">
        <Label className="text-xs text-gray-500">เพิ่มรายการเข้าชุด</Label>
        <CustomSelect
          value={newItemId}
          onChange={setNewItemId}
          options={[
            { value: "", label: "— เลือกรายการ —" },
            ...items.map((i) => ({ value: i.id, label: i.name })),
          ]}
        />
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            className="h-8 w-20 text-right text-sm"
          />
          <SegmentedControl
            value={newBasis}
            onChange={setNewBasis}
            options={BASIS_OPTIONS}
            size="sm"
          />
          <Button
            size="sm"
            className="ms-auto"
            disabled={busy || !newItemId || Number(newQty) <= 0}
            onClick={async () => {
              const ok = await post({
                action: "save_line",
                presetId: selected.id,
                itemId: newItemId,
                qty: Number(newQty),
                qtyBasis: newBasis,
                sortOrder: (lines.at(-1)?.sort_order ?? 0) + 10,
              });
              if (ok) {
                setNewItemId("");
                setNewQty("1");
              }
            }}
          >
            <Plus className="h-4 w-4" /> เพิ่ม
          </Button>
        </div>
      </div>
    </div>
  );
}
