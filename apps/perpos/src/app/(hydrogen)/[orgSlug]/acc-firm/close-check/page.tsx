"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Label } from "@/components/ui/label";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import {
  ShieldCheck,
  ListChecks,
  Scale,
  FileEdit,
  CalendarClock,
  Receipt,
  TrendingUp,
  Sparkles,
  CircleCheck,
  Building2,
} from "lucide-react";
import type { Anomaly, AnomalyRule, Severity } from "@/lib/acc-firm/close-check";
import type { CloseCheckResponse } from "@/app/api/acc-firm/close-check/route";

// ── Client list type (จาก GET /api/acc-firm/clients) ────────────────────────────
type ClientRow = {
  id: string;
  status: string;
  client_org: { id: string; name: string; slug: string } | null;
};

// ── Rule metadata (label ไทย + icon) ────────────────────────────────────────────
const RULE_META: Record<AnomalyRule, { label: string; icon: React.ReactNode }> = {
  unbalanced: { label: "รายการไม่สมดุล", icon: <Scale className="h-4 w-4" /> },
  draft_pending: { label: "รายการฉบับร่างค้าง", icon: <FileEdit className="h-4 w-4" /> },
  period_open: { label: "งวดบัญชียังเปิดอยู่", icon: <CalendarClock className="h-4 w-4" /> },
  tax_missing: { label: "แบบภาษีตกหล่น", icon: <Receipt className="h-4 w-4" /> },
  amount_swing: { label: "ยอดผิดปกติเทียบเดือนก่อน", icon: <TrendingUp className="h-4 w-4" /> },
};

const SEVERITY_BADGE: Record<Severity, { tone: BadgeTone; label: string }> = {
  high: { tone: "danger", label: "สำคัญสูง" },
  medium: { tone: "warning", label: "ปานกลาง" },
  low: { tone: "neutral", label: "ทั่วไป" },
};

const TH_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

