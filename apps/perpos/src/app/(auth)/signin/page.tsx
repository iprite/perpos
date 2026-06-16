"use client";

import React, { useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/app/shared/auth-provider";
import GoogleAuthView from "@/components/auth/google-auth-view";
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
  let v = String(raw).trim();
  if (!v) return null;
  try {
    v = decodeURIComponent(v);
  } catch {
    v = String(raw).trim();
  }

  const basePath = normalizeBasePath(APP_BASE_PATH);
  if (basePath && (v === basePath || v.startsWith(`${basePath}/`))) {
    v = v.slice(basePath.length) || "/";
  }

  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  if (v.startsWith("/api")) return null;
  return v;
}

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { blocked, profile, userId, loading: authLoading } = useAuth();

  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get("returnTo")), [searchParams]);
  useEffect(() => {
    if (authLoading) return;
    if (!userId) return;
    if (blocked || profile?.is_active === false) return;
    if (!profile) return;
    const dest = returnTo ?? "/";
    router.replace(withBasePath(dest));
  }, [authLoading, blocked, profile, returnTo, router, userId]);

  const lineLoginHref = withBasePath(`/line/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
  // ทางเข้าสำรองสำหรับผู้ดูแล (Google) — ซ่อนไว้ ใช้ /signin?admin=1 เท่านั้น กันล็อกเอาต์ฉุกเฉิน
  const adminFallback = searchParams.get("admin") != null;

  return (
    <div className="w-full">
      {/* LINE Login — ช่องทางเดียว (product เป็น LINE-first) */}
      <a
        href={lineLoginHref}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-[#06C755] px-4 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[#05b34c] active:scale-[0.99]"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.48 2 2 5.64 2 10.13c0 4.02 3.55 7.39 8.35 8.03.32.07.77.21.88.49.1.25.06.64.03.9l-.14.85c-.04.25-.2.99.87.54 1.07-.45 5.76-3.39 7.86-5.81C21.27 13.49 22 11.9 22 10.13 22 5.64 17.52 2 12 2zM8.28 12.4H6.3a.4.4 0 0 1-.4-.4V8.06a.4.4 0 0 1 .8 0v3.54h1.58a.4.4 0 0 1 0 .8zm1.56-.4a.4.4 0 0 1-.8 0V8.06a.4.4 0 0 1 .8 0v3.94zm4.62 0a.4.4 0 0 1-.27.38.4.4 0 0 1-.13.02.4.4 0 0 1-.32-.16l-2.02-2.75v2.51a.4.4 0 0 1-.8 0V8.06a.4.4 0 0 1 .72-.24l2.02 2.75V8.06a.4.4 0 0 1 .8 0v3.94zm3.1-2.37a.4.4 0 0 1 0 .8h-1.58v.78h1.58a.4.4 0 0 1 0 .8h-1.98a.4.4 0 0 1-.4-.4V8.06a.4.4 0 0 1 .4-.4h1.98a.4.4 0 0 1 0 .8h-1.58v.77h1.58z" />
        </svg>
        เข้าสู่ระบบด้วย LINE
      </a>
      <p className="mt-3 text-center text-xs text-gray-400">เข้าสู่ระบบด้วยบัญชี LINE ของคุณ</p>

      {/* Admin fallback (ซ่อน) — /signin?admin=1 */}
      {adminFallback && (
        <>
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">สำหรับผู้ดูแล</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <GoogleAuthView mode="page" returnTo={returnTo} />
        </>
      )}
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}
