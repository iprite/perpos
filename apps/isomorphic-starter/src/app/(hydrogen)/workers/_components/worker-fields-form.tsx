"use client";

import React, { useMemo } from "react";
import dayjs from "dayjs";
import { Input } from "rizzui";
import { DatePicker } from "@core/ui/datepicker";
import AppSelect from "@core/ui/app-select";

export function WorkerFieldsForm({
  loading,
  nameInputRef,
  customers,
  fullName,
  onChangeFullName,
  customerId,
  onChangeCustomerId,
  passportNo,
  onChangePassportNo,
  passportExpireDate,
  onChangePassportExpireDate,
  visaNumber,
  onChangeVisaNumber,
  visaExpDate,
  onChangeVisaExpDate,
  wpNumber,
  onChangeWpNumber,
  wpExpireDate,
  onChangeWpExpireDate,
}: {
  loading: boolean;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
  customers: Array<{ id: string; name: string }>;
  fullName: string;
  onChangeFullName: (v: string) => void;
  customerId: string;
  onChangeCustomerId: (v: string) => void;
  passportNo: string;
  onChangePassportNo: (v: string) => void;
  passportExpireDate: string;
  onChangePassportExpireDate: (v: string) => void;
  visaNumber: string;
  onChangeVisaNumber: (v: string) => void;
  visaExpDate: string;
  onChangeVisaExpDate: (v: string) => void;
  wpNumber: string;
  onChangeWpNumber: (v: string) => void;
  wpExpireDate: string;
  onChangeWpExpireDate: (v: string) => void;
}) {
  const customerOptions = useMemo(() => customers.map((c) => ({ label: c.name, value: c.id })), [customers]);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
      <div className="grid gap-4 md:grid-cols-2">
        <Input ref={nameInputRef} label="ชื่อ-นามสกุล" value={fullName} onChange={(e) => onChangeFullName(e.target.value)} disabled={loading} />
        <div>
          <AppSelect
            label="นายจ้าง"
            placeholder="เลือก"
            options={customerOptions}
            value={customerId}
            onChange={(v: string) => onChangeCustomerId(v)}
            getOptionValue={(o) => o.value}
            displayValue={(selected) => customerOptions.find((o) => o.value === selected)?.label ?? ""}
            selectClassName="h-10 px-3"
            dropdownClassName="!z-[9999]"
            searchable
            searchPlaceHolder="ค้นหานายจ้าง..."
            disabled={loading}
          />
        </div>

        <Input label="เลขพาสปอร์ต" value={passportNo} onChange={(e) => onChangePassportNo(e.target.value)} disabled={loading} />

        <DatePicker
          selected={passportExpireDate ? dayjs(passportExpireDate).toDate() : null}
          onChange={(date: Date | null) => onChangePassportExpireDate(date ? dayjs(date).format("YYYY-MM-DD") : "")}
          placeholderText="เลือกวันที่"
          disabled={loading}
          inputProps={{ label: "พาสปอร์ตหมดอายุ" }}
        />

        <Input label="เลขที่วีซ่า" value={visaNumber} onChange={(e) => onChangeVisaNumber(e.target.value)} disabled={loading} />
        <DatePicker
          selected={visaExpDate ? dayjs(visaExpDate).toDate() : null}
          onChange={(date: Date | null) => onChangeVisaExpDate(date ? dayjs(date).format("YYYY-MM-DD") : "")}
          placeholderText="เลือกวันที่"
          disabled={loading}
          inputProps={{ label: "วีซ่าหมดอายุ" }}
        />

        <Input label="เลขที่ใบอนุญาตทำงาน" value={wpNumber} onChange={(e) => onChangeWpNumber(e.target.value)} disabled={loading} />
        <DatePicker
          selected={wpExpireDate ? dayjs(wpExpireDate).toDate() : null}
          onChange={(date: Date | null) => onChangeWpExpireDate(date ? dayjs(date).format("YYYY-MM-DD") : "")}
          placeholderText="เลือกวันที่"
          disabled={loading}
          inputProps={{ label: "ใบอนุญาตทำงานหมดอายุ" }}
        />
      </div>
    </div>
  );
}
