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
        <Text className="mt-2 text-sm text-gray-600">
          ระบบไม่พบข้อมูล role ในโปรไฟล์ (profiles) ของบัญชีนี้
        </Text>
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

      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[1fr_120px_120px_160px] gap-0 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">
          <div>อีเมล</div>
          <div>Role</div>
          <div>Active</div>
          <div>LINE</div>
        </div>
        <div className="divide-y divide-gray-100">
          {items.map((u) => (
            <div key={u.id} className="grid grid-cols-[1fr_120px_120px_160px] items-center gap-0 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-900">{u.email ?? "-"}</div>
                <div className="truncate text-xs text-gray-500">{u.id}</div>
              </div>
              <div className="text-gray-700">{u.profile?.role ?? "-"}</div>
              <div className="text-gray-700">{u.profile?.is_active === false ? "ปิด" : "เปิด"}</div>
              <div className="text-gray-700">{u.profile?.line_user_id ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}</div>
            </div>
          ))}
          {items.length === 0 ? <div className="px-4 py-6 text-sm text-gray-600">ยังไม่มีข้อมูล</div> : null}
        </div>
      </div>
    </div>
  );
}
