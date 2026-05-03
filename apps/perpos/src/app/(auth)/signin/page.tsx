"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Title, Text } from "rizzui";
import { MessageCircle, RefreshCcw } from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { APP_BASE_PATH, withBasePath } from "@/utils/base-path";

const SUPABASE_OAUTH_PROVIDER = (process.env.NEXT_PUBLIC_SUPABASE_OAUTH_PROVIDER ?? "oidc").trim();

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

export default function SignInLineOnlyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId, loading: authLoading, envError } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get("returnTo")), [searchParams]);
  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}${withBasePath("/auth/callback")}`;
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) return;
    const dest = returnTo ?? "/";
    router.replace(withBasePath(dest));
  }, [authLoading, returnTo, router, userId]);

  return (
    <div className="mx-auto w-full max-w-md">
      <Title as="h2" className="text-xl font-semibold text-gray-900">
        เข้าสู่ระบบ
      </Title>
      <Text className="mt-2 text-sm text-gray-600">ใช้บัญชี LINE ของคุณเพื่อดำเนินการต่อ</Text>

      {envError ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{envError}</div> : null}
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="mt-8 grid gap-3">
        <Button
          className="w-full bg-[#06C755] text-white hover:bg-[#05b14a] disabled:bg-[#06C755]/60"
          disabled={submitting || !!envError || authLoading}
          onClick={async () => {
            setSubmitting(true);
            setError(null);
            try {
              if (returnTo) window.sessionStorage.setItem("auth:returnTo", returnTo);
              else window.sessionStorage.removeItem("auth:returnTo");

              const supabase = createSupabaseBrowserClient();
              const { data, error: e } = await supabase.auth.signInWithOAuth({
                provider: SUPABASE_OAUTH_PROVIDER as any,
                options: { redirectTo: callbackUrl },
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
          <span className="inline-flex items-center justify-center gap-2">
            <MessageCircle className="h-4 w-4" />
            {submitting ? "กำลังพาไปที่ LINE..." : "เข้าสู่ระบบด้วย LINE"}
          </span>
        </Button>

        <div className="text-xs text-gray-500">คุณจะถูกพาไปที่ LINE เพื่อยืนยันตัวตน</div>

        {error ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={submitting}
            onClick={() => {
              setError(null);
              setSubmitting(false);
            }}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <RefreshCcw className="h-4 w-4" />
              ลองอีกครั้ง
            </span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
