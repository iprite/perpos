"use client";

import DndSwitcher from "@/app/shared/dnd-switcher";
import { useDndEnabled } from "@/store/dnd-enable-store";
import cn from "@core/utils/class-names";
import { useEffect, useRef, useState } from "react";
import { PiArrowsOutCardinalBold } from "react-icons/pi";
import { Box } from "rizzui";
import { createSwapy, Swapy } from "swapy";
import CampaignManagement from "./campaign-management";
import CampaignsList from "./campaigns-list";
import FinancialManagement from "./financial-management";
import MyProfile from "./my-profile";
import PerformanceInsights from "./performance-insights";
import AffiliateStats from "./stats";
import VisitorsStatistics from "./visitors-statistics";

const initialItems = [
  {
    id: "111",
    className: "@4xl/af:col-span-full @4xl/af:order-1 @7xl/af:col-span-8",
    content: <VisitorsStatistics />,
  },
  {
    id: "222",
    className: "@4xl/af:order-2 @5xl/af:col-span-6 @7xl/af:col-span-4",
    content: <MyProfile />,
  },
  {
    id: "333",
    className:
      "@4xl/af:col-span-full @4xl/af:order-4 @7xl/af:order-3 @7xl/af:col-span-8",
    content: <CampaignsList />,
  },
  {
    id: "444",
    className:
      "@4xl/af:order-3  @5xl/af:col-span-6 @7xl/af:order-4 @7xl/af:col-span-4",
    content: <CampaignManagement />,
  },
  {
    id: "555",
    className: "@4xl/af:col-span-full @4xl/af:order-5  @5xl/af:col-span-6",
    content: <FinancialManagement />,
  },
  {
    id: "666",
    className: "@4xl/af:col-span-full @4xl/af:order-6  @5xl/af:col-span-6",
    content: <PerformanceInsights />,
  },
];

export default function AffiliateDashBoard() {
  const swapy = useRef<Swapy | null>(null);
  const container = useRef(null);

  const { enabled } = useDndEnabled();
  const [items, _setItems] = useState(initialItems);

  useEffect(() => {
    if (container.current) {
      swapy.current = createSwapy(container.current, {
        autoScrollOnDrag: true,
      });
    }

    return () => {
      swapy.current?.destroy();
    };
  }, []);

  return (
    <Box className="@container/af">
      <Box
        ref={container}
        className="grid grid-cols-1 @4xl/af:grid-cols-2 @5xl/af:grid-cols-12 gap-6 3xl:gap-8"
      >
        <AffiliateStats className="@4xl/af:col-span-full" />
        {items?.map((item, index) => (
          <Box
            data-swapy-slot={item.id}
            className={cn(
              "relative h-full group [&[data-swapy-highlighted]]:bg-gray-50 rounded-md",
              item.className
            )}
            key={index}
          >
            <Box data-swapy-item={item.id} className="h-full">
              {item.content}
              <button
                data-swapy-handle
                className={cn(
                  "absolute bg-muted rounded-tl-md z-[1] start-0 top-0 size-8 rounded-br-md border border-t-0 border-l-0 border-muted text-gray-700 flex justify-center items-center",
                  enabled
                    ? "translate-x-0 opacity-100 visible pointer-events-auto"
                    : "-translate-x-12 opacity-0 invisible pointer-events-none"
                )}
              >
                <PiArrowsOutCardinalBold className="size-4 pointer-events-none" />
              </button>
            </Box>
          </Box>
        ))}
      </Box>
      <DndSwitcher />
    </Box>
  );
}
