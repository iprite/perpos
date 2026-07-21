"use client";

/**
 * TmcRangeFilter — เลือกช่วงเดือน → push ?range= → server re-render (loading.tsx แสดง skeleton)
 */

import { useRouter, usePathname } from "next/navigation";
import { CustomSelect } from "@/components/ui/custom-select";

const RANGE_OPTS = [
  { value: "1", label: "1 เดือนล่าสุด" },
  { value: "3", label: "3 เดือนล่าสุด" },
  { value: "6", label: "6 เดือนล่าสุด" },
  { value: "12", label: "12 เดือนล่าสุด" },
];

export function TmcRangeFilter({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <CustomSelect
      value={current}
      onChange={(v) => router.push(v === "6" ? pathname : `${pathname}?range=${v}`)}
      options={RANGE_OPTS}
      className="w-44"
    />
  );
}
