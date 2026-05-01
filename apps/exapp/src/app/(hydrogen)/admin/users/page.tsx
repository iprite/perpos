"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Button } from "rizzui";
import { Text, Title } from "rizzui/typography";

import TableSearch from "@/components/table/table-search";
import InviteForm from "@/components/admin-users/invite-form";
import type { ListedUser, OrgOption, RepOption } from "@/components/admin-users/types";
import UsersTable from "@/components/admin-users/users-table";
import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/supabase/types";

export default function AdminUsersPage() {
  const { role, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ListedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionLink, setActionLink] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
  const [repOptions, setRepOptions] = useState<RepOption[]>([]);

  const repLabelByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of repOptions) {
      const code = String(o.repCode ?? "").trim();
      if (!code) continue;
      m.set(code, o.label);
    }
    return m;
  }, [repOptions]);

  const isMissingRepEmailColumnError = useCallback((message: string | null | undefined) => {
    const m = (message ?? "").toLowerCase();
    if (!m) return false;
    return m.includes("company_representatives.email") || (m.includes("column") && m.includes("email") && m.includes("does not exist"));
  }, []);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  const refreshLists = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
        const headers = await authHeader();
        const [res, repsWithEmailRes] = await Promise.all([
          fetch("/api/admin/users/meta", { headers }),
          supabase.from("company_representatives").select("id,rep_code,prefix,first_name,last_name,email").order("rep_code", { ascending: true }),
        ]);
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.error ?? "โหลดข้อมูลประกอบไม่สำเร็จ");
          setLoading(false);
          return;
        }

        const customers = (json?.customers ?? []) as Array<{ id: string; name: string | null; display_id: string | null; email?: string | null }>;
        setOrgOptions(
          customers
            .filter((c) => (c.name ?? "").trim().length > 0)
            .map((c) => ({
              label: c.display_id ? `${c.name} (${c.display_id})` : (c.name as string),
              value: c.id,
              email: c.email ?? null,
            })),
        );

        const repsData =
          repsWithEmailRes.error && isMissingRepEmailColumnError(repsWithEmailRes.error.message)
            ? await supabase
                .from("company_representatives")
                .select("id,rep_code,prefix,first_name,last_name")
                .order("rep_code", { ascending: true })
            : repsWithEmailRes;

        if (repsData.error) {
          setError(repsData.error.message);
          setLoading(false);
          return;
        }

        const reps = (repsData.data ?? []) as Array<{
          id: string;
          rep_code: string | null;
          prefix?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
        }>;

        setRepOptions(
          reps.map((r) => {
            const code = String(r.rep_code ?? r.id).trim() || r.id;
            const prefix = String(r.prefix ?? "").trim();
            const firstName = String(r.first_name ?? "").trim();
            const lastName = String(r.last_name ?? "").trim();
            const fullName = `${prefix}${firstName}${lastName ? ` ${lastName}` : ""}`.trim();
            const emailHint = String(r.email ?? "").trim();
            const hint = fullName || emailHint;
            const label = hint ? `${code} (${hint})` : code;
            return { label, value: r.id, repCode: r.rep_code ?? null, email: r.email ?? null };
          }),
        );
        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setLoading(false);
      }
    });
  }, [authHeader, isMissingRepEmailColumnError, supabase]);

  const refreshUsers = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
        const headers = await authHeader();
        const res = await fetch("/api/admin/users/list?page=1&perPage=200", { headers });
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
    refreshLists();
  }, [refreshLists, refreshUsers]);

  const repLeadOptions = useMemo(() => {
    return items
      .filter((u) => u.profile?.role === "representative" && u.profile?.representative_level === "lead")
      .map((u) => ({ label: u.email ?? u.id, value: u.id }));
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((u) => {
      const hay = [u.id, u.email, u.profile?.role, u.profile?.representative_level, u.employer_org?.organization_name, u.representative?.rep_code]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [items, search]);

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
          <Text className="mt-1 text-sm text-gray-600">เพิ่ม/ลบผู้ใช้ ส่งอีเมลเชิญตั้งรหัส และรีเซ็ตรหัสผ่าน</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TableSearch value={search} onChange={setSearch} disabled={loading} />
          <Button variant="outline" onClick={() => refreshUsers()} disabled={loading}>
            รีเฟรช
          </Button>
        </div>
      </div>

      <InviteForm
        loading={loading}
        orgOptions={orgOptions}
        repOptions={repOptions}
        repLeadOptions={repLeadOptions}
        onInvite={async (payload) => {
          setLoading(true);
          setError(null);
          setMessage(null);
          setActionLink(null);
          try {
            const headers = await authHeader();
            const redirectTo = `${window.location.origin}/auth/password`;
            const res = await fetch("/api/admin/users/invite", {
              method: "POST",
              headers: { ...headers, "content-type": "application/json" },
              body: JSON.stringify({ ...payload, redirectTo }),
            });
            const json = await res.json().catch(() => null);
            const link = (json?.actionLink as string | undefined) ?? null;
            if (link) {
              setActionLink(link);
              await navigator.clipboard.writeText(link).catch(() => undefined);
            }
            if (!res.ok) {
              const err = String(json?.error ?? "ส่ง invite ไม่สำเร็จ");
              const reason = String(json?.reason ?? "");
              const smtpCode = String(json?.code ?? "");
              const smtpResponseCode = String(json?.responseCode ?? "");
              const smtpMsgRaw = String(json?.message ?? "");
              const smtpMsg = smtpMsgRaw ? smtpMsgRaw.slice(0, 160) : "";
              const issue0 = Array.isArray(json?.issues) ? (json.issues[0] as any) : null;
              const issueMsg = issue0
                ? [Array.isArray(issue0.path) ? issue0.path.join(".") : "", String(issue0.message ?? "")].filter(Boolean).join(": ")
                : "";
              if (err === "email_send_failed") {
                if (reason === "missing_smtp_env") {
                  setError("ส่งอีเมลไม่สำเร็จ: ยังไม่ได้ตั้งค่า SMTP (แต่สร้างลิงก์ให้แล้ว)");
                } else if (smtpResponseCode === "550" && smtpMsg.toLowerCase().includes("can not send emails from")) {
                  setError("ส่งอีเมลไม่สำเร็จ: SMTP ไม่อนุญาตให้ส่งจากอีเมลนี้ (ให้เปลี่ยน SMTP_FROM_EMAIL ให้ตรงกับ SMTP_USER หรือให้ผู้ดูแล mail server อนุญาต sender)");
                } else {
                  setError("ส่งอีเมลไม่สำเร็จ (แต่สร้างลิงก์ให้แล้ว)");
                }
                if (smtpCode || smtpResponseCode) {
                  setMessage(
                    [
                      "สร้างลิงก์ตั้งรหัสแล้ว (คัดลอกไว้ในคลิปบอร์ด)",
                      [smtpCode ? `code=${smtpCode}` : "", smtpResponseCode ? `smtp=${smtpResponseCode}` : ""].filter(Boolean).join(" "),
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  );
                } else {
                  setMessage("สร้างลิงก์ตั้งรหัสแล้ว (คัดลอกไว้ในคลิปบอร์ด)");
                }
              } else if (err === "invalid_body") {
                setError(issueMsg ? `ข้อมูลไม่ถูกต้อง: ${issueMsg}` : "ข้อมูลไม่ถูกต้อง (ตรวจอีเมล/ตัวเลือก)");
              } else {
                setError(err);
              }
              setLoading(false);
              return;
            }
            const emailSent = Boolean(json?.emailSent);
            setMessage(emailSent ? "ส่งอีเมลเชิญตั้งรหัสแล้ว" : "สร้างลิงก์ตั้งรหัสแล้ว (คัดลอกไว้ในคลิปบอร์ด)");
            setLoading(false);
            refreshUsers();
          } catch (e: any) {
            setError(e?.message ?? "ส่ง invite ไม่สำเร็จ");
            setLoading(false);
          }
        }}
      />

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

      <UsersTable
        items={filtered}
        repLabelByCode={repLabelByCode}
        loading={loading}
        onReset={async (email) => {
          setLoading(true);
          setError(null);
          setMessage(null);
          setActionLink(null);
          try {
            const headers = await authHeader();
            const redirectTo = `${window.location.origin}/auth/password`;
            const res = await fetch("/api/admin/users/reset-password", {
              method: "POST",
              headers: { ...headers, "content-type": "application/json" },
              body: JSON.stringify({ email, redirectTo }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok) {
              setError(json?.error ?? "ส่งอีเมลรีเซ็ตไม่สำเร็จ");
              setLoading(false);
              return;
            }
            const link = (json?.actionLink as string | undefined) ?? null;
            setActionLink(link);
            if (link) {
              await navigator.clipboard.writeText(link).catch(() => undefined);
            }
            const emailSent = Boolean(json?.emailSent);
            setMessage(emailSent ? "ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว" : "สร้างลิงก์รีเซ็ตรหัสผ่านแล้ว (คัดลอกไว้ในคลิปบอร์ด)");
            setLoading(false);
          } catch (e: any) {
            setError(e?.message ?? "ส่งอีเมลรีเซ็ตไม่สำเร็จ");
            setLoading(false);
          }
        }}
        onDelete={async (userId) => {
          setLoading(true);
          setError(null);
          setMessage(null);
          try {
            const headers = await authHeader();
            const res = await fetch("/api/admin/users/delete", {
              method: "POST",
              headers: { ...headers, "content-type": "application/json" },
              body: JSON.stringify({ userId }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok) {
              setError(json?.error ?? "ลบผู้ใช้ไม่สำเร็จ");
              setLoading(false);
              return;
            }
            setMessage("ลบผู้ใช้แล้ว");
            setLoading(false);
            refreshUsers();
          } catch (e: any) {
            setError(e?.message ?? "ลบผู้ใช้ไม่สำเร็จ");
            setLoading(false);
          }
        }}
      />
    </div>
  );
}
