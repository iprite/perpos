"use client";

// production-parts.tsx — ชิ้นส่วนของหน้างานผลิต: แถบสถานะเครื่อง + แผงจัดลำดับคิวอัตโนมัติ
// การจัดคิวเป็น **rule-based ล้วน ไม่ใช่ AI** (contract v3 §5 — AI อยู่นอกขอบเขตของงานนี้)
// → ห้ามใช้คำว่า AI / ไอคอนบอท / "ความมั่นใจ" กับแผงนี้
// 🔒 แถบเครื่องไม่แสดง hourly_cost (owner-only field — อยู่หน้าตั้งค่า)

import { useState } from "react";
import { ListOrdered, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/typography";
import { MACHINE_STATUS_LABEL } from "../_fixtures/labels";
import type { MachineStatus, MattiiMachine } from "../_fixtures/types";
import { fmtNum } from "../_components";
import { buildQueuePlan, type QueueCandidate, type QueuePlanItem } from "./queue-order";

const MACHINE_TONE: Record<MachineStatus, "neutral" | "info" | "warning"> = {
  idle: "neutral",
  running: "info",
  maintenance: "warning",
};

export function MachineStrip({
  machines,
  jobCountOf,
}: {
  machines: MattiiMachine[];
  /** จำนวนงานในคิวของเครื่องนั้น */
  jobCountOf: (machineId: string) => number;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {machines.map((m) => (
        <div key={m.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                <Printer className="h-4 w-4" />
              </span>
              <span className="truncate text-sm font-semibold text-gray-900">{m.code}</span>
            </div>
            <StatusBadge tone={MACHINE_TONE[m.status]}>
              {MACHINE_STATUS_LABEL[m.status]}
            </StatusBadge>
          </div>
          <Text className="mt-1 truncate text-xs text-gray-500">{m.name}</Text>
          <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
            <span className="tabular-nums">งานในคิว {fmtNum(jobCountOf(m.id))} งาน</span>
            <span className="tabular-nums">กำลังผลิต {fmtNum(m.capacity_per_day)} ผืน/วัน</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AutoQueuePanel({
  input,
  onApply,
}: {
  input: QueueCandidate[];
  /** ผู้ใช้กด "ใช้ลำดับนี้" — ระบบเสนอลำดับให้ คนเป็นผู้ตัดสินใจ */
  onApply: (orderIds: string[]) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const [items, setItems] = useState<QueuePlanItem[]>([]);
  const [summary, setSummary] = useState("");

  function run() {
    setPhase("loading");
    window.setTimeout(() => {
      const res = buildQueuePlan(input);
      setItems(res.items);
      setSummary(res.summary);
      setPhase("done");
    }, 400);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-900">จัดลำดับคิวพิมพ์อัตโนมัติ</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={phase === "loading" || input.length === 0}
          onClick={run}
        >
          {phase === "loading"
            ? "กำลังจัดลำดับ…"
            : phase === "done"
              ? "จัดลำดับใหม่"
              : "จัดลำดับให้อัตโนมัติ"}
        </Button>
      </div>
      <Text className="mt-1.5 text-xs text-gray-500">
        เรียงตามกฎตายตัว: เลยกำหนดส่ง → งานด่วน → ใกล้กำหนด → รวมงานผ้าชนิดเดียวกันไว้ติดกัน
        (ไม่ได้ใช้ AI) — เป็นข้อเสนอ ต้องกดยืนยันเองก่อนคิวจริงถึงจะเปลี่ยน
      </Text>

      {phase === "loading" && (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {phase === "done" && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone="info">ลำดับที่เสนอ {fmtNum(items.length)} งาน</StatusBadge>
          </div>
          <Text className="text-xs text-gray-600">{summary}</Text>
          <ol className="space-y-2">
            {items.map((it, idx) => (
              <li
                key={it.orderId}
                className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-2.5"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium tabular-nums text-gray-600">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-mono text-sm font-medium text-gray-900">{it.orderNo}</div>
                  <Text className="text-xs text-gray-500">{it.reason}</Text>
                </div>
              </li>
            ))}
          </ol>
          <Button size="sm" onClick={() => onApply(items.map((i) => i.orderId))}>
            ใช้ลำดับนี้
          </Button>
        </div>
      )}
    </div>
  );
}
