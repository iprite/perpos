"use client";

import { useRouter } from "next/navigation";
import React, { useEffect } from "react";
import { Text, Title } from "rizzui/typography";

export default function UsersPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/users");
  }, [router]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <Title as="h1" className="text-lg font-semibold text-gray-900">
        กำลังพาไปหน้าใหม่
      </Title>
      <Text className="mt-2 text-sm text-gray-600">ย้ายไปใช้หน้า /admin/users</Text>
    </div>
  );
}
