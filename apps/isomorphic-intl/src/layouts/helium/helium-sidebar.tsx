"use client";

import { siteConfig } from "@/config/site.config";
import { Link } from "@/i18n/routing";
import cn from "@core/utils/class-names";
import Image from "next/image";
import { HeliumSidebarMenu } from "./helium-sidebar-menu";

import ShortLogo from "@public/logo-short-light.svg";

export default function HeliumSidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "fixed bottom-0 start-0 z-50 h-full w-[284px] dark:bg-gray-100/50 xl:p-5 2xl:w-[308px]",
        className
      )}
    >
      <div className="h-full bg-gray-900 p-1.5 pl-0  pr-1.5 dark:bg-gray-100/70 xl:rounded-2xl">
        <div className="sticky top-0 z-40 flex justify-center px-6 pb-5 pt-5 2xl:px-8 2xl:pt-6">
          <Link href={"/"} aria-label="Site Logo">
            <Image
              src={ShortLogo}
              alt={siteConfig.title}
              width={58}
              height={35}
              priority
            />
          </Link>
        </div>

        <div className="custom-scrollbar overflow-y-auto scroll-smooth h-[calc(100%-80px)]">
          <HeliumSidebarMenu />
        </div>
      </div>
    </aside>
  );
}
