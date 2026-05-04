"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useEffect } from "react";

import { useAuth } from "@/app/shared/auth-provider";
import { APP_BASE_PATH, withBasePath } from "@/utils/base-path";

function normalizeBasePath(basePath: string) {
  const trimmed = (basePath ?? "").trim();
  if (!trimmed) return "";
  if (trimmed === "/") return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

function stripBasePath(pathname: string) {
  const basePath = normalizeBasePath(APP_BASE_PATH);
  if (!basePath) return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length) || "/";
  return pathname;
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { loading, blocked, userId } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!userId || blocked) {
      const qs = searchParams?.toString() ? `?${searchParams.toString()}` : "";
      const current = `${stripBasePath(pathname)}${qs}`;
      const dest = current && current.startsWith("/") ? current : "/";
      const extra = blocked ? "&blocked=1" : "";
      router.replace(withBasePath(`/signin?returnTo=${encodeURIComponent(dest)}${extra}`));
    }
  }, [blocked, loading, pathname, router, searchParams, userId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
      </div>
    );
  }

  if (!userId || blocked) return null;
  return <>{children}</>;
}
