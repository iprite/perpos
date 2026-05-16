"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Avatar, Badge, Button, Input, Title, Text } from "rizzui";
import { QRCodeSVG } from "qrcode.react";
import { HardDrive, Image as ImageIcon, Link2, Save, X } from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type LinkTokenResponse =
  | { ok: true; token: string; expiresAt: string; linkUrl: string }
  | { error: string };

type DriveStatusResponse =
  | { ok: true; connected: boolean; expiresAt: string | null; folderId: string | null }
  | { error: string };

function extFromFile(file: File) {
  const name = file.name || "";
  const parts = name.split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase().trim() : "";
  if (ext && ext.length <= 8) return ext;
  const mime = (file.type || "").toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function UserSettingsPage() {
  const { email, profile, refreshProfile, userId } = useAuth();

  const [nickname, setNickname] = useState<string>(String(profile?.display_name ?? ""));
  const [savingNickname, setSavingNickname] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [linkLoading, setLinkLoading] = useState(false);
  const [link, setLink] = useState<{ token: string; expiresAt: string; linkUrl: string } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [driveLoading, setDriveLoading] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);

  const previewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  const isLineLinked = Boolean(profile?.line_user_id);
  const displayName = String(profile?.display_name ?? email ?? "").trim();
  const canSaveNickname = nickname.trim().length > 0 && nickname.trim() !== String(profile?.display_name ?? "").trim();
  const isLinkExpired = link ? new Date(link.expiresAt).getTime() <= Date.now() : false;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setDriveError(null);
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/google-drive/status", { headers: { authorization: `Bearer ${token}` } });
        const json = (await res.json().catch(() => null)) as DriveStatusResponse | null;
        if (!res.ok) throw new Error(String((json as any)?.error ?? "request_failed"));
        if (!json || !(json as any).ok) throw new Error(String((json as any)?.error ?? "request_failed"));
        if (cancelled) return;
        setDriveConnected(Boolean((json as any).connected));
      } catch (e: any) {
        if (cancelled) return;
        setDriveError(String(e?.message ?? "ไม่สามารถโหลดสถานะ Google Drive ได้"));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div>
        <Title as="h1" className="text-xl font-semibold">
          ตั้งค่าผู้ใช้งาน
        </Title>
        <Text className="mt-1 text-sm text-gray-600">อัปเดตโปรไฟล์ และเชื่อมต่อ LINE @perpos</Text>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-12">
        <div className="grid gap-4 lg:col-span-8">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-gray-900">
              <ImageIcon className="h-4 w-4" />
              <div className="text-sm font-semibold">รูปโปรไฟล์</div>
            </div>

            <div className="mt-4 flex flex-wrap items-start gap-4">
              <Avatar
                src={previewUrl ?? profile?.avatar_url ?? undefined}
                name={displayName || email || "U"}
                color="secondary"
                className="bg-gray-100 ring-1 ring-gray-200 text-sm font-semibold text-gray-700 !h-20 !w-20"
              />

              <div className="min-w-[260px] flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setAvatarError(null);
                    setFile(f);
                  }}
                />
                <div className="mt-2 text-xs text-gray-500">รองรับไฟล์รูปภาพ เช่น .jpg .png .webp</div>

                {avatarError ? (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {avatarError}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    disabled={!file || savingAvatar}
                    onClick={async () => {
                      if (!userId) return;
                      if (!file) return;
                      setSavingAvatar(true);
                      setAvatarError(null);
                      try {
                        const supabase = createSupabaseBrowserClient();
                        const ext = extFromFile(file);
                        const path = `${userId}/avatar.${ext}`;

                        const up = await supabase.storage.from("avatars").upload(path, file, {
                          upsert: true,
                          contentType: file.type || undefined,
                          cacheControl: "3600",
                        });
                        if (up.error) {
                          throw new Error(up.error.message);
                        }
                        const pub = supabase.storage.from("avatars").getPublicUrl(path);
                        const publicUrl = pub.data.publicUrl;
                        if (!publicUrl) throw new Error("ไม่สามารถสร้าง URL ของรูปได้");

                        const { error } = await supabase
                          .from("profiles")
                          .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
                          .eq("id", userId);
                        if (error) throw new Error(error.message);

                        await refreshProfile();
                        setFile(null);
                      } catch (e: any) {
                        setAvatarError(String(e?.message ?? "อัปโหลดไม่สำเร็จ"));
                      } finally {
                        setSavingAvatar(false);
                      }
                    }}
                  >
                    <Save className="h-4 w-4" />
                    {savingAvatar ? "กำลังบันทึก..." : "บันทึกรูป"}
                  </Button>

                  <Button
                    variant="outline"
                    disabled={!file || savingAvatar}
                    onClick={() => {
                      setFile(null);
                      setAvatarError(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                    ยกเลิก
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="text-sm font-semibold text-gray-900">ชื่อเล่น</div>
            <div className="mt-4 grid gap-3">
              <Input
                label="ชื่อเล่น"
                value={nickname}
                onChange={(e) => {
                  setNicknameError(null);
                  setNickname(e.target.value);
                }}
              />
              {nicknameError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{nicknameError}</div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!canSaveNickname || savingNickname}
                  onClick={async () => {
                    if (!userId) return;
                    const v = nickname.trim();
                    if (!v) {
                      setNicknameError("กรุณากรอกชื่อเล่น");
                      return;
                    }
                    setSavingNickname(true);
                    setNicknameError(null);
                    try {
                      const supabase = createSupabaseBrowserClient();
                      const { error } = await supabase
                        .from("profiles")
                        .update({ display_name: v, updated_at: new Date().toISOString() })
                        .eq("id", userId);
                      if (error) throw new Error(error.message);
                      await refreshProfile();
                    } catch (e: any) {
                      setNicknameError(String(e?.message ?? "บันทึกไม่สำเร็จ"));
                    } finally {
                      setSavingNickname(false);
                    }
                  }}
                >
                  <Save className="h-4 w-4" />
                  {savingNickname ? "กำลังบันทึก..." : "บันทึกชื่อเล่น"}
                </Button>

                <Button
                  variant="outline"
                  disabled={savingNickname}
                  onClick={() => {
                    setNickname(String(profile?.display_name ?? ""));
                    setNicknameError(null);
                  }}
                >
                  <X className="h-4 w-4" />
                  ยกเลิก
                </Button>
              </div>
              <div className="text-xs text-gray-500">ชื่อที่แสดงปัจจุบัน: {displayName || "-"}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:col-span-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3 text-gray-900">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                <div className="text-sm font-semibold">Connect to Google</div>
              </div>
              <Badge
                variant="flat"
                size="sm"
                color={driveConnected ? "success" : "danger"}
                className="border px-2 py-0.5 text-xs font-normal tracking-wide"
              >
                {driveConnected ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อม"}
              </Badge>
            </div>

            <div className="mt-3 text-sm text-gray-700">
              {driveConnected ? "เชื่อมต่อแล้ว — รองรับ Google Drive และ Google Calendar" : "เชื่อมต่อเพื่อให้บอทอัปโหลดไฟล์ไป Drive และบันทึกนัดใน Calendar"}
            </div>

            {driveError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{driveError}</div>
            ) : null}

            <div className="mt-4 grid gap-2">
              <Button
                disabled={driveLoading}
                onClick={async () => {
                  setDriveError(null);
                  setDriveLoading(true);
                  try {
                    const supabase = createSupabaseBrowserClient();
                    const { data } = await supabase.auth.getSession();
                    const token = data.session?.access_token;
                    if (!token) throw new Error("Unauthorized");
                    const res = await fetch("/api/google-drive/connect", {
                      method: "POST",
                      headers: { authorization: `Bearer ${token}` },
                    });
                    const json = (await res.json().catch(() => null)) as any;
                    if (!res.ok) throw new Error(String(json?.error ?? "request_failed"));
                    const url = String(json?.url ?? "").trim();
                    if (!url) throw new Error("missing_url");
                    window.location.assign(url);
                  } catch (e: any) {
                    setDriveError(String(e?.message ?? "ไม่สามารถเริ่มการเชื่อมต่อได้"));
                    setDriveLoading(false);
                  }
                }}
              >
                {driveLoading ? "กำลังไปที่ Google..." : driveConnected ? "เชื่อมใหม่" : "Connect to Google"}
              </Button>
              {driveConnected ? (
                <Button
                  variant="outline"
                  disabled={driveLoading}
                  onClick={async () => {
                    setDriveError(null);
                    setDriveLoading(true);
                    try {
                      const supabase = createSupabaseBrowserClient();
                      const { data } = await supabase.auth.getSession();
                      const token = data.session?.access_token;
                      if (!token) throw new Error("Unauthorized");
                      const res = await fetch("/api/google-drive/disconnect", {
                        method: "POST",
                        headers: { authorization: `Bearer ${token}` },
                      });
                      const json = (await res.json().catch(() => null)) as any;
                      if (!res.ok) throw new Error(String(json?.error ?? "request_failed"));
                      setDriveConnected(false);
                    } catch (e: any) {
                      setDriveError(String(e?.message ?? "ยกเลิกการเชื่อมต่อไม่สำเร็จ"));
                    } finally {
                      setDriveLoading(false);
                    }
                  }}
                >
                  ยกเลิกการเชื่อมต่อ
                </Button>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3 text-gray-900">
              <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              <div className="text-sm font-semibold">เชื่อมต่อ LINE @perpos</div>
              </div>
              <Badge
                variant="flat"
                size="sm"
                color={isLineLinked ? "success" : "danger"}
                className="border px-2 py-0.5 text-xs font-normal tracking-wide"
              >
                {isLineLinked ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อม"}
              </Badge>
            </div>

            <div className="mt-3 text-sm text-gray-700">
              {isLineLinked ? (
                <div>
                  เชื่อมแล้ว ({profile?.line_user_id})
                  {profile?.line_linked_at ? (
                    <div className="mt-1 text-xs text-gray-500">เชื่อมเมื่อ: {formatDateTime(profile.line_linked_at)}</div>
                  ) : null}
                  <div className="mt-1 text-xs text-gray-500">หากต้องการเปลี่ยนบัญชี LINE ให้สร้างโค้ดผูกบัญชีใหม่</div>
                </div>
              ) : (
                <div>
                  ยังไม่เชื่อมบัญชี
                  <div className="mt-1 text-xs text-gray-500">
                    สร้าง QR เพื่อเปิด LINE @perpos พร้อมข้อความผูกบัญชีอัตโนมัติ
                  </div>
                </div>
              )}
            </div>

            {linkError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{linkError}</div>
            ) : null}

            <div className="mt-4 grid gap-3">
              {linkLoading ? (
                <div className="flex items-center justify-end">
                  <Badge variant="flat" size="sm" color="warning" className="border px-2 py-0.5 text-xs font-normal tracking-wide">
                    กำลังสร้างโค้ด
                  </Badge>
                </div>
              ) : null}
              <Button
                disabled={linkLoading}
                onClick={async () => {
                  setLinkError(null);
                  setLinkLoading(true);
                  setLink(null);
                  try {
                    const supabase = createSupabaseBrowserClient();
                    const { data } = await supabase.auth.getSession();
                    const token = data.session?.access_token;
                    if (!token) throw new Error("Unauthorized");
                    const res = await fetch("/api/line/link-token", {
                      method: "POST",
                      headers: { authorization: `Bearer ${token}` },
                    });
                    const json = (await res.json().catch(() => null)) as LinkTokenResponse | null;
                    if (!res.ok) throw new Error(String((json as any)?.error ?? "request_failed"));
                    if (!json || !(json as any).ok) throw new Error(String((json as any)?.error ?? "request_failed"));
                    setLink({ token: (json as any).token, expiresAt: (json as any).expiresAt, linkUrl: (json as any).linkUrl });
                  } catch (e: any) {
                    setLinkError(String(e?.message ?? "ไม่สามารถสร้างโค้ดผูกบัญชีได้"));
                  } finally {
                    setLinkLoading(false);
                  }
                }}
              >
                {linkLoading ? "กำลังสร้าง QR..." : isLineLinked ? "สร้าง QR ใหม่" : "สร้าง QR เพื่อเชื่อม LINE"}
              </Button>

              {link ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-medium text-gray-700">โค้ดผูกบัญชี</div>
                    <Badge
                      variant="flat"
                      size="sm"
                      color={isLinkExpired ? "danger" : "warning"}
                      className="border px-2 py-0.5 text-xs font-normal tracking-wide"
                    >
                      {isLinkExpired ? "หมดอายุ" : "รอผูกบัญชี"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-center rounded-lg bg-white p-3">
                    <QRCodeSVG value={link.linkUrl} size={200} />
                  </div>
                  <div className="mt-3 text-xs text-gray-600">หมดอายุ: {formatDateTime(link.expiresAt)}</div>
                  <div className="mt-3 grid gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        window.open(link.linkUrl, "_blank", "noopener,noreferrer");
                      }}
                    >
                      เปิด LINE @perpos
                    </Button>
                    <div className="text-xs text-gray-500">หรือพิมพ์ใน LINE: LINK {link.token}</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
