"use client";

/**
 * TmcRangeFilter — ตัวกรองแดชบอร์ด: ช่วงเวลา (preset/กำหนดเอง) + รวม/ไม่รวมเงินมัดจำ
 * push searchParams → server re-render (loading.tsx แสดง skeleton)
 *   ?range=1|3|12 (default 6 ไม่ใส่) · ?from=&to= (กำหนดเอง ชนะ range) · ?dep=in (รวมมัดจำ — default คือไม่รวม)
 */

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
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
  deposits,
}: {
  current: string; // "1" | "3" | "6" | "12" | "custom"
  from?: string;
  to?: string;
  deposits: "in" | "ex"; // รวม/ไม่รวมหมวดเงินมัดจำ
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [showCustom, setShowCustom] = useState(current === "custom");
  const [customFrom, setCustomFrom] = useState(from ?? "");
  const [customTo, setCustomTo] = useState(to ?? "");

  const go = (over: { mode?: string; from?: string; to?: string; dep?: "in" | "ex" }) => {
    const mode = over.mode ?? (showCustom ? "custom" : current);
    const f = over.from ?? customFrom;
    const t = over.to ?? customTo;
    const dep = over.dep ?? deposits;

    const p = new URLSearchParams();
    if (mode === "custom") {
      if (!f || !t || f > t) return; // ยังเลือกวันไม่ครบ/ไม่ถูก — ไม่ push
      p.set("from", f);
      p.set("to", t);
    } else if (mode !== "6") {
      p.set("range", mode);
    }
    if (dep === "in") p.set("dep", "in"); // default = ไม่รวมมัดจำ → ใส่พารามิเตอร์เฉพาะตอน "รวมมัดจำ"
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        value={deposits}
        onChange={(v) => go({ dep: v as "in" | "ex" })}
        ariaLabel="เงินมัดจำ"
        options={[
          { value: "in", label: "รวมมัดจำ" },
          { value: "ex", label: "ไม่รวมมัดจำ" },
        ]}
      />
      {showCustom && (
        <>
          <ThaiDatePicker
            value={customFrom}
            onChange={(v) => {
              setCustomFrom(v);
              go({ mode: "custom", from: v });
            }}
            placeholder="วันเริ่มต้น"
            className="w-36"
          />
          <span className="text-xs text-gray-400">ถึง</span>
          <ThaiDatePicker
            value={customTo}
            onChange={(v) => {
              setCustomTo(v);
              go({ mode: "custom", to: v });
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
            go({ mode: "custom" });
            return;
          }
          setShowCustom(false);
          go({ mode: v });
        }}
        options={RANGE_OPTS}
        className="w-40"
      />
    </div>
  );
}
