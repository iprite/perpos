"use client";

import React from "react";
import { Button } from "rizzui";
import { Mail, PhoneCall, Plus, RefreshCw } from "lucide-react";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CrmActivity, CrmActivityType, CrmDeal, CrmDealStage } from "../crm-types";
import {
  crmCompleteActivity,
  crmListActivities,
  crmListDeals,
  crmListDueTasksForCustomer,
  crmListStages,
  crmUpsertActivity,
  crmUpsertDeal,
  crmUpdateDealStage,
} from "../crm-data";
import { CrmActivitiesTab } from "./crm-activities-tab";
import { CrmActivityModal } from "./crm-activity-modal";
import { CrmDealModal } from "./crm-deal-modal";
import { CrmDealsTab } from "./crm-deals-tab";
import { CrmOverviewTab } from "./crm-overview-tab";

type CustomerLite = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
};

const tabItems = [
  { key: "overview", label: "Overview" },
  { key: "deals", label: "Deals" },
  { key: "activities", label: "Activities" },
] as const;

type TabKey = (typeof tabItems)[number]["key"];

export function CrmCustomerPanel({
  supabase,
  customer,
  customerNameById,
  canEdit,
}: {
  supabase: SupabaseClient;
  customer: CustomerLite;
  customerNameById: Record<string, string>;
  canEdit: boolean;
}) {
  const [tab, setTab] = React.useState<TabKey>("overview");

  const [refreshing, setRefreshing] = React.useState(false);
  const [mutating, setMutating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [stages, setStages] = React.useState<CrmDealStage[]>([]);
  const [dealsForCustomer, setDealsForCustomer] = React.useState<CrmDeal[]>([]);
  const [pipelineDeals, setPipelineDeals] = React.useState<CrmDeal[]>([]);
  const [activities, setActivities] = React.useState<CrmActivity[]>([]);
  const [dueTasks, setDueTasks] = React.useState<CrmActivity[]>([]);

  const [dealModalOpen, setDealModalOpen] = React.useState(false);
  const [editingDeal, setEditingDeal] = React.useState<CrmDeal | null>(null);

  const [activityModalOpen, setActivityModalOpen] = React.useState(false);
  const [activityInitialType, setActivityInitialType] = React.useState<CrmActivityType>("call");

  const refreshAll = React.useCallback(() => {
    Promise.resolve().then(async () => {
      setRefreshing(true);
      setError(null);
      try {
        const [s, dealsC, dealsP, acts, due] = await Promise.all([
          stages.length === 0 ? crmListStages(supabase) : Promise.resolve(stages),
          crmListDeals(supabase, { customerId: customer.id, status: "all" }),
          crmListDeals(supabase, { status: "open", limit: 200 }),
          crmListActivities(supabase, { customerId: customer.id, includeCompleted: true, limit: 200 }),
          crmListDueTasksForCustomer(supabase, customer.id),
        ]);
        setStages(s);
        setDealsForCustomer(dealsC);
        setPipelineDeals(dealsP);
        setActivities(acts);
        setDueTasks(due);
        setRefreshing(false);
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูล CRM ไม่สำเร็จ");
        setRefreshing(false);
      }
    });
  }, [customer.id, stages, supabase]);

  React.useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-900">{customer.name}</div>
            <div className="mt-1 grid gap-1 text-xs text-gray-600">
              {customer.contact_name ? <div className="truncate">ผู้ติดต่อ: {customer.contact_name}</div> : null}
              {customer.email ? (
                <div className="flex items-center gap-1 truncate">
                  <Mail className="h-3.5 w-3.5" />
                  <span>{customer.email}</span>
                </div>
              ) : null}
              {customer.phone ? (
                <div className="flex items-center gap-1 truncate">
                  <PhoneCall className="h-3.5 w-3.5" />
                  <span>{customer.phone}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={refreshAll} disabled={refreshing} className="whitespace-nowrap">
              <RefreshCw className="mr-1 h-4 w-4" />
              รีเฟรช
            </Button>
            {canEdit ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingDeal(null);
                  setDealModalOpen(true);
                }}
                disabled={mutating}
                className="whitespace-nowrap"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add deal
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex gap-2 rounded-lg bg-gray-50 p-1">
          {tabItems.map((x) => (
            <button
              key={x.key}
              onClick={() => setTab(x.key)}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition ${
                tab === x.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:bg-white/60"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="p-4">
        {tab === "overview" ? (
          <CrmOverviewTab
            deals={dealsForCustomer}
            activities={activities}
            dueTasks={dueTasks}
            loading={refreshing}
            canEdit={canEdit}
            onAddTask={() => {
              setActivityInitialType("task");
              setActivityModalOpen(true);
            }}
            onCompleteTask={async (taskId) => {
              if (!canEdit) return;
              setMutating(true);
              try {
                await crmCompleteActivity(supabase, taskId, true);
                await refreshAll();
              } finally {
                setMutating(false);
              }
            }}
          />
        ) : null}

        {tab === "deals" ? (
          <CrmDealsTab
            dealsForCustomer={dealsForCustomer}
            pipelineDeals={pipelineDeals}
            stages={stages}
            customerNameById={customerNameById}
            loading={mutating}
            canEdit={canEdit}
            onAddDeal={() => {
              setEditingDeal(null);
              setDealModalOpen(true);
            }}
            onEditDeal={(deal) => {
              setEditingDeal(deal);
              setDealModalOpen(true);
            }}
            onMoveStage={async (dealId, stageKey) => {
              if (!canEdit) return;
              setMutating(true);
              try {
                await crmUpdateDealStage(supabase, dealId, stageKey);
                await refreshAll();
              } finally {
                setMutating(false);
              }
            }}
          />
        ) : null}

        {tab === "activities" ? (
          <CrmActivitiesTab
            activities={activities}
            loading={mutating}
            canEdit={canEdit}
            onAdd={(t) => {
              setActivityInitialType(t);
              setActivityModalOpen(true);
            }}
            onToggleComplete={async (activityId, completed) => {
              if (!canEdit) return;
              setMutating(true);
              try {
                await crmCompleteActivity(supabase, activityId, completed);
                await refreshAll();
              } finally {
                setMutating(false);
              }
            }}
          />
        ) : null}

      </div>

      <CrmDealModal
        open={dealModalOpen}
        onClose={() => setDealModalOpen(false)}
        customerName={customer.name}
        stages={stages}
        loading={mutating}
        canEdit={canEdit}
        editingDeal={editingDeal}
        onSave={async (payload) => {
          if (!canEdit) return;
          setMutating(true);
          setError(null);
          try {
            await crmUpsertDeal(supabase, {
              id: payload.id,
              customer_id: customer.id,
              title: payload.title,
              amount: payload.amount,
              stage_key: payload.stage_key,
              probability: payload.probability,
              expected_close_date: payload.expected_close_date,
              status: payload.status,
            });
            setDealModalOpen(false);
            await refreshAll();
          } catch (e: any) {
            setError(e?.message ?? "บันทึกดีลไม่สำเร็จ");
          } finally {
            setMutating(false);
          }
        }}
      />

      <CrmActivityModal
        open={activityModalOpen}
        onClose={() => setActivityModalOpen(false)}
        customerName={customer.name}
        deals={dealsForCustomer}
        loading={mutating}
        canEdit={canEdit}
        initialType={activityInitialType}
        onSave={async (payload) => {
          if (!canEdit) return;
          setMutating(true);
          setError(null);
          try {
            await crmUpsertActivity(supabase, {
              customer_id: customer.id,
              type: payload.type,
              subject: payload.subject,
              notes: payload.notes,
              deal_id: payload.deal_id,
              due_at: payload.due_at,
              reminder_at: payload.reminder_at,
            });
            setActivityModalOpen(false);
            await refreshAll();
          } catch (e: any) {
            setError(e?.message ?? "บันทึกกิจกรรมไม่สำเร็จ");
          } finally {
            setMutating(false);
          }
        }}
      />
    </div>
  );
}
