"use client";

// no-access.tsx — banner สิทธิ์ (golf-club)
//  · AccessLockBanner  = inline banner "โหมดดูอย่างเดียว / ต้องมีสิทธิ์…" (viewer/staff read-only)
//  · NoAccess          = full-page fallback เมื่อ role เข้าหน้านั้นไม่ได้เลย

import { ShieldAlert, ShieldX } from "lucide-react";
import { Text } from "@/components/ui/typography";
import { GolfShell } from "./nav";

/** แถบเตือน read-only วางหัวหน้า (ปุ่ม mutation จะถูกซ่อน/disable แยกในหน้า) */
export function AccessLockBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <span>{children}</span>
    </div>
  );
}

/** หน้าเต็ม "ไม่มีสิทธิ์เข้าถึง" — ครอบด้วย GolfShell (ยังเห็นเมนู/สลับ role ได้) */
export function NoAccess({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <GolfShell title={title} icon={icon}>
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
        <div className="mb-4 rounded-full bg-gray-100 p-4">
          <ShieldX className="h-8 w-8 text-gray-400" />
        </div>
        <Text className="text-sm font-medium text-gray-900">ไม่มีสิทธิ์เข้าถึง</Text>
        <Text className="mt-1 text-sm text-gray-500">{children}</Text>
      </div>
    </GolfShell>
  );
}
