"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { useAuth } from "@/app/shared/auth-provider";
import { useConfirmDialog } from "@/app/shared/confirm-dialog/provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import SettingsSidebar from "@/components/settings/user-settings-sidebar";
import AccountSummaryCard from "@/components/settings/user-settings-account-card";
import ProfileEditCard from "@/components/settings/user-settings-profile-card";
import PasswordCard from "@/components/settings/user-settings-password-card";
import LineLinkCard from "@/components/settings/user-settings-line-link-card";
import LineNotificationsCard from "@/components/settings/user-settings-line-notifications-card";

export type SettingsProfile = {
  id: string;
  email: string | null;
  role: string;
  display_name: string | null;
  avatar_url: string | null;
  line_user_id: string | null;
  line_linked_at: string | null;
  created_at: string;
};

export type NotiItem = {
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
};

export default function UserSettingsPage() {
  const { userId, email, envError, loading: authLoading } = useAuth();
  const confirm = useConfirmDialog();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SettingsProfile | null>(null);

  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [lineLoading, setLineLoading] = useState(false);
  const [lineLinkUrl, setLineLinkUrl] = useState<string | null>(null);
  const [lineExpiresAt, setLineExpiresAt] = useState<string | null>(null);

  const [notiLoading, setNotiLoading] = useState(false);
  const [notiItems, setNotiItems] = useState<NotiItem[]>([]);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    const headers = await authHeader();
    const res = await fetch("/api/settings/profile", { headers });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error ?? "โหลดโปรไฟล์ไม่สำเร็จ");
    const p = (json?.profile ?? null) as SettingsProfile | null;
    setProfile(p);
    setDisplayNameDraft(String(p?.display_name ?? ""));
    setAvatarUrl(p?.avatar_url ?? null);
  }, [authHeader]);

  const refreshNoti = useCallback(async () => {
    const headers = await authHeader();
    const res = await fetch("/api/settings/line-notifications", { headers });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error ?? "โหลดรายการแจ้งเตือนไม่สำเร็จ");
    setNotiItems(((json?.items ?? []) as any[]) as NotiItem[]);
  }, [authHeader]);

  const refreshLineQr = useCallback(async () => {
    setLineLoading(true);
    try {
      const headers = await authHeader();
      const res = await fetch("/api/line/link-token", { method: "POST", headers });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "สร้าง QR ไม่สำเร็จ");
      setLineLinkUrl(String(json?.linkUrl ?? ""));
      setLineExpiresAt(String(json?.expiresAt ?? ""));
    } catch (e: any) {
      toast.error(e?.message ?? "สร้าง QR ไม่สำเร็จ");
    } finally {
      setLineLoading(false);
    }
  }, [authHeader]);

  useEffect(() => {
    if (authLoading) return;
    if (envError) {
      setLoading(false);
      return;
    }
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.resolve()
      .then(async () => {
        setLoading(true);
        await refreshProfile();
        await refreshNoti();
      })
      .catch((e: any) => {
        if (!cancelled) toast.error(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, envError, refreshNoti, refreshProfile, userId]);

  useEffect(() => {
    if (!profile) return;
    if (profile.line_user_id) return;
    if (lineLinkUrl) return;
    void refreshLineQr();
  }, [lineLinkUrl, profile, refreshLineQr]);

  const onSaveProfile = useCallback(async () => {
    const name = displayNameDraft.trim();
    if (!name) {
      toast.error("กรุณากรอกชื่อแสดงผล");
      return;
    }
    const headers = await authHeader();
    const res = await fetch("/api/settings/profile", {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ displayName: name }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(json?.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    toast.success("บันทึกแล้ว");
    await refreshProfile();
  }, [authHeader, displayNameDraft, refreshProfile]);

  const onUploadAvatar = useCallback(
    async (file: File) => {
      const headers = await authHeader();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/settings/avatar/upload", { method: "POST", headers, body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "อัปโหลดรูปไม่สำเร็จ");
        return;
      }
      const url = String(json?.avatarUrl ?? "");
      if (url) setAvatarUrl(url);
      toast.success("อัปโหลดรูปแล้ว");
      await refreshProfile();
    },
    [authHeader, refreshProfile],
  );

  const onToggleNoti = useCallback(
    async (eventKey: string, enabled: boolean) => {
      setNotiItems((prev) => prev.map((x) => (x.key === eventKey ? { ...x, enabled } : x)));
      setNotiLoading(true);
      try {
        const headers = await authHeader();
        const res = await fetch("/api/settings/line-notifications", {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ eventKey, enabled }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? "บันทึกการแจ้งเตือนไม่สำเร็จ");
      } catch (e: any) {
        toast.error(e?.message ?? "บันทึกการแจ้งเตือนไม่สำเร็จ");
        await refreshNoti();
      } finally {
        setNotiLoading(false);
      }
    },
    [authHeader, refreshNoti],
  );

  const onUnlinkLine = useCallback(async () => {
    const ok = await confirm({
      title: "ยกเลิกการเชื่อม LINE?",
      message: "คุณจะไม่ได้รับการแจ้งเตือนผ่าน LINE จนกว่าจะเชื่อมใหม่",
      confirmText: "ยกเลิกการเชื่อม",
      cancelText: "กลับไปก่อน",
      tone: "danger",
    });
    if (!ok) return;
    const headers = await authHeader();
    const res = await fetch("/api/line/unlink", { method: "POST", headers });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(json?.error ?? "ยกเลิกการเชื่อมไม่สำเร็จ");
      return;
    }
    toast.success("ยกเลิกการเชื่อมแล้ว");
    setLineLinkUrl(null);
    setLineExpiresAt(null);
    await refreshProfile();
    void refreshLineQr();
  }, [authHeader, confirm, refreshLineQr, refreshProfile]);

  const lineLinked = Boolean(profile?.line_user_id);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-6">
      <div className="mb-5">
        <div className="text-2xl font-semibold text-gray-900">ตั้งค่าผู้ใช้</div>
        <div className="mt-1 text-sm text-gray-600">จัดการข้อมูลส่วนตัว ความปลอดภัย และการแจ้งเตือน LINE</div>
      </div>

      {envError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{envError}</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
          <div className="sticky top-20 h-fit self-start">
            <SettingsSidebar />
          </div>

          <div className="space-y-6">
            <section id="profile" className="scroll-mt-24">
              <AccountSummaryCard email={email} userId={userId} lineLinked={lineLinked} />
              <div className="mt-6">
                <ProfileEditCard
                  loading={loading}
                  email={email}
                  avatarUrl={avatarUrl}
                  displayNameDraft={displayNameDraft}
                  onDisplayNameDraftChange={setDisplayNameDraft}
                  onCancel={() => setDisplayNameDraft(String(profile?.display_name ?? ""))}
                  onSave={() => void onSaveProfile()}
                  onUploadAvatar={(f) => void onUploadAvatar(f)}
                />
              </div>
            </section>

            <section id="security" className="scroll-mt-24">
              <PasswordCard supabase={supabase} disabled={authLoading || loading} />
            </section>

            <section id="line" className="scroll-mt-24">
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="text-base font-semibold text-gray-900">LINE แจ้งเตือน</div>
                <div className="mt-1 text-sm text-gray-600">เชื่อม LINE เพื่อรับการแจ้งเตือน และเลือกเหตุการณ์ที่ต้องการ</div>

                <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <LineLinkCard
                    linked={lineLinked}
                    lineUserId={profile?.line_user_id ?? null}
                    linkUrl={lineLinkUrl}
                    expiresAt={lineExpiresAt}
                    loading={lineLoading}
                    onRefresh={() => void refreshLineQr()}
                    onUnlink={() => void onUnlinkLine()}
                  />

                  <LineNotificationsCard
                    linked={lineLinked}
                    loading={notiLoading}
                    items={notiItems}
                    onToggle={(k, v) => void onToggleNoti(k, v)}
                  />
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
