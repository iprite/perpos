"use client";

/**
 * TmcDashboardTabs — pill tab บนแดชบอร์ด TMC (ภาพรวม / ต้นทุน & กำไร)
 * เก็บ state ไว้ใน URL (?tab=costs) เพื่อให้ refresh/แชร์ลิงก์แล้วอยู่แท็บเดิม
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, TrendingUp } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented";

export function TmcDashboardTabs({ current }: { current: "overview" | "costs" }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function go(tab: string) {
    const p = new URLSearchParams(sp.toString());
    if (tab === "overview") p.delete("tab");
    else p.set("tab", tab);
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <SegmentedControl
      value={current}
      onChange={go}
      size="sm"
      options={[
        { value: "overview", label: "ภาพรวม", icon: <LayoutDashboard className="h-4 w-4" /> },
        { value: "costs", label: "ต้นทุน & กำไร", icon: <TrendingUp className="h-4 w-4" /> },
      ]}
    />
  );
}
