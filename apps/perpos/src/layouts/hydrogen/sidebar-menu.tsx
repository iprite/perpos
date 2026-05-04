'use client';

import Link from "next/link";
import { Fragment, useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Title, Collapse } from "rizzui";
import cn from "@core/utils/class-names";
import { PiCaretDownBold } from "react-icons/pi";
import { getMenuItems, isLinkMenuItem } from "@/layouts/hydrogen/menu-items";
import { useAuth } from "@/app/shared/auth-provider";
import StatusBadge from "@core/components/get-status-badge";

export function SidebarMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useAuth();
  const menuItems = getMenuItems(role, pathname ?? "/");
  const prefetchHrefs = useMemo(() => {
    const hrefs: string[] = [];
    for (const item of menuItems) {
      if (!isLinkMenuItem(item)) continue;
      if (item.href) hrefs.push(item.href);
      if (item.dropdownItems?.length) {
        for (const d of item.dropdownItems) {
          if (d.href) hrefs.push(d.href);
        }
      }
    }
    return Array.from(new Set(hrefs));
  }, [menuItems]);

  useEffect(() => {
    const run = () => {
      for (const href of prefetchHrefs) router.prefetch(href);
    };
    const runPriority = () => {
      for (const href of prefetchHrefs.slice(0, 6)) router.prefetch(href);
    };

    const t0 = setTimeout(runPriority, 0);
    const w = globalThis as any;
    if (typeof w?.requestIdleCallback === "function") {
      w.requestIdleCallback(run);
      return () => clearTimeout(t0);
    }
    const t = setTimeout(run, 300);
    return () => {
      clearTimeout(t0);
      clearTimeout(t);
    };
  }, [prefetchHrefs, router]);

  return (
    <div className="mt-4 pb-3 3xl:mt-6">
      {menuItems.map((item, index) => {
        const isActive = isLinkMenuItem(item) ? pathname === item.href : false;
        const pathnameExistInDropdowns =
          isLinkMenuItem(item) && item.dropdownItems?.length
            ? item.dropdownItems.filter((dropdownItem) => dropdownItem.href === pathname)
            : [];
        const isDropdownOpen = Boolean(pathnameExistInDropdowns.length);

        return (
          <Fragment key={item.name + "-" + index}>
            {isLinkMenuItem(item) ? (
              <>
                {item.dropdownItems?.length ? (
                  <Collapse
                    defaultOpen={isDropdownOpen}
                    header={({ open, toggle }) => (
                      <div
                        onClick={toggle}
                        className={cn(
                          "group relative mx-3 flex cursor-pointer items-center justify-between rounded-md px-3 py-2 font-medium lg:my-1 2xl:mx-5 2xl:my-2",
                          isDropdownOpen
                            ? "before:top-2/5 text-primary before:absolute before:-start-3 before:block before:h-4/5 before:w-1 before:rounded-ee-md before:rounded-se-md before:bg-primary 2xl:before:-start-5"
                            : "text-gray-700 transition-colors duration-200 hover:bg-gray-100 dark:text-gray-700/90 dark:hover:text-gray-700"
                        )}
                      >
                        <span className="flex items-center">
                          {item.icon && (
                            <span
                              className={cn(
                                "me-2 inline-flex h-5 w-5 items-center justify-center rounded-md [&>svg]:h-[20px] [&>svg]:w-[20px]",
                                isDropdownOpen
                                  ? "text-primary"
                                  : "text-gray-800 dark:text-gray-500 dark:group-hover:text-gray-700"
                              )}
                            >
                              {item.icon}
                            </span>
                          )}
                          {item.name}
                        </span>

                        <PiCaretDownBold
                          strokeWidth={3}
                          className={cn(
                            "h-3.5 w-3.5 -rotate-90 text-gray-500 transition-transform duration-200 rtl:rotate-90",
                            open && "rotate-0 rtl:rotate-0"
                          )}
                        />
                      </div>
                    )}
                  >
                    {item.dropdownItems.map((dropdownItem, di) => {
                      const isChildActive = pathname === dropdownItem.href;

                      return (
                        <Link
                          href={dropdownItem?.href}
                          prefetch
                          key={dropdownItem?.name + di}
                          onMouseEnter={() => router.prefetch(dropdownItem?.href)}
                          className={cn(
                            "mx-3.5 mb-0.5 flex items-center justify-between rounded-md px-3.5 py-2 font-medium capitalize last-of-type:mb-1 lg:last-of-type:mb-2 2xl:mx-5",
                            isChildActive
                              ? "text-primary"
                              : "text-gray-500 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-900"
                          )}
                        >
                          <div className="flex items-center truncate">
                            <span
                              className={cn(
                                "me-[18px] ms-1 inline-flex h-1 w-1 rounded-full bg-current transition-all duration-200",
                                isChildActive ? "bg-primary ring-[1px] ring-primary" : "opacity-40"
                              )}
                            />{" "}
                            <span className="truncate">{dropdownItem?.name}</span>
                          </div>
                          {dropdownItem?.badge?.length ? (
                            <StatusBadge status={dropdownItem?.badge} />
                          ) : null}
                        </Link>
                      );
                    })}
                  </Collapse>
                ) : (
                  <Link
                    href={item.href}
                    prefetch
                    className={cn(
                      "group relative mx-3 my-0.5 flex items-center justify-between rounded-md px-3 py-2 font-medium capitalize lg:my-1 2xl:mx-5 2xl:my-2",
                      isActive
                        ? "before:top-2/5 text-primary before:absolute before:-start-3 before:block before:h-4/5 before:w-1 before:rounded-ee-md before:rounded-se-md before:bg-primary 2xl:before:-start-5"
                        : "text-gray-700 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-700/90"
                    )}
                    onMouseEnter={() => router.prefetch(item.href)}
                  >
                    <div className="flex items-center truncate">
                      {item.icon && (
                        <span
                          className={cn(
                            "me-2 inline-flex h-5 w-5 items-center justify-center rounded-md [&>svg]:h-[20px] [&>svg]:w-[20px]",
                            isActive
                              ? "text-primary"
                              : "text-gray-800 dark:text-gray-500 dark:group-hover:text-gray-700"
                          )}
                        >
                          {item.icon}
                        </span>
                      )}
                      <span className="truncate">{item.name}</span>
                    </div>
                    {item.badge?.length ? <StatusBadge status={item.badge} /> : null}
                  </Link>
                )}
              </>
            ) : (
              <Title
                as="h6"
                className={cn(
                  "mb-2 truncate px-6 text-xs font-normal uppercase tracking-widest text-gray-500 2xl:px-8",
                  index !== 0 && "mt-6 3xl:mt-7"
                )}
              >
                {item.name}
              </Title>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
