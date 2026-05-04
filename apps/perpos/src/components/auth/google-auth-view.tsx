"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "rizzui";
import { Chrome, Lock, X } from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { withBasePath } from "@/utils/base-path";

type GoogleAuthViewProps = {
  mode?: "modal" | "page";
  returnTo?: string | null;
  onClose?: () => void;
};

function getCurrentPathWithQuery() {
  if (typeof window === "undefined") return null;
  const p = String(window.location.pathname ?? "");
  const q = String(window.location.search ?? "");
  const v = `${p}${q}`.trim();
  return v.startsWith("/") ? v : null;
}

export default function GoogleAuthView({ mode = "modal", returnTo, onClose }: GoogleAuthViewProps) {
  const router = useRouter();
  const { blocked, profileError, signOut, userId, loading: authLoading, envError } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveReturnTo = useMemo(() => returnTo ?? getCurrentPathWithQuery(), [returnTo]);
  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}${withBasePath("/auth/callback")}`;
  }, []);

  useEffect(() => {
    if (authLoading || !userId) return;
    if (blocked) return;
    if (mode === "modal") onClose?.();
  }, [authLoading, blocked, mode, onClose, userId]);

  const canSubmit = !submitting && !blocked && !envError;

  return (
    <div className={mode === "page" ? "mx-auto w-full max-w-md" : "w-full"}>
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
        {mode === "modal" ? (
          <button
            type="button"
            onClick={() => onClose?.()}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}

        <div className="p-6">
          <div className="flex flex-col items-center text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-gray-200 bg-gray-50 text-gray-900">
              <Lock className="h-5 w-5" />
            </div>
            <div className="mt-4 text-xl font-semibold text-gray-900">Sign in to PERPOS</div>
            <div className="mt-1 text-sm text-gray-600">Welcome back! Please sign in to continue</div>
          </div>

          {envError ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{envError}</div> : null}
          {profileError ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{profileError}</div> : null}
          {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
          {blocked ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              บัญชีนี้ยังไม่ได้รับเชิญหรือยังไม่ถูกเปิดใช้งาน (invite-only)
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="border-gray-300 text-gray-800 hover:bg-gray-50"
                  disabled={submitting}
                  onClick={async () => {
                    setSubmitting(true);
                    try {
                      await signOut();
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                >
                  ออกจากระบบ
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4">
            <Button
              type="button"
              disabled={!canSubmit}
              className="h-11 w-full justify-center gap-2 bg-[#2D2F36] text-white shadow-sm hover:bg-[#3B3E45]"
              onClick={async () => {
                if (!canSubmit) return;
                setSubmitting(true);
                setError(null);
                try {
                  if (effectiveReturnTo) window.sessionStorage.setItem("auth:returnTo", effectiveReturnTo);
                  else window.sessionStorage.removeItem("auth:returnTo");

                  const supabase = createSupabaseBrowserClient();
                  const { data, error: e } = await supabase.auth.signInWithOAuth({
                    provider: "google",
                    options: {
                      redirectTo: callbackUrl,
                      queryParams: { prompt: "select_account" },
                    },
                  });
                  if (e) throw new Error(e.message);
                  const url = String((data as any)?.url ?? "").trim();
                  if (!url) throw new Error("ไม่สามารถเริ่มการเข้าสู่ระบบได้");
                  window.location.assign(url);
                } catch (e: any) {
                  setError(e?.message ?? "ไม่สามารถเริ่มการเข้าสู่ระบบได้");
                  setSubmitting(false);
                }
              }}
            >
              <Chrome className="h-4 w-4" />
              {submitting ? "กำลังพาไปที่ Google..." : "ดำเนินการต่อด้วย Google"}
            </Button>
          </div>
        </div>

        <div className="border-t border-gray-200">
          <div className="bg-[repeating-linear-gradient(135deg,rgba(249,115,22,0.08)_0,rgba(249,115,22,0.08)_10px,rgba(249,115,22,0.03)_10px,rgba(249,115,22,0.03)_20px)] p-5 text-center">
            <div className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Lock className="h-3.5 w-3.5" />
              <span>
                Secured by <span className="font-semibold text-gray-700">Supabase</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
