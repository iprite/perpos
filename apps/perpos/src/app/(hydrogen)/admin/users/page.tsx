"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text, Title } from "rizzui/typography";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/supabase/types";
import { withBasePath } from "@/utils/base-path";
import { backendUrl } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";

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

type OrgMembership = {
  id: string;
  orgId: string;
  orgName: string;
  role: string;
};

type OrgItem = {
  id: string;
  name: string;
};

type OrgData = {
  memberships: OrgMembership[];
  allOrgs: OrgItem[];
};

const ORG_ROLES = ["owner", "admin", "management", "member"] as const;
type OrgRole = (typeof ORG_ROLES)[number];

const ORG_ROLE_OPTIONS = ORG_ROLES.map((r) => ({ value: r, label: r }));
const SYSTEM_ROLE_OPTIONS = [
  { value: "user", label: "user — ต้องกำหนด Org" },
  { value: "admin", label: "admin — คุมทุก Org" },
];

export default function AdminUsersPage() {
  const { role, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ListedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionLink, setActionLink] = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("user");
  const [inviteMappings, setInviteMappings] = useState<{ orgId: string; orgRole: OrgRole }[]>([
    { orgId: "", orgRole: "member" },
  ]);
  const [allOrgs, setAllOrgs] = useState<OrgItem[]>([]);

  // Org panel state
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [orgData, setOrgData] = useState<Record<string, OrgData>>({});
  const [orgLoading, setOrgLoading] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Add-org form state per user
  const [addOrgId, setAddOrgId] = useState<Record<string, string>>({});
  const [addOrgRole, setAddOrgRole] = useState<Record<string, OrgRole>>({});

  // Per-user action states
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  const refreshUsers = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
        const headers = await authHeader();
        const res = await fetch(backendUrl("/admin/users/list?page=1&perPage=200"), { headers });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.error ?? "โหลดรายการผู้ใช้ไม่สำเร็จ");
          setItems([]);
          setLoading(false);
          return;
        }
        setItems((json?.items ?? []) as ListedUser[]);
        setLoading(false);
      } catch (e: unknown) {
        setError((e as Error)?.message ?? "โหลดรายการผู้ใช้ไม่สำเร็จ");
        setItems([]);
        setLoading(false);
      }
    });
  }, [authHeader]);

  const loadOrgData = useCallback(
    async (userId: string) => {
      setOrgLoading(userId);
      setOrgError(null);
      try {
        const headers = await authHeader();
        const res = await fetch(backendUrl(`/admin/users/orgs?userId=${userId}`), { headers });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setOrgError(json?.error ?? "โหลดข้อมูล org ไม่สำเร็จ");
          setOrgLoading(null);
          return;
        }
        setOrgData((prev) => ({ ...prev, [userId]: json as OrgData }));
        setOrgLoading(null);
      } catch (e: unknown) {
        setOrgError((e as Error)?.message ?? "โหลดข้อมูล org ไม่สำเร็จ");
        setOrgLoading(null);
      }
    },
    [authHeader],
  );

  const toggleExpand = useCallback(
    (userId: string) => {
      if (expandedUserId === userId) {
        setExpandedUserId(null);
        return;
      }
      setExpandedUserId(userId);
      if (!orgData[userId]) {
        loadOrgData(userId);
      }
    },
    [expandedUserId, orgData, loadOrgData],
  );

  const handleRoleChange = useCallback(
    async (userId: string, orgId: string, newRole: OrgRole) => {
      try {
        const headers = await authHeader();
        const res = await fetch(backendUrl("/admin/users/orgs"), {
          method: "PUT",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ userId, orgId, role: newRole }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setOrgError(json?.error ?? "อัปเดต role ไม่สำเร็จ");
          return;
        }
        setOrgData((prev) => {
          const d = prev[userId];
          if (!d) return prev;
          return {
            ...prev,
            [userId]: {
              ...d,
              memberships: d.memberships.map((m) => (m.orgId === orgId ? { ...m, role: newRole } : m)),
            },
          };
        });
      } catch (e: unknown) {
        setOrgError((e as Error)?.message ?? "อัปเดต role ไม่สำเร็จ");
      }
    },
    [authHeader],
  );

  const handleRemoveMembership = useCallback(
    async (userId: string, orgId: string) => {
      try {
        const headers = await authHeader();
        const res = await fetch(backendUrl("/admin/users/orgs"), {
          method: "DELETE",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ userId, orgId }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setOrgError(json?.error ?? "ลบ membership ไม่สำเร็จ");
          return;
        }
        setOrgData((prev) => {
          const d = prev[userId];
          if (!d) return prev;
          return {
            ...prev,
            [userId]: {
              ...d,
              memberships: d.memberships.filter((m) => m.orgId !== orgId),
            },
          };
        });
      } catch (e: unknown) {
        setOrgError((e as Error)?.message ?? "ลบ membership ไม่สำเร็จ");
      }
    },
    [authHeader],
  );

  const handleAddMembership = useCallback(
    async (userId: string) => {
      const selectedOrgId = addOrgId[userId] ?? "";
      const selectedRole = addOrgRole[userId] ?? "member";
      if (!selectedOrgId) return;
      try {
        const headers = await authHeader();
        const res = await fetch(backendUrl("/admin/users/orgs"), {
          method: "PUT",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ userId, orgId: selectedOrgId, role: selectedRole }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setOrgError(json?.error ?? "เพิ่ม org ไม่สำเร็จ");
          return;
        }
        await loadOrgData(userId);
        setAddOrgId((prev) => ({ ...prev, [userId]: "" }));
        setAddOrgRole((prev) => ({ ...prev, [userId]: "member" }));
      } catch (e: unknown) {
        setOrgError((e as Error)?.message ?? "เพิ่ม org ไม่สำเร็จ");
      }
    },
    [authHeader, addOrgId, addOrgRole, loadOrgData],
  );

  const handleToggleStatus = useCallback(
    async (userId: string, currentActive: boolean) => {
      setTogglingUserId(userId);
      try {
        const headers = await authHeader();
        const res = await fetch(backendUrl("/admin/users/status"), {
          method: "PUT",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ userId, isActive: !currentActive }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.error ?? "อัปเดตสถานะไม่สำเร็จ");
        } else {
          setItems((prev) =>
            prev.map((u) =>
              u.id === userId && u.profile
                ? { ...u, profile: { ...u.profile, is_active: !currentActive } }
                : u,
            ),
          );
        }
      } catch (e: unknown) {
        setError((e as Error)?.message ?? "อัปเดตสถานะไม่สำเร็จ");
      } finally {
        setTogglingUserId(null);
      }
    },
    [authHeader],
  );

  const handleDeleteUser = useCallback(
    async (userId: string, email: string | null) => {
      if (!confirm(`ลบผู้ใช้ "${email ?? userId}" ออกจากระบบ?\nการกระทำนี้ไม่สามารถย้อนกลับได้`)) return;
      setDeletingUserId(userId);
      try {
        const headers = await authHeader();
        const res = await fetch(backendUrl("/admin/users/delete"), {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.error ?? "ลบผู้ใช้ไม่สำเร็จ");
        } else {
          setMessage(`ลบ ${email ?? userId} แล้ว`);
          refreshUsers();
        }
      } catch (e: unknown) {
        setError((e as Error)?.message ?? "ลบผู้ใช้ไม่สำเร็จ");
      } finally {
        setDeletingUserId(null);
      }
    },
    [authHeader, refreshUsers],
  );

  const handleResetPassword = useCallback(
    async (email: string | null) => {
      if (!email) return;
      setResettingUserId(email);
      try {
        const headers = await authHeader();
        const redirectTo = `${window.location.origin}${withBasePath("/auth/password")}`;
        const res = await fetch(backendUrl("/admin/users/reset-password"), {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ email, redirectTo }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.error ?? "สร้างลิงก์ reset password ไม่สำเร็จ");
        } else {
          const link = json?.actionLink as string | null;
          if (link) {
            setActionLink(link);
            await navigator.clipboard.writeText(link).catch(() => undefined);
          }
          if (json?.emailSent) {
            setMessage(`ส่งอีเมล reset password ไปที่ ${email} แล้ว`);
          } else {
            setMessage("สร้างลิงก์ reset password แล้ว (คัดลอกไว้ในคลิปบอร์ด)");
          }
        }
      } catch (e: unknown) {
        setError((e as Error)?.message ?? "สร้างลิงก์ reset password ไม่สำเร็จ");
      } finally {
        setResettingUserId(null);
      }
    },
    [authHeader],
  );

  React.useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  // Load orgs list once for the invite form
  useEffect(() => {
    authHeader()
      .then(async (h) => {
        const res = await fetch(backendUrl("/admin/users/orgs"), { headers: h });
        const json = await res.json().catch(() => null);
        if (json?.allOrgs) setAllOrgs(json.allOrgs as OrgItem[]);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allOrgOptions = useMemo(
    () => [{ value: "", label: "— เลือก Org —" }, ...allOrgs.map((o) => ({ value: o.id, label: o.name }))],
    [allOrgs],
  );

  if (authLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <Title as="h1" className="text-lg font-semibold text-gray-900">กำลังโหลด…</Title>
      </div>
    );
  }

  if (role === null) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <Title as="h1" className="text-lg font-semibold text-gray-900">ไม่พบสิทธิ์ผู้ใช้</Title>
        <Text className="mt-2 text-sm text-gray-600">ระบบไม่พบข้อมูล role ในโปรไฟล์ (profiles) ของบัญชีนี้</Text>
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <Title as="h1" className="text-lg font-semibold text-gray-900">ไม่มีสิทธิ์เข้าถึงหน้านี้</Title>
        <Text className="mt-2 text-sm text-gray-600">หน้านี้สำหรับ Admin เท่านั้น</Text>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">จัดการผู้ใช้</Title>
          <Text className="mt-1 text-sm text-gray-600">ระบบ invite-only • roles: admin / user</Text>
        </div>
        <Button variant="outline" onClick={() => refreshUsers()} disabled={loading}>รีเฟรช</Button>
      </div>

      {/* ── Invite form ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-700">เชิญผู้ใช้ใหม่</p>

        {/* Email + System role */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
          <div className="space-y-1.5">
            <Label>อีเมล</Label>
            <Input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@example.com"
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role ระบบ</Label>
            <CustomSelect
              value={inviteRole}
              onChange={(v) => setInviteRole(v as Role)}
              options={SYSTEM_ROLE_OPTIONS}
              disabled={loading}
            />
          </div>
        </div>

        {/* Org mappings — user only */}
        {inviteRole === "user" && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Org ที่เข้าถึงได้</p>
            {inviteMappings.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <CustomSelect
                    value={m.orgId}
                    onChange={(v) =>
                      setInviteMappings((prev) => prev.map((x, j) => (j === i ? { ...x, orgId: v } : x)))
                    }
                    placeholder="เลือก Org"
                    options={allOrgOptions}
                    disabled={loading}
                  />
                </div>
                <div className="w-40">
                  <CustomSelect
                    value={m.orgRole}
                    onChange={(v) =>
                      setInviteMappings((prev) => prev.map((x, j) => (j === i ? { ...x, orgRole: v as OrgRole } : x)))
                    }
                    options={ORG_ROLE_OPTIONS}
                    disabled={loading || !m.orgId}
                  />
                </div>
                {inviteMappings.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setInviteMappings((prev) => prev.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-600 px-1 text-lg leading-none"
                    disabled={loading}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setInviteMappings((prev) => [...prev, { orgId: "", orgRole: "member" }])}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              disabled={loading}
            >
              + เพิ่ม Org
            </button>
          </div>
        )}

        {inviteRole === "admin" && (
          <p className="text-xs text-gray-400 italic">Admin มีสิทธิ์เข้าถึงทุก Org โดยอัตโนมัติ</p>
        )}

        <Button
          disabled={
            loading ||
            !inviteEmail.trim() ||
            (inviteRole === "user" && inviteMappings.every((m) => !m.orgId))
          }
          onClick={async () => {
            const email = inviteEmail.trim();
            if (!email) return;
            setLoading(true);
            setError(null);
            setMessage(null);
            setActionLink(null);
            try {
              const headers = await authHeader();
              const redirectTo = `${window.location.origin}${withBasePath("/auth/password")}`;
              const res = await fetch(backendUrl("/admin/users/invite"), {
                method: "POST",
                headers: { ...headers, "content-type": "application/json" },
                body: JSON.stringify({ email, role: inviteRole, redirectTo }),
              });
              const json = await res.json().catch(() => null);
              const link = (json?.actionLink as string | undefined) ?? null;
              if (link) {
                setActionLink(link);
                await navigator.clipboard.writeText(link).catch(() => undefined);
              }
              if (!res.ok) {
                setError(String(json?.error ?? "ส่ง invite ไม่สำเร็จ"));
                setLoading(false);
                return;
              }

              // Auto-add org memberships for user role
              const newUserId = (json?.userId as string | undefined) ?? null;
              if (newUserId && inviteRole === "user") {
                const validMappings = inviteMappings.filter((m) => m.orgId);
                await Promise.all(
                  validMappings.map(async (m) => {
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

              setMessage(Boolean(json?.emailSent) ? "ส่งอีเมลเชิญแล้ว" : "สร้างลิงก์เชิญแล้ว (คัดลอกไว้ในคลิปบอร์ด)");
              setInviteEmail("");
              setInviteRole("user");
              setInviteMappings([{ orgId: "", orgRole: "member" }]);
              setLoading(false);
              refreshUsers();
            } catch (e: unknown) {
              setError((e as Error)?.message ?? "ส่ง invite ไม่สำเร็จ");
              setLoading(false);
            }
          }}
        >
          เชิญผู้ใช้
        </Button>
      </div>

      {/* Feedback messages */}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>}
      {actionLink && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <div className="font-medium text-gray-900">ลิงก์สำหรับตั้งรหัสผ่าน</div>
          <div className="mt-2 break-all rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">{actionLink}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(actionLink).catch(() => undefined);
                setMessage("คัดลอกลิงก์แล้ว");
              }}
            >
              คัดลอกลิงก์
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open(actionLink, "_blank", "noopener,noreferrer")}>
              เปิดลิงก์
            </Button>
          </div>
        </div>
      )}

      {orgError && <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700">{orgError}</div>}

      {/* ── User list ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_90px_140px_100px_180px] gap-0 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">
          <div>อีเมล</div>
          <div>Role</div>
          <div>สถานะ</div>
          <div>LINE</div>
          <div>การจัดการ</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-100">
          {items.map((u) => {
            const isExpanded = expandedUserId === u.id;
            const data = orgData[u.id];
            const membershipCount = data?.memberships.length ?? null;
            const isLoadingOrgs = orgLoading === u.id;
            const isDeleting = deletingUserId === u.id;
            const isResetting = resettingUserId === u.email;
            const isToggling = togglingUserId === u.id;

            // Derive display status
            const isActive = u.profile?.is_active !== false;
            const hasSigned = !!u.last_sign_in_at;
            const wasInvited = !!u.invited_at;
            const isPending = wasInvited && !hasSigned;

            return (
              <div key={u.id}>
                {/* User row */}
                <div className="grid grid-cols-[1fr_90px_140px_100px_180px] items-center gap-0 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900">{u.email ?? "-"}</div>
                    <div className="truncate text-xs text-gray-400">{u.id}</div>
                  </div>
                  <div className="text-gray-700">{u.profile?.role ?? "-"}</div>
                  {/* Status column */}
                  <div className="flex items-center gap-1.5">
                    {/* Badge */}
                    {!isActive ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">ปิดใช้งาน</span>
                    ) : isPending ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-600">รอตั้งรหัส</span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">ใช้งานได้</span>
                    )}
                    {/* Toggle button */}
                    <button
                      onClick={() => handleToggleStatus(u.id, isActive)}
                      disabled={isToggling}
                      title={isActive ? "คลิกเพื่อปิดใช้งาน" : "คลิกเพื่อเปิดใช้งาน"}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                        isActive
                          ? "bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          : "bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-700"
                      }`}
                    >
                      {isToggling ? "..." : isActive ? "ปิด" : "เปิด"}
                    </button>
                  </div>
                  <div className="text-gray-700">{u.profile?.line_user_id ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}</div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {/* Orgs toggle */}
                    <button
                      onClick={() => toggleExpand(u.id)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        isExpanded
                          ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {isLoadingOrgs ? "..." : membershipCount !== null ? `${membershipCount} org` : "Orgs"}
                    </button>
                    {/* Reset password */}
                    <button
                      onClick={() => handleResetPassword(u.email)}
                      disabled={isResetting || !u.email}
                      className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-40"
                    >
                      {isResetting ? "..." : "Reset PW"}
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => handleDeleteUser(u.id, u.email)}
                      disabled={isDeleting}
                      className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-40"
                    >
                      {isDeleting ? "..." : "ลบ"}
                    </button>
                  </div>
                </div>

                {/* Expanded org panel */}
                {isExpanded && (
                  <div className="border-b border-indigo-100 bg-indigo-50/30 px-4 py-4">
                    {isLoadingOrgs ? (
                      <div className="text-sm text-gray-500">กำลังโหลด…</div>
                    ) : data ? (
                      <div className="space-y-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                          สมาชิก Organizations
                        </div>

                        {/* Membership list */}
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
                                <button
                                  onClick={() => handleRemoveMembership(u.id, m.orgId)}
                                  className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                                >
                                  ลบ
                                </button>
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
                              value={addOrgRole[u.id] ?? "member"}
                              onChange={(v) => setAddOrgRole((prev) => ({ ...prev, [u.id]: v as OrgRole }))}
                              options={ORG_ROLE_OPTIONS}
                              disabled={!addOrgId[u.id]}
                            />
                          </div>
                          <Button
                            size="sm"
                            disabled={!addOrgId[u.id]}
                            onClick={() => handleAddMembership(u.id)}
                          >
                            เพิ่ม
                          </Button>
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
    </div>
  );
}
