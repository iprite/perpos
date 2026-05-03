"use client";

import React from "react";
import { Button } from "rizzui";
import { Text } from "rizzui/typography";
import { Plus } from "lucide-react";

import type { CrmDeal, CrmDealStage } from "../crm-types";
import { CrmKanban } from "./crm-kanban";

function asMoney(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CrmDealsTab({
  dealsForCustomer,
  pipelineDeals,
  stages,
  customerNameById,
  loading,
  canEdit,
  onAddDeal,
  onEditDeal,
  onMoveStage,
}: {
  dealsForCustomer: CrmDeal[];
  pipelineDeals: CrmDeal[];
  stages: CrmDealStage[];
  customerNameById: Record<string, string>;
  loading: boolean;
  canEdit: boolean;
  onAddDeal: () => void;
  onEditDeal: (deal: CrmDeal) => void;
  onMoveStage: (dealId: string, stageKey: string) => Promise<void>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">Deals/Opportunities</div>
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={onAddDeal} disabled={loading}>
            <Plus className="mr-1 h-4 w-4" />
            Add deal
          </Button>
        ) : null}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
        <div className="grid grid-cols-[1.3fr_0.8fr_0.8fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
          <div>ดีล</div>
          <div>Stage</div>
          <div className="text-right">มูลค่า</div>
        </div>
        {dealsForCustomer.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-600">ยังไม่มีดีล</div>
        ) : (
          dealsForCustomer.map((d) => (
            <div key={d.id} className="grid grid-cols-[1.3fr_0.8fr_0.8fr] gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
              <button className="min-w-0 text-left" onClick={() => onEditDeal(d)} disabled={!canEdit}>
                <div className="truncate text-sm font-medium text-gray-900">{d.title}</div>
                <div className="mt-0.5 truncate text-xs text-gray-500">{d.expected_close_date ?? "-"}</div>
              </button>
              <div className="text-sm text-gray-700">{stages.find((s) => s.key === d.stage_key)?.name ?? d.stage_key}</div>
              <div className="text-right text-sm font-medium text-gray-900">{asMoney(d.amount)}</div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6">
        <div className="text-sm font-semibold text-gray-900">Pipeline (Kanban)</div>
        <Text className="mt-1 text-xs text-gray-600">ลากการ์ดเพื่อเปลี่ยน stage</Text>
        <div className="mt-3">
          <CrmKanban
            stages={stages}
            deals={pipelineDeals}
            customerNameById={customerNameById}
            onEditDeal={onEditDeal}
            onMoveStage={onMoveStage}
          />
        </div>
      </div>
    </div>
  );
}

