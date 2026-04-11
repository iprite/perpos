"use client";

import {
  berylliumMenuItemAtom,
  berylliumMenuItems,
  MenuItemsType,
} from "@/layouts/beryllium/beryllium-fixed-menu-items";
import {
  getActiveMainMenuIndex,
  removeFirstLetters,
  useBerylliumSidebars,
} from "@/layouts/beryllium/beryllium-utils";
import cn from "@core/utils/class-names";
import { useAtom, useSetAtom } from "jotai";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { PiTextIndent } from "react-icons/pi";
import { ActionIcon } from "rizzui";

function MenuItem({ menu }: { menu: MenuItemsType }) {
  const { expandedLeft, setExpandedLeft } = useBerylliumSidebars();
  const [menuItems, setMenuItems] = useAtom(berylliumMenuItemAtom);
  const t = useTranslations("layout");
  const Icon = menu.icon;

  const isActive = menuItems === menu;

  function handleClick() {
    setMenuItems(menu);
    if (!expandedLeft) {
      setExpandedLeft(true);
    }
  }

  return (
    <li
      onClick={handleClick}
      className="group flex cursor-pointer flex-col items-center gap-1.5 pb-1.5 "
    >
      <span
        className={cn(
          "rounded-3xl bg-gray-0/0 px-4 py-2 text-white transition-colors duration-200 group-hover:bg-gray-0 group-hover:text-gray-900 dark:group-hover:bg-gray-100",
          isActive && "bg-gray-0 text-gray-900 dark:bg-gray-100 "
        )}
      >
        <Icon className="h-auto w-6" />
      </span>
      <span className="text-white">{t(menu.name)}</span>
    </li>
  );
}

function MenuItems() {
  return (
    <menu className="flex w-full justify-center">
      <div className="custom-scrollbar overflow-y-auto scroll-smooth h-[calc(100vh_-_105px)] w-full pb-5">
        <ul className="flex flex-col gap-6">
          {berylliumMenuItems.map((menu) => (
            <MenuItem key={menu.id} menu={menu} />
          ))}
        </ul>
      </div>
    </menu>
  );
}

export default function BerylliumLeftSidebarFixed({ lang }: { lang?: string }) {
  const pathname = usePathname();
  const setMenuItems = useSetAtom(berylliumMenuItemAtom);
  const { expandedLeft, setExpandedLeft } = useBerylliumSidebars();

  useEffect(() => {
    const activeMenuIndex = getActiveMainMenuIndex(
      removeFirstLetters(3, pathname),
      berylliumMenuItems
    );
    setMenuItems(berylliumMenuItems[activeMenuIndex]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <aside className="fixed start-0 top-0 z-50 hidden h-screen w-[88px] flex-col items-center gap-10 bg-gray-900 py-3.5 xl:flex dark:bg-gray-0">
      <ActionIcon
        aria-label="open sidebar"
        variant="text"
        className="rounded-full bg-transparent text-white transition-colors hover:bg-gray-300  hover:enabled:text-gray-900"
        size="xl"
        onClick={() => setExpandedLeft(!expandedLeft)}
      >
        <PiTextIndent className="h-auto w-9" />
      </ActionIcon>
      <MenuItems />
    </aside>
  );
}
