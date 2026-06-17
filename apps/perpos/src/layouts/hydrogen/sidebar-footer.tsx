"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import ProfileMenu from "@/layouts/profile-menu";
import { useAuth } from "@/app/shared/auth-provider";

export function SidebarFooter() {
  const { userId } = useAuth();
  if (!userId) return null;

  return (
    <div className="shrink-0 border-t border-gray-100 p-3 dark:border-gray-200/10">
      {/* อัปเกรดแพ็กเกจ — แสดงเหนือ profile card */}
      <Link
        href="/assistant/billing"
        className="mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800"
      >
        <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
        อัปเกรดแพ็กเกจ
      </Link>
      <ProfileMenu />
    </div>
  );
}
