"use client";

import React, { useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, FileText, Clock } from "lucide-react";

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

const FEATURES: { icon: React.ReactNode; title: string; desc: string }[] = [
  {
    icon: <Zap className="h-4 w-4" />,
    title: "ถอดเสียงภาษาไทยแม่นยำ",
    desc: "อัปโหลดไฟล์เสียง/วิดีโอ ประชุมยาวหลายชั่วโมงก็ได้",
  },
  {
    icon: <FileText className="h-4 w-4" />,
    title: "รายงานการประชุม (MoM)",
    desc: "สรุป มติ และสิ่งที่ต้องทำต่อ ดาวน์โหลดเป็น PDF",
  },
  {
    icon: <Clock className="h-4 w-4" />,
    title: "เริ่มฟรี 300 นาที",
    desc: "ทดลองใช้ได้ทันทีหลังเข้าสู่ระบบด้วย LINE",
  },
];

function LineLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 5.64 2 10.13c0 4.02 3.55 7.39 8.35 8.03.32.07.77.21.88.49.1.25.06.64.03.9l-.14.85c-.04.25-.2.99.87.54 1.07-.45 5.76-3.39 7.86-5.81C21.27 13.49 22 11.9 22 10.13 22 5.64 17.52 2 12 2zM8.28 12.4H6.3a.4.4 0 0 1-.4-.4V8.06a.4.4 0 0 1 .8 0v3.54h1.58a.4.4 0 0 1 0 .8zm1.56-.4a.4.4 0 0 1-.8 0V8.06a.4.4 0 0 1 .8 0v3.94zm4.62 0a.4.4 0 0 1-.27.38.4.4 0 0 1-.13.02.4.4 0 0 1-.32-.16l-2.02-2.75v2.51a.4.4 0 0 1-.8 0V8.06a.4.4 0 0 1 .72-.24l2.02 2.75V8.06a.4.4 0 0 1 .8 0v3.94zm3.1-2.37a.4.4 0 0 1 0 .8h-1.58v.78h1.58a.4.4 0 0 1 0 .8h-1.98a.4.4 0 0 1-.4-.4V8.06a.4.4 0 0 1 .4-.4h1.98a.4.4 0 0 1 0 .8h-1.58v.77h1.58z" />
    </svg>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-neo-tech text-2xl font-bold tracking-wide">PERPOS</span>
    </span>
  );
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

  const lineLoginHref = withBasePath(
    `/line/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`,
  );
  // ทางเข้าสำรองสำหรับผู้ดูแล (Google) — ซ่อนไว้ ใช้ /signin?admin=1 เท่านั้น
  const adminFallback = searchParams.get("admin") != null;

  return (
    <div className="w-full max-w-4xl">
      <div className="grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 lg:grid-cols-2">
        {/* Left — brand / value panel (desktop) */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 p-10 text-white lg:flex">
          {/* decorative glow */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-blue-400/20 blur-2xl" />

          <div className="relative">
            <BrandMark className="flex items-center gap-2.5" />
            <h2 className="mt-12 text-3xl font-bold leading-snug">
              PERPOS Flow & Suite
              <br />
              เว็บบัญชี ERP สำหรับไทย
            </h2>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white">
              ผู้ช่วย AI บน LINE (Flow) + ระบบบัญชีและ ERP (Suite) สำหรับธุรกิจไทย —
              อัปโหลดไฟล์เสียง รับรายงานการประชุมเป็น PDF พร้อมสรุปครบ
            </p>
          </div>

          <ul className="relative mt-10 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                  {f.icon}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{f.title}</span>
                  <span className="block text-xs text-indigo-100/90">{f.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right — login */}
        <div className="flex flex-col justify-center p-8 sm:p-10">
          {/* brand (mobile only) */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="font-neo-tech text-xl font-bold tracking-wide text-slate-900">
              PERPOS
            </span>
          </div>

          <h1 className="text-2xl font-semibold text-slate-900">เข้าสู่ระบบ</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            ใช้บัญชี LINE ของคุณ เข้าใช้งานได้ทันที ไม่ต้องตั้งรหัสผ่าน
          </p>

          <a
            href={lineLoginHref}
            className="group mt-7 flex w-full items-center justify-center gap-2.5 rounded-xl bg-blue-600 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md active:scale-[0.99]"
          >
            <LineLogo className="h-5 w-5" />
            เข้าสู่ระบบด้วย LINE
          </a>

          {/* Admin fallback (ซ่อน) — /signin?admin=1 */}
          {adminFallback && (
            <>
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs text-slate-400">สำหรับผู้ดูแล</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <GoogleAuthView mode="page" returnTo={returnTo} />
            </>
          )}

          <div className="mt-8 text-center text-xs leading-relaxed text-slate-400">
            <p>การเข้าสู่ระบบถือว่าคุณยอมรับ</p>
            <p className="mt-2">
              <a
                href={withBasePath("/terms")}
                className="text-slate-500 underline-offset-2 hover:underline"
              >
                ข้อกำหนดการให้บริการ
              </a>
            </p>
            <p className="mt-2">
              <a
                href={withBasePath("/privacy")}
                className="text-slate-500 underline-offset-2 hover:underline"
              >
                นโยบายความเป็นส่วนตัว
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
