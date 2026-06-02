"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, X, Eye, EyeOff } from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { withBasePath } from "@/utils/base-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  return (
    <div className={mode === "page" ? "mx-auto w-full max-w-md" : "w-full"}>
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
        {mode === "modal" && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onClose?.()}
            className="absolute right-4 top-4 h-8 w-8 rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 focus:outline-none"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        <div className="p-8">
          {/* Header */}
          <div className="flex flex-col items-center text-center">
            {/* Logo */}
            <div className="mb-6">
              <img src="/tmc-logo.svg" alt="PERPOS" className="h-9 w-auto" />
            </div>
            
            <div className="text-xl font-bold text-slate-800 font-inter">
              {view === "signin"      && "เข้าสู่ระบบ PERPOS"}
              {view === "forgot"      && "รีเซ็ตรหัสผ่าน"}
              {view === "forgot_sent" && "ตรวจสอบอีเมลของคุณ"}
            </div>
            <div className="mt-1.5 text-sm text-slate-500 leading-relaxed max-w-xs">
              {view === "signin"      && "ยินดีต้อนรับกลับมา! กรุณาเข้าสู่ระบบเพื่อใช้งาน"}
              {view === "forgot"      && "เราจะส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลของคุณ"}
              {view === "forgot_sent" && `ส่งลิงก์ไปที่ ${email} เรียบร้อยแล้ว`}
            </div>
          </div>

          {/* Alerts */}
          {envError     && <div className="mt-5 rounded-xl border border-red-150 bg-red-50 px-4 py-3 text-sm text-red-700 leading-relaxed">{envError}</div>}
          {profileError && <div className="mt-4 rounded-xl border border-red-150 bg-red-50 px-4 py-3 text-sm text-red-700 leading-relaxed">{profileError}</div>}
          {error        && <div className="mt-4 rounded-xl border border-red-150 bg-red-50 px-4 py-3 text-sm text-red-700 leading-relaxed">{error}</div>}

          {blocked && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 leading-relaxed">
              บัญชีนี้ยังไม่ได้รับเชิญหรือยังไม่ถูกเปิดใช้งาน
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={async () => { setSubmitting(true); try { await signOut(); } finally { setSubmitting(false); } }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  ออกจากระบบ
                </Button>
              </div>
            </div>
          )}

          {/* Sign in form */}
          {view === "signin" && (
            <form onSubmit={handleSignIn} className="mt-6 grid gap-4">
              <div>
                <Label className="mb-1.5 block text-xs font-bold text-slate-700">อีเมล (Email)</Label>
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11 rounded-xl bg-slate-50/50 focus:bg-white transition-colors"
                  disabled={submitting}
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-700">รหัสผ่าน (Password)</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setView("forgot"); setError(null); }}
                    className="h-auto p-0 text-xs text-slate-400 hover:text-blue-600 hover:bg-transparent transition-colors focus-visible:ring-0"
                  >
                    ลืมรหัสผ่าน?
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 rounded-xl pr-10 bg-slate-50/50 focus:bg-white transition-colors"
                    disabled={submitting}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-transparent focus-visible:ring-0"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={submitting || !email.trim() || !password}
                className="mt-2 h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md shadow-blue-500/10"
              >
                {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
              </Button>
            </form>
          )}

          {/* Forgot password form */}
          {view === "forgot" && (
            <form onSubmit={handleForgot} className="mt-6 grid gap-4">
              <div>
                <Label className="mb-1.5 block text-xs font-bold text-slate-700">อีเมล (Email)</Label>
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11 rounded-xl bg-slate-50/50 focus:bg-white transition-colors"
                  disabled={submitting}
                />
              </div>
              <Button
                type="submit"
                disabled={submitting || !email.trim()}
                className="mt-2 h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md shadow-blue-500/10"
              >
                {submitting ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ตรหัสผ่าน"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setView("signin"); setError(null); }}
                className="w-full text-center text-xs text-slate-400 hover:text-blue-600 hover:bg-transparent transition-colors pt-2 h-auto py-1"
              >
                ← กลับสู่หน้าเข้าสู่ระบบ
              </Button>
            </form>
          )}

          {/* Sent confirmation */}
          {view === "forgot_sent" && (
            <div className="mt-6 grid gap-4">
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 leading-relaxed">
                ส่งลิงก์รีเซ็ตรหัสผ่านไปที่ <strong>{email}</strong> แล้ว — กรุณาตรวจสอบกล่องข้อความในอีเมลของคุณ
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setView("signin"); setError(null); }}
                className="w-full text-center text-xs text-slate-400 hover:text-blue-600 hover:bg-transparent transition-colors pt-2 h-auto py-1"
              >
                ← กลับสู่หน้าเข้าสู่ระบบ
              </Button>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/80">
          <div className="p-4.5 text-center py-4">
            <div className="inline-flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap">
              <Lock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span>Secured by <span className="font-semibold text-slate-600">Supabase Security</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
