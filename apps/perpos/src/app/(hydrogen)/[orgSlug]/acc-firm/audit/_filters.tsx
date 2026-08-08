"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { CustomSelect } from "@/components/ui/custom-select";
import { FilterBar, FilterClear } from "@/components/ui/filter-bar";
import { SegmentedControl } from "@/components/ui/segmented";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

export type AuditClientOption = { id: string; name: string };

/** ตัวกรองของหน้าร่องรอย — ทุกค่าอยู่ใน URL (หน้าเป็น SSR searchParams-driven) */
export function FirmAuditFilters({ clients }: { clients: AuditClientOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const client = sp.get("client") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const scope = sp.get("scope") ?? "all";
  const hasFilter = !!client || !!from || !!to || scope !== "all";

  const clientOptions = useMemo(
    () => [
      { value: "", label: "ทุกลูกค้า" },
      ...clients.map((c) => ({ value: c.id, label: c.name })),
    ],
    [clients],
  );

  // เปลี่ยนตัวกรองแล้วต้องกลับหน้า 1 เสมอ ไม่งั้นค้างอยู่หน้าที่เกินจำนวนผลลัพธ์ใหม่ → ตารางว่าง
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <FilterBar>
      <CustomSelect
        value={client}
        onChange={(v) => setParam("client", v)}
        options={clientOptions}
        className="w-56"
      />
      <SegmentedControl
        value={scope}
        onChange={(v) => setParam("scope", v)}
        ariaLabel="ขอบเขตร่องรอย"
        options={[
          { value: "all", label: "ทั้งหมด" },
          { value: "business", label: "ที่ระบุเจตนา" },
        ]}
      />
      <ThaiDatePicker
        value={from}
        onChange={(iso) => setParam("from", iso)}
        placeholder="ตั้งแต่"
      />
      <ThaiDatePicker value={to} onChange={(iso) => setParam("to", iso)} placeholder="ถึง" />
      <FilterClear disabled={!hasFilter} onClick={() => router.push(pathname)} />
    </FilterBar>
  );
}
