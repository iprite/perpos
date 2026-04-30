"use client";

import React from "react";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import type { CrmDeal, CrmDealStage } from "../crm-types";

function asMoney(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function KanbanColumn({
  id,
  title,
  count,
  amount,
  children,
}: {
  id: string;
  title: string;
  count: number;
  amount: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="min-w-[240px] max-w-[280px] flex-1">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-semibold text-gray-700">{title}</div>
        <div className="text-[11px] text-gray-500">
          {count} • {asMoney(amount)}
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`mt-2 min-h-[120px] rounded-xl border border-gray-200 p-2 ${isOver ? "bg-blue-50" : "bg-gray-50"}`}
      >
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}

function DealCard({
  deal,
  customerName,
  onEdit,
}: {
  deal: CrmDeal;
  customerName: string;
  onEdit: (deal: CrmDeal) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = {
    transform: CSS.Translate.toString(transform),
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      onClick={() => onEdit(deal)}
      className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition ${
        isDragging ? "opacity-60" : "hover:shadow-md"
      }`}
    >
      <div className="truncate text-sm font-semibold text-gray-900">{deal.title}</div>
      <div className="mt-0.5 truncate text-xs text-gray-600">{customerName || deal.customer_id}</div>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-700">
        <div>{asMoney(deal.amount)}</div>
        <div className="text-gray-500">{deal.expected_close_date ?? "-"}</div>
      </div>
    </div>
  );
}

export function CrmKanban({
  stages,
  deals,
  customerNameById,
  onMoveStage,
  onEditDeal,
}: {
  stages: CrmDealStage[];
  deals: CrmDeal[];
  customerNameById: Record<string, string>;
  onMoveStage: (dealId: string, stageKey: string) => Promise<void>;
  onEditDeal: (deal: CrmDeal) => void;
}) {
  const stageByKey = React.useMemo(() => {
    const m: Record<string, CrmDealStage> = {};
    for (const s of stages) m[s.key] = s;
    return m;
  }, [stages]);

  const visibleDeals = React.useMemo(() => {
    return deals.filter((d) => !!stageByKey[d.stage_key]);
  }, [deals, stageByKey]);

  const onDragEnd = async (event: DragEndEvent) => {
    const dealId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    const deal = visibleDeals.find((d) => d.id === dealId);
    if (!deal) return;
    if (deal.stage_key === overId) return;
    await onMoveStage(dealId, overId);
  };

  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {stages.map((s) => {
          const items = visibleDeals.filter((d) => d.stage_key === s.key);
          const sum = items.reduce((acc, d) => acc + (Number.isFinite(d.amount) ? d.amount : 0), 0);
          return (
            <KanbanColumn key={s.key} id={s.key} title={s.name} count={items.length} amount={sum}>
              {items.map((d) => (
                <DealCard
                  key={d.id}
                  deal={d}
                  customerName={(customerNameById[d.customer_id] ?? "").trim()}
                  onEdit={onEditDeal}
                />
              ))}
            </KanbanColumn>
          );
        })}
      </div>
    </DndContext>
  );
}
