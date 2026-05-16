"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Button, Input, Select } from "rizzui";
import { Text, Title } from "rizzui/typography";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/supabase/types";
import { withBasePath } from "@/utils/base-path";

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

const ORG_ROLES = ["owner", "admin", "member"] as const;
type OrgRole = (typeof ORG_ROLES)[number];

export default function AdminUsersPage() {
  const { role, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ListedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionLink, setActionLink] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("user");

  // Org panel state
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [orgData, setOrgData] = useState<Record<string, OrgData>>({});
  const [orgLoading, setOrgLoading] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Add-org form state per user
  const [addOrgId, setAddOrgId] = useState<Record<string, string>>({});
  const [addOrgRole, setAddOrgRole] = useState<Record<string, OrgRole>>({});

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
        const res = await fetch(withBasePath("/api/admin/users/list?page=1&perPage=200"), { headers });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.error ?? "โหลดรายการผู้ใช้ไม่สำเร็จ");
          setItems([]);
          setLoading(false);
          return;
        }
        setItems((json?.items ?? []) as ListedUser[]);
        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "โหลดรายการผู้ใช้ไม่สำเร็จ");
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
        const res = await fetch(withBasePath(`/api/admin/users/orgs?userId=${userId}`), { headers });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setOrgError(json?.error ?? "โหลดข้อมูล org ไม่สำเร็จ");
          setOrgLoading(null);
          return;
        }
        setOrgData((prev) => ({ ...prev, [userId]: json as OrgData }));
        setOrgLoading(null);
      } catch (e: any) {
        setOrgError(e?.message ?? "โหลดข้อมูล org ไม่สำเร็จ");
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
        const res = await fetch(withBasePath("/api/admin/users/orgs"), {
          method: "PUT",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ userId, orgId, role: newRole }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setOrgError(json?.error ?? "อัปเดต role ไม่สำเร็จ");
          return;
        }
        // Update local state
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
      } catch (e: any) {
        setOrgError(e?.message ?? "อัปเดต role ไม่สำเร็จ");
      }
    },
    [authHeader],
  );

  const handleRemoveMembership = useCallback(
    async (userId: string, orgId: string) => {
      try {
        const headers = await authHeader();
        const res = await fetch(withBasePath("/api/admin/users/orgs"), {
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
      } catch (e: any) {
        setOrgError(e?.message ?? "ลบ membership ไม่สำเร็จ");
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
        const res = await fetch(withBasePath("/api/admin/users/orgs"), {
          method: "PUT",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ userId, orgId: selectedOrgId, role: selectedRole }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setOrgError(json?.error ?? "เพิ่ม org ไม่สำเร็จ");
          return;
        }
        // Reload org data for this user
        await loadOrgData(userId);
        setAddOrgId((prev) => ({ ...prev, [userId]: "" }));
        setAddOrgRole((prev) => ({ ...prev, [userId]: "member" }));
      } catch (e: any) {
        setOrgError(e?.message ?? "เพิ่ม org ไม่สำเร็จ");
      }
    },
    [authHeader, addOrgId, addOrgRole, loadOrgData],
  );

  React.useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  if (authLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          กำลังโหลด…
        </Title>
      </div>
    );
  }

  if (role === null) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          ไม่พบสิทธิ์ผู้ใช้
        </Title>
        <Text className="mt-2 text-sm text-gray-600">ระบบไม่พบข้อมูล role ในโปรไฟล์ (profiles) ของบัญชีนี้</Text>
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          ไม่มีสิทธิ์เข้าถึงหน้านี้
        </Title>
        <Text className="mt-2 text-sm text-gray-600">หน้านี้สำหรับ Admin เท่านั้น</Text>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            จัดการผู้ใช้
          </Title>
          <Text className="mt-1 text-sm text-gray-600">ระบบ invite-only • roles: admin/user • ผูก LINE ต่อผู้ใช้</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => refreshUsers()} disabled={loading}>
            รีเฟรช
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_140px] md:items-end">
          <Input label="อีเมล" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@example.com" disabled={loading} />
          <Select
            label="Role"
            value={{ label: inviteRole, value: inviteRole }}
            options={[
              { label: "admin", value: "admin" },
              { label: "user", value: "user" },
            ]}
            onChange={(opt: any) => setInviteRole((opt?.value as Role) ?? "user")}
            disabled={loading}
          />
          <Button
            className="h-10 bg-indigo-600 text-white hover:bg-indigo-500"
            disabled={loading}
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
                const res = await fetch(withBasePath("/api/admin/users/invite"), {
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
                setMessage(Boolean(json?.emailSent) ? "ส่งอีเมลเชิญแล้ว" : "สร้างลิงก์เชิญแล้ว (คัดลอกไว้ในคลิปบอร์ด) ");
                setInviteEmail("");
                setLoading(false);
                refreshUsers();
              } catch (e: any) {
                setError(e?.message ?? "ส่ง invite ไม่สำเร็จ");
                setLoading(false);
              }
            }}
          >
            เชิญผู้ใช้
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div> : null}
      {actionLink ? (
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <div className="font-medium text-gray-900">ลิงก์สำหรับตั้งรหัสผ่าน</div>
          <div className="mt-2 break-all rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">{actionLink}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(actionLink).catch(() => undefined);
                setMessage("คัดลอกลิงก์แล้ว");
              }}
            >
              คัดลอกลิงก์
            </Button>
            <Button variant="outline" onClick={() => window.open(actionLink, "_blank", "noopener,noreferrer")}>
              เปิดลิงก์
            </Button>
          </div>
        </div>
      ) : null}

      {orgError ? <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700">{orgError}</div> : null}

      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {/* Header */}
        <div className="grid grid-cols-[1fr_100px_100px_140px_120px] gap-0 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">
          <div>อีเมล</div>
          <div>Role</div>
          <div>Active</div>
          <div>LINE</div>
          <div>Orgs</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-100">
          {items.map((u) => {
            const isExpanded = expandedUserId === u.id;
            const data = orgData[u.id];
            const membershipCount = data?.memberships.length ?? null;
            const isLoadingOrgs = orgLoading === u.id;

            return (
              <div key={u.id}>
                {/* User row */}
                <div className="grid grid-cols-[1fr_100px_100px_140px_120px] items-center gap-0 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900">{u.email ?? "-"}</div>
                    <div className="truncate text-xs text-gray-500">{u.id}</div>
                  </div>
                  <div className="text-gray-700">{u.profile?.role ?? "-"}</div>
                  <div className="text-gray-700">{u.profile?.is_active === false ? "ปิด" : "เปิด"}</div>
                  <div className="text-gray-700">{u.profile?.line_user_id ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}</div>
                  <div>
                    <button
                      onClick={() => toggleExpand(u.id)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        isExpanded
                          ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {isLoadingOrgs
                        ? "..."
                        : membershipCount !== null
                          ? `${membershipCount} org${membershipCount !== 1 ? "s" : ""}`
                          : "จัดการ"}
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
                                <select
                                  value={m.role}
                                  onChange={(e) => handleRoleChange(u.id, m.orgId, e.target.value as OrgRole)}
                                  className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                >
                                  {ORG_ROLES.map((r) => (
                                    <option key={r} value={r}>
                                      {r}
                                    </option>
                                  ))}
                                </select>
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
                          <select
                            value={addOrgId[u.id] ?? ""}
                            onChange={(e) => setAddOrgId((prev) => ({ ...prev, [u.id]: e.target.value }))}
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          >
                            <option value="">-- เลือก org --</option>
                            {data.allOrgs
                              .filter((o) => !data.memberships.some((m) => m.orgId === o.id))
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                          </select>
                          <select
                            value={addOrgRole[u.id] ?? "member"}
                            onChange={(e) => setAddOrgRole((prev) => ({ ...prev, [u.id]: e.target.value as OrgRole }))}
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          >
                            {ORG_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleAddMembership(u.id)}
                            disabled={!addOrgId[u.id]}
                            className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                          >
                            เพิ่ม
                          </button>
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
          {items.length === 0 ? <div className="px-4 py-6 text-sm text-gray-600">ยังไม่มีข้อมูล</div> : null}
        </div>
      </div>
    </div>
  );
}
