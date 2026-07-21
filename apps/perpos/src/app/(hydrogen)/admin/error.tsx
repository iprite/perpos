"use client";

// Error boundary ระดับ segment /admin — จับ error จาก server component (เช่น DB query พัง)
// ให้แสดง UI สวย ๆ ในกรอบ content (shell ยังอยู่ เพราะ error.tsx แทนเฉพาะ segment ใต้ layout)
// + ส่งเข้า Sentry · ปุ่ม "ลองใหม่" เรียก reset() ให้ Next render segment ใหม่

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 rounded-full bg-red-50 p-4">
        <AlertTriangle className="h-8 w-8 text-red-600" />
      </div>
      <h3 className="text-base font-medium text-gray-900">โหลดข้อมูลไม่สำเร็จ</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">
        ระบบขัดข้องชั่วคราว ทีมงานได้รับแจ้งแล้ว กรุณาลองใหม่อีกครั้ง
      </p>
      <Button className="mt-4" onClick={() => reset()}>
        ลองใหม่
      </Button>
    </div>
  );
}
