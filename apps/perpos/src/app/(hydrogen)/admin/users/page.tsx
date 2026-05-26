"use client";

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { Text, Title } from "rizzui/typography";
import {
  Settings2, Building2, KeyRound, Eye, UserX, UserCheck, Trash2, ChevronDown,
} from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/supabase/types";
import { withBasePath } from "@/utils/base-path";
import { backendUrl } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { startImpersonationSession } from "@/components/impersonation-banner";

// ── Types ─────────────────────────────────────────────────────────────────────

type ListedUser = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  invited_at: string | null;
  profile: {
    id: string;
    email: string | null;
    role: Role;
    is_active?: boolean | null;
    line_user_id?: string | null;
    created_at: string;
  } | null;
};

type OrgMembership = { id: string; orgId: string; orgName: string; role: string };
type OrgItem       = { id: string; name: string };
type OrgData       = { memberships: OrgMembership[]; allOrgs: OrgItem[] };

const ORG_ROLES = ["owner", "admin", "team_lead", "team_member"] as const;
type OrgRole = (typeof ORG_ROLES)[number];

const ORG_ROLE_LABELS: Record<string, string> = {
  owner: "Owner", admin: "Admin", team_lead: "Team lead", team_member: "Team member",
};
const ORG_ROLE_OPTIONS  = ORG_ROLES.map((r) => ({ value: r, label: ORG_ROLE_LABELS[r] ?? r }));
const SYSTEM_ROLE_OPTIONS = [
  { value: "user",        label: "user — ต้องกำหนด Org" },
  { value: "super_admin", label: "super admin — คุมทุก Org" },
];

// ── UserActionMenu ─────────────────────────────────────────────────────────────

interface UserActionMenuProps {
  user:            ListedUser;
  isActive:        boolean;
  isToggling:      boolean;
  isDeleting:      boolean;
  isResetting:     boolean;
  isLoadingOrgs:   boolean;
  membershipCount: number | null;
  isExpanded:      boolean;
  canImpersonate:  boolean;
  onToggleStatus:  () => void;
  onDelete:        () => void;
  onResetPassword: () => void;
  onImpersonate:   () => void;
  onToggleOrgs:    () => void;
}

