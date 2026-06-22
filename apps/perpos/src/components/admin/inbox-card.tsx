"use client";

/**
 * InboxCard — "Action Inbox" บน dashboard admin
 *
 * แสดงงานที่ต้องลงมือ (จาก computeAdminInbox) จัดลำดับความสำคัญ + คลิกลงมือได้:
 *   - item ผูก org → เปิด Org 360 drawer
 *   - item มี href → นำทาง
 *   - กากบาท = dismiss (ซ่อนชั่วคราวใน session นี้)
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Wrench, Mic, Activity, CheckCircle, X, ChevronRight } from "lucide-react";
import cn from "@core/utils/class-names";
import { useOrgDrawer } from "./org-link";
import type { InboxItem, InboxKind, InboxSeverity } from "@/lib/admin/inbox";

const KIND_ICON: Record<InboxKind, React.ComponentType<{ className?: string }>> = {
  billing: CreditCard,
  maintenance: Wrench,
  stt: Mic,
  api: Activity,
};

const SEVERITY_CHIP: Record<InboxSeverity, string> = {
  critical: "bg-red-50 text-red-600",
  warning: "bg-amber-50 text-amber-600",
  info: "bg-blue-50 text-blue-600",
};

export function InboxCard({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const openOrg = useOrgDrawer();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = useMemo(() => items.filter((i) => !dismissed.has(i.id)), [items, dismissed]);

  function act(item: InboxItem) {
    if (item.org_id) openOrg(item.org_id);
    else if (item.href) router.push(item.href);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <div className="text-sm font-semibold text-gray-700">ต้องลงมือ</div>
        {visible.length > 0 && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            {visible.length}
          </span>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="flex items-center gap-2 px-5 py-6 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" /> ไม่มีงานค้าง — ทุกอย่างเรียบร้อย
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {visible.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li key={item.id} className="group flex items-center gap-3 px-5 py-2.5">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    SEVERITY_CHIP[item.severity],
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <button
                  type="button"
                  onClick={() => act(item)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-800">
                      {item.title}
                    </span>
                    {item.detail && (
                      <span className="block truncate text-xs text-gray-400">{item.detail}</span>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
                </button>
                <button
                  type="button"
                  title="ปิดรายการนี้"
                  onClick={() => setDismissed((s) => new Set(s).add(item.id))}
                  className="shrink-0 rounded p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
