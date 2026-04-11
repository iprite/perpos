"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Button, Input } from "rizzui";

export type DocType = "passport" | "visa" | "wp";

export type RuleRow = {
  id: string;
  customer_id: string | null;
  doc_type: DocType;
  lead_days: number[];
  enabled: boolean;
  notify_employer: boolean;
  notify_sale: boolean;
  notify_in_app: boolean;
  notify_email: boolean;
};

const DOCS: DocType[] = ["passport", "visa", "wp"];

function parseLeadDays(text: string) {
  const raw = text
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const nums = raw
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.trunc(n));
  const unique = Array.from(new Set(nums));
  unique.sort((a, b) => b - a);
  return unique;
}

function docTypeLabel(t: DocType) {
  if (t === "passport") return "พาสปอร์ต";
  if (t === "visa") return "วีซ่า";
  return "ใบอนุญาตทำงาน";
}

export function NotificationSettingsRulesCard(props: {
  loading: boolean;
  userId: string;
  rules: RuleRow[];
  onUpsertGlobalRule: (docType: DocType, next: Partial<RuleRow> & { lead_days?: number[] }) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const globalRuleByDoc = useMemo(() => {
    const m = new Map<DocType, RuleRow>();
    for (const r of props.rules) {
      if (r.customer_id !== null) continue;
      m.set(r.doc_type, r);
    }
    return m;
  }, [props.rules]);

  const [leadDaysText, setLeadDaysText] = useState<Record<DocType, string>>({
    passport: "90,60,30,14,7,0",
    visa: "90,60,30,14,7,0",
    wp: "90,60,30,14,7,0",
  });

  React.useEffect(() => {
    const nextLead: Record<DocType, string> = { passport: "", visa: "", wp: "" };
    (Object.keys(nextLead) as DocType[]).forEach((k) => {
      const r = props.rules.find((x) => x.customer_id === null && x.doc_type === k);
      const arr = (r?.lead_days ?? [90, 60, 30, 14, 7, 0]) as any[];
      nextLead[k] = arr.map((n) => String(n)).join(",");
    });
    setLeadDaysText(nextLead);
  }, [props.rules]);

  const saveRules = useCallback(async () => {
    for (const doc of DOCS) {
      const existing = globalRuleByDoc.get(doc) ?? null;
      const lead = parseLeadDays(leadDaysText[doc]);
      await props.onUpsertGlobalRule(doc, {
        enabled: existing?.enabled ?? true,
        notify_employer: existing?.notify_employer ?? true,
        notify_sale: existing?.notify_sale ?? true,
        notify_in_app: existing?.notify_in_app ?? true,
        notify_email: existing?.notify_email ?? true,
        lead_days: lead.length ? lead : [90, 60, 30, 14, 7, 0],
      });
    }
    await props.onRefresh();
  }, [globalRuleByDoc, leadDaysText, props]);

  const toggle = useCallback(
    async (doc: DocType, field: "enabled" | "notify_employer" | "notify_sale" | "notify_in_app" | "notify_email", value: boolean) => {
      await props.onUpsertGlobalRule(doc, { [field]: value } as any);
      await props.onRefresh();
    },
    [props],
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm font-semibold text-gray-900">กติกา (ค่าเริ่มต้น)</div>
      <div className="mt-1 text-xs text-gray-500">กำหนดวันเตือนล่วงหน้า (วัน) สำหรับแต่ละประเภทเอกสาร</div>

      <div className="mt-4 grid gap-3">
        {DOCS.map((doc) => {
          const r = globalRuleByDoc.get(doc) ?? null;
          return (
            <div key={doc} className="rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-gray-900">{docTypeLabel(doc)}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <input type="checkbox" checked={Boolean(r?.enabled ?? true)} onChange={(e) => toggle(doc, "enabled", e.target.checked)} disabled={props.loading} />
                    เปิดใช้งาน
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <input
                      type="checkbox"
                      checked={Boolean(r?.notify_employer ?? true)}
                      onChange={(e) => toggle(doc, "notify_employer", e.target.checked)}
                      disabled={props.loading}
                    />
                    แจ้งนายจ้าง
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <input type="checkbox" checked={Boolean(r?.notify_sale ?? true)} onChange={(e) => toggle(doc, "notify_sale", e.target.checked)} disabled={props.loading} />
                    แจ้งทีมขาย
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <input type="checkbox" checked={Boolean(r?.notify_in_app ?? true)} onChange={(e) => toggle(doc, "notify_in_app", e.target.checked)} disabled={props.loading} />
                    แจ้งผ่านแอป
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <input type="checkbox" checked={Boolean(r?.notify_email ?? true)} onChange={(e) => toggle(doc, "notify_email", e.target.checked)} disabled={props.loading} />
                    แจ้งผ่านอีเมล
                  </label>
                </div>
              </div>
              <div className="mt-3">
                <Input
                  label="วันเตือน (comma separated)"
                  value={leadDaysText[doc]}
                  onChange={(e) => setLeadDaysText((m) => ({ ...m, [doc]: e.target.value }))}
                  disabled={props.loading}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={() => saveRules()} disabled={props.loading}>
          บันทึกกติกา
        </Button>
      </div>
    </div>
  );
}
