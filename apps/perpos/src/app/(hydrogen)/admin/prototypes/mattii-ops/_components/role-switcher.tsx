"use client";

// role-switcher.tsx — สลับ role ที่จำลอง (จุดขาย: โชว์ว่า matrix สิทธิ์ + nav ต่อ role ทำงานจริง)
// ใช้ Dropdown มาตรฐาน @/components/ui/dropdown

import { ShieldCheck } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { ROLE_LABEL, ROLE_ORDER, useMattiiRole } from "./role-context";

export function RoleSwitcher({ className }: { className?: string }) {
  const { role, setRole } = useMattiiRole();

  return (
    <Dropdown
      label={ROLE_LABEL[role]}
      leadingIcon={<ShieldCheck className="h-4 w-4" />}
      badge="จำลองสิทธิ์"
      selectedKey={role}
      placement="bottom-end"
      className={className}
      items={ROLE_ORDER.map((r) => ({
        key: r,
        label: ROLE_LABEL[r],
        icon: <ShieldCheck className="h-4 w-4" />,
        onClick: () => setRole(r),
      }))}
    />
  );
}
