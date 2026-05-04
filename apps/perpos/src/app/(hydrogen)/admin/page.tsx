"use client";

import React from "react";
import { Title, Text } from "rizzui/typography";

import { useAuth } from "@/app/shared/auth-provider";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-gray-900">{title}</div>
      <div className="mt-2 text-sm text-gray-700">{children}</div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { email } = useAuth();

  return (
    <div>
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          แอดมินคอนโซล
        </Title>
        <Text className="mt-1 text-sm text-gray-600">จัดการผู้ใช้ สิทธิ์รายฟังก์ชัน และการส่งข่าวผ่าน LINE</Text>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card title="ผู้ดูแลระบบ">
          {email ? `เข้าสู่ระบบด้วย ${email}` : "-"}
        </Card>
        <Card title="สถานะการเชื่อมต่อ">
          ตั้งค่า `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`, `LINE_MESSAGING_CHANNEL_SECRET` และ `OPENAI_API_KEY` ในฝั่งเซิร์ฟเวอร์
        </Card>
      </div>
    </div>
  );
}

