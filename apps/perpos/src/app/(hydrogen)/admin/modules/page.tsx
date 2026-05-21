"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { backendUrl } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import { ALL_MODULES, MODULE_LABELS, MODULE_MENUS, ORG_ROLES, type OrgRole } from "@/lib/modules";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrgItem      = { id: string; name: string };
type ModuleSetting = { module_key: string; is_enabled: boolean; allowed_roles: OrgRole[]; specific?: boolean };
type MenuSetting   = { module_key: string; menu_key: string; allowed_roles: OrgRole[] };

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<OrgRole, string> = {
  owner:       "Owner",
  admin:       "Admin",
  team_lead:   "TL",
  team_member: "TM",
};

const ROLE_FULL: Record<OrgRole, string> = {
  owner:       "Owner",
  admin:       "Admin",
  team_lead:   "Team lead",
  team_member: "Team member",
};

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none",
        checked ? "bg-blue-600" : "bg-gray-200",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminModulesPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgs, setOrgs]                         = useState<OrgItem[]>([]);
  const [selectedOrgId, setSelectedOrgId]       = useState<string>("");
  const [orgOpen, setOrgOpen]                   = useState(false);
  const [settings, setSettings]                 = useState<ModuleSetting[]>([]);
  const [menuSettings, setMenuSettings]         = useState<MenuSetting[]>([]);
  const [expandedModules, setExpandedModules]   = useState<Set<string>>(new Set());
  const [loading, setLoading]                   = useState(false);
  const [saving, setSaving]                     = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [saved, setSaved]                       = useState(false);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  // ── Load org list ────────────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const headers = await authHeader();
        const res  = await fetch(backendUrl("/admin/modules"), { headers });
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

  // ── Load settings when org changes ───────────────────────────────────────────
  useEffect(() => {
    if (!selectedOrgId) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    void (async () => {
      try {
        const headers = await authHeader();
        const res  = await fetch(backendUrl(`/admin/modules?orgId=${encodeURIComponent(selectedOrgId)}`), { headers });
        const json = await res.json().catch(() => null);
        if (!res.ok) { setError(json?.error ?? "โหลดไม่สำเร็จ"); setLoading(false); return; }
        const loaded = (json?.settings ?? []) as ModuleSetting[];
        setSettings(loaded);
        setMenuSettings((json?.menuSettings ?? []) as MenuSetting[]);
        // Auto-expand enabled modules
        setExpandedModules(new Set(loaded.filter((s) => s.is_enabled).map((s) => s.module_key)));
        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "โหลดไม่สำเร็จ");
        setLoading(false);
      }
    })();
  }, [authHeader, selectedOrgId]);

  // ── State helpers ─────────────────────────────────────────────────────────────

  const toggleExpand = (key: string) =>
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const updateEnabled = (moduleKey: string, val: boolean) =>
    setSettings((prev) => prev.map((s) => s.module_key === moduleKey ? { ...s, is_enabled: val } : s));

  const toggleModuleRole = (moduleKey: string, role: OrgRole) =>
    setSettings((prev) =>
      prev.map((s) => {
        if (s.module_key !== moduleKey) return s;
        const has = s.allowed_roles.includes(role);
        return { ...s, allowed_roles: has ? s.allowed_roles.filter((r) => r !== role) : [...s.allowed_roles, role] };
      }),
    );

  const toggleMenuRole = (moduleKey: string, menuKey: string, role: OrgRole) =>
    setMenuSettings((prev) => {
      const idx = prev.findIndex((m) => m.module_key === moduleKey && m.menu_key === menuKey);
      if (idx === -1) {
        // Not yet in state — default was all roles; removing this one
        const allExcept = ORG_ROLES.filter((r) => r !== role);
        return [...prev, { module_key: moduleKey, menu_key: menuKey, allowed_roles: allExcept }];
      }
      return prev.map((m) => {
        if (m.module_key !== moduleKey || m.menu_key !== menuKey) return m;
        const has = m.allowed_roles.includes(role);
        return { ...m, allowed_roles: has ? m.allowed_roles.filter((r) => r !== role) : [...m.allowed_roles, role] };
      });
    });

  // ── Save ──────────────────────────────────────────────────────────────────────

  const save = async () => {
    if (!selectedOrgId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const headers = await authHeader();
      const res = await fetch(backendUrl("/admin/modules"), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ orgId: selectedOrgId, settings, menuSettings }),
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

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const getMenuRoles = (moduleKey: string, menuKey: string): OrgRole[] => {
    const found = menuSettings.find((m) => m.module_key === moduleKey && m.menu_key === menuKey);
    return found ? found.allowed_roles as OrgRole[] : [...ORG_ROLES]; // default = all
  };

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

  // Group modules by type (specific modules only appear if the org already has them)
  const commonSettings  = settings.filter((s) => !s.specific);
  const specificSettings = settings.filter((s) => s.specific);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page title */}
      <div>
        <h1 className="text-lg font-semibold text-gray-900">จัดการ Modules</h1>
        <p className="mt-1 text-sm text-gray-600">
          เปิด/ปิด module ต่อองค์กร — กำหนด role ระดับ module และระดับ menu
        </p>
      </div>

      {/* Org selector + save */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
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
                    {org.id === selectedOrgId && <span className="h-2 w-2 shrink-0 rounded-full bg-slate-600" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <Button disabled={!selectedOrgId || saving || loading} onClick={() => void save()}>
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </Button>
        {saved && <span className="text-sm text-green-600">บันทึกแล้ว ✓</span>}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      {selectedOrgId && !loading && settings.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white">

          {/* Column header */}
          <div className="grid grid-cols-[28px_1fr_72px_repeat(4,60px)] items-center border-b-2 border-gray-100 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <div />
            <div>Module / Menu</div>
            <div className="text-center">เปิด</div>
            {ORG_ROLES.map((r) => (
              <div key={r} className="text-center" title={ROLE_FULL[r]}>{ROLE_LABEL[r]}</div>
            ))}
          </div>

          {/* ── Module rows renderer ── */}
          {(
            [
              { label: null,          list: commonSettings },
              { label: "เฉพาะองค์กร", list: specificSettings },
            ] as { label: string | null; list: ModuleSetting[] }[]
          ).map(({ label: sectionLabel, list: sectionList }) => {
            if (sectionList.length === 0) return null;
            return (
              <React.Fragment key={sectionLabel ?? "common"}>
                {/* Section header for specific modules */}
                {sectionLabel && (
                  <div className="flex items-center gap-3 border-b border-gray-100 bg-amber-50 px-4 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">{sectionLabel}</span>
                    <span className="text-xs text-amber-500">module เฉพาะสำหรับองค์กรนี้</span>
                  </div>
                )}
                {sectionList.map((s) => {
                  const mod        = ALL_MODULES.find((m) => m.key === s.module_key);
                  if (!mod) return null;
                  const menus      = MODULE_MENUS[mod.key] ?? [];
                  const isExpanded = expandedModules.has(mod.key);

                  return (
                    <div key={mod.key}>
                      {/* ── Module row ── */}
                      <div
                        className="grid grid-cols-[28px_1fr_72px_repeat(4,60px)] items-center border-b border-gray-100 px-4 py-3 hover:bg-gray-50/60"
                      >
                        {/* Expand button */}
                        <button
                          type="button"
                          disabled={menus.length === 0}
                          onClick={() => toggleExpand(mod.key)}
                          className="flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-30"
                        >
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />
                          }
                        </button>

                        {/* Module name */}
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{MODULE_LABELS[mod.key]}</div>
                          {menus.length > 0 && (
                            <div className="text-xs text-gray-400">{menus.length} เมนู</div>
                          )}
                        </div>

                        {/* Enable toggle */}
                        <div className="flex justify-center">
                          <Toggle
                            checked={s.is_enabled}
                            onChange={() => { updateEnabled(mod.key, !s.is_enabled); if (!isExpanded) toggleExpand(mod.key); }}
                          />
                        </div>

                        {/* Module-level role checkboxes */}
                        {ORG_ROLES.map((role) => (
                          <div key={role} className="flex justify-center">
                            <input
                              type="checkbox"
                              title={ROLE_FULL[role]}
                              className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-blue-600 disabled:cursor-not-allowed"
                              checked={s.allowed_roles.includes(role)}
                              disabled={!s.is_enabled}
                              onChange={() => toggleModuleRole(mod.key, role)}
                            />
                          </div>
                        ))}
                      </div>

                      {/* ── Menu rows (accordion) ── */}
                      {isExpanded && menus.map((menu, idx) => {
                        const menuRoles = getMenuRoles(mod.key, menu.key);
                        const isLast    = idx === menus.length - 1;

                        return (
                          <div
                            key={menu.key}
                            className={[
                              "grid grid-cols-[28px_1fr_72px_repeat(4,60px)] items-center bg-slate-50/60 px-4 py-2.5",
                              !isLast ? "border-b border-gray-100" : "border-b border-gray-200",
                            ].join(" ")}
                          >
                            {/* Indent indicator */}
                            <div className="flex justify-center">
                              <span className="h-3 w-px bg-gray-200" />
                            </div>

                            {/* Menu name */}
                            <div className="flex items-center gap-2 pl-2">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                              <span className="text-sm text-gray-700">{menu.label}</span>
                            </div>

                            {/* Empty (no toggle for menus) */}
                            <div />

                            {/* Menu-level role checkboxes */}
                            {ORG_ROLES.map((role) => {
                              const moduleAllows = s.allowed_roles.includes(role);
                              return (
                                <div key={role} className="flex justify-center">
                                  <input
                                    type="checkbox"
                                    title={`${ROLE_FULL[role]}${!moduleAllows ? " (ไม่มีสิทธิ์ module)" : ""}`}
                                    className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                                    checked={menuRoles.includes(role)}
                                    disabled={!s.is_enabled || !moduleAllows}
                                    onChange={() => toggleMenuRole(mod.key, menu.key, role)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {loading && <div className="mt-8 text-center text-sm text-gray-400">กำลังโหลด…</div>}

      {/* Legend */}
      {!loading && settings.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-gray-400">
          {ORG_ROLES.map((r) => (
            <span key={r}><b className="text-gray-500">{ROLE_LABEL[r]}</b> = {ROLE_FULL[r]}</span>
          ))}
          <span className="text-gray-300">|</span>
          <span>row module = สิทธิ์เข้าถึงทั้ง module · row menu = สิทธิ์เห็นเมนูย่อย</span>
        </div>
      )}
    </div>
  );
}
