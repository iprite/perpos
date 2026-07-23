"use client";

// production-card.tsx — การ์ดงานผลิต 1 ใบ (ออกแบบสำหรับแท็บเล็ตแนวตั้ง มือเปื้อน ยืนห่างจอ)
//  · บรรทัดแรก: เลขออเดอร์ + จำนวนผืน (≥ text-lg)
//  · บรรทัดสอง: ลาย · ขนาด · เวอร์ชันที่ลูกค้ายืนยัน (vN) → เช็ค "พิมพ์ถูกไฟล์ไหม" ได้โดยไม่ต้องเปิด dialog
//  · ปุ่มหลัก **ปุ่มเดียว** = การกระทำถัดไปตาม order-flow.ts · สูง 48px เต็มความกว้าง (touch)
//  · action รอง (QC ไม่ผ่าน / จัดคิว-เครื่อง / รายละเอียด) เป็นปุ่มรองด้านล่าง

import { AlertTriangle, ChevronRight, Printer, Settings2, XCircle } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import { NEXT_ACTION, PriorityBadge, daysUntil, fmtDateTH, fmtNum } from "../_components";
import type { ProductionCard as CardData } from "./use-production-state";

export function ProductionJobCard({
  card,
  canPress,
  onPrimary,
  onQcFail,
  onQueue,
  onDetail,
}: {
  card: CardData;
  /** บทบาทนี้กดปุ่มขั้นถัดไปได้ไหม */
  canPress: boolean;
  onPrimary: () => void;
  onQcFail: () => void;
  onQueue: () => void;
  onDetail: () => void;
}) {
  const { order } = card;
  const next = NEXT_ACTION[order.status];
  const left = daysUntil(order.due_date);
  const overdue = left !== null && left < 0;
  const noCfFile = !card.cfConfirmed;
  const blockPrint = order.status === "cf_approved" && noCfFile;
  const primaryDisabled = !canPress || !next || blockPrint;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-lg font-semibold text-gray-900">{order.order_no}</span>
        <span className="shrink-0 text-lg font-semibold tabular-nums text-gray-900">
          {fmtNum(card.pieces)} ผืน
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700">
        <span className="font-medium">{card.patternLabel}</span>
        <span className="text-gray-300">·</span>
        <span className="tabular-nums">{card.sizeLabel}</span>
        <span className="text-gray-300">·</span>
        {noCfFile ? (
          <StatusBadge tone="danger">ยังไม่มีไฟล์ที่ลูกค้ายืนยัน</StatusBadge>
        ) : card.cfVersionNo !== null ? (
          <StatusBadge tone="success">ไฟล์ที่ยืนยัน v{card.cfVersionNo}</StatusBadge>
        ) : (
          <StatusBadge tone="success">ยืนยันแล้ว (เวอร์ชันล่าสุด)</StatusBadge>
        )}
        {card.extraItemCount > 0 && (
          <StatusBadge tone="neutral">+ อีก {fmtNum(card.extraItemCount)} รายการ</StatusBadge>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={order.priority} />
        {overdue && (
          <StatusBadge tone="danger">
            <AlertTriangle className="mr-1 h-3 w-3" />
            เลยกำหนด {fmtNum(Math.abs(left as number))} วัน
          </StatusBadge>
        )}
        {card.hasReprint && <StatusBadge tone="warning">เคยพิมพ์ซ้ำ</StatusBadge>}
        <StatusBadge tone="neutral">
          <Printer className="mr-1 h-3 w-3" />
          {card.machine ? card.machine.code : "ยังไม่ระบุเครื่อง"}
        </StatusBadge>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={cn("tabular-nums", overdue ? "text-red-600" : "text-gray-500")}>
          กำหนดส่ง {fmtDateTH(order.due_date)}
        </span>
        <span className="truncate text-gray-500">{card.customer?.display_name ?? "—"}</span>
      </div>

      {blockPrint && (
        <Text className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
          ยังไม่มีเวอร์ชันไฟล์ลายที่ลูกค้ายืนยัน — ให้ฝ่ายขายบันทึกผลยืนยันในหน้างานแบบก่อน
          จึงจะเข้าคิวพิมพ์ได้
        </Text>
      )}

      {next && (
        <Button
          className="mt-3 h-12 w-full text-base"
          disabled={primaryDisabled}
          title={
            canPress
              ? blockPrint
                ? "ต้องมีไฟล์ลายที่ลูกค้ายืนยันก่อน"
                : undefined
              : "บทบาทของคุณไม่มีสิทธิ์กดขั้นตอนนี้"
          }
          onClick={onPrimary}
        >
          {next.label}
        </Button>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* ปุ่มรองบนหน้าจอทีมผลิต = สูง 44px ขึ้นไป (มือเปื้อน กดบนแท็บเล็ต) */}
        {order.status === "qc" && (
          <Button
            variant="outline"
            disabled={!canPress}
            className="h-11 text-red-600"
            onClick={onQcFail}
          >
            <XCircle className="mr-1.5 h-4 w-4" /> QC ไม่ผ่าน
          </Button>
        )}
        <Button variant="ghost" disabled={!canPress} className="h-11" onClick={onQueue}>
          <Settings2 className="mr-1.5 h-4 w-4" /> จัดคิว / เปลี่ยนเครื่อง
        </Button>
        <Button variant="ghost" className="ms-auto h-11 text-gray-600" onClick={onDetail}>
          รายละเอียด <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
