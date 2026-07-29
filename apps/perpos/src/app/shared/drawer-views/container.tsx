"use client";

import { Drawer } from "rizzui";
import { Fragment, useEffect } from "react";
import cn from "@core/utils/class-names";
import { usePathname } from "next/navigation";
import { useDrawer } from "@/app/shared/drawer-views/use-drawer";

export default function GlobalDrawer() {
  const { isOpen, view, placement, closeDrawer, containerClassName, customSize } = useDrawer();
  const pathname = usePathname();
  useEffect(() => {
    closeDrawer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={closeDrawer}
      placement={placement}
      customSize={customSize}
      overlayClassName="dark:bg-opacity-40 dark:backdrop-blur-md"
      containerClassName={cn(
        "dark:bg-gray-100",
        // คุมความกว้างด้วย max-w เฉพาะตอนไม่ได้ส่ง customSize (rizzui customSize คุมเอง)
        customSize ? "" : "min-w-min max-w-[320px]",
        containerClassName,
      )}
      className="z-[9999] h-screen"
    >
      {/* rizzui Drawer render children เป็น array `[resizer, children]` → item ต้องมี key
          (ไม่งั้น React เตือน "unique key prop" ทุกครั้งที่เปิด drawer) */}
      {view ? <Fragment key="drawer-view">{view}</Fragment> : null}
    </Drawer>
  );
}
