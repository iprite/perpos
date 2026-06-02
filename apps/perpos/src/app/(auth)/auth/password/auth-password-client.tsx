"use client";

import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { withBasePath } from "@/utils/base-path";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

function cleanupAuthUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  window.history.replaceState({}, document.title, url.pathname);
}

function parseHashParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(hash);
}

export default function AuthPasswordClient() {
  const router = useRouter();
  const search = useSearchParams();

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const code = search.get("code");
  const tokenHash = search.get("token_hash");
  const type = search.get("type");

  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => password.trim().length >= 8 && password === confirm, [confirm, password]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      setChecking(true);
      setError(null);
      try {
        const hashParams = parseHashParams();
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const hashError = hashParams.get("error_description") ?? hashParams.get("error");

        if (hashError) {
          if (!cancelled) {
            setError(decodeURIComponent(hashError));
            setReady(false);
            setChecking(false);
          }
          cleanupAuthUrl();
          return;
        }

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            if (!cancelled) {
              setError("ลิงก์หมดอายุหรือถูกใช้ไปแล้ว");
              setReady(false);
              setChecking(false);
            }
            cleanupAuthUrl();
            return;
          }
          cleanupAuthUrl();
          if (!cancelled) {
            setReady(true);
            setChecking(false);
          }
          return;
        }

        if (tokenHash && type) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            type: type as any,
            token_hash: tokenHash,
          });
          if (verifyError) {
            if (!cancelled) {
              setError("ลิงก์หมดอายุหรือถูกใช้ไปแล้ว");
              setReady(false);
              setChecking(false);
            }
            cleanupAuthUrl();
            return;
          }
          cleanupAuthUrl();
          if (!cancelled) {
            setReady(true);
            setChecking(false);
          }
          return;
        }

        if (accessToken && refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionError) {
            if (!cancelled) {
              setError("ลิงก์หมดอายุหรือถูกใช้ไปแล้ว");
              setReady(false);
              setChecking(false);
            }
            cleanupAuthUrl();
            return;
          }
          cleanupAuthUrl();
          if (!cancelled) {
            setReady(true);
            setChecking(false);
          }
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          cleanupAuthUrl();
          if (!cancelled) {
            setReady(true);
            setChecking(false);
          }
          return;
        }

        if (!cancelled) {
          setError("ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณาขออีเมลใหม่");
          setReady(false);
          setChecking(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "ตรวจสอบลิงก์ไม่สำเร็จ");
          setReady(false);
          setChecking(false);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code, supabase, tokenHash, type]);

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
        <div className="p-8">
          {/* Header */}
          <div className="flex flex-col items-center text-center">
            {/* Logo */}
            <div className="mb-6">
              <img src="/tmc-logo.svg" alt="PERPOS" className="h-9 w-auto" />
            </div>

            <div className="text-xl font-bold text-slate-800 font-inter">
              ตั้งรหัสผ่านใหม่
            </div>
            <div className="mt-1.5 text-sm text-slate-500 leading-relaxed max-w-xs">
              ตั้งรหัสผ่านใหม่เพื่อเริ่มใช้งานบัญชีผู้ใช้ของคุณบน PERPOS
            </div>
          </div>

          {/* Checking status */}
          {checking && (
            <div className="mt-6 flex flex-col items-center justify-center py-6 text-slate-500">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600 mb-2" />
              <div className="text-sm font-medium">กำลังตรวจสอบความถูกต้องของลิงก์...</div>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mt-6 rounded-xl border border-red-150 bg-red-50 px-4 py-3 text-sm text-red-700 leading-relaxed">
              {error}
            </div>
          )}

          {/* Form */}
          {ready && (
            <div className="mt-6 grid gap-4">
              <div>
                <Label className="mb-1.5 block text-xs font-bold text-slate-700">รหัสผ่านใหม่</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="อย่างน้อย 8 ตัวอักษร"
                    className="h-11 rounded-xl pr-10 bg-slate-50/50 focus:bg-white transition-colors"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <span className="mt-1 block text-[11px] text-slate-400">อย่างน้อย 8 ตัวอักษร</span>
              </div>

              <div>
                <Label className="mb-1.5 block text-xs font-bold text-slate-700">ยืนยันรหัสผ่าน</Label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="พิมพ์ซ้ำอีกครั้งเพื่อยืนยัน"
                    className="h-11 rounded-xl pr-10 bg-slate-50/50 focus:bg-white transition-colors"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <Button
                  className="h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md shadow-blue-500/10"
                  disabled={!canSubmit || submitting}
                  onClick={async () => {
                    setSubmitting(true);
                    setError(null);
                    try {
                      const { error: updateError } = await supabase.auth.updateUser({ password });
                      if (updateError) {
                        setError(updateError.message);
                        setSubmitting(false);
                        return;
                      }
                      await supabase.auth.signOut();
                      router.replace(withBasePath("/signin"));
                      setSubmitting(false);
                    } catch (e: any) {
                      setError(e?.message ?? "ตั้งรหัสผ่านไม่สำเร็จ");
                      setSubmitting(false);
                    }
                  }}
                >
                  {submitting ? "กำลังบันทึกรหัสผ่าน..." : "บันทึกรหัสผ่าน"}
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  onClick={() => router.replace(withBasePath("/signin"))} 
                  disabled={submitting}
                >
                  ไปที่หน้าเข้าสู่ระบบ
                </Button>
              </div>
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
