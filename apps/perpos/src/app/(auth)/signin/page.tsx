"use client";

import React, { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/app/shared/auth-provider";
import GoogleAuthView from "@/components/auth/google-auth-view";
import { APP_BASE_PATH, withBasePath } from "@/utils/base-path";

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

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { blocked, profile, userId, loading: authLoading } = useAuth();

  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get("returnTo")), [searchParams]);
  useEffect(() => {
    if (authLoading) return;
    if (!userId) return;
    if (blocked || profile?.is_active === false) return;
    if (!profile) return;
    const dest = returnTo ?? "/";
    router.replace(withBasePath(dest));
  }, [authLoading, blocked, profile, returnTo, router, userId]);

  return (
    <div className="w-full">
      <GoogleAuthView mode="page" returnTo={returnTo} />
    </div>
  );
}
