"use client";

/**
 * UndoToast — toast ที่มีปุ่ม "เลิกทำ" ค้าง 8 วินาที
 *
 * ทำไมต้องมี (DESIGN.md §12 + MAIL_UI_SPEC §3):
 *   การกระทำที่ "ทำลายข้อมูล" (ลบ / เก็บเข้าคลัง) ถ้าต้องยืนยันทุกครั้งด้วย dialog
 *   ผู้ใช้จะทำงานเร็วไม่ได้ — ท่าที่ถูกคือ **ทำทันทีแล้วให้เลิกทำได้**
 *
 * ⚠️ สร้างบนระบบ toast เดิม (`@/lib/toast` → react-hot-toast) เท่านั้น
 *    ห้ามตั้งระบบ toast ใหม่ (สี/ตำแหน่ง/ระยะเวลาถูกคุมกลางที่ <AppToaster />)
 *
 *   const id = showUndoToast({ message: "เก็บแล้ว 3 ฉบับ", onUndo: () => restore() });
 *   dismissUndoToast(id);   // ปิดเองเมื่อ flush คิวแล้ว
 */

import { Undo2, X } from "lucide-react";
import cn from "@core/utils/class-names";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";

/** ระยะเวลาที่ผู้ใช้กด "เลิกทำ" ได้ (มิลลิวินาที) — ใช้ร่วมกับคิว optimistic */
export const UNDO_TOAST_MS = 8000;

export function UndoToast({
  message,
  onUndo,
  onDismiss,
  visible = true,
  undoLabel = "เลิกทำ",
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  visible?: boolean;
  undoLabel?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-2 rounded-xl border border-gray-200 bg-white py-2 pl-4 pr-2 shadow-lg transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <span className="text-sm text-gray-800">{message}</span>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 font-semibold text-primary hover:bg-gray-100"
        onClick={onUndo}
      >
        <Undo2 className="h-4 w-4" />
        {undoLabel}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="ปิดข้อความ"
        className="h-7 w-7 text-gray-400 hover:text-gray-600"
        onClick={onDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** เปิด toast เลิกทำ — คืน id ไว้ปิด/อัปเดตทีหลัง (ส่ง id เดิมมาซ้ำ = อัปเดตใบเดิม ไม่ซ้อนกัน) */
export function showUndoToast({
  id,
  message,
  onUndo,
  duration = UNDO_TOAST_MS,
  undoLabel,
}: {
  id?: string;
  message: string;
  onUndo: () => void;
  duration?: number;
  undoLabel?: string;
}): string {
  return toast.custom(
    (t) => (
      <UndoToast
        message={message}
        visible={t.visible}
        undoLabel={undoLabel}
        onUndo={() => {
          toast.dismiss(t.id);
          onUndo();
        }}
        onDismiss={() => toast.dismiss(t.id)}
      />
    ),
    { id, duration },
  );
}

export function dismissUndoToast(id: string) {
  toast.dismiss(id);
}
