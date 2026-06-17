import React from "react";
import cn from "@core/utils/class-names";

/**
 * StatCard — การ์ดตัวเลขสรุป (KPI / metric tile) มาตรฐานของทั้งระบบ
 *
 * ใช้แทนการ์ดสรุปที่เขียนเองทุกที่ (รายรับรวม, คงเหลือ, จำนวนรายการ ฯลฯ)
 * ดีไซน์อิง Stripe/Linear: การ์ดขาว เส้นบาง เงาจาง — **ไม่ใช้พื้นพาสเทลเต็มใบ**
 * (พื้นสีเต็มใบทำให้ dashboard ดู "เยอะ/รก") · สีบอกสถานะอยู่ที่ชิปไอคอน + ตัวเลขเท่านั้น
 *
 * กันตัวเลขล้น:
 *   - ตัวเลขใช้ `tabular-nums` + ขนาด responsive (text-xl → sm:text-2xl) + `tracking-tight`
 *   - การ์ดมี `min-w-0` ให้ยุบได้ใน grid/flex (ดู DESIGN.md §5 ข้อ 6)
 *   - **ห้าม truncate ตัวเลขเงิน** (ตัดหลักทิ้ง = อ่านผิด) — ให้ grid ที่ครอบจัดให้พอดี
 *     (เช่น `grid-cols-1 sm:grid-cols-3` เพื่อให้มือถือเป็นการ์ดเต็มแถว ตัวเลขจึงพอดี)
 *   - ค่าที่ยาวมาก (ยอดรวมหลักล้าน) แนะนำส่งเป็นสตริงย่อ (฿1.1M) สำหรับ KPI tile
 *     และเก็บค่าเต็มไว้ใน `sub` ถ้าต้องการ
 *
 *   <StatCard
 *     icon={<TrendingUp className="h-4 w-4" />}
 *     label="รายรับรวม"
 *     value="2,971,327.90 ฿"
 *     tone="positive"
 *     valueColored
 *   />
 */

export type StatTone =
  | "neutral"
  | "primary"
  | "positive"
  | "negative"
  | "warning"
  | "info";

const TONE: Record<StatTone, { chip: string; value: string }> = {
  neutral:  { chip: "bg-gray-100 text-gray-500",    value: "text-gray-900" },
  primary:  { chip: "bg-indigo-50 text-indigo-600", value: "text-indigo-700" },
  positive: { chip: "bg-green-50 text-green-600",   value: "text-green-700" },
  negative: { chip: "bg-red-50 text-red-600",       value: "text-red-700" },
  warning:  { chip: "bg-amber-50 text-amber-600",   value: "text-amber-700" },
  info:     { chip: "bg-blue-50 text-blue-600",     value: "text-blue-700" },
};

export function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
  valueColored = false,
  align = "left",
  className,
}: {
  /** ไอคอน (optional) — แสดงในชิปสีตาม tone */
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  /** บรรทัดย่อยใต้ตัวเลข (เช่น "รับ 3.0M / จ่าย 1.9M" หรือ delta) */
  sub?: React.ReactNode;
  tone?: StatTone;
  /** ให้ตัวเลขใช้สีตาม tone (รายรับเขียว/รายจ่ายแดง) · default = ตัวเลขสีเข้ม (ink) */
  valueColored?: boolean;
  /** จัดกึ่งกลางทั้งใบ (สำหรับแถวสรุปสั้น ๆ) */
  align?: "left" | "center";
  className?: string;
}) {
  const t = TONE[tone];
  const centered = align === "center";
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm",
        className,
      )}
    >
      <div className={cn("flex items-center gap-2", centered && "justify-center")}>
        {icon && (
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", t.chip)}>
            {icon}
          </span>
        )}
        <span className="truncate text-xs font-medium text-gray-500">{label}</span>
      </div>
      <div
        className={cn(
          "mt-2 text-xl font-semibold leading-tight tracking-tight tabular-nums sm:text-2xl",
          centered && "text-center",
          valueColored ? t.value : "text-gray-900",
        )}
      >
        {value}
      </div>
      {sub != null && (
        <div className={cn("mt-0.5 text-xs text-gray-400", centered && "text-center")}>{sub}</div>
      )}
    </div>
  );
}
