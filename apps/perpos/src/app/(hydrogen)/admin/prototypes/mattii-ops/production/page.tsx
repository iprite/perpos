"use client";

// production/page.tsx — งานผลิต (Contract v3 หน้า 5) — รวม คิวพิมพ์ + QC + แพ็ค ไว้หน้าเดียว
// ออกแบบสำหรับ **แท็บเล็ตแนวตั้งหน้าเครื่องพิมพ์**: การ์ดใหญ่ (ไม่ใช่ตาราง) · ปุ่มหลักปุ่มเดียวต่อการ์ด
// happy path = 1 กด ("QC ผ่าน" ไม่เปิดฟอร์ม) · เปิด dialog เฉพาะ "QC ไม่ผ่าน"
// ทุกการเปลี่ยนสถานะผ่าน guard ใน _components/order-flow.ts เท่านั้น

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardCheck, Package, Printer } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { EMPTY_STATES } from "../_fixtures/empty-states";
import { ORDER_STATUS_LABEL } from "../_fixtures/labels";
import type { OrderStatus, QcDefectType } from "../_fixtures/types";
import {
  FilterBar,
  MATTII_BASE,
  MattiiShell,
  NoAccess,
  canAdvance,
  canFailQc,
  daysUntil,
  fmtNum,
  useMattiiData,
  useMattiiRole,
} from "../_components";
import { ProductionJobCard } from "./production-card";
import { JobDetailDialog, QcFailDialog, QueueDialog } from "./production-dialogs";
import { AutoQueuePanel, MachineStrip } from "./production-parts";
import { useProductionState, type ProductionCard } from "./use-production-state";

const MACHINE_STORAGE_KEY = "mattii-prototype-production-machine";

const LANES: { key: string; label: string; status: OrderStatus }[] = [
  { key: "to_print", label: "รอพิมพ์", status: "cf_approved" },
  { key: "printing", label: "กำลังพิมพ์", status: "printing" },
  { key: "qc", label: "รอ QC", status: "qc" },
  { key: "packing", label: "แพ็ค", status: "packing" },
];

/** "งานวันนี้" = เลยกำหนด · งานด่วน · หรือถึงกำหนดภายใน 3 วัน */
function isTodayScope(card: ProductionCard): boolean {
  if (card.order.priority === "rush") return true;
  const left = daysUntil(card.order.due_date);
  return left === null || left <= 3;
}

