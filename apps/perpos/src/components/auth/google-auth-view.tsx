"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, X, Mail, Eye, EyeOff } from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { withBasePath } from "@/utils/base-path";

type Props = {
  mode?: "modal" | "page";
  returnTo?: string | null;
  onClose?: () => void;
};

type View = "signin" | "forgot" | "forgot_sent";

export default function GoogleAuthView({ mode = "modal", returnTo, onClose }: Props) {
  const router = useRouter();
  const { blocked, profileError, signOut, userId, loading: authLoading, envError } = useAuth();

  const [view, setView] = useState<View>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    if (authLoading || !userId) return;
    if (blocked) return;
    if (mode === "modal") onClose?.();
  }, [authLoading, blocked, mode, onClose, userId]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (e) {
        setError(e.message === "Invalid login credentials" ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : e.message);
        return;
      }
      if (mode === "modal") {
        onClose?.();
      } else {
        router.replace(withBasePath(returnTo ?? "/"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !email.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const redirectTo = `${window.location.origin}${withBasePath("/auth/callback")}?returnTo=${encodeURIComponent(withBasePath("/auth/password"))}`;
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (e) { setError(e.message); return; }
      setView("forgot_sent");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0 disabled:opacity-60";

  return (
    <div className={mode === "page" ? "mx-auto w-full max-w-md" : "w-full"}>
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
        {mode === "modal" && (
          <button
            type="button"
            onClick={() => onClose?.()}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 focus:outline-none"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="p-6">
          {/* Header */}
          <div className="flex flex-col items-center text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-gray-200 bg-gray-50 text-gray-900">
              {view === "forgot" || view === "forgot_sent" ? (
                <Mail className="h-5 w-5" />
              ) : (
                <Lock className="h-5 w-5" />
              )}
            </div>
            <div className="mt-4 text-xl font-semibold text-gray-900">
              {view === "signin"      && "Sign in to PERPOS"}
              {view === "forgot"      && "Reset password"}
              {view === "forgot_sent" && "Check your email"}
            </div>
            <div className="mt-1 text-sm text-gray-500">
              {view === "signin"      && "Welcome back! Please sign in to continue"}
              {view === "forgot"      && "We'll send a reset link to your email"}
              {view === "forgot_sent" && `Sent to ${email} — check your inbox`}
            </div>
          </div>

          {/* Alerts */}
          {envError     && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{envError}</div>}
          {profileError && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{profileError}</div>}
          {error        && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          {blocked && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              บัญชีนี้ยังไม่ได้รับเชิญหรือยังไม่ถูกเปิดใช้งาน
              <div className="mt-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={async () => { setSubmitting(true); try { await signOut(); } finally { setSubmitting(false); } }}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  ออกจากระบบ
                </button>
              </div>
            </div>
          )}

          {/* Sign in form */}
          {view === "signin" && (
            <form onSubmit={handleSignIn} className="mt-6 grid gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputCls}
                  disabled={submitting}
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600">Password</label>
                  <button
                    type="button"
                    onClick={() => { setView("forgot"); setError(null); }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputCls} pr-10`}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting || !email.trim() || !password}
                className="mt-1 h-11 w-full rounded-lg bg-[#2D2F36] text-sm font-medium text-white hover:bg-[#3B3E45] disabled:opacity-50"
              >
                {submitting ? "กำลังเข้าสู่ระบบ..." : "Sign in"}
              </button>
            </form>
          )}

          {/* Forgot password form */}
          {view === "forgot" && (
            <form onSubmit={handleForgot} className="mt-6 grid gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputCls}
                  disabled={submitting}
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="mt-1 h-11 w-full rounded-lg bg-[#2D2F36] text-sm font-medium text-white hover:bg-[#3B3E45] disabled:opacity-50"
              >
                {submitting ? "กำลังส่ง..." : "Send reset link"}
              </button>
              <button
                type="button"
                onClick={() => { setView("signin"); setError(null); }}
                className="text-center text-xs text-gray-400 hover:text-gray-600"
              >
                ← Back to sign in
              </button>
            </form>
          )}

          {/* Sent confirmation */}
          {view === "forgot_sent" && (
            <div className="mt-6 grid gap-3">
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                ส่ง reset link ไปที่ <strong>{email}</strong> แล้ว — กรุณาตรวจสอบกล่องขาเข้า
              </div>
              <button
                type="button"
                onClick={() => { setView("signin"); setError(null); }}
                className="text-center text-xs text-gray-400 hover:text-gray-600"
              >
                ← Back to sign in
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200">
          <div className="bg-[repeating-linear-gradient(135deg,rgba(249,115,22,0.08)_0,rgba(249,115,22,0.08)_10px,rgba(249,115,22,0.03)_10px,rgba(249,115,22,0.03)_20px)] p-5 text-center">
            <div className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Lock className="h-3.5 w-3.5" />
              <span>Secured by <span className="font-semibold text-gray-700">Supabase</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
