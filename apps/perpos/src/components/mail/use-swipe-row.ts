"use client";

/**
 * ปัดแถวเมลบนมือถือ (M3 · MAIL_UI_SPEC §8) — ปัดขวา = เก็บเข้าคลัง · ปัดซ้าย = ลบ
 *
 * กฎที่ห้ามพัง:
 *  - **ต้องเข้าคิว "เลิกทำ" ชุดเดียวกับปุ่ม/คีย์ลัด** — ปัดพลาดบนมือถือเกิดง่ายกว่าคลิกพลาดมาก
 *    (ผู้เรียกส่ง `onArchive`/`onTrash` ที่เป็นตัวเดียวกับ `e`/`#` เข้ามา)
 *  - **ห้ามขวางการเลื่อนรายการ** — ตัดสินแกนจากการขยับ 10px แรก ถ้าเป็นแนวตั้งให้ปล่อยผ่านทันที
 *    และไม่ `preventDefault` จนกว่าจะรู้ว่าเป็นการปัดแนวนอนจริง (ไม่งั้นสกอร์ลบนมือถือกระตุก)
 *  - ใช้ Pointer Events ตัวเดียว ครอบทั้งนิ้วและเมาส์ — ห้ามผูก touch/mouse แยกกัน (จะยิงซ้อน)
 *
 * ระยะที่ต้องปัดถึงจะทำงาน = 96px (ประมาณ 1/4 ของจอมือถือ) — สั้นกว่านี้แตะแล้วสะบัดนิ้วนิดเดียวก็ลบ
 */

import { useCallback, useRef, useState } from "react";

export const SWIPE_TRIGGER_PX = 96;
const AXIS_LOCK_PX = 10;
/** ปัดได้ไกลสุดเท่านี้ (ยางยืด) — ไม่ให้แถวหลุดจอ */
const MAX_DRAG_PX = 140;

export type SwipeAction = "archive" | "trash";

export function useSwipeRow({
  onArchive,
  onTrash,
  enabled = true,
}: {
  onArchive: () => void;
  onTrash: () => void;
  /** ปิดบนจอใหญ่/เมื่อกำลังเลือกหลายฉบับ */
  enabled?: boolean;
}) {
  const [dx, setDx] = useState(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const axisRef = useRef<"none" | "x" | "y">("none");

  const reset = useCallback(() => {
    startRef.current = null;
    axisRef.current = "none";
    setDx(0);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || e.pointerType === "mouse") return; // เมาส์ใช้ปุ่ม/คีย์ลัดอยู่แล้ว
      startRef.current = { x: e.clientX, y: e.clientY };
      axisRef.current = "none";
    },
    [enabled],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const start = startRef.current;
    if (!start) return;
    const deltaX = e.clientX - start.x;
    const deltaY = e.clientY - start.y;

    if (axisRef.current === "none") {
      if (Math.abs(deltaX) < AXIS_LOCK_PX && Math.abs(deltaY) < AXIS_LOCK_PX) return;
      // เลื่อนแนวตั้ง = ปล่อยให้รายการสกอร์ลตามปกติ ห้ามยึดเหตุการณ์
      axisRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
      if (axisRef.current === "y") {
        startRef.current = null;
        return;
      }
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    const clamped = Math.max(-MAX_DRAG_PX, Math.min(MAX_DRAG_PX, deltaX));
    setDx(clamped);
  }, []);

  const onPointerUp = useCallback(() => {
    if (!startRef.current || axisRef.current !== "x") {
      reset();
      return;
    }
    const distance = dx;
    reset();
    if (distance >= SWIPE_TRIGGER_PX) onArchive();
    else if (distance <= -SWIPE_TRIGGER_PX) onTrash();
  }, [dx, onArchive, onTrash, reset]);

  /** action ที่จะเกิดถ้าปล่อยนิ้วตอนนี้ — ใช้เปลี่ยนสี/ไอคอนพื้นหลังให้ผู้ใช้รู้ล่วงหน้า */
  const pendingAction: SwipeAction | null =
    dx >= SWIPE_TRIGGER_PX ? "archive" : dx <= -SWIPE_TRIGGER_PX ? "trash" : null;

  return {
    dx,
    pendingAction,
    swiping: axisRef.current === "x" && dx !== 0,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: reset,
    },
  };
}
