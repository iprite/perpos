"use client";

/**
 * มาตรฐาน Toast ของ PERPOS — แหล่งเดียวของทั้งแอป
 *
 * กฎ: ทุกการ "เปลี่ยนค่า/บันทึก/ลบ/สลับสถานะ" ต้องแจ้งผลด้วย toast เสมอ
 *   - สำเร็จ  → toast.success(...) หรือ helper notify.saved()/notify.deleted()
 *   - ล้มเหลว → toast.error(...)   หรือ helper notify.error(e)
 *
 * ห้าม import จาก "react-hot-toast" ตรง ๆ ในโค้ดแอป — import จากไฟล์นี้แทน
 * (สี/ตำแหน่ง/ระยะเวลา ถูกตั้งค่ากลางที่ <AppToaster /> ใน app/shared/toaster.tsx)
 */
import { toast } from "react-hot-toast";

export { toast };

/** ดึงข้อความ error จาก unknown ให้ปลอดภัย */
function toMessage(err: unknown, fallback: string): string {
  if (typeof err === "string") return err || fallback;
  if (err instanceof Error) return err.message || fallback;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

/** helper มาตรฐานสำหรับเคสที่ใช้บ่อย */
export const notify = {
  success: (msg: string) => toast.success(msg),
  error: (err: unknown, fallback = "เกิดข้อผิดพลาด") => toast.error(toMessage(err, fallback)),
  saved: (msg = "บันทึกแล้ว") => toast.success(msg),
  deleted: (msg = "ลบแล้ว") => toast.success(msg),
  created: (msg = "เพิ่มรายการแล้ว") => toast.success(msg),
  updated: (msg = "อัปเดตแล้ว") => toast.success(msg),
  info: (msg: string) => toast(msg),
};
