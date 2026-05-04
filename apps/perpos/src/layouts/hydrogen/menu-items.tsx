import React from "react";
import {
  Newspaper,
  LayoutDashboard,
  Link2,
  Shield,
  Users,
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

const allRoles: Role[] = ["admin", "user"];

function hasRole(itemRoles: Role[] | undefined, role: Role | null) {
  if (!itemRoles) return true;
  if (!role) return false;
  return itemRoles.includes(role);
}

function buildUserMenuItems(): MenuItem[] {
  return [
    { name: "PERPOS", roles: allRoles },
    {
      name: "แดชบอร์ด",
      href: "/me",
      icon: <LayoutDashboard className="h-5 w-5" />,
      roles: allRoles,
    },
  ];
}

function buildAdminMenuItems(): MenuItem[] {
  return [
    { name: "แอดมินคอนโซล", roles: ["admin"] },
    {
      name: "ภาพรวม",
      href: "/admin",
      icon: <LayoutDashboard className="h-5 w-5" />,
      roles: ["admin"],
    },
    {
      name: "ผู้ใช้",
      href: "/admin/users",
      icon: <Users className="h-5 w-5" />,
      roles: ["admin"],
    },
    {
      name: "สิทธิ์รายฟังก์ชัน",
      href: "/admin/permissions",
      icon: <Shield className="h-5 w-5" />,
      roles: ["admin"],
    },
    {
      name: "News Agent",
      href: "/admin/news-agent",
      icon: <Newspaper className="h-5 w-5" />,
      roles: ["admin"],
    },
    {
      name: "การส่งผ่าน LINE",
      href: "/admin/delivery",
      icon: <Link2 className="h-5 w-5" />,
      roles: ["admin"],
    },
  ];
}

function pickMenuContext(pathname: string, role: Role | null) {
  const p = pathname || "/";
  if (p === "/me" || p.startsWith("/me/")) return "user";
  if (p === "/settings" || p.startsWith("/settings/")) return "user";
  if (p.startsWith("/templates")) return "user";
  if (p === "/admin" || p.startsWith("/admin/")) return role === "admin" ? "admin" : "user";
  return role === "admin" ? "admin" : "user";
}

export function getMenuItems(role: Role | null, pathname: string): MenuItem[] {
  const context = pickMenuContext(pathname, role);
  const items = context === "admin" ? buildAdminMenuItems() : buildUserMenuItems();

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
