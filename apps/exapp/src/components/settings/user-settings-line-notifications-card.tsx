import React from "react";

import type { NotiItem } from "@/components/settings/user-settings-page";

export default function LineNotificationsCard({
  linked,
  loading,
  items,
  onToggle,
}: {
  linked: boolean;
  loading: boolean;
  items: NotiItem[];
  onToggle: (eventKey: string, enabled: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="text-sm font-semibold text-gray-900">ตั้งค่าการแจ้งเตือนรายเหตุการณ์</div>
      {!linked && <div className="mt-2 text-xs text-gray-600">เชื่อม LINE ก่อนเพื่อเปิดการแจ้งเตือน</div>}

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="text-sm text-gray-600">{loading ? "กำลังโหลด..." : "ยังไม่มีเหตุการณ์ที่ตั้งค่าได้"}</div>
        ) : (
          items.map((it) => (
            <div key={it.key} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">{it.name}</div>
                <div className="mt-1 text-xs text-gray-600">{it.description ?? ""}</div>
              </div>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={it.enabled}
                  disabled={!linked || loading}
                  onChange={(e) => onToggle(it.key, e.target.checked)}
                />
              </label>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