export default function ProductionPage() {
  const { can, role } = useMattiiRole();
  const { advanceOrder, moveOrder, addActivity, addQcRecord, addPrintJob } = useMattiiData();
  const {
    cards,
    machines,
    sortCards,
    setMachine,
    applyQueueOrder,
    moveToFront,
    moveToBack,
    defectLog,
    logDefect,
  } = useProductionState();

  const [loading, setLoading] = useState(true);
  const [lane, setLane] = useState(LANES[0].key);
  const [scope, setScope] = useState<"today" | "all">("today");
  const [machineFilter, setMachineFilter] = useState("");
  const [qcFailId, setQcFailId] = useState<string | null>(null);
  const [queueId, setQueueId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 450);
    return () => window.clearTimeout(t);
  }, []);

  // จำเครื่องที่เลือกไว้ข้ามการเข้าใช้งาน (ทีมผลิตยืนประจำเครื่องเดิมทุกวัน)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MACHINE_STORAGE_KEY);
      if (saved) setMachineFilter(saved);
    } catch {
      // localStorage ใช้ไม่ได้ (โหมดส่วนตัว) — ใช้ค่าเริ่มต้นต่อไปได้
    }
  }, []);

  function changeMachineFilter(value: string) {
    setMachineFilter(value);
    try {
      window.localStorage.setItem(MACHINE_STORAGE_KEY, value);
    } catch {
      // เก็บไม่ได้ก็ไม่เป็นไร — ตัวกรองยังทำงานในรอบนี้
    }
  }

  const scoped = useMemo(
    () =>
      cards.filter((c) => {
        if (scope === "today" && !isTodayScope(c)) return false;
        if (machineFilter && (c.machine?.id ?? "") !== machineFilter) return false;
        return true;
      }),
    [cards, scope, machineFilter],
  );

  const laneCards = useMemo(() => {
    const map: Record<string, ProductionCard[]> = {};
    for (const l of LANES) {
      map[l.key] = sortCards(scoped.filter((c) => c.order.status === l.status));
    }
    return map;
  }, [scoped, sortCards]);

  const kpi = useMemo(() => {
    const overdue = cards.filter((c) => {
      const left = daysUntil(c.order.due_date);
      return left !== null && left < 0;
    }).length;
    return {
      inLine: cards.length,
      waitingQc: cards.filter((c) => c.order.status === "qc").length,
      overdue,
      defectPieces: defectLog.reduce((s, d) => s + d.defectQty, 0),
    };
  }, [cards, defectLog]);

  const queueInput = useMemo(
    () =>
      [...(laneCards.to_print ?? []), ...(laneCards.printing ?? [])].map((c) => ({
        orderId: c.order.id,
        orderNo: c.order.order_no,
        priority: c.order.priority,
        dueDate: c.order.due_date,
        pieces: c.pieces,
        fabricType: c.fabricType,
      })),
    [laneCards],
  );

  const machineOptions = useMemo(
    () => [
      { value: "", label: "ทุกเครื่อง" },
      ...machines.map((m) => ({ value: m.id, label: `${m.code} · ${m.name}` })),
    ],
    [machines],
  );

  const activeCard = (id: string | null) => cards.find((c) => c.order.id === id) ?? null;
  const qcFailCard = activeCard(qcFailId);
  const queueCard = activeCard(queueId);
  const detailCard = activeCard(detailId);

  if (!can("view", "production")) {
    return (
      <NoAccess title="งานผลิต" icon={<Printer className="h-6 w-6" />}>
        บทบาทนี้ไม่มีสิทธิ์ดูคิวงานผลิต — ลองสลับเป็นทีมผลิต หรือเจ้าของ/ผู้จัดการ
      </NoAccess>
    );
  }

  const canPress = can("approve", "production");
  const hasFilter = scope !== "today" || machineFilter !== "";

  function clearFilters() {
    setScope("today");
    changeMachineFilter("");
  }

  function handlePrimary(card: ProductionCard) {
    const from = card.order.status;
    if (!canAdvance(from, role)) {
      notify.error("บทบาทของคุณไม่มีสิทธิ์กดขั้นตอนนี้");
      return;
    }
    const msg = advanceOrder(card.order.id);
    if (!msg) {
      notify.error("สถานะนี้ไม่มีขั้นถัดไป");
      return;
    }
    if (from === "printing") {
      // การตัดสต๊อกจริงเกิดใน data-context (Contract §3.17 จุด A) — ที่นี่แค่บอกผลให้ผู้ใช้เห็น
      notify.success(
        `${card.order.order_no}: พิมพ์เสร็จ → ตรวจคุณภาพ · ตัดวัสดุผลิตออกจากสต๊อกแล้ว (ผ้าพรม ${fmtNum(card.fabricSqm, 2)} ตร.ม. + หมึก/ฟิล์ม/ยางรองหลัง)`,
      );
    } else if (from === "packing") {
      // งานหลุดจากจอทีมผลิตหลังแพ็คเสร็จ → บอกให้ชัดว่าไปต่อที่ไหน (ตัดวัสดุแพ็ค = §3.17 จุด B)
      notify.success(
        `${card.order.order_no}: แพ็คเสร็จ · ตัดวัสดุแพ็คออกจากสต๊อกแล้ว (กล่อง ${fmtNum(card.packageCount)} ใบ) → ไปออกเลขพัสดุที่หน้าจัดส่ง`,
      );
    } else {
      notify.success(msg);
    }
  }

  function handleQcFail(
    card: ProductionCard,
    input: { defectType: QcDefectType; defectQty: number; defectNote: string; defectCost: number },
  ) {
    if (!canFailQc(card.order.status, role)) {
      notify.error("บทบาทของคุณไม่มีสิทธิ์บันทึกผล QC");
      return;
    }
    moveOrder(
      card.order.id,
      "printing",
      `QC ไม่ผ่าน (${input.defectQty} ผืน) → ${ORDER_STATUS_LABEL.printing} (พิมพ์ซ้ำ)`,
    );
    // เขียนเข้า state กลาง → รายงาน "งานผลิต & ของเสีย" และอัตราพิมพ์ซ้ำบนหน้าแรกขยับตามจริง
    addQcRecord({
      order_id: card.order.id,
      result: "fail",
      defect_type: input.defectType,
      defect_note: input.defectNote || null,
      defect_qty: input.defectQty,
      defect_cost: input.defectCost,
    });
    addPrintJob({
      order_id: card.order.id,
      machine_id: card.machine?.id ?? null,
      pieces: input.defectQty,
      is_reprint: true,
      material_note: "รอบพิมพ์ซ้ำจาก QC ไม่ผ่าน",
    });
    logDefect({
      orderId: card.order.id,
      orderNo: card.order.order_no,
      defectType: input.defectType,
      defectQty: input.defectQty,
      defectNote: input.defectNote,
      defectCost: input.defectCost,
    });
    addActivity(
      card.order.id,
      "note",
      `บันทึกของเสีย ${input.defectQty} ผืน — สร้างงานพิมพ์ซ้ำอัตโนมัติ`,
    );
    notify.success(
      `${card.order.order_no}: บันทึก QC ไม่ผ่าน ${input.defectQty} ผืน · สร้างงานพิมพ์ซ้ำแล้ว`,
    );
  }

  const rows = laneCards[lane] ?? [];

  return (
    <MattiiShell
      title="งานผลิต"
      description="คิวพิมพ์ ตรวจคุณภาพ และแพ็คของ — กดปุ่มเดียวจบต่อหนึ่งขั้นตอน"
      icon={<Printer className="h-6 w-6" />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Printer className="h-4 w-4" />}
          label="งานในสายผลิตตอนนี้"
          value={fmtNum(kpi.inLine)}
          sub={`แสดงตามตัวกรอง ${fmtNum(scoped.length)} งาน`}
          tone="info"
        />
        <StatCard
          icon={<ClipboardCheck className="h-4 w-4" />}
          label="รอตรวจคุณภาพ"
          value={fmtNum(kpi.waitingQc)}
          sub="ตรวจให้ไว ของจะได้ไปแพ็คต่อ"
          tone="warning"
          valueColored
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="เลยกำหนดส่งในสายผลิต"
          value={fmtNum(kpi.overdue)}
          sub="ต้องดันขึ้นหัวคิวก่อนงานอื่น"
          tone="negative"
          valueColored
        />
        <StatCard
          icon={<Package className="h-4 w-4" />}
          label="ผืนเสียที่บันทึกรอบนี้"
          value={fmtNum(kpi.defectPieces)}
          sub="จาก QC ไม่ผ่านที่บันทึกในหน้านี้"
          tone={kpi.defectPieces > 0 ? "negative" : "neutral"}
          valueColored={kpi.defectPieces > 0}
        />
      </div>

      <MachineStrip
        machines={machines}
        jobCountOf={(machineId) => cards.filter((c) => c.machine?.id === machineId).length}
      />

      {/* แถบตัวกรองมาตรฐานเดียวกับหน้าอื่นในโมดูล (FilterBar) — เลนเป็น row เดียว ล้นแล้วเลื่อน (DESIGN §4) */}
      <FilterBar
        toolbar={
          <SegmentedControl
            value={scope}
            onChange={setScope}
            size="sm"
            ariaLabel="ช่วงงานที่แสดง"
            options={[
              { value: "today", label: "งานวันนี้" },
              { value: "all", label: "ทั้งหมด" },
            ]}
          />
        }
        onClear={hasFilter ? clearFilters : undefined}
        resultText={`“งานวันนี้” = เลยกำหนด · งานด่วน · ถึงกำหนดภายใน 3 วัน (ระบบจำเครื่องที่เลือกไว้ให้)`}
      >
        <div className="flex w-full gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LANES.map((l) => {
            const active = lane === l.key;
            return (
              <Button
                key={l.key}
                size="sm"
                variant={active ? "secondary" : "ghost"}
                className={cn("shrink-0 whitespace-nowrap", active && "bg-gray-100 text-gray-900")}
                onClick={() => setLane(l.key)}
              >
                {l.label}
                <span className="ml-1.5 rounded-full bg-white px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-gray-600">
                  {fmtNum((laneCards[l.key] ?? []).length)}
                </span>
              </Button>
            );
          })}
        </div>
        <CustomSelect
          value={machineFilter}
          onChange={changeMachineFilter}
          options={machineOptions}
          className="w-56"
        />
      </FilterBar>

      {lane === "packing" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <Text className="text-sm text-gray-600">
            แพ็คเสร็จแล้วงานจะย้ายไปรอออกเลขพัสดุที่หน้าจัดส่ง
          </Text>
          <Button asChild variant="outline" size="sm" className="ms-auto h-11">
            <Link href={`${MATTII_BASE}/shipments`}>ไปหน้าจัดส่ง</Link>
          </Button>
        </div>
      )}

      {(lane === "to_print" || lane === "printing") && (
        <AutoQueuePanel
          input={queueInput}
          onApply={(ids) => {
            applyQueueOrder(ids);
            notify.success(`จัดลำดับคิวใหม่ ${fmtNum(ids.length)} งานตามลำดับที่เสนอแล้ว`);
          }}
        />
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
          <div className="mb-4 rounded-full bg-gray-100 p-4">
            <Printer className="h-8 w-8 text-gray-400" />
          </div>
          <Text className="text-sm font-medium text-gray-900">
            {EMPTY_STATES.productionQueue.title}
          </Text>
          <Text className="mt-1 max-w-md text-sm text-gray-500">
            {EMPTY_STATES.productionQueue.description}
          </Text>
          {scope === "today" ? (
            <Button size="sm" className="mt-4" onClick={() => setScope("all")}>
              ดูงานทั้งหมดในสายผลิต
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline" className="mt-4">
              <Link href={`${MATTII_BASE}/orders`}>{EMPTY_STATES.productionQueue.ctaLabel}</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {rows.map((card) => (
            <ProductionJobCard
              key={card.order.id}
              card={card}
              canPress={canPress}
              onPrimary={() => handlePrimary(card)}
              onQcFail={() => setQcFailId(card.order.id)}
              onQueue={() => setQueueId(card.order.id)}
              onDetail={() => setDetailId(card.order.id)}
            />
          ))}
        </div>
      )}

      {qcFailCard && (
        <QcFailDialog
          card={qcFailCard}
          open
          onOpenChange={(v) => !v && setQcFailId(null)}
          onSubmit={(input) => handleQcFail(qcFailCard, input)}
        />
      )}
      {queueCard && (
        <QueueDialog
          card={queueCard}
          machines={machines}
          open
          onOpenChange={(v) => !v && setQueueId(null)}
          onSetMachine={(machineId) => {
            setMachine(queueCard.order.id, machineId);
            notify.success(`ย้ายงาน ${queueCard.order.order_no} ไปเครื่องใหม่แล้ว`);
          }}
          onMoveFront={() => {
            moveToFront(queueCard.order.id);
            notify.success(`ดัน ${queueCard.order.order_no} ขึ้นหัวคิวแล้ว`);
          }}
          onMoveBack={() => {
            moveToBack(queueCard.order.id);
            notify.success(`เลื่อน ${queueCard.order.order_no} ไปท้ายคิวแล้ว`);
          }}
        />
      )}
      {detailCard && (
        <JobDetailDialog card={detailCard} open onOpenChange={(v) => !v && setDetailId(null)} />
      )}
    </MattiiShell>
  );
}
