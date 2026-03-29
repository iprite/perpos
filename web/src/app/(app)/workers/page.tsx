"use client";

import React from "react";

type WorkerRow = {
  name: string;
  nationality: string;
  passport: string;
  nextExpiry: string;
  driveLink: string;
};

const sample: WorkerRow[] = [
  {
    name: "Somchai L.",
    nationality: "Myanmar",
    passport: "MM1234567",
    nextExpiry: "2026-05-20",
    driveLink: "https://drive.google.com/",
  },
  {
    name: "Sokha P.",
    nationality: "Cambodia",
    passport: "KH8899001",
    nextExpiry: "2026-04-10",
    driveLink: "https://drive.google.com/",
  },
];

export default function WorkersPage() {
  return (
    <div>
      <div>
        <div className="text-lg font-semibold">แรงงาน</div>
        <div className="mt-1 text-sm text-[color:var(--color-muted)]">ดูรายการแรงงานและวันหมดอายุเอกสารสำคัญ</div>
      </div>

      <div className="mt-4 rounded-xl border bg-[color:var(--color-surface)]">
        <div className="p-4 flex items-center gap-3">
          <input
            className="h-9 w-full max-w-[420px] rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            placeholder="ค้นหาชื่อ/เลขพาสปอร์ต"
          />
          <select className="h-9 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm">
            <option>ทุกสถานะเอกสาร</option>
            <option>ใกล้หมดอายุ</option>
            <option>ปกติ</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[color:var(--color-muted)]">
              <tr className="border-t">
                <th className="px-4 py-3 font-medium">ชื่อ</th>
                <th className="px-4 py-3 font-medium">สัญชาติ</th>
                <th className="px-4 py-3 font-medium">Passport</th>
                <th className="px-4 py-3 font-medium">วันหมดอายุใกล้สุด</th>
                <th className="px-4 py-3 font-medium">เอกสาร</th>
              </tr>
            </thead>
            <tbody>
              {sample.map((row) => (
                <tr key={row.passport} className="border-t hover:bg-[color:var(--color-surface-2)] transition">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.nationality}</td>
                  <td className="px-4 py-3">{row.passport}</td>
                  <td className="px-4 py-3">{row.nextExpiry}</td>
                  <td className="px-4 py-3">
                    <a
                      href={row.driveLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm underline decoration-[color:var(--color-border)] hover:opacity-80"
                    >
                      เปิดใน Google Drive
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

