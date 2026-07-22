"use client";

// save-to-library-dialog.tsx — บันทึกรายการที่ยืนยันแล้วเข้าคลังสินค้า (POST /api/gov-procure/products)
//
// A-2 — คลังรับเฉพาะ `source='human_verified'` (server บังคับซ้ำอีกชั้น)
// B1 — รายการที่ถูกยืนยันแบบกลุ่มโดย "ยังไม่มีใครเปิดอ่าน" แยกเป็นกลุ่มที่สอง และ **ไม่รวมให้อัตโนมัติ**
//      (ใช้ `Switch` — ระบบไม่มี component checkbox)

import { useMemo, useState } from "react";
import { Library } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/typography";
import { toast } from "@/lib/toast";
import type { CatalogItem } from "@/lib/gov-procure/catalog";
import { govApi } from "../../_components/api";
import { fmtNum } from "./format";

export function SaveToLibraryDialog({
  open,
  onOpenChange,
  orgId,
  items,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  /** รายการทั้งหมดของชุด (กรองเองในกล่องนี้) */
  items: CatalogItem[];
  onDone: () => void;
}) {
  const [includeUnread, setIncludeUnread] = useState(false);
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => {
    const verified = items.filter((i) => i.source === "human_verified");
    return {
      read: verified.filter((i) => i.viewed_at),
      unread: verified.filter((i) => !i.viewed_at),
    };
  }, [items]);

  const selected = useMemo(
    () => (includeUnread ? [...groups.read, ...groups.unread] : groups.read),
    [groups, includeUnread],
  );

  async function save() {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      const res = await govApi<{ saved: number; rejected: { reason: string }[] }>(
        `/api/gov-procure/products?orgId=${encodeURIComponent(orgId)}`,
        "POST",
        { itemIds: selected.map((i) => i.id) },
      );
      const rejected = res.rejected?.length ?? 0;
      toast.success(
        rejected > 0
          ? `บันทึก ${fmtNum(res.saved)} รายการเข้าคลังแล้ว · ข้าม ${fmtNum(rejected)} รายการ`
          : `บันทึก ${fmtNum(res.saved)} รายการเข้าคลังสินค้าแล้ว`,
      );
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message || "บันทึกเข้าคลังไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>บันทึกเข้าคลังสินค้า</DialogTitle>
          <Text className="text-xs text-gray-500">
            คลังรับเฉพาะรายการที่ยืนยันแล้ว — ชุดถัดไปที่ชื่อตรงกันจะดึงข้อมูลนี้ไปใช้อัตโนมัติ
          </Text>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <Text className="text-sm font-medium text-gray-900">
                ยืนยันแล้วและมีคนเปิดอ่าน — {fmtNum(groups.read.length)} รายการ
              </Text>
              <Text className="mt-0.5 text-xs text-gray-500">บันทึกเข้าคลังทั้งหมดนี้</Text>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
              <div className="min-w-0 pr-3">
                <Text className="text-sm font-medium text-gray-900">
                  ยืนยันแบบกลุ่มโดยยังไม่เปิดอ่าน — {fmtNum(groups.unread.length)} รายการ
                </Text>
                <Text className="mt-0.5 text-xs text-gray-500">
                  ยังไม่มีใครอ่านเนื้อหาจริง — เปิดสวิตช์นี้เองถ้าต้องการเก็บเข้าคลังด้วย
                </Text>
              </div>
              <Switch
                checked={includeUnread}
                onChange={setIncludeUnread}
                disabled={groups.unread.length === 0}
                aria-label="รวมรายการที่ยืนยันแบบกลุ่มโดยยังไม่เปิดอ่าน"
              />
            </div>

            <Text className="text-xs text-gray-500">
              ถ้าคลังมีชื่อนี้อยู่แล้ว ระบบจะอัปเดตข้อมูลทับให้เป็นเวอร์ชันล่าสุด
            </Text>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button disabled={saving || selected.length === 0} onClick={() => void save()}>
            <Library className="mr-1.5 h-4 w-4" />
            {saving ? "กำลังบันทึก…" : `บันทึก ${fmtNum(selected.length)} รายการเข้าคลัง`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
