"use client";

import React, { useEffect, useState } from "react";
import { HardDrive, Link2, Wifi } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { backendUrl } from "@/lib/backend";
import { Button } from "@/components/ui/button";

type DriveStatusResponse =
  | { ok: true; connected: boolean; expiresAt: string | null; folderId: string | null }
  | { error: string };

type LinkTokenResponse =
  | { ok: true; token: string; expiresAt: string; linkUrl: string }
  | { error: string };

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
      connected ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-600"
    }`}>
      {connected ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อม"}
    </span>
  );
}

export default function AssistantConnectionsPage() {
  const { profile, userId } = useAuth();

  // ── Google Drive state ────────────────────────────────────────────────────
  const [driveLoading,   setDriveLoading]   = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveError,     setDriveError]     = useState<string | null>(null);

  // ── LINE state ────────────────────────────────────────────────────────────
  const [linkLoading, setLinkLoading] = useState(false);
  const [link,        setLink]        = useState<{ token: string; expiresAt: string; linkUrl: string } | null>(null);
  const [linkError,   setLinkError]   = useState<string | null>(null);

  const isLineLinked   = Boolean(profile?.line_user_id);
  const isLinkExpired  = link ? new Date(link.expiresAt).getTime() <= Date.now() : false;

  // ── Load Google Drive status ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setDriveError(null);
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res  = await fetch(backendUrl("/google-drive/status"), { headers: { authorization: `Bearer ${token}` } });
        const json = (await res.json().catch(() => null)) as DriveStatusResponse | null;
        if (!res.ok || !json || !(json as any).ok) throw new Error(String((json as any)?.error ?? "request_failed"));
        if (!cancelled) setDriveConnected(Boolean((json as any).connected));
      } catch (e: any) {
        if (!cancelled) setDriveError(String(e?.message ?? "โหลดสถานะไม่สำเร็จ"));
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [userId]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleDriveConnect() {
    setDriveError(null);
    setDriveLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Unauthorized");
      const res  = await fetch(backendUrl("/google-drive/connect"), { method: "POST", headers: { authorization: `Bearer ${token}` } });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(String(json?.error ?? "request_failed"));
      const url = String(json?.url ?? "").trim();
      if (!url) throw new Error("missing_url");
      window.location.assign(url);
    } catch (e: any) {
      setDriveError(String(e?.message ?? "เริ่มการเชื่อมต่อไม่สำเร็จ"));
      setDriveLoading(false);
    }
  }

  async function handleDriveDisconnect() {
    setDriveError(null);
    setDriveLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Unauthorized");
      const res  = await fetch(backendUrl("/google-drive/disconnect"), { method: "POST", headers: { authorization: `Bearer ${token}` } });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(String(json?.error ?? "request_failed"));
      setDriveConnected(false);
    } catch (e: any) {
      setDriveError(String(e?.message ?? "ยกเลิกการเชื่อมต่อไม่สำเร็จ"));
    } finally {
      setDriveLoading(false);
    }
  }

  async function handleLineLink() {
    setLinkError(null);
    setLinkLoading(true);
    setLink(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Unauthorized");
      const res  = await fetch(backendUrl("/line/link-token"), { method: "POST", headers: { authorization: `Bearer ${token}` } });
      const json = (await res.json().catch(() => null)) as LinkTokenResponse | null;
      if (!res.ok || !json || !(json as any).ok) throw new Error(String((json as any)?.error ?? "request_failed"));
      setLink({ token: (json as any).token, expiresAt: (json as any).expiresAt, linkUrl: (json as any).linkUrl });
    } catch (e: any) {
      setLinkError(String(e?.message ?? "สร้างโค้ดผูกบัญชีไม่สำเร็จ"));
    } finally {
      setLinkLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">การเชื่อมต่อ</h1>
        <p className="mt-1 text-sm text-gray-500">เชื่อมต่อบัญชีภายนอกเพื่อให้ Assistant ทำงานได้เต็มประสิทธิภาพ</p>
      </div>

      <div className="grid gap-4">
        {/* Google */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
                <HardDrive className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">Google</div>
                <div className="text-xs text-gray-500">Drive + Calendar</div>
              </div>
            </div>
            <StatusBadge connected={driveConnected} />
          </div>

          <p className="mt-3 text-sm text-gray-600">
            {driveConnected
              ? "เชื่อมต่อแล้ว — bot สามารถอัปโหลดไฟล์ไป Drive และบันทึกนัดใน Calendar"
              : "เชื่อมต่อเพื่อให้ bot อัปโหลดไฟล์ไป Google Drive และบันทึกนัดหมายใน Google Calendar"}
          </p>

          {driveError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{driveError}</div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={driveLoading} onClick={handleDriveConnect}>
              {driveLoading ? "กำลังไปที่ Google..." : driveConnected ? "เชื่อมใหม่" : "Connect to Google"}
            </Button>
            {driveConnected && (
              <Button variant="outline" disabled={driveLoading} onClick={handleDriveDisconnect}>
                ยกเลิกการเชื่อมต่อ
              </Button>
            )}
          </div>
        </div>

        {/* LINE */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50">
                <Link2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">LINE @perpos</div>
                <div className="text-xs text-gray-500">Bot สำหรับสั่งงานผ่าน LINE</div>
              </div>
            </div>
            <StatusBadge connected={isLineLinked} />
          </div>

          <p className="mt-3 text-sm text-gray-600">
            {isLineLinked ? (
              <>เชื่อมแล้ว ({profile?.line_user_id})</>
            ) : (
              "สแกน QR เพื่อผูกบัญชี LINE กับ @perpos bot"
            )}
          </p>
          {isLineLinked && profile?.line_linked_at ? (
            <p className="mt-1 text-xs text-gray-400">เชื่อมเมื่อ: {formatDateTime(profile.line_linked_at)}</p>
          ) : null}

          {linkError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{linkError}</div>
          ) : null}

          <div className="mt-4 space-y-3">
            <Button disabled={linkLoading} onClick={handleLineLink}>
              {linkLoading ? "กำลังสร้าง QR..." : isLineLinked ? "สร้าง QR ใหม่" : "สร้าง QR เพื่อเชื่อม LINE"}
            </Button>

            {link && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-medium text-gray-700">โค้ดผูกบัญชี</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                    isLinkExpired ? "border-red-200 bg-red-50 text-red-600" : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}>
                    {isLinkExpired ? "หมดอายุ" : "รอผูกบัญชี"}
                  </span>
                </div>
                <div className="flex justify-center rounded-lg bg-white p-3">
                  <QRCodeSVG value={link.linkUrl} size={180} />
                </div>
                <p className="mt-3 text-xs text-gray-500">หมดอายุ: {formatDateTime(link.expiresAt)}</p>
                <div className="mt-3 grid gap-2">
                  <Button variant="outline" onClick={() => window.open(link.linkUrl, "_blank", "noopener,noreferrer")}>
                    เปิด LINE @perpos
                  </Button>
                  <p className="text-center text-xs text-gray-400">หรือพิมพ์ใน LINE: LINK {link.token}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
