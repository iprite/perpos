"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "rizzui";
import { AlertTriangle, RefreshCcw } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { APP_BASE_PATH, withBasePath } from "@/utils/base-path";

function normalizeBasePath(basePath: string) {
  const trimmed = (basePath ?? "").trim();
  if (!trimmed) return "";
  if (trimmed === "/") return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

function sanitizeReturnTo(raw: string | null) {
  if (!raw) return null;
  const basePath = normalizeBasePath(APP_BASE_PATH);
  let v = String(raw).trim();
  if (!v) return null;
  if (basePath && (v === basePath || v.startsWith(`${basePath}/`))) {
    v = v.slice(basePath.length) || "/";
  }
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  if (v.startsWith("/api")) return null;
  return v;
}

function readReturnToFromSession() {
  if (typeof window === "undefined") return null;
  const v = window.sessionStorage.getItem("auth:returnTo");
  return sanitizeReturnTo(v);
}

function clearReturnToFromSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem("auth:returnTo");
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"processing" | "error">("processing");
  const [message, setMessage] = useState<string | null>(null);

  const errorParam = useMemo(() => searchParams.get("error"), [searchParams]);
  const errorDescription = useMemo(() => searchParams.get("error_description"), [searchParams]);
  const code = useMemo(() => searchParams.get("code"), [searchParams]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (errorParam) {
        const raw = String(errorParam);
        const desc = String(errorDescription ?? "").trim();
        const friendly = raw === "access_denied" ? "คุณยกเลิกการอนุญาต" : desc || "เข้าสู่ระบบไม่สำเร็จ";
        if (!cancelled) {
          setStatus("error");
          setMessage(friendly);
        }
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw new Error(error.message);
        }
        const { data } = await supabase.auth.getSession();
        if (!data.session?.user) throw new Error("การยืนยันตัวตนล้มเหลว กรุณาลองใหม่");

        const dest = readReturnToFromSession() ?? "/";
        clearReturnToFromSession();
        router.replace(withBasePath(dest));
      } catch (e: any) {
        if (cancelled) return;
        setStatus("error");
        setMessage(e?.message ?? "เข้าสู่ระบบไม่สำเร็จ");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code, errorDescription, errorParam, router]);

  if (status === "processing") {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-slate-950/85 p-6 text-white shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-[14px]">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            <div>
              <div className="text-base font-semibold">กำลังเข้าสู่ระบบ...</div>
              <div className="mt-1 text-sm text-white/70">กรุณารอสักครู่ ระบบกำลังตรวจสอบสิทธิ์</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-white/10 bg-slate-950/85 p-6 text-white shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-[14px]">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/15 text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold">เข้าสู่ระบบไม่สำเร็จ</div>
            {message ? <div className="mt-1 text-sm text-white/70">{String(message).slice(0, 240)}</div> : null}
          </div>
        </div>

        <div className="mt-5 grid gap-2">
          <Button className="w-full bg-indigo-600 text-white hover:bg-indigo-500" onClick={() => router.replace(withBasePath("/signin"))}>
            กลับไปหน้าเข้าสู่ระบบ
          </Button>
          <Button
            variant="outline"
            className="w-full border-white/15 text-white hover:bg-white/5"
            onClick={() => {
              clearReturnToFromSession();
              router.replace(withBasePath("/signin"));
            }}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <RefreshCcw className="h-4 w-4" />
              ลองอีกครั้ง
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
