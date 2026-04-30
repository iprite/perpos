"use client";

import React from "react";

export function WorkerSummaryCard({ fullName, passportNo, nationality }: { fullName: string; passportNo: string; nationality: string }) {
  const name = fullName.trim();
  const pass = passportNo.trim();
  const nat = nationality.trim();
  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
      <div className="text-sm font-semibold text-gray-900">สรุปแรงงาน</div>
      <div className="mt-2 text-sm text-gray-700">{name ? name : <span className="text-gray-500">กรอกข้อมูลเพื่อดูสรุป</span>}</div>
      <div className="mt-2 grid gap-1 text-xs text-gray-600">
        <div>{pass ? `P ${pass}` : "-"}</div>
        <div>{nat ? nat : "-"}</div>
      </div>
    </div>
  );
}

