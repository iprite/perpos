import React from "react";
import {
  BadgePercent,
  BriefcaseBusiness,
  Building2,
  FileSignature,
  FileText,
  LayoutDashboard,
  Shield,
  Users,
  UserSquare2,
  Wallet,
} from "lucide-react";

import type { Role } from "@/lib/supabase/types";

export type LabelMenuItem = { name: string; roles?: Role[] };

export type LinkMenuItem = {
  name: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string;
  roles?: Role[];
  dropdownItems?: {
    name: string;
    href: string;
    badge?: string;
    roles?: Role[];
  }[];
};

export type MenuItem = LabelMenuItem | LinkMenuItem;

export function isLinkMenuItem(item: MenuItem): item is LinkMenuItem {
  return (item as LinkMenuItem).href !== undefined;
}

const allRoles: Role[] = ["admin", "sale", "operation", "employer", "representative"];

function hasRole(itemRoles: Role[] | undefined, role: Role | null) {
  if (!itemRoles) return true;
  if (!role) return false;
  return itemRoles.includes(role);
}

export function getMenuItems(role: Role | null): MenuItem[] {
  const items: MenuItem[] = [
    { name: "ภาพรวม", roles: ["admin", "sale", "operation", "employer"] },
    {
      name: "แดชบอร์ด",
      href: "/",
      icon: <LayoutDashboard className="h-5 w-5" />,
      roles: ["admin", "sale", "operation", "employer"],
    },
  ];

  items.push({ name: "การขายและบริการ", roles: ["admin", "sale", "employer"] });
  items.push(
    {
      name: "ใบเสนอราคา",
      href: "/quotes",
      icon: <FileText className="h-5 w-5" />,
      roles: ["admin", "sale"],
    },
    {
      name: "ออเดอร์",
      href: "/orders",
      icon: <BriefcaseBusiness className="h-5 w-5" />,
      roles: ["admin", "sale", "employer"],
    },
    {
      name: "นายจ้าง/ลูกค้า",
      href: "/customers",
      icon: <Building2 className="h-5 w-5" />,
      roles: ["admin", "sale", "employer"],
    },
    {
      name: "แรงงาน",
      href: "/workers",
      icon: <Users className="h-5 w-5" />,
      roles: ["admin", "employer"],
    },
  );

  items.push({ name: "งานปฏิบัติการ", roles: ["admin", "operation", "sale"] });
  items.push(
    {
      name: "ธุรกรรมการเงิน",
      href: "/finance",
      icon: <Wallet className="h-5 w-5" />,
      dropdownItems: [
        { name: "รายรับ/รายจ่าย", href: "/finance", roles: ["admin", "sale", "operation"] },
        { name: "เงินสดย่อย", href: "/finance/petty-cash", roles: ["admin", "sale", "operation"] },
      ],
      roles: ["admin", "sale", "operation"],
    },
    {
      name: "จัดการ POA",
      href: "/poa-requests",
      icon: <FileSignature className="h-5 w-5" />,
      roles: ["admin", "operation"],
    },
    {
      name: "จัดการออเดอร์",
      href: "/manage-orders",
      icon: <BriefcaseBusiness className="h-5 w-5" />,
      roles: ["admin", "operation"],
    },
    {
      name: "นายจ้าง/ลูกค้า",
      href: "/customers",
      icon: <Building2 className="h-5 w-5" />,
      roles: ["admin", "operation"],
    },
    {
      name: "แรงงาน",
      href: "/workers",
      icon: <Users className="h-5 w-5" />,
      roles: ["admin", "operation"],
    },
  );

  items.push(
    { name: "หนังสือมอบอำนาจ", roles: ["representative"] },
    {
      name: "คำขอ POA",
      href: "/my-poa-requests",
      icon: <FileText className="h-5 w-5" />,
      roles: ["representative"],
    },
  );

  items.push({ name: "ผู้ดูแลระบบ", roles: ["admin"] });
  items.push(
    {
      name: "บริการ (Service)",
      href: "/services",
      icon: <BadgePercent className="h-5 w-5" />,
      roles: ["admin"],
    },
    {
      name: "หนังสือมอบอำนาจ",
      href: "/poa-request-types",
      icon: <FileSignature className="h-5 w-5" />,
      roles: ["admin"],
    },
    {
      name: "ตัวแทนบริษัท",
      href: "/representatives",
      icon: <UserSquare2 className="h-5 w-5" />,
      roles: ["admin"],
    },
    {
      name: "ผู้ใช้และสิทธิ์",
      href: "/admin/users",
      icon: <Shield className="h-5 w-5" />,
      roles: ["admin"],
    },
  );

  return items.filter((item) => {
    if (!("href" in item)) return hasRole(item.roles, role);
    if (item.dropdownItems?.length) {
      const filtered = item.dropdownItems.filter((d) => hasRole(d.roles, role));
      item.dropdownItems = filtered;
      if (filtered.length === 0) return false;
    }
    return hasRole(item.roles, role);
  });
}
