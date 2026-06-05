"use client";

/**
 * ImpersonationBanner
 *
 * Renders a fixed red bar at the top of every page when a super admin has an
 * active impersonation session. The session ID is stored in localStorage so it
 * persists across navigations and is visible across tabs.
 *
 * Usage:
 *   // In layout.tsx (server component):
 *   <ImpersonationBanner />
 *
 *   // To start a session (e.g. from the users admin page):
 *   import { startImpersonationSession } from '@/components/impersonation-banner';
 *   startImpersonationSession(sessionId);
 */

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { backendUrl } from "@/lib/backend";
import { Button } from "@/components/ui/button";

export const IMPERSONATION_SESSION_KEY = "perpos_impersonation_session_id";
const CHECK_INTERVAL_MS = 60_000; // re-verify every 60 s

type ImpersonationInfo = {
  id: string;
  is_active: boolean;
  expired?: boolean;
  reason: string;
  started_at: string;
  target_user: {
    id: string;
    email: string | null;
    display_name: string | null;
  } | null;
  org: { id: string; name: string; slug: string } | null;
};

export function ImpersonationBanner() {
  const [info, setInfo] = useState<ImpersonationInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const bannerRef = React.useRef<HTMLDivElement>(null);

  const clearSession = useCallback(() => {
    localStorage.removeItem(IMPERSONATION_SESSION_KEY);
    setSessionId(null);
    setInfo(null);
  }, []);

  const checkSession = useCallback(
    async (sid: string) => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          clearSession();
          return;
        }

        const res = await fetch(
          backendUrl(`/admin/impersonate?sessionId=${encodeURIComponent(sid)}`),
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        );
        if (!res.ok) {
          clearSession();
          return;
        }

        const data = (await res.json()) as ImpersonationInfo;
        if (!data.is_active || data.expired) {
          clearSession();
          return;
        }

        setInfo(data);
      } catch {
        clearSession();
      }
    },
    [clearSession],
  );

  // On mount: read localStorage and start polling
  useEffect(() => {
    const sid = localStorage.getItem(IMPERSONATION_SESSION_KEY);
    if (!sid) return;

    setSessionId(sid);
    checkSession(sid);

    const interval = setInterval(() => {
      const current = localStorage.getItem(IMPERSONATION_SESSION_KEY);
      if (current) checkSession(current);
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [checkSession]);

  // Cross-tab sync via storage events
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== IMPERSONATION_SESSION_KEY) return;
      if (!e.newValue) {
        setInfo(null);
        setSessionId(null);
      } else {
        setSessionId(e.newValue);
        checkSession(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [checkSession]);

  // Track banner height and set as CSS custom property
  useEffect(() => {
    if (!info) {
      document.documentElement.style.removeProperty("--impersonation-banner-height");
      return;
    }

    const updateHeight = () => {
      if (bannerRef.current) {
        const height = bannerRef.current.offsetHeight;
        document.documentElement.style.setProperty(
          "--impersonation-banner-height",
          `${height}px`
        );
      }
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });

    if (bannerRef.current) {
      resizeObserver.observe(bannerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.removeProperty("--impersonation-banner-height");
    };
  }, [info]);

  const handleEndSession = useCallback(async () => {
    if (!sessionId) return;
    setEnding(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch(backendUrl("/admin/impersonate"), {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ sessionId }),
        });
      }
    } catch {
      /* ignore — still clear locally */
    } finally {
      clearSession();
      setEnding(false);
    }
  }, [sessionId, clearSession]);

  if (!info) return null;

  const targetName =
    info.target_user?.display_name ||
    info.target_user?.email ||
    "Unknown User";

  const startedAt = new Date(info.started_at);
  const expiresAt = new Date(startedAt.getTime() + 30 * 60 * 1000);
  const minutesLeft = Math.max(
    0,
    Math.round((expiresAt.getTime() - Date.now()) / 60_000),
  );

  return (
    <div
      ref={bannerRef}
      className="fixed left-0 right-0 top-0 z-[9999] flex items-center gap-3 bg-red-600 px-4 py-2.5 text-white shadow-lg"
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm min-w-0">
        <span className="font-semibold whitespace-nowrap">⚠️ โหมดสวมรอย</span>
        <span className="opacity-90">
          กำลังดูข้อมูลในฐานะ{" "}
          <strong className="font-semibold">{targetName}</strong>
          {info.org && (
            <>
              {" "}
              —{" "}
              <span className="opacity-80">{info.org.name}</span>
            </>
          )}
        </span>
        {minutesLeft > 0 && (
          <span className="whitespace-nowrap rounded-full bg-red-800/60 px-2 py-0.5 text-xs font-medium">
            เหลือ {minutesLeft} นาที
          </span>
        )}
        <span className="hidden text-xs opacity-60 sm:inline truncate max-w-xs">
          เหตุผล: {info.reason}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 border-red-300 bg-transparent text-white hover:bg-red-700 hover:border-red-400 hover:text-white focus-visible:ring-red-300"
        onClick={handleEndSession}
        disabled={ending}
      >
        <X className="mr-1 h-3.5 w-3.5" />
        {ending ? "กำลังออก…" : "ออกจากโหมดสวมรอย"}
      </Button>
    </div>
  );
}

/**
 * Call this from any client component (e.g. users admin page) to start an
 * impersonation session that will be picked up by the banner.
 */
export function startImpersonationSession(sessionId: string): void {
  localStorage.setItem(IMPERSONATION_SESSION_KEY, sessionId);
  // Notify other tabs
  window.dispatchEvent(
    new StorageEvent("storage", {
      key:      IMPERSONATION_SESSION_KEY,
      newValue: sessionId,
    }),
  );
}
