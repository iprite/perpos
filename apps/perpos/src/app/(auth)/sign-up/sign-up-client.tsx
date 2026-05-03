"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Password, Title, Text } from "rizzui";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { withBasePath } from "@/utils/base-path";

export default function SignUpClient() {
  const router = useRouter();
  const { userId, loading, envError } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSubmit = useMemo(() => email.trim().length > 0 && password.trim().length >= 8, [email, password]);

  useEffect(() => {
    if (!loading && userId) router.replace("/");
  }, [loading, router, userId]);

  return (
    <div className="mx-auto w-full max-w-md">
      <Title as="h2" className="text-xl font-semibold text-gray-900">
        สร้างบัญชี
      </Title>
      <Text className="mt-2 text-sm text-gray-600">สร้างบัญชีใหม่ด้วยอีเมล/รหัสผ่าน</Text>

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
        <div className="grid gap-2">
          <Password
            label="รหัสผ่าน"
            placeholder="อย่างน้อย 8 ตัวอักษร"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <div className="mt-2 text-xs text-gray-500">แนะนำอย่างน้อย 8 ตัวอักษร</div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {info ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div> : null}

      <div className="mt-6 grid gap-3">
        <Button
          className="w-full"
          disabled={!canSubmit || submitting || !!envError}
          onClick={async () => {
            setSubmitting(true);
            setError(null);
            setInfo(null);
            try {
              const supabase = createSupabaseBrowserClient();
              const { data, error: signUpError } = await supabase.auth.signUp({
                email: email.trim(),
                password,
              });
              if (signUpError) {
                setError(signUpError.message);
                setSubmitting(false);
                return;
              }
              if (!data.session) {
                setInfo("สร้างบัญชีแล้ว กรุณาเช็คอีเมลเพื่อยืนยันก่อนเข้าสู่ระบบ");
                setSubmitting(false);
                return;
              }
              router.replace("/");
              setSubmitting(false);
            } catch (e: any) {
              setError(e?.message ?? "สร้างบัญชีไม่สำเร็จ");
              setSubmitting(false);
            }
          }}
        >
          {submitting ? "กำลังสร้างบัญชี..." : "สร้างบัญชี"}
        </Button>
        <Button variant="outline" className="w-full" onClick={() => router.push(withBasePath("/signin"))}>
          กลับไปหน้าเข้าสู่ระบบ
        </Button>
      </div>
    </div>
  );
}
