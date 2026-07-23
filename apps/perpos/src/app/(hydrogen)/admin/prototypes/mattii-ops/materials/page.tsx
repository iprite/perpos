"use client";

// materials/page.tsx — วัสดุ & สต๊อก (2 แท็บ: วัสดุ · ความเคลื่อนไหวสต๊อก)
// 🔒 owner-only §2.3: `unit_cost` / `stock_value` / มูลค่าใน ledger ซ่อนทั้งคอลัมน์ (ไม่ใช่ disable)
// §5 ข้อ 3: ไม่มีปุ่มในแถว → คลิกแถววัสดุเปิด dialog แล้วรับเข้า/ปรับยอดใน DialogFooter
// mock: รับเข้า/ปรับยอด เขียนผ่าน data-context (state กลาง) → หน้าอื่น (ภาพรวม/รายงาน) เห็นยอดเดียวกันทันที

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeftRight, Boxes, Coins, PackageSearch } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { MATERIAL_UNIT_LABEL } from "../_fixtures/labels";
import { lowStockMaterials } from "../_fixtures/metrics";
import type { MattiiMaterial, StockMoveType } from "../_fixtures/types";
import {
  MattiiShell,
  NoAccess,
  fmtMoney,
  fmtNum,
  useMattiiData,
  useMattiiRole,
} from "../_components";
import { MaterialsTab, type MaterialScope } from "./materials-table";
import { MovementsTab } from "./movements-table";
import { MaterialDialog } from "./material-dialog";

/** §1.2 NAV_BY_ROLE — หน้านี้อยู่ในเมนูของเจ้าของ/ผู้จัดการ และทีมผลิต */
const ALLOWED_ROLES = ["owner", "production"];

export default function MaterialsPage() {
  const { role, isOwner } = useMattiiRole();
  const { materials, stockMovements: movements, addStockMovement } = useMattiiData();

  const [tab, setTab] = useState<"materials" | "movements">("materials");
  const [openId, setOpenId] = useState<string | null>(null);
  const [movementMaterial, setMovementMaterial] = useState("");
  const [scope, setScope] = useState<MaterialScope>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 350);
    return () => window.clearTimeout(t);
  }, []);

  // การ์ด "วัสดุใกล้หมด" บนหน้าภาพรวมลิงก์มาที่ `?low=1` → เปิดตัวกรอง "เฉพาะใกล้หมด" ให้เลย
  // อ่านจาก window.location แทน useSearchParams เพื่อเลี่ยง Suspense boundary ของ Next.js
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("low") === "1") {
      setTab("materials");
      setScope("low");
    }
  }, []);

  const summary = useMemo(() => {
    const low = lowStockMaterials(materials);
    return {
      total: materials.length,
      lowCount: low.length,
      lowNames: low.map((m) => m.name).join(" · "),
      stockValue: materials.reduce((s, m) => s + m.stock_value, 0),
    };
  }, [materials]);

  const opened = openId ? (materials.find((m) => m.id === openId) ?? null) : null;

  /** รับเข้า / ปรับยอด → เขียน movement เข้า state กลาง (อัปเดตคงเหลือ + มูลค่าสต๊อกให้เอง) */
  function applyMovement(
    material: MattiiMaterial,
    moveType: StockMoveType,
    qtyDelta: number,
    reason: string,
  ) {
    addStockMovement({
      material_id: material.id,
      move_type: moveType,
      qty_delta: qtyDelta,
      reason: reason || null,
    });
  }

  if (!ALLOWED_ROLES.includes(role)) {
    return (
      <NoAccess title="วัสดุ & สต๊อก" icon={<Boxes className="h-6 w-6" />}>
        คลังวัสดุเปิดให้เจ้าของ/ผู้จัดการ และทีมผลิต — สลับบทบาทที่แถบด้านบนเพื่อดูตัวอย่าง
      </NoAccess>
    );
  }

  const tabs: { key: "materials" | "movements"; label: string; icon: ReactNode }[] = [
    { key: "materials", label: "วัสดุ", icon: <Boxes className="h-4 w-4" /> },
    {
      key: "movements",
      label: "ความเคลื่อนไหวสต๊อก",
      icon: <ArrowLeftRight className="h-4 w-4" />,
    },
  ];

  return (
    <MattiiShell
      title="วัสดุ & สต๊อก"
      description="คงเหลือวัสดุจริงและความเคลื่อนไหวทุกครั้งที่พิมพ์/แพ็ค — เตือนก่อนของหมดกลางงาน"
      icon={<Boxes className="h-6 w-6" />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<PackageSearch className="h-4 w-4" />}
          label="วัสดุทั้งหมด"
          value={fmtNum(summary.total)}
          sub="รายการที่ติดตามสต๊อกอยู่"
          tone="neutral"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="ต่ำกว่าจุดสั่งซื้อ"
          value={fmtNum(summary.lowCount)}
          sub={summary.lowCount > 0 ? summary.lowNames : "ทุกรายการยังอยู่เหนือจุดสั่งซื้อ"}
          tone={summary.lowCount > 0 ? "negative" : "positive"}
          valueColored
        />
        {isOwner && (
          <StatCard
            icon={<Coins className="h-4 w-4" />}
            label="มูลค่าสต๊อกคงเหลือ"
            value={fmtMoney(summary.stockValue)}
            sub="คงเหลือ × ต้นทุนต่อหน่วยปัจจุบัน"
            tone="info"
          />
        )}
      </div>

      {/* แถบแท็บ — row เดียว ล้นแล้วเลื่อน (DESIGN §4) */}
      <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={tab === t.key ? "secondary" : "ghost"}
            className={cn(
              "shrink-0 whitespace-nowrap",
              tab === t.key && "bg-gray-100 text-gray-900",
            )}
            onClick={() => setTab(t.key)}
          >
            <span className="mr-1.5">{t.icon}</span>
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "materials" ? (
        <MaterialsTab
          materials={materials}
          loading={loading}
          onSelect={(m) => setOpenId(m.id)}
          scope={scope}
          onScopeChange={setScope}
        />
      ) : (
        <MovementsTab
          movements={movements}
          materials={materials}
          loading={loading}
          materialId={movementMaterial}
          onMaterialChange={setMovementMaterial}
        />
      )}

      <MaterialDialog
        material={opened}
        movements={opened ? movements.filter((mv) => mv.material_id === opened.id) : []}
        unitLabel={opened ? MATERIAL_UNIT_LABEL[opened.unit] : ""}
        onOpenChange={(v) => !v && setOpenId(null)}
        onApply={applyMovement}
        onViewMovements={(m) => {
          setMovementMaterial(m.id);
          setTab("movements");
          setOpenId(null);
        }}
      />
    </MattiiShell>
  );
}
