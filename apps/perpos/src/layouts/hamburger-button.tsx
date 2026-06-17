"use client";

import { DrawerPlacements, useDrawer } from "@/app/shared/drawer-views/use-drawer";
import { ActionIcon } from "rizzui";
import { PanelLeftClose } from "lucide-react";
import cn from "@core/utils/class-names";
import { ReactNode } from "react";

interface Props {
  view: ReactNode;
  placement?: DrawerPlacements;
  className?: string;
}

export default function HamburgerButton({ view, placement = "left", className }: Props) {
  const { openDrawer } = useDrawer();
  return (
    <ActionIcon
      aria-label="Open Sidebar Menu"
      variant="text"
      className={cn("me-3 h-auto w-auto p-0 sm:me-4 xl:hidden", className)}
      onClick={() =>
        openDrawer({
          view,
          placement,
        })
      }
    >
      <PanelLeftClose className="h-6 w-6" strokeWidth={1.5} />
    </ActionIcon>
  );
}
