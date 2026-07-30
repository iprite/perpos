"use client";

/**
 * TmcRangeFilter — เลือกช่วงเวลา → push ?range= หรือ ?from=&to= → server re-render
 * (loading.tsx แสดง skeleton) · "กำหนดเอง" = ระบุวันเริ่ม-สิ้นสุดการคำนวณเอง
 */

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

const RANGE_OPTS = [
  { value: "1", label: "1 เดือนล่าสุด" },
  { value: "3", label: "3 เดือนล่าสุด" },
  { value: "6", label: "6 เดือนล่าสุด" },
  { value: "12", label: "12 เดือนล่าสุด" },
  { value: "custom", label: "กำหนดเอง" },
];

export function TmcRangeFilter({
  current,
  from,
  to,
}: {
  current: string; // "1" | "3" | "6" | "12" | "custom"
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [showCustom, setShowCustom] = useState(current === "custom");
  const [customFrom, setCustomFrom] = useState(from ?? "");
  const [customTo, setCustomTo] = useState(to ?? "");

  const pushCustom = (f: string, t: string) => {
    if (f && t && f <= t) router.push(`${pathname}?from=${f}&to=${t}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showCustom && (
        <>
          <ThaiDatePicker
            value={customFrom}
            onChange={(v) => {
              setCustomFrom(v);
              pushCustom(v, customTo);
            }}
            placeholder="วันเริ่มต้น"
            className="w-36"
          />
          <span className="text-xs text-gray-400">ถึง</span>
          <ThaiDatePicker
            value={customTo}
            onChange={(v) => {
              setCustomTo(v);
              pushCustom(customFrom, v);
            }}
            placeholder="วันสิ้นสุด"
            className="w-36"
          />
          {customFrom && customTo && customFrom > customTo && (
            <span className="text-xs text-red-600">วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น</span>
          )}
        </>
      )}
      <CustomSelect
        value={showCustom ? "custom" : current}
        onChange={(v) => {
          if (v === "custom") {
            setShowCustom(true);
            if (customFrom && customTo) pushCustom(customFrom, customTo);
            return;
          }
          setShowCustom(false);
          router.push(v === "6" ? pathname : `${pathname}?range=${v}`);
        }}
        options={RANGE_OPTS}
        className="w-40"
      />
    </div>
  );
}
