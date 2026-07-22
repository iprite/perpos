"use client";

// orders/page.tsx — ⭐ pattern page ของ mattii_ops
// ตาราง/บอร์ด ใช้ filter ชุดเดียวกัน (filters.ts) · KPI ดึงจาก _fixtures/metrics.ts แหล่งเดียว
// 🔒 owner-only: การ์ด "สำหรับเจ้าของ" + คอลัมน์ต้นทุน/กำไร/% ในตาราง (ซ่อนทั้งชุด ไม่ใช่ disable)

import { useEffect, useMemo, useState } from "react";
import {
  Coins,
  Kanban,
  LayoutList,
  Plus,
  Search,
  ShoppingBag,
  Timer,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { notify } from "@/lib/toast";
import { ORDER_STAGES } from "../_fixtures/labels";
import {
  overdueOrdersCount,
  salesCostProfitTotals,
  staleAwaitingCfCount,
} from "../_fixtures/metrics";
import type {
  ChatChannel,
  MattiiOrder,
  OrderPriority,
  OrderStage,
  OrderStatus,
} from "../_fixtures/types";
import {
  FilterBar,
  MattiiShell,
  NoAccess,
  SectionHeading,
  fmtMoney,
  fmtNum,
  fmtPercent,
  useMattiiData,
  useMattiiRole,
} from "../_components";
import {
  CHANNEL_OPTIONS,
  EMPTY_FILTERS,
  FLAG_LABEL,
  PRIORITY_OPTIONS,
  STAGE_OPTIONS,
  STATUS_OPTIONS,
  filterOrders,
  hasActiveFilter,
  sortByNewest,
  type OrderFilters,
} from "./filters";
import { OrdersTable } from "./orders-table";
import { OrdersBoard } from "./orders-board";
import { OrderDetailDialog } from "./order-detail-dialog";
import { CreateOrderDialog } from "./create-order-dialog";

export default function OrdersPage() {
  const { can, isOwner } = useMattiiRole();
  const { orders, customers, advanceOrder } = useMattiiData();

  const [view, setView] = useState<"table" | "board">("table");
  const [detailed, setDetailed] = useState<"stage" | "status">("stage");
  const [filters, setFilters] = useState<OrderFilters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // รับตัวกรองจากหน้าภาพรวม (`?filter=overdue|stale_cf`, `?view=board`, `?stage=<key>`)
  // อ่านจาก window.location แทน useSearchParams เพื่อเลี่ยง Suspense boundary ของ Next.js
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const flag = q.get("filter");
    const stage = q.get("stage");
    if (q.get("view") === "board") setView("board");
    // ตั้งค่าครั้งเดียวตอนเข้าหน้า — จากนั้นผู้ใช้คุมตัวกรองเองได้อิสระ
    setFilters((prev) => ({
      ...prev,
      flag: flag === "overdue" || flag === "stale_cf" ? flag : prev.flag,
      stage:
        stage && ORDER_STAGES.some((s) => s.key === stage) ? (stage as OrderStage) : prev.stage,
    }));
  }, []);

  const visible = useMemo(
    () => sortByNewest(filterOrders(orders, filters, customers)),
    [orders, filters, customers],
  );

  // KPI — คิดจาก metrics.ts (แหล่งเดียว) บนข้อมูลสดใน client state
  const kpi = useMemo(() => {
    const totals = salesCostProfitTotals(orders);
    return {
      total: orders.length,
      overdue: overdueOrdersCount(orders),
      staleCf: staleAwaitingCfCount(2, orders),
      ...totals,
    };
  }, [orders]);

  const selected = selectedId ? (orders.find((o) => o.id === selectedId) ?? null) : null;

  function setF<K extends keyof OrderFilters>(key: K, value: OrderFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleAdvance(order: MattiiOrder) {
    const msg = advanceOrder(order.id);
    if (msg) notify.success(msg);
    else notify.error("สถานะนี้ไม่มีขั้นถัดไป");
  }

  if (!can("view", "orders")) {
    return (
      <NoAccess title="ออเดอร์" icon={<ShoppingBag className="h-6 w-6" />}>
        บทบาทนี้ไม่มีสิทธิ์ดูรายการออเดอร์ — ลองสลับเป็นเจ้าของ/ผู้จัดการ หรือฝ่ายขาย
      </NoAccess>
    );
  }

  const canCreate = can("write", "orders");

  return (
    <MattiiShell
      title="ออเดอร์"
      description="ติดตามออเดอร์พรมพิมพ์ลายทุกใบ ตั้งแต่รับงานจนส่งถึงมือลูกค้า"
      icon={<ShoppingBag className="h-6 w-6" />}
      actions={
        canCreate ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> สร้างออเดอร์
          </Button>
        ) : undefined
      }
    >
      {/* KPI (ทุกบทบาทเห็น) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<ShoppingBag className="h-4 w-4" />}
          label="ออเดอร์ทั้งหมด"
          value={fmtNum(kpi.total)}
          sub={`แสดงตามตัวกรอง ${fmtNum(visible.length)} ใบ`}
          tone="neutral"
        />
        <StatCard
          icon={<Timer className="h-4 w-4" />}
          label="ค้างรอลูกค้ายืนยันลาย ≥ 2 วัน"
          value={fmtNum(kpi.staleCf)}
          sub="ตามให้ไว ลดเวลารอทั้งสาย"
          tone="warning"
          valueColored
        />
        <StatCard
          icon={<Timer className="h-4 w-4" />}
          label="เลยกำหนดส่ง"
          value={fmtNum(kpi.overdue)}
          sub="ยังไม่ส่งและเลยวันที่สัญญาไว้"
          tone="negative"
          valueColored
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="ยอดขายรวม"
          value={fmtMoney(kpi.totalSales)}
          sub="ทุกออเดอร์ในระบบ"
          tone="info"
        />
      </div>

      {/* 🔒 section สำหรับเจ้าของ — role อื่นตัดทั้ง section (§2.3 ข้อ 1) */}
      {isOwner && (
        <div>
          <SectionHeading>สำหรับเจ้าของ</SectionHeading>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              icon={<Coins className="h-4 w-4" />}
              label="ต้นทุนรวม"
              value={fmtMoney(kpi.totalCost)}
              tone="neutral"
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="กำไรขั้นต้น"
              value={fmtMoney(kpi.grossProfit)}
              tone={kpi.grossProfit >= 0 ? "positive" : "negative"}
              valueColored
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="อัตรากำไรเฉลี่ย"
              value={fmtPercent(kpi.marginPercent)}
              sub="เทียบยอดขายรวมทั้งหมด"
              tone={kpi.marginPercent >= 0 ? "positive" : "negative"}
              valueColored
            />
          </div>
        </div>
      )}

      {/* แถบมุมมอง + ตัวกรอง — ใช้ <FilterBar> ตัวเดียวกับทุกหน้าในโมดูล (ux-reviewer b6) */}
      <FilterBar
        className="mb-0"
        toolbar={
          <>
            <SegmentedControl
              value={view}
              onChange={setView}
              ariaLabel="สลับมุมมอง"
              options={[
                { value: "table", label: "ตาราง", icon: <LayoutList className="h-4 w-4" /> },
                { value: "board", label: "บอร์ด", icon: <Kanban className="h-4 w-4" /> },
              ]}
            />
            <SegmentedControl
              value={detailed}
              onChange={(v) => {
                setDetailed(v);
                setFilters((prev) => ({ ...prev, stage: "", status: "" }));
              }}
              size="sm"
              ariaLabel="ระดับความละเอียดของสถานะ"
              options={[
                { value: "stage", label: "ช่วงงาน (5)" },
                { value: "status", label: "ละเอียด (14)" },
              ]}
            />
          </>
        }
        onClear={hasActiveFilter(filters) ? () => setFilters(EMPTY_FILTERS) : undefined}
        resultText={
          hasActiveFilter(filters)
            ? `พบ ${fmtNum(visible.length)} ออเดอร์จากทั้งหมด ${fmtNum(orders.length)} ใบ`
            : undefined
        }
      >
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={filters.search}
              onChange={(e) => setF("search", e.target.value)}
              placeholder="ค้นหาเลขที่ออเดอร์ / ชื่อลูกค้า"
              className="pl-9"
            />
          </div>
          {detailed === "stage" ? (
            <CustomSelect
              value={filters.stage}
              onChange={(v) => setF("stage", v as OrderStage | "")}
              options={STAGE_OPTIONS}
            />
          ) : (
            <CustomSelect
              value={filters.status}
              onChange={(v) => setF("status", v as OrderStatus | "")}
              options={STATUS_OPTIONS}
            />
          )}
          <CustomSelect
            value={filters.channel}
            onChange={(v) => setF("channel", v as ChatChannel | "")}
            options={CHANNEL_OPTIONS}
          />
          <CustomSelect
            value={filters.priority}
            onChange={(v) => setF("priority", v as OrderPriority | "")}
            options={PRIORITY_OPTIONS}
          />
          <div className="flex items-center gap-2">
            <ThaiDatePicker
              value={filters.from}
              onChange={(iso) => setF("from", iso)}
              placeholder="ตั้งแต่วันที่"
            />
            <ThaiDatePicker
              value={filters.to}
              onChange={(iso) => setF("to", iso)}
              placeholder="ถึงวันที่"
            />
          </div>
        </div>
        {filters.flag && <StatusBadge tone="warning">{FLAG_LABEL[filters.flag]}</StatusBadge>}
      </FilterBar>

      {view === "table" ? (
        <OrdersTable
          orders={visible}
          onSelect={(o) => setSelectedId(o.id)}
          onClearFilters={() => setFilters(EMPTY_FILTERS)}
          onCreate={() => setCreateOpen(true)}
          filtered={hasActiveFilter(filters)}
          canCreate={canCreate}
        />
      ) : (
        <OrdersBoard
          orders={visible}
          detailed={detailed === "status"}
          onSelect={(o) => setSelectedId(o.id)}
          onAdvance={handleAdvance}
          onClearFilters={() => setFilters(EMPTY_FILTERS)}
          onCreate={() => setCreateOpen(true)}
          filtered={hasActiveFilter(filters)}
          canCreate={canCreate}
        />
      )}

      <OrderDetailDialog order={selected} onOpenChange={(v) => !v && setSelectedId(null)} />

      {createOpen && (
        <CreateOrderDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(o) => setSelectedId(o.id)}
        />
      )}
    </MattiiShell>
  );
}