function UserActionMenu({
  user, isActive, isToggling, isDeleting, isResetting,
  isLoadingOrgs, membershipCount, isExpanded, canImpersonate,
  onToggleStatus, onDelete, onResetPassword, onImpersonate, onToggleOrgs,
}: UserActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState<{ top?: number; bottom?: number; right: number }>({ right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const MENU_H = 220; // estimated max height

  function openMenu() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    const fitsBelow = r.bottom + 4 + MENU_H <= window.innerHeight;
    if (fitsBelow) {
      setPos({ top: r.bottom + 4, right });
    } else {
      setPos({ bottom: window.innerHeight - r.top + 4, right });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const orgLabel = isLoadingOrgs ? "…" : membershipCount !== null ? `${membershipCount} org` : "Orgs";

  return (
    <div className="flex justify-center">
      <button
        ref={btnRef}
        onClick={() => open ? setOpen(false) : openMenu()}
        title="การจัดการ"
        className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
          open
            ? "border-blue-300 bg-blue-50 text-blue-600"
            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700"
        }`}
      >
        <Settings2 className="h-3.5 w-3.5" />
      </button>

      {open && typeof window !== "undefined" && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
        >
          {/* Orgs */}
          <MenuItem
            icon={<Building2 className="h-3.5 w-3.5" />}
            label={orgLabel}
            badge={isExpanded ? <ChevronDown className="h-3 w-3 opacity-50" /> : undefined}
            onClick={() => { onToggleOrgs(); setOpen(false); }}
            className="text-gray-700 hover:bg-gray-50"
          />

          {/* Reset password */}
          <MenuItem
            icon={<KeyRound className="h-3.5 w-3.5" />}
            label={isResetting ? "กำลังสร้าง…" : "Reset Password"}
            onClick={() => { onResetPassword(); setOpen(false); }}
            disabled={isResetting || !user.email}
            className="text-amber-700 hover:bg-amber-50"
          />

          {/* View As */}
          {canImpersonate && (
            <MenuItem
              icon={<Eye className="h-3.5 w-3.5" />}
              label="View As"
              onClick={() => { onImpersonate(); setOpen(false); }}
              className="text-orange-700 hover:bg-orange-50"
            />
          )}

          <div className="my-1 h-px bg-gray-100" />

          {/* Toggle status */}
          <MenuItem
            icon={isActive
              ? <UserX className="h-3.5 w-3.5" />
              : <UserCheck className="h-3.5 w-3.5" />}
            label={isToggling ? "กำลังอัปเดต…" : isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
            onClick={() => { onToggleStatus(); setOpen(false); }}
            disabled={isToggling}
            className={isActive ? "text-gray-600 hover:bg-gray-50" : "text-green-700 hover:bg-green-50"}
          />

          <div className="my-1 h-px bg-gray-100" />

          {/* Delete */}
          <MenuItem
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label={isDeleting ? "กำลังลบ…" : "ลบผู้ใช้"}
            onClick={() => { onDelete(); setOpen(false); }}
            disabled={isDeleting}
            className="text-red-600 hover:bg-red-50"
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon, label, badge, onClick, disabled, className,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium disabled:opacity-40 ${className ?? ""}`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const { role, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [items,   setItems]   = useState<ListedUser[]>([]);
  const [error,   setError]   = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionLink, setActionLink] = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole,  setInviteRole]  = useState<string>("user");
  const [inviteMappings, setInviteMappings] = useState<{ orgId: string; orgRole: OrgRole }[]>([
    { orgId: "", orgRole: "team_member" },
  ]);
  const [allOrgs, setAllOrgs] = useState<OrgItem[]>([]);

  // Org panel
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [orgData,        setOrgData]        = useState<Record<string, OrgData>>({});
  const [orgLoading,     setOrgLoading]     = useState<string | null>(null);
  const [orgError,       setOrgError]       = useState<string | null>(null);
  const [addOrgId,       setAddOrgId]       = useState<Record<string, string>>({});
  const [addOrgRole,     setAddOrgRole]     = useState<Record<string, OrgRole>>({});

  // Per-user action states
  const [deletingUserId,  setDeletingUserId]  = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [togglingUserId,  setTogglingUserId]  = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; userId: string; email: string | null }>({ open: false, userId: '', email: null });

  // Impersonation modal
  const [impersonateTarget,  setImpersonateTarget]  = useState<ListedUser | null>(null);
  const [impersonateReason,  setImpersonateReason]  = useState("");
  const [impersonateOrgId,   setImpersonateOrgId]   = useState("");
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const [impersonateError,   setImpersonateError]   = useState<string | null>(null);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  const refreshUsers = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true); setError(null); setMessage(null);
      try {
        const headers = await authHeader();
        const res  = await fetch(backendUrl("/admin/users/list?page=1&perPage=200"), { headers });
        const json = await res.json().catch(() => null);
        if (!res.ok) { setError(json?.error ?? "โหลดรายการผู้ใช้ไม่สำเร็จ"); setItems([]); }
        else          { setItems((json?.items ?? []) as ListedUser[]); }
      } catch (e: unknown) {
        setError((e as Error)?.message ?? "โหลดรายการผู้ใช้ไม่สำเร็จ"); setItems([]);
      } finally { setLoading(false); }
    });
  }, [authHeader]);

  const loadOrgData = useCallback(async (userId: string) => {
    setOrgLoading(userId); setOrgError(null);
    try {
      const headers = await authHeader();
      const res  = await fetch(backendUrl(`/admin/users/orgs?userId=${userId}`), { headers });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setOrgError(json?.error ?? "โหลดข้อมูล org ไม่สำเร็จ"); }
      else          { setOrgData((prev) => ({ ...prev, [userId]: json as OrgData })); }
    } catch (e: unknown) { setOrgError((e as Error)?.message ?? "โหลดข้อมูล org ไม่สำเร็จ"); }
    finally { setOrgLoading(null); }
  }, [authHeader]);

  const toggleExpand = useCallback((userId: string) => {
    if (expandedUserId === userId) { setExpandedUserId(null); return; }
    setExpandedUserId(userId);
    if (!orgData[userId]) loadOrgData(userId);
  }, [expandedUserId, orgData, loadOrgData]);

  const handleRoleChange = useCallback(async (userId: string, orgId: string, newRole: OrgRole) => {
    try {
      const headers = await authHeader();
      const res  = await fetch(backendUrl("/admin/users/orgs"), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ userId, orgId, role: newRole }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setOrgError(json?.error ?? "อัปเดต role ไม่สำเร็จ"); return; }
      setOrgData((prev) => {
        const d = prev[userId];
        if (!d) return prev;
        return { ...prev, [userId]: { ...d, memberships: d.memberships.map((m) => m.orgId === orgId ? { ...m, role: newRole } : m) } };
      });
    } catch (e: unknown) { setOrgError((e as Error)?.message ?? "อัปเดต role ไม่สำเร็จ"); }
  }, [authHeader]);

  const handleRemoveMembership = useCallback(async (userId: string, orgId: string) => {
    try {
      const headers = await authHeader();
      const res  = await fetch(backendUrl("/admin/users/orgs"), {
        method: "DELETE",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ userId, orgId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setOrgError(json?.error ?? "ลบ membership ไม่สำเร็จ"); return; }
      setOrgData((prev) => {
        const d = prev[userId];
        if (!d) return prev;
        return { ...prev, [userId]: { ...d, memberships: d.memberships.filter((m) => m.orgId !== orgId) } };
      });
    } catch (e: unknown) { setOrgError((e as Error)?.message ?? "ลบ membership ไม่สำเร็จ"); }
  }, [authHeader]);

  const handleAddMembership = useCallback(async (userId: string) => {
    const selectedOrgId = addOrgId[userId] ?? "";
    const selectedRole  = addOrgRole[userId] ?? "team_member";
    if (!selectedOrgId) return;
    try {
      const headers = await authHeader();
      const res  = await fetch(backendUrl("/admin/users/orgs"), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ userId, orgId: selectedOrgId, role: selectedRole }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setOrgError(json?.error ?? "เพิ่ม org ไม่สำเร็จ"); return; }
      await loadOrgData(userId);
      setAddOrgId((prev)   => ({ ...prev, [userId]: "" }));
      setAddOrgRole((prev) => ({ ...prev, [userId]: "team_member" }));
    } catch (e: unknown) { setOrgError((e as Error)?.message ?? "เพิ่ม org ไม่สำเร็จ"); }
  }, [authHeader, addOrgId, addOrgRole, loadOrgData]);

  const handleToggleStatus = useCallback(async (userId: string, currentActive: boolean) => {
    setTogglingUserId(userId);
    try {
      const headers = await authHeader();
      const res  = await fetch(backendUrl("/admin/users/status"), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ userId, isActive: !currentActive }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError(json?.error ?? "อัปเดตสถานะไม่สำเร็จ"); }
      else {
        setItems((prev) =>
          prev.map((u) => u.id === userId && u.profile
            ? { ...u, profile: { ...u.profile, is_active: !currentActive } }
            : u,
          ),
        );
      }
    } catch (e: unknown) { setError((e as Error)?.message ?? "อัปเดตสถานะไม่สำเร็จ"); }
    finally { setTogglingUserId(null); }
  }, [authHeader]);

  const doDeleteUser = useCallback(async () => {
    const { userId, email } = deleteConfirm;
    setDeletingUserId(userId);
    setDeleteConfirm({ open: false, userId: '', email: null });
    try {
      const headers = await authHeader();
      const res  = await fetch(backendUrl("/admin/users/delete"), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError(json?.error ?? "ลบผู้ใช้ไม่สำเร็จ"); }
      else          { setMessage(`ลบ ${email ?? userId} แล้ว`); refreshUsers(); }
    } catch (e: unknown) { setError((e as Error)?.message ?? "ลบผู้ใช้ไม่สำเร็จ"); }
    finally { setDeletingUserId(null); }
  }, [authHeader, refreshUsers, deleteConfirm]);

  const handleResetPassword = useCallback(async (email: string | null) => {
    if (!email) return;
    setResettingUserId(email);
    try {
      const headers = await authHeader();
      const redirectTo = `${window.location.origin}${withBasePath("/auth/password")}`;
      const res  = await fetch(backendUrl("/admin/users/reset-password"), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ email, redirectTo }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError(json?.error ?? "สร้างลิงก์ reset password ไม่สำเร็จ"); }
      else {
        const link = json?.actionLink as string | null;
        if (link) { setActionLink(link); await navigator.clipboard.writeText(link).catch(() => undefined); }
        setMessage(json?.emailSent
          ? `ส่งอีเมล reset password ไปที่ ${email} แล้ว`
          : "สร้างลิงก์ reset password แล้ว (คัดลอกไว้ในคลิปบอร์ด)");
      }
    } catch (e: unknown) { setError((e as Error)?.message ?? "สร้างลิงก์ reset password ไม่สำเร็จ"); }
    finally { setResettingUserId(null); }
  }, [authHeader]);

  const handleStartImpersonation = useCallback(async () => {
    if (!impersonateTarget || !impersonateOrgId || !impersonateReason.trim()) return;
    setImpersonateLoading(true); setImpersonateError(null);
    try {
      const headers = await authHeader();
      const res  = await fetch(backendUrl("/admin/impersonate"), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ targetUserId: impersonateTarget.id, orgId: impersonateOrgId, reason: impersonateReason.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setImpersonateError(json?.error ?? "เริ่ม session ไม่สำเร็จ"); return; }
      startImpersonationSession(json.sessionId as string);
      setImpersonateTarget(null); setImpersonateReason(""); setImpersonateOrgId("");
    } catch (e: unknown) { setImpersonateError((e as Error)?.message ?? "เริ่ม session ไม่สำเร็จ"); }
    finally { setImpersonateLoading(false); }
  }, [impersonateTarget, impersonateOrgId, impersonateReason, authHeader]);

  React.useEffect(() => { refreshUsers(); }, [refreshUsers]);

  useEffect(() => {
    authHeader().then(async (h) => {
      const res  = await fetch(backendUrl("/admin/users/orgs"), { headers: h });
      const json = await res.json().catch(() => null);
      if (json?.allOrgs) setAllOrgs(json.allOrgs as OrgItem[]);
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allOrgOptions = useMemo(
    () => [{ value: "", label: "— เลือก Org —" }, ...allOrgs.map((o) => ({ value: o.id, label: o.name }))],
    [allOrgs],
  );

  if (authLoading) return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <Title as="h1" className="text-lg font-semibold text-gray-900">กำลังโหลด…</Title>
    </div>
  );

  if (role === null) return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <Title as="h1" className="text-lg font-semibold text-gray-900">ไม่พบสิทธิ์ผู้ใช้</Title>
      <Text className="mt-2 text-sm text-gray-600">ระบบไม่พบข้อมูล role ในโปรไฟล์ (profiles) ของบัญชีนี้</Text>
    </div>
  );

  if (role !== "super_admin") return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <Title as="h1" className="text-lg font-semibold text-gray-900">ไม่มีสิทธิ์เข้าถึงหน้านี้</Title>
      <Text className="mt-2 text-sm text-gray-600">หน้านี้สำหรับ Admin เท่านั้น</Text>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">User Management</Title>
          <Text className="mt-1 text-sm text-gray-600">ระบบ invite-only • roles: admin / user</Text>
        </div>
        <Button variant="outline" onClick={() => refreshUsers()} disabled={loading}>รีเฟรช</Button>
      </div>

      {/* ── Invite form ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-700">เชิญผู้ใช้ใหม่</p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
          <div className="space-y-1.5">
            <Label>อีเมล</Label>
            <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@example.com" disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <Label>Role ระบบ</Label>
            <CustomSelect value={inviteRole} onChange={(v) => setInviteRole(v)} options={SYSTEM_ROLE_OPTIONS} disabled={loading} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Org และสิทธิ์ภายใน Org
            {inviteRole === "super_admin" && <span className="ml-1 text-gray-400 normal-case font-normal">(super admin เห็นทุก org ในระบบ)</span>}
          </p>
          {inviteMappings.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1">
                <CustomSelect
                  value={m.orgId}
                  onChange={(v) => setInviteMappings((prev) => prev.map((x, j) => j === i ? { ...x, orgId: v } : x))}
                  placeholder="เลือก Org"
                  options={allOrgOptions}
                  disabled={loading}
                />
              </div>
              <div className="w-40">
                <CustomSelect
                  value={m.orgRole}
                  onChange={(v) => setInviteMappings((prev) => prev.map((x, j) => j === i ? { ...x, orgRole: v as OrgRole } : x))}
                  options={ORG_ROLE_OPTIONS}
                  disabled={loading || !m.orgId}
                />
              </div>
              {inviteMappings.length > 1 && (
                <button type="button" onClick={() => setInviteMappings((prev) => prev.filter((_, j) => j !== i))}
                  className="text-red-400 hover:text-red-600 px-1 text-lg leading-none" disabled={loading}>×</button>
              )}
            </div>
          ))}
          <button type="button"
            onClick={() => setInviteMappings((prev) => [...prev, { orgId: "", orgRole: "team_member" }])}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium" disabled={loading}>
            + เพิ่ม Org
          </button>
        </div>

        <Button
          disabled={loading || !inviteEmail.trim() || inviteMappings.every((m) => !m.orgId)}
          onClick={async () => {
            const email = inviteEmail.trim();
            if (!email) return;
            setLoading(true); setError(null); setMessage(null); setActionLink(null);
            try {
              const headers  = await authHeader();
              const redirectTo = `${window.location.origin}${withBasePath("/auth/password")}`;
              const res  = await fetch(backendUrl("/admin/users/invite"), {
                method: "POST",
                headers: { ...headers, "content-type": "application/json" },
                body: JSON.stringify({ email, role: inviteRole, redirectTo }),
              });
              const json = await res.json().catch(() => null);
              const link = (json?.actionLink as string | undefined) ?? null;
              if (link) { setActionLink(link); await navigator.clipboard.writeText(link).catch(() => undefined); }
              if (!res.ok) { setError(String(json?.error ?? "ส่ง invite ไม่สำเร็จ")); return; }

              const newUserId = (json?.userId as string | undefined) ?? null;
              if (newUserId) {
                await Promise.all(
                  inviteMappings.filter((m) => m.orgId).map(async (m) => {
                    try {
                      const h2 = await authHeader();
                      await fetch(backendUrl("/admin/users/orgs"), {
                        method: "PUT",
                        headers: { ...h2, "content-type": "application/json" },
                        body: JSON.stringify({ userId: newUserId, orgId: m.orgId, role: m.orgRole }),
                      });
                    } catch { /* non-critical */ }
                  }),
                );
              }

              setMessage(Boolean(json?.emailSent)
                ? "✅ ส่งอีเมลเชิญไปที่ " + email + " แล้ว"
                : "สร้างลิงก์เชิญแล้ว (คัดลอกไว้ในคลิปบอร์ด)" + (json?.smtpError ? ` — ส่งเมลไม่สำเร็จ: ${String(json.smtpError)}` : ""));
              setInviteEmail(""); setInviteRole("user"); setInviteMappings([{ orgId: "", orgRole: "team_member" }]);
              refreshUsers();
            } catch (e: unknown) { setError((e as Error)?.message ?? "ส่ง invite ไม่สำเร็จ"); }
            finally { setLoading(false); }
          }}
        >
          เชิญผู้ใช้
        </Button>
      </div>

      {/* Feedback */}
      {error   && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>}
      {actionLink && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <div className="font-medium text-gray-900">ลิงก์สำหรับตั้งรหัสผ่าน</div>
          <div className="mt-2 break-all rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">{actionLink}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard.writeText(actionLink).catch(() => undefined); setMessage("คัดลอกลิงก์แล้ว"); }}>คัดลอกลิงก์</Button>
            <Button variant="outline" size="sm" onClick={() => window.open(actionLink, "_blank", "noopener,noreferrer")}>เปิดลิงก์</Button>
          </div>
        </div>
      )}

      {orgError && <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700">{orgError}</div>}

      {/* ── Impersonation modal ── */}
      <Dialog open={!!impersonateTarget} onOpenChange={(open) => { if (!open) { setImpersonateTarget(null); setImpersonateReason(""); setImpersonateOrgId(""); setImpersonateError(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <span>⚠️</span><span>สวมรอยเป็นผู้ใช้</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-600">ผู้ใช้เป้าหมาย</p>
              <p className="mt-1 font-medium text-gray-900">{impersonateTarget?.email ?? "—"}</p>
              <p className="text-xs text-gray-500">{impersonateTarget?.id}</p>
            </div>
            <div className="space-y-1.5">
              <Label>บริบทองค์กร <span className="text-red-500">*</span></Label>
              <CustomSelect
                value={impersonateOrgId}
                onChange={(v) => setImpersonateOrgId(v)}
                options={[{ value: "", label: "— เลือกองค์กร —" }, ...allOrgs.map((o) => ({ value: o.id, label: o.name }))]}
                disabled={impersonateLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label>เหตุผล <span className="text-red-500">*</span></Label>
              <textarea
                value={impersonateReason}
                onChange={(e) => setImpersonateReason(e.target.value)}
                placeholder="ระบุเหตุผลที่ต้องสวมรอย เช่น 'ช่วย debug ปัญหา invoice #123'"
                rows={3}
                disabled={impersonateLoading}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50 resize-none"
              />
            </div>
            {impersonateError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{impersonateError}</div>}
            <p className="text-xs text-gray-500">Session จะหมดอายุอัตโนมัติใน <strong>30 นาที</strong> และถูกบันทึกใน audit log ทุกครั้ง</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setImpersonateTarget(null)} disabled={impersonateLoading}>ยกเลิก</Button>
            <Button variant="destructive" onClick={handleStartImpersonation} disabled={impersonateLoading || !impersonateOrgId || !impersonateReason.trim()}>
              {impersonateLoading ? "กำลังเริ่ม…" : "เริ่มสวมรอย"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── User list ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_100px_130px_80px_44px] gap-0 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">
          <div>อีเมล</div>
          <div>Role</div>
          <div>สถานะ</div>
          <div>LINE</div>
          <div className="text-center">⚙</div>
        </div>

        <div className="divide-y divide-gray-100">
          {items.map((u) => {
            const isExpanded      = expandedUserId === u.id;
            const data            = orgData[u.id];
            const membershipCount = data?.memberships.length ?? null;
            const isLoadingOrgs   = orgLoading === u.id;
            const isDeleting      = deletingUserId === u.id;
            const isResetting     = resettingUserId === u.email;
            const isToggling      = togglingUserId === u.id;
            const isActive        = u.profile?.is_active !== false;
            const hasSigned       = !!u.last_sign_in_at;
            const isPending       = !!u.invited_at && !hasSigned;

            return (
              <div key={u.id}>
                <div className="grid grid-cols-[1fr_100px_130px_80px_44px] items-center gap-0 px-4 py-3 text-sm">
                  {/* Email */}
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900">{u.email ?? "-"}</div>
                    <div className="truncate text-xs text-gray-400">{u.id}</div>
                  </div>

                  {/* Role */}
                  <div className="text-gray-700 text-xs">{u.profile?.role ?? "-"}</div>

                  {/* Status badge only */}
                  <div>
                    {!isActive ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">ปิดใช้งาน</span>
                    ) : isPending ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-600">รอตั้งรหัส</span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">ใช้งานได้</span>
                    )}
                  </div>

                  {/* LINE */}
                  <div className="text-xs text-gray-500">
                    {u.profile?.line_user_id ? "เชื่อมแล้ว" : "—"}
                  </div>

                  {/* Settings icon → popover */}
                  <UserActionMenu
                    user={u}
                    isActive={isActive}
                    isToggling={isToggling}
                    isDeleting={isDeleting}
                    isResetting={isResetting}
                    isLoadingOrgs={isLoadingOrgs}
                    membershipCount={membershipCount}
                    isExpanded={isExpanded}
                    canImpersonate={u.profile?.role !== "super_admin"}
                    onToggleStatus={() => handleToggleStatus(u.id, isActive)}
                    onDelete={() => setDeleteConfirm({ open: true, userId: u.id, email: u.email })}
                    onResetPassword={() => handleResetPassword(u.email)}
                    onImpersonate={() => {
                      setImpersonateTarget(u);
                      setImpersonateReason("");
                      setImpersonateError(null);
                      const orgId = orgData[u.id]?.memberships.length === 1
                        ? orgData[u.id].memberships[0].orgId : "";
                      setImpersonateOrgId(orgId);
                    }}
                    onToggleOrgs={() => toggleExpand(u.id)}
                  />
                </div>

                {/* Expanded org panel */}
                {isExpanded && (
                  <div className="border-b border-indigo-100 bg-indigo-50/30 px-4 py-4">
                    {isLoadingOrgs ? (
                      <div className="text-sm text-gray-500">กำลังโหลด…</div>
                    ) : data ? (
                      <div className="space-y-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">สมาชิก Organizations</div>

                        {data.memberships.length === 0 ? (
                          <div className="text-sm text-gray-500">ยังไม่มี org</div>
                        ) : (
                          <div className="space-y-2">
                            {data.memberships.map((m) => (
                              <div key={m.id} className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-white px-3 py-2">
                                <span className="flex-1 text-sm font-medium text-gray-800">{m.orgName}</span>
                                <div className="w-36">
                                  <CustomSelect
                                    value={m.role}
                                    onChange={(v) => handleRoleChange(u.id, m.orgId, v as OrgRole)}
                                    options={ORG_ROLE_OPTIONS}
                                  />
                                </div>
                                <button onClick={() => handleRemoveMembership(u.id, m.orgId)}
                                  className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700">ลบ</button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add org row */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className="text-xs font-medium text-gray-600">เพิ่ม Org:</span>
                          <div className="w-52">
                            <CustomSelect
                              value={addOrgId[u.id] ?? ""}
                              onChange={(v) => setAddOrgId((prev) => ({ ...prev, [u.id]: v }))}
                              options={[
                                { value: "", label: "— เลือก org —" },
                                ...data.allOrgs
                                  .filter((o) => !data.memberships.some((m) => m.orgId === o.id))
                                  .map((o) => ({ value: o.id, label: o.name })),
                              ]}
                            />
                          </div>
                          <div className="w-36">
                            <CustomSelect
                              value={addOrgRole[u.id] ?? "team_member"}
                              onChange={(v) => setAddOrgRole((prev) => ({ ...prev, [u.id]: v as OrgRole }))}
                              options={ORG_ROLE_OPTIONS}
                              disabled={!addOrgId[u.id]}
                            />
                          </div>
                          <Button size="sm" disabled={!addOrgId[u.id]} onClick={() => handleAddMembership(u.id)}>เพิ่ม</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">ไม่สามารถโหลดข้อมูลได้</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="px-4 py-6 text-sm text-gray-600">ยังไม่มีข้อมูล</div>
          )}
        </div>
      </div>

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => setDeleteConfirm((s) => ({ ...s, open: o }))}
        title={`ลบผู้ใช้ "${deleteConfirm.email ?? deleteConfirm.userId}"`}
        description="การกระทำนี้ไม่สามารถย้อนกลับได้"
        onConfirm={doDeleteUser}
        loading={!!deletingUserId}
      />
    </div>
  );
}
