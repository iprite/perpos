"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";

import { useRole } from "@/app/providers";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useRole();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => email.trim().length > 0 && password.trim().length > 0, [email, password]);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, router, user]);

  return (
    <div className="min-h-screen bg-[color:var(--color-background)] text-[color:var(--color-foreground)] flex items-center justify-center p-6">
      <div className="w-full max-w-[420px] rounded-xl border bg-[color:var(--color-surface)] p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-base font-semibold">ExApp</div>
            <div className="mt-1 text-sm text-[color:var(--color-muted)]">เข้าสู่ระบบด้วย Supabase</div>
          </div>
          <div className="h-10 w-10 rounded-lg border bg-[color:var(--color-surface-2)] flex items-center justify-center text-sm font-semibold">
            EX
          </div>
        </div>

        <div className="mt-5">
          <label className="text-sm font-medium">อีเมล</label>
          <input
            className="mt-2 h-10 w-full rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            placeholder="name@company.com"
          />
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium">รหัสผ่าน</label>
          <input
            className="mt-2 h-10 w-full rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            type="password"
          />
        </div>

        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

        <button
          type="button"
          className="mt-5 h-10 w-full rounded-md bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          disabled={!canSubmit || submitting}
          onClick={async () => {
            setSubmitting(true);
            setError(null);
            const supabase = createSupabaseBrowserClient();
            const { error: signInError } = await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
            if (signInError) {
              setError(signInError.message);
              setSubmitting(false);
              return;
            }
            router.replace("/");
            setSubmitting(false);
          }}
        >
          {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>

        <button
          type="button"
          className="mt-3 h-10 w-full rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm font-medium hover:bg-[color:var(--color-surface)] transition disabled:opacity-50"
          disabled={!canSubmit || submitting}
          onClick={async () => {
            setSubmitting(true);
            setError(null);
            const supabase = createSupabaseBrowserClient();
            const { error: signUpError } = await supabase.auth.signUp({
              email: email.trim(),
              password,
            });
            if (signUpError) {
              setError(signUpError.message);
              setSubmitting(false);
              return;
            }
            router.replace("/");
            setSubmitting(false);
          }}
        >
          {submitting ? "กำลังสร้างบัญชี..." : "สร้างบัญชี (Dev)"}
        </button>
      </div>
    </div>
  );
}