export default function CloseCheckPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId] = useState("");
  const [token, setToken] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const [clientOrgId, setClientOrgId] = useState("");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CloseCheckResponse | null>(null);
  const [hasRun, setHasRun] = useState(false);

  // ── init: resolve org + token, load active clients ────────────────────────────
  useEffect(() => {
    (async () => {
      const [{ data: org }, { data: sess }] = await Promise.all([
        supabase.from("organizations").select("id").eq("slug", orgSlug).single(),
        supabase.auth.getSession(),
      ]);
      if (org) setOrgId(org.id);
      if (sess?.session) setToken(sess.session.access_token);
    })();
  }, [supabase, orgSlug]);

  const loadClients = useCallback(async () => {
    if (!orgId || !token) return;
    setClientsLoading(true);
    try {
      const res = await fetch(`/api/acc-firm/clients?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const rows: ClientRow[] = (json.clients ?? []).filter(
          (c: ClientRow) => c.status === "active" && c.client_org,
        );
        setClients(rows);
      }
    } finally {
      setClientsLoading(false);
    }
  }, [orgId, token]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const clientOptions = useMemo(
    () =>
      clients.map((c) => ({
        value: c.client_org!.id,
        label: c.client_org!.name,
      })),
    [clients],
  );

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y, y - 1, y - 2].map((v) => ({ value: String(v), label: `${v + 543}` }));
  }, [now]);

  const monthOptions = useMemo(
    () => TH_MONTHS.map((m, i) => ({ value: String(i + 1), label: m })),
    [],
  );

  async function runCheck() {
    if (!orgId || !token || !clientOrgId) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/acc-firm/close-check?orgId=${orgId}&clientOrgId=${clientOrgId}&year=${year}&month=${month}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json();
      if (!res.ok) {
        notify.error(json.error, "ตรวจปิดงวดไม่สำเร็จ");
        return;
      }
      setResult(json as CloseCheckResponse);
      setHasRun(true);
      if (json.isClean) {
        notify.success("ตรวจเสร็จ — งวดนี้ไม่พบความผิดปกติ");
      } else {
        notify.info(`พบ ${json.anomalies.length} ความผิดปกติที่ควรตรวจสอบ`);
      }
    } catch (e) {
      notify.error(e, "ตรวจปิดงวดไม่สำเร็จ");
    } finally {
      setRunning(false);
    }
  }

  const periodLabel = `${TH_MONTHS[Number(month) - 1]} ${Number(year) + 543}`;

  return (
    <PageShell
      width="default"
      icon={<ShieldCheck className="h-6 w-6" />}
      title="ตรวจปิดงวด"
      description="ผู้ช่วยตรวจความผิดปกติก่อนปิดงบ ข้าม client — เลือกลูกค้าและงวด แล้วให้ระบบไล่ตรวจให้"
    >
      {/* ── ตัวเลือก: client + งวด ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-6">
            <Label className="mb-1 block text-xs text-gray-500">ลูกค้า (client)</Label>
            <CustomSelect
              value={clientOrgId}
              onChange={setClientOrgId}
              options={
                clientsLoading
                  ? [{ value: "", label: "กำลังโหลด…" }]
                  : clientOptions.length === 0
                    ? [{ value: "", label: "— ยังไม่มีลูกค้าในความดูแล —" }]
                    : [{ value: "", label: "— เลือกลูกค้า —" }, ...clientOptions]
              }
              className="w-full"
            />
          </div>
          <div className="sm:col-span-3">
            <Label className="mb-1 block text-xs text-gray-500">ปี (พ.ศ.)</Label>
            <CustomSelect
              value={year}
              onChange={setYear}
              options={yearOptions}
              className="w-full"
            />
          </div>
          <div className="sm:col-span-3">
            <Label className="mb-1 block text-xs text-gray-500">เดือน</Label>
            <CustomSelect
              value={month}
              onChange={setMonth}
              options={monthOptions}
              className="w-full"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={runCheck} disabled={running || !clientOrgId}>
            {running ? (
              "กำลังตรวจสอบ…"
            ) : (
              <>
                <ListChecks className="mr-1.5 h-4 w-4" /> ตรวจสอบ
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ── ระหว่างตรวจ: skeleton ───────────────────────────────────────────────── */}
      {running && (
        <div className="space-y-3">
          <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
        </div>
      )}

      {/* ── ก่อนเริ่ม: empty state ─────────────────────────────────────────────── */}
      {!running && !hasRun && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="mb-4 rounded-full bg-gray-100 p-4">
            <ShieldCheck className="h-8 w-8 text-gray-400" />
          </div>
          <Text className="text-sm font-medium text-gray-900">เริ่มตรวจปิดงวด</Text>
          <Text className="mt-1 max-w-sm text-sm text-gray-500">
            เลือกลูกค้าและงวดที่ต้องการ แล้วกด &ldquo;ตรวจสอบ&rdquo; — ระบบจะไล่ตรวจรายการไม่สมดุล
            ฉบับร่างค้าง งวดที่ยังไม่ปิด ภาษีตกหล่น และยอดผิดปกติให้อัตโนมัติ
          </Text>
        </div>
      )}

      {/* ── ผลตรวจ ──────────────────────────────────────────────────────────────── */}
      {!running && result && (
        <div className="space-y-4">
          {/* หัวผล: ลูกค้า + งวด */}
          <div className="flex flex-wrap items-center gap-2 px-1">
            <Building2 className="h-4 w-4 text-gray-400" />
            <Text className="text-sm font-semibold text-gray-900">{result.clientOrgName}</Text>
            <span className="text-gray-300">·</span>
            <Text className="text-sm text-gray-500">งวด {periodLabel}</Text>
          </div>

          {/* งวดสะอาด → empty state เชิงบวก */}
          {result.isClean ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-green-200 bg-green-50/40 py-16 text-center shadow-sm">
              <div className="mb-4 rounded-full bg-green-100 p-4">
                <CircleCheck className="h-8 w-8 text-green-600" />
              </div>
              <Text className="text-sm font-semibold text-green-700">งวดนี้ไม่พบความผิดปกติ</Text>
              <Text className="mt-1 max-w-sm text-sm text-gray-500">
                รายการสมดุล ไม่มีฉบับร่างค้าง งวดพร้อมปิด และไม่มีภาษีตกหล่น — พร้อมปิดงบได้
              </Text>
            </div>
          ) : (
            <>
              {/* AI narration */}
              {result.narration && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <Text className="text-sm font-semibold text-gray-900">สรุปจากผู้ช่วย</Text>
                  </div>
                  <Text className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                    {result.narration}
                  </Text>
                  {result.priority.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <Text className="mb-1.5 text-xs font-medium text-gray-500">
                        ลำดับงานที่ควรทำก่อน
                      </Text>
                      <ol className="space-y-1.5">
                        {result.priority.map((p, i) => (
                          <li key={i} className="flex gap-2 text-sm text-gray-700">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                              {i + 1}
                            </span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {/* รายการ anomaly */}
              <div className="space-y-2.5">
                {result.anomalies.map((a, i) => (
                  <AnomalyCard key={i} anomaly={a} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}

function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
  const meta = RULE_META[anomaly.rule];
  const sev = SEVERITY_BADGE[anomaly.severity];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
          {meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text className="text-sm font-semibold text-gray-900">{meta.label}</Text>
            <StatusBadge tone={sev.tone}>{sev.label}</StatusBadge>
            <span className="text-xs tabular-nums text-gray-400">{anomaly.count} รายการ</span>
          </div>
          <Text className="mt-1 text-sm text-gray-600">{anomaly.detail}</Text>
          {anomaly.refs && anomaly.refs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {anomaly.refs.map((r) => (
                <span
                  key={r.id}
                  className="inline-flex items-center rounded-md bg-gray-50 px-2 py-0.5 font-mono text-xs text-gray-600 ring-1 ring-inset ring-gray-200"
                >
                  {r.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
