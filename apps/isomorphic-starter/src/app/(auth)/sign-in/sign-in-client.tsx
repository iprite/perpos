"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Title, Text } from "rizzui";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignInClient() {
  const router = useRouter();
  const { userId, loading, envError } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      <Text className="mt-2 text-sm text-gray-600">ใช้บัญชี Supabase (อีเมล/รหัสผ่าน) เพื่อเข้าสู่ระบบ</Text>

      {envError ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{envError}</div> : null}

      <div className="mt-8 grid gap-4">
        <Input
          label="อีเมล"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          inputMode="email"
          autoComplete="email"
        />
        <div>
          <div className="mb-1 text-sm font-medium text-gray-700">รหัสผ่าน</div>
          <input
            className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </div>
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
        <Button variant="outline" className="w-full" onClick={() => router.push("/sign-up")}>
          สร้างบัญชี
        </Button>
      </div>
    </div>
  );
}
