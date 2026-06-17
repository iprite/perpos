"use client";

import ProfileMenu from "@/layouts/profile-menu";
import { useAuth } from "@/app/shared/auth-provider";

export function SidebarFooter() {
  const { userId } = useAuth();
  if (!userId) return null;

  return (
    <div className="shrink-0 border-t border-gray-100 p-3 dark:border-gray-200/10">
      <ProfileMenu />
    </div>
  );
}
