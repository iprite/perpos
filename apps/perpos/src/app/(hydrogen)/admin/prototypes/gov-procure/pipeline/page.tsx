"use client";

// pipeline/page.tsx — บอร์ดไปป์ไลน์ (kanban) — spec §5 #2
// 6 lane ตาม STAGE_ORDER (quotation→closed) · หัว lane = StageBadge + จำนวน + มูลค่า ฿ รวม (tabular, สด)
// การ์ด order: หน่วยงาน+กอง · CompanyBadge · ยอดเสนอ (tabular) · OverdueBadge/AgingBadge ถ้า delivered
//   คลิกการ์ด → DetailDialog · ปุ่ม "เลื่อน →" (baseline ทุก viewport, keyboard, canWrite) → StageMoveDialog
// drag = ไม่ทำ (spec P2-b: ปุ่ม = baseline ครบเท่า drag) — ใช้ปุ่มเลื่อนอย่างเดียว a11y ชัด ไม่ import lib ใหม่
// desktop = 6 lane เรียงแนวนอน scroll-x · มือถือ = stack ทีละ lane (ไม่ scroll แนวนอนยาว)
// lane ว่าง = placeholder จาง (lane ไม่หาย, §5d) · loading = skeleton lane · ห้ามปุ่ม refresh
// เลื่อน stage → updateStage/closeOrder + toast (ใน StageMoveDialog) → การ์ดย้าย lane + sum อัปเดตสด

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  KanbanSquare,
  Plus,
  ArrowRight,
  Inbox,
  Building2,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
import {
  GovProcureShell,
  useData,
  useRole,
  fmtMoney,
  fmtNum,
} from "../_components";
import { StageBadge, OverdueBadge, AgingBadge, CompanyBadge } from "../_components/badges";
import { DetailDialog } from "../_components/detail-dialog";
import { StageMoveDialog } from "../_components/stage-move-dialog";
import { OrderDialog } from "../_components/order-dialog";
import { TODAY_DATE } from "../_components/format";
import {
  STAGE_ORDER,
  STAGE_LABELS,
  STAGE_TONE,
  deriveAgingDays,
  isOverdue,
  type GovProcureOrder,
  type Stage,
} from "../_fixtures/types";

// แถบสีบางบนหัว lane (utility class จากพาเลตต์ — ไม่ hardcode hex) map จาก STAGE_TONE
const LANE_ACCENT: Record<string, string> = {
  neutral: "bg-gray-300",
  info: "bg-blue-400",
  warning: "bg-amber-400",
  success: "bg-green-500",
};

export default function PipelinePage() {
  const { orders, settings } = useData();
  const { canWrite } = useRole();

  // hooks บนสุดก่อน early-return (rules-of-hooks)
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<GovProcureOrder | null>(null);
  const [moveStage, setMoveStage] = useState<GovProcureOrder | null>(null);
  const [editing, setEditing] = useState<GovProcureOrder | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // จำลอง skeleton ตอนโหลดครั้งแรก (§5d)
  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 350);
    return () => window.clearTimeout(t);
  }, []);

  // จัดกลุ่มงานตาม stage (สด) + มูลค่ารวมต่อ lane
  const lanes = useMemo(() => {
    return STAGE_ORDER.map((stage) => {
      const items = orders
        .filter((o) => o.stage === stage)
        .sort((a, b) => (b.seq_no ?? 0) - (a.seq_no ?? 0));
      return {
        stage,
        items,
        value: items.reduce((s, o) => s + (o.price_incl_vat ?? 0), 0),
      };
    });
  }, [orders]);

  const hasOrders = orders.length > 0;

  return (
    <GovProcureShell
      title="บอร์ดไปป์ไลน์"
      description="ลากสายตาไล่งานทุกขั้น ตั้งแต่เสนอราคาจนถึงปิดงาน — เลื่อนงานข้ามขั้นได้จากการ์ดโดยตรง"
      icon={<KanbanSquare className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> สร้างงาน
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <BoardSkeleton />
      ) : !hasOrders ? (
        <EmptyBoard canWrite={canWrite} onCreate={() => setCreateOpen(true)} />
      ) : (
        // desktop: 6 lane แนวนอน scroll-x · มือถือ: stack ทีละ lane (grid 1 คอลัมน์)
        <div className="grid grid-cols-1 gap-3 lg:flex lg:gap-3 lg:overflow-x-auto lg:pb-2 [scrollbar-width:thin]">
          {lanes.map((lane) => (
            <Lane
              key={lane.stage}
              stage={lane.stage}
              items={lane.items}
              value={lane.value}
              sla={settings.sla_threshold}
              canWrite={canWrite}
              onOpen={setDetail}
              onMove={setMoveStage}
            />
          ))}
        </div>
      )}

      {/* dialogs (reuse — props ตรง signature ของจริง) */}
      <DetailDialog
        order={detail}
        open={detail !== null}
        onOpenChange={(v) => !v && setDetail(null)}
        onEdit={(o) => {
          setDetail(null);
          setEditing(o);
        }}
        onMoveStage={(o) => {
          setDetail(null);
          setMoveStage(o);
        }}
      />
      <StageMoveDialog
        order={moveStage}
        open={moveStage !== null}
        onOpenChange={(v) => !v && setMoveStage(null)}
      />
      <OrderDialog order={null} open={createOpen} onOpenChange={setCreateOpen} />
      <OrderDialog
        order={editing}
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
      />
    </GovProcureShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Lane — 1 ขั้นของ pipeline (หัว lane + การ์ด / placeholder)
