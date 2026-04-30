"use client";

import React from "react";
import { Button } from "rizzui";
import { CalendarClock, CheckCircle2, ClipboardList, Mail, PhoneCall } from "lucide-react";

import type { CrmActivity, CrmActivityType } from "../crm-types";
import { crmFormatDueLabel, crmGroupDueAt } from "../crm-data";

export function CrmActivitiesTab({
  activities,
  loading,
  canEdit,
  onAdd,
  onToggleComplete,
}: {
  activities: CrmActivity[];
  loading: boolean;
  canEdit: boolean;
  onAdd: (type: CrmActivityType) => void;
  onToggleComplete: (activityId: string, completed: boolean) => Promise<void>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">Activities</div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onAdd("call")} disabled={loading}>
              <PhoneCall className="mr-1 h-4 w-4" />
              Call
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAdd("email")} disabled={loading}>
              <Mail className="mr-1 h-4 w-4" />
              Email
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAdd("meeting")} disabled={loading}>
              <CalendarClock className="mr-1 h-4 w-4" />
              Meeting
            </Button>
            <Button size="sm" onClick={() => onAdd("task")} disabled={loading}>
              <ClipboardList className="mr-1 h-4 w-4" />
              Task
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        {activities.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">ยังไม่มีกิจกรรม</div>
        ) : (
          activities.map((a) => {
            const dueGroup = a.due_at ? crmGroupDueAt(a.due_at) : null;
            return (
              <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700">{a.type}</div>
                      {a.completed_at ? (
                        <div className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">completed</div>
                      ) : null}
                    </div>
                    <div className="mt-2 truncate text-sm font-semibold text-gray-900">{a.subject}</div>
                    {a.notes ? <div className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{a.notes}</div> : null}
                    {a.due_at ? (
                      <div className="mt-2 flex items-center gap-1 text-xs">
                        <CalendarClock className="h-3.5 w-3.5 text-gray-500" />
                        <span className="text-gray-600">{crmFormatDueLabel(a.due_at)}</span>
                        {dueGroup ? (
                          <span
                            className={
                              dueGroup === "overdue" ? "text-red-600" : dueGroup === "today" ? "text-amber-600" : "text-gray-500"
                            }
                          >
                            {dueGroup === "overdue" ? "• เกินกำหนด" : dueGroup === "today" ? "• วันนี้" : "• ภายใน 7 วัน"}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {canEdit && a.type === "task" ? (
                    <Button
                      size="sm"
                      variant={a.completed_at ? "outline" : "solid"}
                      onClick={async () => onToggleComplete(a.id, !a.completed_at)}
                      disabled={loading}
                      className="whitespace-nowrap"
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      {a.completed_at ? "Undo" : "Done"}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

