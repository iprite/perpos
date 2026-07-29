"use client";

// ตัวเลือกงวด (เดือน) — เขียนค่าลง URL (?period=YYYY-MM-01) ตามท่า searchParams-driven
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CustomSelect } from "@/components/ui/custom-select";
import { formatThaiMonth } from "@/lib/p2p-group/labels";

/** ตัวเลือกย้อนหลัง 18 เดือนจากเดือนปัจจุบัน */
export function monthOptions(now = new Date()): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    out.push({ value: v, label: formatThaiMonth(v) });
  }
  return out;
}

export function MonthFilter({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const options = monthOptions();
  // งวดที่เลือกอาจเก่ากว่า 18 เดือน (มาจากลิงก์) — ใส่เพิ่มไม่ให้ค่าหาย
  if (value && !options.some((o) => o.value === value)) {
    options.unshift({ value, label: formatThaiMonth(value) });
  }

  return (
    <CustomSelect
      value={value}
      onChange={(v) => {
        const next = new URLSearchParams(params.toString());
        next.set("period", v);
        router.push(`${pathname}?${next.toString()}`);
      }}
      options={options}
      className="w-40"
    />
  );
}
