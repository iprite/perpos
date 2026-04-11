"use client";

import Link from "next/link";
import React, { useMemo } from "react";
import { Title, Text } from "rizzui/typography";

import { useAuth } from "@/app/shared/auth-provider";

type Card = {
  title: string;
  description: string;
  href: string;
};

export default function WorkspacePage() {
  const { role } = useAuth();

  const cards = useMemo(() => {
    if (role === "representative") {
      const rep: Card[] = [
        {
          title: "คำขอ POA",
          description: "ดู/สร้างคำขอ POA ของตัวเอง และหัวหน้าทีมเห็นของลูกทีม",
          href: "/my-poa-requests",
        },
      ];
      return rep;
    }

    if (role === "employer") {
      const emp: Card[] = [
        { title: "ออเดอร์", description: "ดูข้อมูลออเดอร์ (view only)", href: "/orders" },
        { title: "แรงงาน", description: "จัดการข้อมูลแรงงาน (editable)", href: "/workers" },
        { title: "แจ้งเตือนเอกสาร", description: "ดูเอกสารใกล้หมดอายุและประวัติการแจ้งเตือน", href: "/notifications" },
      ];
      return emp;
    }

    const internal: Card[] = [
      { title: "จัดการ POA", description: "ดูและดำเนินการคำขอ POA", href: "/poa-requests" },
      { title: "ออเดอร์", description: "ดูออเดอร์ทั้งหมดตามสิทธิ์", href: "/orders" },
      { title: "แรงงาน", description: "ดูและจัดการข้อมูลแรงงานตามสิทธิ์", href: "/workers" },
      { title: "แจ้งเตือนเอกสาร", description: "ดูเอกสารใกล้หมดอายุและประวัติการแจ้งเตือน", href: "/notifications" },
      { title: "ตั้งค่าแจ้งเตือน", description: "ตั้งค่ากติกา/ผู้รับ/แม่แบบ และทดสอบส่ง", href: "/settings/notifications" },
    ];
    return internal;
  }, [role]);

  return (
    <div>
      <Title as="h1" className="text-lg font-semibold text-gray-900">
        Workspace
      </Title>
      <Text className="mt-1 text-sm text-gray-600">ระบบจะแสดงโมดูลตามบทบาทของคุณ</Text>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-gray-200 bg-white p-5 transition hover:border-gray-300 hover:shadow-sm"
          >
            <div className="text-base font-semibold text-gray-900">{c.title}</div>
            <div className="mt-2 text-sm text-gray-600">{c.description}</div>
            <div className="mt-4 text-sm font-medium text-gray-900">เปิด</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
