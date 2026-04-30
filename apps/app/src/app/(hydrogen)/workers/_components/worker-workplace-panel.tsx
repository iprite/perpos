"use client";

import React, { useMemo } from "react";
import AppSelect from "@core/ui/app-select";

export function WorkerWorkplacePanel({
  loading,
  disabled,
  workplaceId,
  onChangeWorkplaceId,
  workplaces,
}: {
  loading: boolean;
  disabled: boolean;
  workplaceId: string;
  onChangeWorkplaceId: (v: string) => void;
  workplaces: Array<{ id: string; name: string | null; address: string }>;
}) {
  const options = useMemo(
    () => [{ label: "ไม่ระบุ", value: "" }].concat(workplaces.map((w) => ({ label: (w.name ?? "").trim() || w.address, value: w.id }))),
    [workplaces],
  );

  return (
    <div className="relative z-[60] rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
      <div className="text-sm font-semibold text-gray-900">สถานที่ทำงาน</div>
      <div className="mt-3">
        <AppSelect
          label="เลือกที่อยู่ที่ทำงาน"
          placeholder="เลือก"
          options={options}
          value={workplaceId}
          onChange={(v: string) => onChangeWorkplaceId(v)}
          getOptionValue={(o) => o.value}
          displayValue={(selected) => options.find((o) => o.value === selected)?.label ?? ""}
          selectClassName="h-10 px-3"
          dropdownClassName="!z-[2147483647]"
          inPortal={false}
          disabled={loading || disabled}
        />
      </div>
    </div>
  );
}
