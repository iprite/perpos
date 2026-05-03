"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Title, Text } from "rizzui";
import { PiEye, PiEyeSlash } from "react-icons/pi";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignInClient() {
  const router = useRouter();
  const { userId, loading, envError } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => email.trim().length > 0 && password.trim().length > 0, [email, password]);

  useEffect(() => {
    if (!loading && userId) router.replace("/");
  }, [loading, router, userId]);

  return (
    <div className="mx-auto w-full max-w-md">
      <Title as="h2" className="text-xl font-semibold text-gray-900">
        เข้าสู่ระบบ
      </Title>
      <Text className="mt-2 text-sm text-gray-600">ใช้บัญชี (อีเมล/รหัสผ่าน) เพื่อเข้าสู่ระบบ</Text>

      {envError ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{envError}</div> : null}

      <div className="mt-8 grid gap-4">
        <Input
          label="อีเมล"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          inputMode="email"
          autoComplete="email"
          variant="outline"
          size="lg"
          rounded="pill"
          className="[&>label>span]:font-medium"
          inputClassName="text-sm"
        />
        <Input
          label="รหัสผ่าน"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type={showPassword ? "text" : ("password" as any)}
          autoComplete="current-password"
          variant="outline"
          size="lg"
          rounded="pill"
          className="[&>label>span]:font-medium"
          inputClassName="text-sm"
          suffix={
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            >
              {showPassword ? <PiEyeSlash className="h-4 w-4" /> : <PiEye className="h-4 w-4" />}
            </button>
          }
        />
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6 grid gap-3">
        <Button
          className="w-full"
          disabled={!canSubmit || submitting || !!envError}
          onClick={async () => {
            setSubmitting(true);
            setError(null);
            try {
              const supabase = createSupabaseBrowserClient();
              const signInResult = await Promise.race([
                supabase.auth.signInWithPassword({
                  email: email.trim(),
                  password,
                }),
                new Promise<{ error: { message: string } }>((resolve) => {
                  window.setTimeout(() => resolve({ error: { message: "เชื่อมต่อระบบช้าเกินไป กรุณาลองใหม่" } }), 15000);
                }),
              ]);
              const signInError = (signInResult as any)?.error ?? null;
              if (signInError) {
                setError(signInError.message);
                setSubmitting(false);
                return;
              }
              router.replace("/");
              setSubmitting(false);
            } catch (e: any) {
              setError(e?.message ?? "เข้าสู่ระบบไม่สำเร็จ");
              setSubmitting(false);
            }
          }}
        >
          {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </Button>
      </div>
    </div>
  );
}
