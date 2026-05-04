"use client";

import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { Button, Password } from "rizzui";
import { Text, Title } from "rizzui/typography";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { withBasePath } from "@/utils/base-path";

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
    <div className="mx-auto w-full max-w-lg">
      <Title as="h2" className="text-xl font-semibold text-gray-900">
        ตั้งรหัสผ่าน
      </Title>
      <Text className="mt-2 text-sm text-gray-600">ตั้งรหัสผ่านเพื่อเข้าสู่ระบบ</Text>

      {checking ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">กำลังตรวจสอบลิงก์...</div>
      ) : null}

      {error ? <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {ready ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Password
                label="รหัสผ่านใหม่"
                placeholder="อย่างน้อย 8 ตัวอักษร"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <div className="mt-2 text-xs text-gray-500">อย่างน้อย 8 ตัวอักษร</div>
            </div>
            <Password
              label="ยืนยันรหัสผ่าน"
              placeholder="พิมพ์ซ้ำอีกครั้ง"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            <div className="flex flex-wrap gap-2">
              <Button
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
                {submitting ? "กำลังบันทึก..." : "บันทึกรหัสผ่าน"}
              </Button>
              <Button variant="outline" onClick={() => router.replace(withBasePath("/signin"))} disabled={submitting}>
                ไปหน้าเข้าสู่ระบบ
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
