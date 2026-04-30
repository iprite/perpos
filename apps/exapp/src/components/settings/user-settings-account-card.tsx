import React from "react";
import toast from "react-hot-toast";
import { Button } from "rizzui";

export default function AccountSummaryCard({
  email,
  userId,
  lineLinked,
}: {
  email: string | null;
  userId: string | null;
  lineLinked: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="text-base font-semibold text-gray-900">ข้อมูลบัญชี</div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <div className="text-xs text-gray-500">อีเมล</div>
          <div className="mt-1 text-sm font-medium text-gray-900">{email ?? "-"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">รหัสผู้ใช้ (UID)</div>
          <div className="mt-1 flex items-center gap-2">
            <div className="truncate text-sm font-medium text-gray-900">{userId ?? "-"}</div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!userId) return;
                try {
                  await navigator.clipboard.writeText(userId);
                  toast.success("คัดลอกแล้ว");
                } catch {
                  toast.error("คัดลอกไม่สำเร็จ");
                }
              }}
            >
              คัดลอก
            </Button>
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">สถานะ LINE</div>
          <div className="mt-1 text-sm font-medium">
            {lineLinked ? (
              <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
                เชื่อมแล้ว
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                ยังไม่เชื่อม
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

