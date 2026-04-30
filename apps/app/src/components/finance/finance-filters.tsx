"use client";

import React, { useMemo } from "react";
import dayjs from "dayjs";
import { Button } from "rizzui";
import AppSelect from "@core/ui/app-select";
import { DatePicker } from "@core/ui/datepicker";

function LabeledSelect({
  label,
  value,
  placeholder,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <AppSelect
      label={label}
      placeholder={placeholder}
      options={options}
      value={value}
      onChange={(v: string) => onChange(v)}
      getOptionValue={(o) => o.value}
      displayValue={(selected) => options.find((o) => o.value === selected)?.label ?? ""}
      disabled={disabled}
      selectClassName="h-10 px-3"
    />
  );
}

export function FinanceFilters({
  loading,
  dateStart,
  dateEnd,
  txnType,
  sourceType,
  onChangeDateStart,
  onChangeDateEnd,
  onChangeTxnType,
  onChangeSourceType,
  onRefresh,
  onReset,
}: {
  loading: boolean;
  dateStart: string;
  dateEnd: string;
  txnType: string;
  sourceType: string;
  onChangeDateStart: (v: string) => void;
  onChangeDateEnd: (v: string) => void;
  onChangeTxnType: (v: string) => void;
  onChangeSourceType: (v: string) => void;
  onRefresh: () => void;
  onReset: () => void;
}) {
  const typeOptions = useMemo(
    () => [
      { value: "", label: "ทั้งหมด" },
      { value: "INCOME", label: "รายรับ" },
      { value: "EXPENSE", label: "รายจ่าย" },
    ],
    [],
  );
  const sourceOptions = useMemo(
    () => [
      { value: "", label: "ทั้งหมด" },
      { value: "CUSTOMER", label: "ลูกค้า" },
      { value: "AGENT_POA", label: "POA ตัวแทน" },
      { value: "OPS", label: "งานปฏิบัติการ" },
    ],
    [],
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_0.8fr_0.8fr] md:items-end">
        <div>
          <div className="text-sm font-medium text-gray-700">ช่วงวันที่เริ่ม</div>
          <DatePicker
            selected={dateStart ? dayjs(dateStart).toDate() : null}
            onChange={(date: Date | null) => onChangeDateStart(date ? dayjs(date).format("YYYY-MM-DD") : "")}
            placeholderText="Select Date"
            disabled={loading}
          />
        </div>
        <div>
          <div className="text-sm font-medium text-gray-700">ช่วงวันที่สิ้นสุด</div>
          <DatePicker
            selected={dateEnd ? dayjs(dateEnd).toDate() : null}
            onChange={(date: Date | null) => onChangeDateEnd(date ? dayjs(date).format("YYYY-MM-DD") : "")}
            placeholderText="Select Date"
            disabled={loading}
          />
        </div>
        <LabeledSelect label="ประเภท" value={txnType} placeholder="ทั้งหมด" options={typeOptions} disabled={loading} onChange={onChangeTxnType} />
        <LabeledSelect label="แหล่งที่มา" value={sourceType} placeholder="ทั้งหมด" options={sourceOptions} disabled={loading} onChange={onChangeSourceType} />
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onRefresh} disabled={loading}>
          รีเฟรช
        </Button>
        <Button variant="outline" onClick={onReset} disabled={loading}>
          ล้างตัวกรอง
        </Button>
      </div>
    </div>
  );
}

