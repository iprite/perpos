"use client";

// no-access.tsx — empty state "ไม่มีสิทธิ์เข้าถึง" ใช้ร่วมทุกหน้า gov_procure (DRY)
// ส่ง title + icon เข้า GovProcureShell · เนื้อหาอธิบายส่งผ่าน children · mirror hotel

import { ShieldX } from "lucide-react";
import { Text } from "@/components/ui/typography";
import { GovProcureShell } from "./nav";

export function NoAccess({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  /** ข้อความอธิบายว่าบทบาทใดเข้าได้ / ให้สลับเป็นใคร */
  children: React.ReactNode;
}) {
  return (
    <GovProcureShell title={title} icon={icon}>
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
        <div className="mb-4 rounded-full bg-gray-100 p-4">
          <ShieldX className="h-8 w-8 text-gray-400" />
        </div>
        <Text className="text-sm font-medium text-gray-900">ไม่มีสิทธิ์เข้าถึง</Text>
        <Text className="mt-1 text-sm text-gray-500">{children}</Text>
      </div>
    </GovProcureShell>
  );
}
