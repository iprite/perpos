"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpenText, Users, BotMessageSquare, Building2, Briefcase, Calculator, Boxes,
} from "lucide-react";
import { useAtomValue } from "jotai";
import { ALL_MODULES } from "@/lib/modules";
import { enabledModuleKeysAtom, orgSlugAtom } from "@/app/shared/module-atoms";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";

const MODULE_ICONS: Record<string, React.ReactNode> = {
  accounting: <BookOpenText className="h-4 w-4" />,
  payroll:    <Users        className="h-4 w-4" />,
  assistant:  <BotMessageSquare className="h-4 w-4" />,
  tmc:        <Building2    className="h-4 w-4" />,
  crm:        <Briefcase    className="h-4 w-4" />,
  acc_firm:   <Calculator   className="h-4 w-4" />,
  jaquar:     <Boxes        className="h-4 w-4" />,
};

// Segments ที่ไม่ใช่ context ขององค์กร (ERP) — module switcher ไม่เกี่ยวข้อง
const SYSTEM_SEGMENTS = new Set(["admin", "assistant", "user", "no-org", "no-module", "signin"]);

export function SidebarModuleSwitcher() {
  const pathname    = usePathname() ?? "/";
  const orgSlug     = useAtomValue(orgSlugAtom);
  const enabledKeys = useAtomValue(enabledModuleKeysAtom);
  const router      = useRouter();

  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? "";

  // module switcher = สลับโมดูล ERP ภายใน org เท่านั้น
  // บน /assistant, /admin ฯลฯ ต้องไม่โผล่ (การสลับ Ai ERP ↔ ผู้ช่วย AI เป็นหน้าที่ของ toggle ที่ footer)
  const visibleModules = ALL_MODULES.filter((m) => enabledKeys.includes(m.key) && !m.personal);
  const activeModule   = visibleModules.find((m) => m.match(pathname)) ?? visibleModules[0];

  if (SYSTEM_SEGMENTS.has(firstSegment)) return null;
  if (visibleModules.length <= 1) return null;

  const items: DropdownItem[] = visibleModules.map((m) => ({
    key:   m.key,
    label: m.label,
    icon:  MODULE_ICONS[m.key] ?? <BookOpenText className="h-4 w-4" />,
    onClick: () => {
      if (m.key !== activeModule?.key) router.push(`/${orgSlug}${m.href}`);
    },
  }));

  return (
    <div className="px-4 pb-3 pt-1 2xl:px-6">
      <Dropdown
        label={activeModule?.label ?? "Module"}
        leadingIcon={MODULE_ICONS[activeModule?.key ?? ""] ?? <BookOpenText className="h-4 w-4" />}
        selectedKey={activeModule?.key}
        items={items}
        className="w-full"
        placement="bottom-start"
      />
    </div>
  );
}
