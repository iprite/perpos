"use client";

import React, { useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import { Title, Text } from "rizzui/typography";

import "react-datepicker/dist/react-datepicker.css";

export default function DateInputTemplatePage() {
  const [value, setValue] = useState<Date | null>(new Date());

  const formatted = useMemo(() => {
    if (!value) return "-";
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "full" }).format(value);
  }, [value]);

  return (
    <div>
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          Template: Date Input
        </Title>
        <Text className="mt-1 text-sm text-gray-600">ตัวอย่างคอมโพเนนต์เลือกวันที่สำหรับใช้ซ้ำ</Text>
      </div>

      <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="text-sm font-medium text-gray-900">เลือกวันที่</div>
        <div className="mt-3">
          <DatePicker
            selected={value}
            onChange={(d) => setValue(d)}
            dateFormat="yyyy-MM-dd"
            className="h-10 w-full max-w-sm rounded-md border border-gray-300 px-3 text-sm"
          />
        </div>
        <div className="mt-4 text-sm text-gray-700">
          วันที่ที่เลือก: <span className="font-medium text-gray-900">{formatted}</span>
        </div>
      </div>
    </div>
  );
}

