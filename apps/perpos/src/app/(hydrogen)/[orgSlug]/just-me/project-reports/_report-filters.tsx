"use client";

/**
 * _report-filters.tsx — ตัวกรองของหน้ารายงาน (ค่ากรองอยู่ใน URL — หน้าเป็น server component)
 * ตัวกรอง 3 อัน → ซ่อนหลังปุ่มไอคอน + จุดเตือนเมื่อกรองค้าง (DESIGN §4)
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { FilterBar, FilterClear } from "@/components/ui/filter-bar";
import { SegmentedControl } from "@/components/ui/segmented";
import { PROJECT_STATUS_LABEL } from "@/lib/just-me/labels";
import type { ProjectStatus } from "@/lib/just-me/types";

const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  ...(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => ({
    value: s,
    label: PROJECT_STATUS_LABEL[s],
  })),
];

export function ReportFilters({
  status,
  year,
  onlyOver,
  years,
}: {
  status: ProjectStatus | "";
  year: number;
  onlyOver: boolean;
  years: string[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const hasFilter = Boolean(status) || year > 0 || onlyOver;
  const [open, setOpen] = useState(hasFilter);

  function apply(next: { status?: string; year?: string; over?: string }) {
    const params = new URLSearchParams();
    const s = next.status ?? status;
    const y = next.year ?? (year ? String(year) : "");
    const o = next.over ?? (onlyOver ? "1" : "");
    if (s) params.set("status", s);
    if (y) params.set("year", y);
    if (o === "1") params.set("over", "1");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `?${qs}` : "?"));
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant={open || hasFilter ? "secondary" : "outline"}
          size="icon"
          title="ตัวกรอง"
          className="relative"
          onClick={() => setOpen((v) => !v)}
        >
          <Filter className="h-4 w-4" />
          {hasFilter && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />
          )}
        </Button>
      </div>

      {open && (
        <FilterBar>
          <CustomSelect
            value={status}
            onChange={(v) => apply({ status: v })}
            options={STATUS_OPTIONS}
            className="w-44"
          />
          <CustomSelect
            value={year ? String(year) : ""}
            onChange={(v) => apply({ year: v })}
            options={[
              { value: "", label: "ทุกปีที่เริ่มงาน" },
              ...years.map((y) => ({ value: y, label: `เริ่มปี ${Number(y) + 543}` })),
            ]}
            className="w-44"
          />
          <SegmentedControl
            value={onlyOver ? "1" : ""}
            onChange={(v) => apply({ over: v })}
            ariaLabel="กรองโครงการที่เกินงบ"
            options={[
              { value: "", label: "ทุกโครงการ" },
              { value: "1", label: "เฉพาะที่เกินงบ" },
            ]}
          />
          <FilterClear
            disabled={!hasFilter}
            onClick={() => startTransition(() => router.push("?"))}
          />
        </FilterBar>
      )}
    </div>
  );
}
