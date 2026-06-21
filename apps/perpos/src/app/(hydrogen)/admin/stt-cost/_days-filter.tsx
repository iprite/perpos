"use client";

/**
 * SttCostDaysFilter — เลือกช่วงวัน → push ?days= → server re-render (loading.tsx แสดง skeleton)
 */

import { useRouter, usePathname } from "next/navigation";
import { CustomSelect } from "@/components/ui/custom-select";

export function SttCostDaysFilter({ current }: { current: number }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <CustomSelect
      value={String(current)}
      onChange={(v) => router.push(v === "30" ? pathname : `${pathname}?days=${v}`)}
      className="w-32"
      options={[
        { value: "7", label: "7 วัน" },
        { value: "30", label: "30 วัน" },
        { value: "90", label: "90 วัน" },
        { value: "365", label: "1 ปี" },
      ]}
    />
  );
}
