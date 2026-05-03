"use client";

import React from "react";
import { Button } from "rizzui";
import { ClipboardList, CalendarClock, CheckCircle2, Plus } from "lucide-react";

import type { CrmActivity, CrmDeal } from "../crm-types";
import { crmFormatDueLabel, crmGroupDueAt } from "../crm-data";

function asMoney(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CrmOverviewTab({
  deals,
  activities,
  dueTasks,
  loading,
  canEdit,
  onAddTask,
  onCompleteTask,
}: {
  deals: CrmDeal[];
  activities: CrmActivity[];
  dueTasks: CrmActivity[];
  loading: boolean;
  canEdit: boolean;
  onAddTask: () => void;
  onCompleteTask: (taskId: string) => Promise<void>;
}) {
  const summary = React.useMemo(() => {
    const openDeals = deals.filter((d) => d.status === "open");
    const openAmount = openDeals.reduce((acc, d) => acc + (Number.isFinite(d.amount) ? d.amount : 0), 0);
    const lastAct = activities[0]?.created_at ?? null;
    return { openDealsCount: openDeals.length, openAmount, lastAct, dueSoon: dueTasks.length };
  }, [activities, deals, dueTasks.length]);

  const upcoming = React.useMemo(() => {
    return dueTasks
      .filter((t) => !!t.due_at)
      .slice(0, 8)
      .map((t) => ({ ...t, dueGroup: t.due_at ? crmGroupDueAt(t.due_at) : "next7" }));
  }, [dueTasks]);

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-600">Open deals</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{summary.openDealsCount}</div>
          <div className="mt-1 text-xs text-gray-500">ยอดรวม {asMoney(summary.openAmount)}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-600">Tasks due (7 วัน)</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{summary.dueSoon}</div>
          <div className="mt-1 text-xs text-gray-500">งานติดตามที่ยังไม่เสร็จ</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-600">Last activity</div>
          <div className="mt-1 text-sm font-semibold text-gray-900">{summary.lastAct ? summary.lastAct : "-"}</div>
          <div className="mt-1 text-xs text-gray-500">อ้างอิง created_at</div>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <ClipboardList className="h-4 w-4" />
            Upcoming reminders
          </div>
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={onAddTask} disabled={loading}>
              <Plus className="mr-1 h-4 w-4" />
              Add task
            </Button>
          ) : null}
        </div>

        {upcoming.length === 0 ? (
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">ยังไม่มีงานใกล้ถึงกำหนด</div>
        ) : (
          <div className="mt-3 space-y-2">
            {upcoming.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">{t.subject}</div>
                  {t.due_at ? (
                    <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                      <CalendarClock className="h-3.5 w-3.5" />
                      <span>{crmFormatDueLabel(t.due_at)}</span>
                      <span
                        className={
                          t.dueGroup === "overdue" ? "text-red-600" : t.dueGroup === "today" ? "text-amber-600" : "text-gray-500"
                        }
                      >
                        {t.dueGroup === "overdue" ? "• เกินกำหนด" : t.dueGroup === "today" ? "• วันนี้" : "• ภายใน 7 วัน"}
                      </span>
                    </div>
                  ) : null}
                </div>
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => onCompleteTask(t.id)}
                    disabled={loading}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    Done
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

