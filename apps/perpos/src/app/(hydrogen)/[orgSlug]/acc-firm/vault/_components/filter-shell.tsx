"use client";

// เปลือกหน้าคลังเอกสาร — PageShell + ปุ่มไอคอนตัวกรอง (DESIGN.md §4 "Filter toggle")
// หน้าเป็น server component ล้วน จึงต้องมี client wrapper ตัวนี้ถือ state เปิด/ปิดแถบตัวกรอง
// (เนื้อหาที่ server เรนเดอร์ส่งเข้ามาทาง children — ไม่ถูกดึงมาเป็น client component)

import { useEffect, useState, type ReactNode } from "react";
import { Filter, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { VaultClientFilter } from "./client-filter";

export function VaultFilterShell({
  icon,
  title,
  description,
  q,
  scope,
  summary,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  q: string;
  scope: string;
  /** แถวการ์ดสรุป — ย่อ/กางได้ เพื่อคืนพื้นที่ให้ตาราง */
  summary: ReactNode;
  children: ReactNode;
}) {
  const hasFilter = !!q || !!scope;
  const [showFilters, setShowFilters] = useState(hasFilter);
  const [showSummary, setShowSummary] = useState(true);

  // ตารางด้านล่างเป็น <Table fillViewport> ที่ server เรนเดอร์มา — มันวัดความสูงใหม่ตอน
  // re-render ของตัวเองหรือตอน resize เท่านั้น. ย่อ/กางของเหนือมันจึงต้องปลุกให้วัดใหม่เอง
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [showSummary, showFilters]);

  return (
    <PageShell
      width="full"
      icon={icon}
      title={title}
      description={description}
      actions={
        <>
          <Button
            variant={showSummary ? "secondary" : "outline"}
            size="icon"
            title={showSummary ? "ซ่อนการ์ดสรุป" : "แสดงการ์ดสรุป"}
            aria-expanded={showSummary}
            onClick={() => setShowSummary((v) => !v)}
          >
            <LayoutDashboard className="h-4 w-4" />
          </Button>
          <Button
            variant={showFilters || hasFilter ? "secondary" : "outline"}
            size="icon"
            title="ตัวกรอง"
            className="relative"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-4 w-4" />
            {hasFilter && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />
            )}
          </Button>
        </>
      }
    >
      {showSummary && summary}
      {showFilters && <VaultClientFilter q={q} scope={scope} />}
      {children}
    </PageShell>
  );
}
