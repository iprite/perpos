"use client";

/**
 * IssueFilters — filter status/type/severity ของ Issue Tracker (server component)
 * เปลี่ยนค่า → push URL ใหม่ (?status=…&page=1) → server re-render (loading.tsx แสดง skeleton)
 */

import { useRouter, usePathname } from "next/navigation";
import { CustomSelect } from "@/components/ui/custom-select";

export function IssueFilters({
  status,
  type,
  severity,
}: {
  status: string;
  type: string;
  severity: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const push = (next: { status?: string; type?: string; severity?: string }) => {
    const qs = new URLSearchParams();
    const merged = { status, type, severity, ...next };
    if (merged.status) qs.set("status", merged.status);
    if (merged.type) qs.set("type", merged.type);
    if (merged.severity) qs.set("severity", merged.severity);
    // เปลี่ยน filter = กลับหน้า 1 เสมอ
    router.push(qs.toString() ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <CustomSelect
        value={status}
        onChange={(v) => push({ status: v })}
        options={[
          { value: "", label: "ทุกสถานะ" },
          { value: "open", label: "เปิดเรื่อง" },
          { value: "triaging", label: "คัดแยก" },
          { value: "diagnosing", label: "หาต้นเหตุ" },
          { value: "fixing", label: "กำลังแก้" },
          { value: "verifying", label: "กำลังตรวจ" },
          { value: "fixed", label: "แก้แล้ว (รอ deploy)" },
          { value: "deployed", label: "ขึ้น prod แล้ว" },
          { value: "closed", label: "ปิดสมบูรณ์" },
          { value: "blocked", label: "ติดบล็อก" },
          { value: "wontfix", label: "ไม่แก้" },
          { value: "duplicate", label: "ซ้ำ" },
          { value: "handoff_feature", label: "ส่งต่อฟีเจอร์" },
        ]}
        className="w-48"
      />
      <CustomSelect
        value={type}
        onChange={(v) => push({ type: v })}
        options={[
          { value: "", label: "ทุกประเภท" },
          { value: "bug", label: "บั๊ก" },
          { value: "user_error", label: "ใช้งานผิด" },
          { value: "config_infra", label: "ตั้งค่า/ระบบ" },
          { value: "feature_gap", label: "ฟีเจอร์ขาด" },
        ]}
        className="w-40"
      />
      <CustomSelect
        value={severity}
        onChange={(v) => push({ severity: v })}
        options={[
          { value: "", label: "ทุกความรุนแรง" },
          { value: "sev1", label: "วิกฤต (sev1)" },
          { value: "sev2", label: "สำคัญ (sev2)" },
          { value: "sev3", label: "เล็กน้อย (sev3)" },
        ]}
        className="w-44"
      />
    </div>
  );
}
