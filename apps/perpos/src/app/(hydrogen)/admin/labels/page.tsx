"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Title, Text } from "rizzui/typography";
import { Save, RotateCcw } from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { backendUrl } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { invalidateOrgLabels } from "@/hooks/use-org-labels";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrgItem = { id: string; name: string };

type LabelRow = {
  key: string;
  default_value: string;
  override: string | null;
};

type LocalEdits = Record<string, string>; // labelKey → edited value (empty = clear)

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCALE_OPTIONS = [
  { value: "th", label: "ภาษาไ��ย (TH)" },
  { value: "en", label: "English (EN)" },
];

// Group labels by domain prefix
function groupLabels(labels: LabelRow[]): Record<string, LabelRow[]> {
  const groups: Record<string, LabelRow[]> = {};
  for (const row of labels) {
    const prefix = row.key.split(".")[0] ?? "other";
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(row);
  }
  return groups;
}

const DOMAIN_LABELS: Record<string, string> = {
  finance:    "การเงิน (Finance)",
  sales:      "การขาย (Sales)",
  purchase:   "การจัดซื้อ (Purchase)",
  payroll:    "เงินเดือน (Payroll)",
  inventory:  "สินค้า (Inventory)",
  nav:        "เมนูนำทาง (Navigation)",
  action:     "คำสั่ง (Actions)",
  status:     "สถานะ (Status)",
  document:   "เอกสาร (Document)",
  tmc:        "TMC Management",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LabelsPage() {
  const { role, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgs, setOrgs]           = useState<OrgItem[]>([]);
  const [orgId, setOrgId]         = useState("");
  const [locale, setLocale]       = useState("th");
  const [labels, setLabels]       = useState<LabelRow[]>([]);
  const [localEdits, setLocalEdits] = useState<LocalEdits>({});

  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [message, setMessage]     = useState<string | null>(null);

  const [searchQ, setSearchQ]     = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(Object.keys(DOMAIN_LABELS)));

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  // Load orgs on mount
  useEffect(() => {
    authHeader()
      .then(async (h) => {
        const res = await fetch(backendUrl("/admin/labels"), { headers: h });
        const json = await res.json().catch(() => null);
        if (json?.orgs) setOrgs(json.orgs as OrgItem[]);
      })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load labels when orgId / locale changes
  const loadLabels = useCallback(async () => {
    if (!orgId) { setLabels([]); setLocalEdits({}); return; }
    setLoading(true);
    setError(null);
    try {
      const h = await authHeader();
      const res = await fetch(backendUrl(`/admin/labels?orgId=${orgId}&locale=${locale}`), { headers: h });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError(json?.error ?? "โหลดไม่สำเร็จ"); setLoading(false); return; }
      setLabels((json?.labels ?? []) as LabelRow[]);
      setLocalEdits({});
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [orgId, locale, authHeader]);

  useEffect(() => { loadLabels(); }, [loadLabels]);

  // ── Computed ──────────────────────────────────────────────────────────────

  const filteredLabels = useMemo(() => {
    if (!searchQ.trim()) return labels;
    const q = searchQ.toLowerCase();
    return labels.filter(
      (l) =>
        l.key.includes(q) ||
        l.default_value.toLowerCase().includes(q) ||
        (l.override ?? "").toLowerCase().includes(q),
    );
  }, [labels, searchQ]);

  const grouped = useMemo(() => groupLabels(filteredLabels), [filteredLabels]);

  const dirtyCount = Object.keys(localEdits).filter((k) => {
    const current = labels.find((l) => l.key === k)?.override ?? "";
    return (localEdits[k] ?? "") !== current;
  }).length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleEdit = (key: string, value: string) => {
    setLocalEdits((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const handleReset = (key: string) => {
    setLocalEdits((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const currentValue = (row: LabelRow): string => {
    if (row.key in localEdits) return localEdits[row.key] ?? "";
    return row.override ?? "";
  };

  const handleSaveAll = async () => {
    if (!orgId || dirtyCount === 0) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const h = await authHeader();
      // Build overrides object: key → value (or null to clear)
      const overrides: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(localEdits)) {
        overrides[key] = value.trim() || null;
      }
      const res = await fetch(backendUrl("/admin/labels"), {
        method: "PUT",
        headers: { ...h, "content-type": "application/json" },
        body: JSON.stringify({ orgId, locale, overrides }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError(json?.error ?? "บันทึกไม่สำเร็จ"); return; }
      setMessage(`บันทึกแล้ว ${json.upserted} รายการ${json.deleted > 0 ? `, ลบ ${json.deleted} รายการ` : ""}`);
      invalidateOrgLabels(orgId);
      await loadLabels();
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else                 next.add(group);
      return next;
    });
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (authLoading) return <div className="p-6 text-sm text-gray-500">กำลังโหลด…</div>;
  if (role !== "super_admin") return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <Title as="h1" className="text-lg font-semibold">ไม่มีสิทธิ์เข้าถึงหน้านี้</Title>
    </div>
  );

  const orgOptions = [{ value: "", label: "— เลือก Org —" }, ...orgs.map((o) => ({ value: o.id, label: o.name }))];
  const hasEdits   = dirtyCount > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">Label Overrides</Title>
          <Text className="mt-1 text-sm text-gray-500">
            {'ปรับคำศัพท์ประจำ Org • เช่น "รายรับ" → "ค่าเช่า" สำหรับ TMC'}
          </Text>
        </div>
        {hasEdits && (
          <Button onClick={handleSaveAll} disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "กำลังบันทึก…" : `บันทึก ${dirtyCount} รายการ`}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:grid-cols-[1fr_160px_200px]">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">Organization</label>
          <CustomSelect
            value={orgId}
            onChange={(v) => { setOrgId(v); setLocalEdits({}); }}
            options={orgOptions}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">Locale</label>
          <CustomSelect
            value={locale}
            onChange={(v) => { setLocale(v); setLocalEdits({}); }}
            options={LOCALE_OPTIONS}
            disabled={!orgId}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">ค้นหา</label>
          <Input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="ค้นหา key หรือคำ…"
            disabled={!orgId}
          />
        </div>
      </div>

      {/* Feedback */}
      {error   && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
      {hasEdits && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          มีการเปลี่ยนแปลง {dirtyCount} รายการที่ยังไม่ได้บันทึก — กด <strong>บันทึก</strong> เพื่อยืนยัน
        </div>
      )}

      {/* Label groups */}
      {!orgId ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-400">
          เลือก Organization เพื่อดูและจัดการ Label Overrides
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
          กำลังโหลด…
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([group, rows]) => {
            const expanded = expandedGroups.has(group);
            const overriddenCount = rows.filter((r) => {
              const edit = localEdits[r.key];
              return edit !== undefined ? edit.trim() !== "" : r.override !== null;
            }).length;

            return (
              <div key={group} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                {/* Group header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 hover:bg-gray-100"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <span>{DOMAIN_LABELS[group] ?? group}</span>
                    <span className="text-xs font-normal text-gray-400">
                      ({rows.length} labels
                      {overriddenCount > 0 && (
                        <span className="ml-1 text-indigo-600">, {overriddenCount} overridden</span>
                      )})
                    </span>
                  </div>
                  <span className={`text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                </button>

                {/* Rows */}
                {expanded && (
                  <>
                    {/* Column headers */}
                    <div className="grid grid-cols-[180px_1fr_1fr_40px] gap-0 border-b border-gray-100 bg-gray-50/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <div>Label Key</div>
                      <div>ค่าเริ่มต้น</div>
                      <div>Override (org นี้)</div>
                      <div></div>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {rows.map((row) => {
                        const editValue  = localEdits[row.key] ?? row.override ?? "";
                        const isDirty    = localEdits[row.key] !== undefined &&
                          localEdits[row.key] !== (row.override ?? "");
                        const hasOverride = row.override !== null || (localEdits[row.key] ?? "") !== "";

                        return (
                          <div
                            key={row.key}
                            className={`grid grid-cols-[180px_1fr_1fr_40px] items-center gap-0 px-4 py-2 text-sm transition-colors ${isDirty ? "bg-amber-50/40" : ""}`}
                          >
                            {/* Key */}
                            <div className="font-mono text-xs text-gray-500 truncate pr-2">
                              {row.key}
                            </div>
                            {/* Default */}
                            <div className="text-gray-700 pr-3">{row.default_value}</div>
                            {/* Override input */}
                            <div>
                              <Input
                                value={editValue}
                                onChange={(e) => handleEdit(row.key, e.target.value)}
                                placeholder={row.default_value}
                                className={`h-8 text-sm ${
                                  hasOverride
                                    ? "border-indigo-300 bg-indigo-50/30 text-indigo-900"
                                    : "border-gray-200 bg-transparent text-gray-700"
                                }`}
                              />
                            </div>
                            {/* Reset */}
                            <div className="flex justify-center">
                              {(hasOverride || isDirty) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleReset(row.key);
                                    // If it has a server-side override, mark it for deletion
                                    if (row.override !== null) {
                                      setLocalEdits((prev) => ({ ...prev, [row.key]: "" }));
                                    }
                                  }}
                                  title="รีเซ็ตเป็นค่าเริ่มต้น"
                                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
