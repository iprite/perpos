"use client";

import Logo from "@core/components/logo";
import cn from "@core/utils/class-names";
import Link from "next/link";
import { SidebarMenu } from "./sidebar-menu";
import { SidebarModuleSwitcher } from "@/components/sidebar-module-switcher";

export default function Sidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "fixed bottom-0 start-0 z-50 h-full w-[270px] border-e-2 border-gray-100 bg-white dark:bg-gray-100/50 2xl:w-72",
        className
      )}
    >
      <div className="sticky top-0 z-40 bg-gray-0/10 pb-2 pt-5 dark:bg-gray-100/5">
        <Link
          href={"/"}
          aria-label="Site Logo"
          className="flex justify-center px-6 pb-4 text-gray-800 hover:text-gray-900 2xl:px-8"
        >
          <Logo className="max-w-[155px]" />
        </Link>
        <SidebarModuleSwitcher />
      </div>

      <div className="custom-scrollbar overflow-y-auto scroll-smooth h-[calc(100%-120px)]">
        <SidebarMenu />
      </div>
    </aside>
  );
}
