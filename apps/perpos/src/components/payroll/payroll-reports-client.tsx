"use client";

import React from "react";
import { FileText, Building2, FileBarChart2, Clock } from "lucide-react";

const plannedFeatures = [
  {
    icon: <FileText className="h-6 w-6 text-teal-500" />,
    title: "สลิปเงินเดือน",
    desc: "พิมพ์สลิปเงินเดือนรายบุคคล รูปแบบ PDF",
  },
  {
    icon: <Building2 className="h-6 w-6 text-blue-500" />,
    title: "ไฟล์โอนเงินธนาคาร",
    desc: "ส่งออกไฟล์สำหรับโอนเงินผ่านธนาคาร (BAY, KBank, SCB)",
  },
  {
    icon: <FileBarChart2 className="h-6 w-6 text-violet-500" />,
    title: "รายงาน SSO / ประกันสังคม",
    desc: "สรุปส่งประกันสังคมรายเดือน ไฟล์ Excel",
  },
  {
    icon: <FileText className="h-6 w-6 text-amber-500" />,
    title: "หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)",
    desc: "ออกหนังสือรับรองการหักภาษี ณ ที่จ่ายประจำปี",
  },
];

export function PayrollReportsClient() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
        <Clock className="h-8 w-8 text-slate-400" />
      </div>
      <h2 className="mb-2 text-xl font-semibold text-slate-800">อยู่ระหว่างพัฒนา</h2>
      <p className="mb-10 text-sm text-slate-500">ฟีเจอร์รายงานจะพร้อมในเร็วๆ นี้</p>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        {plannedFeatures.map((f) => (
          <div
            key={f.title}
            className="flex gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="shrink-0">{f.icon}</div>
            <div>
              <div className="font-medium text-slate-800">{f.title}</div>
              <div className="mt-1 text-sm text-slate-500">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
