"use client";

// edit-dialog.tsx — แก้ไขประเภทห้อง 1 ประเภท (label/ราคา/capacity/bed_type) — owner เท่านั้น
// PATCH-only: ไม่เพิ่ม/ลบประเภท · room_count = read-only (คำนวณจากห้องจริง)

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { useHotelData, RoomTypeBadge } from "../_components";
import type { RoomTypeConfig } from "../_fixtures/types";

export function RoomTypeEditDialog({
  config,
  open,
  onOpenChange,
}: {
  config: RoomTypeConfig | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { updateRoomTypeConfig } = useHotelData();

  const [label, setLabel] = useState("");
  const [daily, setDaily] = useState("");
  const [hourly, setHourly] = useState("");
  const [capacity, setCapacity] = useState("");
  const [bedType, setBedType] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState(false);

  // hooks ก่อน early-return — seed จาก config เมื่อเปิด
  useEffect(() => {
    if (config) {
      setLabel(config.label);
      setDaily(String(config.base_price_daily));
      setHourly(config.base_price_hourly != null ? String(config.base_price_hourly) : "");
      setCapacity(String(config.capacity));
      setBedType(config.bed_type ?? "");
      setDescription(config.description ?? "");
      setErr(false);
    }
  }, [config]);

  if (!config) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    const dailyNum = Number(daily);
    const capNum = Number(capacity);
    if (!label.trim() || !Number.isFinite(dailyNum) || dailyNum <= 0 || capNum <= 0) {
      setErr(true);
      return;
    }
    updateRoomTypeConfig(config.id, {
      label: label.trim(),
      base_price_daily: dailyNum,
      base_price_hourly: hourly.trim() ? Number(hourly) : null,
      capacity: capNum,
      bed_type: bedType.trim() || null,
      description: description.trim() || null,
    });
    toast.success(`บันทึกประเภทห้อง ${config.room_type} แล้ว`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex flex-wrap items-center gap-2">
              แก้ไขประเภทห้อง
              <RoomTypeBadge type={config.room_type} />
            </span>
          </DialogTitle>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <DialogBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="rt-label">ชื่อประเภท *</Label>
                <Input
                  id="rt-label"
                  className={`mt-1 ${err && !label.trim() ? "border-red-500 focus:ring-red-500" : ""}`}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="rt-daily">ราคา/คืน (฿) *</Label>
                <Input
                  id="rt-daily"
                  type="number"
                  min={0}
                  className="mt-1"
                  value={daily}
                  onChange={(e) => setDaily(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="rt-hourly">ราคา/ชม. (฿)</Label>
                <Input
                  id="rt-hourly"
                  type="number"
                  min={0}
                  className="mt-1"
                  placeholder="ไม่มี = ปล่อยว่าง"
                  value={hourly}
                  onChange={(e) => setHourly(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="rt-cap">รองรับ (คน) *</Label>
                <Input
                  id="rt-cap"
                  type="number"
                  min={1}
                  className="mt-1"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="rt-bed">ประเภทเตียง</Label>
                <Input
                  id="rt-bed"
                  className="mt-1"
                  placeholder="เช่น เตียงคู่ Queen"
                  value={bedType}
                  onChange={(e) => setBedType(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="rt-desc">คำอธิบาย</Label>
                <Input
                  id="rt-desc"
                  className="mt-1"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500 sm:col-span-2">
                จำนวนห้องประเภทนี้:{" "}
                <span className="font-medium text-gray-700">{config.room_count} ห้อง</span>{" "}
                <span className="text-gray-400">
                  (คำนวณจากผังห้องจริง — แก้ที่หน้า “ห้อง & สถานะ”)
                </span>
              </div>
              {err && (
                <p className="text-xs text-red-600 sm:col-span-2">
                  กรุณากรอกชื่อ ราคา/คืน และจำนวนผู้เข้าพักให้ถูกต้อง
                </p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit">
              <Save className="mr-1.5 h-4 w-4" /> บันทึก
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
