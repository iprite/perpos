"use client";

// no-access.tsx — empty state "ไม่มีสิทธิ์เข้าถึง" ใช้ร่วมทุกหน้า mattii_ops (§2.3 ข้อ 4)
// ต้องไม่เรนเดอร์ข้อมูลใด ๆ + ต้องมีปุ่มกลับหน้าภาพรวมเสมอ

import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import { MattiiShell, MATTII_BASE } from "./nav";

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
    <MattiiShell title={title} icon={icon}>
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
        <div className="mb-4 rounded-full bg-gray-100 p-4">
          <ShieldX className="h-8 w-8 text-gray-400" />
        </div>
        <Text className="text-sm font-medium text-gray-900">ไม่มีสิทธิ์เข้าถึง</Text>
        <Text className="mt-1 max-w-md text-sm text-gray-500">{children}</Text>
        <Button asChild className="mt-4" variant="outline" size="sm">
          <Link href={MATTII_BASE}>กลับหน้าภาพรวม</Link>
        </Button>
      </div>
    </MattiiShell>
  );
}
