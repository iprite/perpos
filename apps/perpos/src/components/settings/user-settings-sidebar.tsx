import React from "react";

export default function SettingsSidebar() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">เมนู</div>
      <div className="mt-3 flex flex-row gap-2 overflow-x-auto lg:flex-col">
        <a className="rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50" href="#profile">
          โปรไฟล์
        </a>
        <a className="rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50" href="#security">
          ความปลอดภัย
        </a>
        <a className="rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50" href="#line">
          LINE แจ้งเตือน
        </a>
      </div>
    </div>
  );
}

