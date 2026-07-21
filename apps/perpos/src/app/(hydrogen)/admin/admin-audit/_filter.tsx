"use client";

/**
 * AuditActionFilter — dropdown filter action สำหรับ admin-audit (server component)
 * เปลี่ยนค่า → push URL ใหม่ (?action=…&page=1) → server re-render (loading.tsx แสดง skeleton)
 */

import { useRouter, usePathname } from "next/navigation";
import { CustomSelect } from "@/components/ui/custom-select";

export function AuditActionFilter({ actions, current }: { actions: string[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <CustomSelect
      value={current}
      onChange={(v) => {
        const qs = new URLSearchParams();
        if (v) qs.set("action", v);
        // เปลี่ยน filter = กลับหน้า 1 เสมอ
        router.push(qs.toString() ? `${pathname}?${qs}` : pathname);
      }}
      options={[
        { value: "", label: "ทุก action" },
        ...actions.map((a) => ({ value: a, label: a })),
      ]}
      className="w-52"
    />
  );
}
