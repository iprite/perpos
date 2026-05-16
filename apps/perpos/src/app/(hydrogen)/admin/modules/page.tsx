"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Switch } from "rizzui";
import { Title, Text } from "rizzui/typography";
import { ChevronDown } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { withBasePath } from "@/utils/base-path";
import { ALL_MODULES, MODULE_LABELS, ORG_ROLES, type OrgRole } from "@/lib/modules";

type OrgItem = { id: string; name: string };
type ModuleSetting = { module_key: string; is_enabled: boolean; allowed_roles: OrgRole[] };

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export default function AdminModulesPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [orgOpen, setOrgOpen] = useState(false);
  const [settings, setSettings] = useState<ModuleSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  // Load org list on mount
  useEffect(() => {
    void (async () => {
      try {
        const headers = await authHeader();
        const res = await fetch(withBasePath("/api/admin/modules"), { headers });
        const json = await res.json().catch(() => null);
        if (!res.ok) { setError(json?.error ?? "โหลดองค์กรไม่สำเร็จ"); return; }
        const list = (json?.orgs ?? []) as OrgItem[];
        setOrgs(list);
        if (list.length) setSelectedOrgId(list[0].id);
      } catch (e: any) {
        setError(e?.message ?? "โหลดองค์กรไม่สำเร็จ");
      }
    })();
  }, [authHeader]);

  // Load module settings when org changes
  useEffect(() => {
    if (!selectedOrgId) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    void (async () => {
      try {
        const headers = await authHeader();
        const res = await fetch(
          withBasePath(`/api/admin/modules?orgId=${encodeURIComponent(selectedOrgId)}`),
          { headers },
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) { setError(json?.error ?? "โหลด module settings ไม่สำเร็จ"); setLoading(false); return; }
        setSettings((json?.settings ?? []) as ModuleSetting[]);
        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "โหลดไม่สำเร็จ");
        setLoading(false);
      }
    })();
  }, [authHeader, selectedOrgId]);

  const updateEnabled = (moduleKey: string, val: boolean) => {
    setSettings((prev) =>
      prev.map((s) => (s.module_key === moduleKey ? { ...s, is_enabled: val } : s)),
    );
  };

  const toggleRole = (moduleKey: string, role: OrgRole) => {
    setSettings((prev) =>
      prev.map((s) => {
        if (s.module_key !== moduleKey) return s;
        const has = s.allowed_roles.includes(role);
        const allowed_roles = has
          ? s.allowed_roles.filter((r) => r !== role)
          : [...s.allowed_roles, role];
        return { ...s, allowed_roles };
      }),
    );
  };

  const save = async () => {
    if (!selectedOrgId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const headers = await authHeader();
      const res = await fetch(withBasePath("/api/admin/modules"), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ orgId: selectedOrgId, settings }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError(json?.error ?? "บันทึกไม่สำเร็จ"); setSaving(false); return; }
      setSaved(true);
      setSaving(false);
    } catch (e: any) {
      setError(e?.message ?? "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  };

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

  return (
    <div>
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          จัดการ Modules
        </Title>
        <Text className="mt-1 text-sm text-gray-600">
          เปิด/ปิด module ต่อองค์กร และกำหนดว่า role ใดเข้าถึงได้บ้าง
        </Text>
      </div>

      {/* Org selector */}
      <div className="mt-5 flex items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setOrgOpen((v) => !v)}
            className="inline-flex h-9 min-w-[220px] items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50"
          >
            <span className="truncate font-medium">{selectedOrg?.name ?? "เลือกองค์กร"}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
          {orgOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              <div className="max-h-60 overflow-y-auto py-1">
                {orgs.map((org) => (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => { setSelectedOrgId(org.id); setOrgOpen(false); }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span className="flex-1 truncate">{org.name}</span>
                    {org.id === selectedOrgId && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-slate-600" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button
          className="bg-indigo-600 text-white hover:bg-indigo-500"
          disabled={!selectedOrgId || saving || loading}
          onClick={() => void save()}
        >
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </Button>
        {saved && <span className="text-sm text-green-600">บันทึกแล้ว ✓</span>}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Module table */}
      {selectedOrgId && !loading && settings.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_100px_repeat(3,80px)] items-center border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <div>Module</div>
            <div className="text-center">เปิดใช้งาน</div>
            {ORG_ROLES.map((r) => (
              <div key={r} className="text-center">{ROLE_LABEL[r]}</div>
            ))}
          </div>

          {ALL_MODULES.map((mod) => {
            const s = settings.find((x) => x.module_key === mod.key);
            if (!s) return null;
            return (
              <div
                key={mod.key}
                className="grid grid-cols-[1fr_100px_repeat(3,80px)] items-center border-b border-gray-100 px-5 py-4 last:border-0"
              >
                <div>
                  <div className="text-sm font-medium text-gray-900">{MODULE_LABELS[mod.key]}</div>
                  <div className="text-xs text-gray-400">{mod.href}</div>
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={s.is_enabled}
                    onChange={(e: any) => updateEnabled(mod.key, Boolean(e?.target?.checked ?? e))}
                  />
                </div>
                {ORG_ROLES.map((role) => (
                  <div key={role} className="flex justify-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-indigo-600 disabled:cursor-not-allowed"
                      checked={s.allowed_roles.includes(role)}
                      disabled={!s.is_enabled}
                      onChange={() => toggleRole(mod.key, role)}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {loading && (
        <div className="mt-8 text-center text-sm text-gray-400">กำลังโหลด…</div>
      )}
    </div>
  );
}
