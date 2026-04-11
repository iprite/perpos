"use client";

import { Link } from "@/i18n/routing";
import { berylliumSidebarMenuItems } from "@/layouts/beryllium/beryllium-sidebar-menu-items";
import Logo from "@core/components/logo";
import cn from "@core/utils/class-names";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

export default function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const t = useTranslations("layout");

  return (
    <aside
      className={cn(
        "fixed bottom-0 start-0 z-50 h-full w-[270px] border-e-2 border-gray-100 bg-white 2xl:w-72 dark:bg-gray-100/50",
        className
      )}
    >
      <div className="sticky top-0 z-40 bg-gray-0/10 px-6 pb-5 pt-5 2xl:px-8 2xl:pt-6 dark:bg-gray-100/5">
        <Link
          href={"/"}
          aria-label="Site Logo"
          className="text-gray-800 hover:text-gray-900"
        >
          <Logo className="max-w-[155px]" />
        </Link>
      </div>

      <div className="custom-scrollbar overflow-y-auto scroll-smooth h-[calc(100%-80px)]">
        <div className="mt-4 pb-3 3xl:mt-6">
          {berylliumSidebarMenuItems.map((item, index) => {
            const isActive = pathname === (item?.href as string);
            return (
              <Link
                key={index}
                href={item?.href!}
                className={cn(
                  "group relative mx-3 my-0.5 flex items-center justify-between rounded-full px-3 py-2 font-medium capitalize lg:my-1 2xl:mx-5 2xl:my-2",
                  isActive
                    ? "before:top-2/5 text-primary before:absolute before:-start-3 before:block before:h-4/5 before:w-1 before:rounded-ee-full before:rounded-se-full before:bg-primary 2xl:before:-start-5"
                    : "text-gray-700 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-700/90"
                )}
              >
                <div className="flex items-center truncate">
                  {item?.icon && (
                    <span
                      className={cn(
                        "me-2 inline-flex h-5 w-5 items-center justify-center rounded-full [&>svg]:h-[20px] [&>svg]:w-[20px]",
                        isActive
                          ? "text-primary"
                          : "text-gray-800 dark:text-gray-500 dark:group-hover:text-gray-700"
                      )}
                    >
                      {item?.icon}
                    </span>
                  )}
                  <span className="truncate">{t(item.name)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