// ════════════════════════════════════════════════════════════════════
function Lane({
  stage,
  items,
  value,
  sla,
  canWrite,
  onOpen,
  onMove,
}: {
  stage: Stage;
  items: GovProcureOrder[];
  value: number;
  sla: number;
  canWrite: boolean;
  onOpen: (o: GovProcureOrder) => void;
  onMove: (o: GovProcureOrder) => void;
}) {
  const accent = LANE_ACCENT[STAGE_TONE[stage]] ?? "bg-gray-300";
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-gray-200 bg-gray-50/60 lg:w-[300px] lg:shrink-0">
      {/* หัว lane: แถบสี + StageBadge + จำนวน + มูลค่ารวม (สด, tabular) */}
      <div className="rounded-t-xl border-b border-gray-200 bg-white px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", accent)} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
            {STAGE_LABELS[stage]}
          </span>
          <StatusBadge tone="neutral">{fmtNum(items.length)}</StatusBadge>
        </div>
        <div className="mt-1 pl-4 tabular-nums text-xs font-medium text-gray-500">
          {fmtMoney(value)}
        </div>
      </div>

      {/* การ์ดในขั้นนี้ (หรือ placeholder ถ้าว่าง — lane ไม่หาย, §5d) */}
      <div className="flex flex-col gap-2 p-2.5">
        {items.length === 0 ? (
          <LanePlaceholder />
        ) : (
          items.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              sla={sla}
              canWrite={canWrite}
              onOpen={onOpen}
              onMove={onMove}
            />
          ))
        )}
      </div>
    </section>
  );
}

/** lane ว่าง — placeholder จาง (lane ยังอยู่ · spec §5d) */
function LanePlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-200 py-8 text-center">
      <Inbox className="h-5 w-5 text-gray-300" />
      <Text className="text-xs text-gray-400">ไม่มีงานในขั้นนี้</Text>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// OrderCard — การ์ดงาน (คลิก → detail · ปุ่ม "เลื่อน →" → stage-move)
// ════════════════════════════════════════════════════════════════════
function OrderCard({
  order,
  sla,
  canWrite,
  onOpen,
  onMove,
}: {
  order: GovProcureOrder;
  sla: number;
  canWrite: boolean;
  onOpen: (o: GovProcureOrder) => void;
  onMove: (o: GovProcureOrder) => void;
}) {
  const aging = deriveAgingDays(order, TODAY_DATE);
  const overdue = isOverdue(order, sla, TODAY_DATE);
  const isLast = order.stage === "closed";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(order)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(order);
        }
      }}
      className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm transition-colors duration-150 hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {/* หน่วยงาน + กอง */}
      <div className="flex items-start gap-1.5">
        <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900">
            {order.customer_name}
          </div>
          <div className="truncate text-xs text-gray-500">
            {order.department ?? "ไม่ระบุกอง"}
          </div>
        </div>
      </div>

      {/* รายการสินค้า (ย่อ) */}
      {order.product_description && (
        <div className="mt-1.5 line-clamp-2 text-xs text-gray-600">
          {order.product_description}
        </div>
      )}

      {/* บริษัท + overdue/aging */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <CompanyBadge company={order.company} />
        {order.stage === "delivered" && aging != null && (
          overdue ? <OverdueBadge days={aging} /> : <AgingBadge days={aging} />
        )}
      </div>

      {/* ยอดเสนอ + ปุ่มเลื่อน */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
        <span className="tabular-nums text-sm font-semibold text-gray-900">
          {fmtMoney(order.price_incl_vat)}
        </span>
        {canWrite && !isLast && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-primary hover:bg-gray-100"
            aria-label={`เลื่อนสถานะงาน ${order.qt_reference ?? order.customer_name}`}
            onClick={(e) => {
              e.stopPropagation();
              onMove(order);
            }}
          >
            เลื่อน <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// loading skeleton (lane skeleton — ห้าม spinner กลางจอ, §9)
// ════════════════════════════════════════════════════════════════════
function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:flex lg:gap-3 lg:overflow-x-hidden">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="flex flex-col rounded-xl border border-gray-200 bg-gray-50/60 lg:w-[300px] lg:shrink-0"
        >
          <div className="rounded-t-xl border-b border-gray-200 bg-white px-3 py-2.5">
            <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="flex flex-col gap-2 p-2.5">
            {[...Array(2)].map((_, j) => (
              <div key={j} className="h-24 animate-pulse rounded-lg bg-white" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// empty: พอร์ตว่าง (§5d) — CTA สร้างงานแรก
// ════════════════════════════════════════════════════════════════════
function EmptyBoard({
  canWrite,
  onCreate,
}: {
  canWrite: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-4">
        <KanbanSquare className="h-8 w-8 text-gray-400" />
      </div>
      <Text className="text-sm font-medium text-gray-900">ยังไม่มีงานในบอร์ด</Text>
      <Text className="mt-1 max-w-sm text-sm text-gray-500">
        เมื่อสร้างงานแล้ว จะเห็นการ์ดงานวางในขั้น “เสนอราคา” และเลื่อนไปทีละขั้นจนถึงปิดงานได้ที่นี่
      </Text>
      {canWrite ? (
        <Button className="mt-4" size="sm" onClick={onCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> สร้างงานแรก
        </Button>
      ) : (
        <Button className="mt-4" size="sm" variant="outline" asChild>
          <Link href="/admin/prototypes/gov-procure">กลับหน้าแดชบอร์ด</Link>
        </Button>
      )}
    </div>
  );
}
