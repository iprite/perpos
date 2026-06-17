"use client";

import Link from "next/link";
import { LayoutGrid } from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import ProfileMenu from "@/layouts/profile-menu";

/**
 * ส่วนขวาของ header หน้าสาธารณะ (terms/privacy) — รู้สถานะล็อกอิน
 * - ล็อกอินแล้ว: ปุ่ม "เข้าแอป" + ไอคอนเมนูผู้ใช้ (เหมือน header ในแอป)
 * - ยังไม่ล็อกอิน: ลิงก์นโยบาย/ข้อกำหนด + ปุ่มเข้าสู่ระบบ
 */
export default function PublicHeaderActions() {
  const { userId, loading } = useAuth();

  if (loading) {
    // กันหน้ากระพริบระหว่างเช็ค session — เว้นที่ว่างขนาดปุ่มไอคอน
    return <div className="h-8 w-8" />;
  }

  if (userId) {
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow-sm transition-colors hover:bg-gray-50"
        >
          <LayoutGrid className="h-4 w-4" />
          เข้าแอป
        </Link>
        <ProfileMenu variant="icon" />
      </div>
    );
  }

  return (
    <nav className="flex items-center gap-3 text-sm">
      <Link href="/privacy" className="hidden text-gray-600 hover:text-gray-900 sm:inline">
        นโยบายความเป็นส่วนตัว
      </Link>
      <Link href="/terms" className="hidden text-gray-600 hover:text-gray-900 sm:inline">
        ข้อกำหนดการให้บริการ
      </Link>
      <Link
        href="/signin"
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-900 shadow-sm hover:bg-gray-50"
      >
        เข้าสู่ระบบ
      </Link>
    </nav>
  );
}
