"use client";

import { useEffect } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { backendUrl } from "@/lib/backend";

const PING_INTERVAL_MS = 300_000; // ทุก 5 นาที (ลด Fluid Active CPU — 1 invocation/ping/แท็บ)

/**
 * Heartbeat — ยิง /presence/ping เป็นระยะเพื่ออัปเดต profiles.last_seen_at
 * ใช้โชว์สถานะ "ออนไลน์" ในหน้า admin/users · หยุดยิงเมื่อแท็บถูกซ่อน (ประหยัด)
 */
export default function PresenceHeartbeat() {
  useEffect(() => {
    const supabase = (() => {
      try {
        return createSupabaseBrowserClient();
      } catch {
        return null;
      }
    })();
    if (!supabase) return;

    let cancelled = false;

    const ping = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        await fetch(backendUrl("/presence/ping"), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true,
        });
      } catch {
        /* presence ไม่ critical — เงียบไว้ */
      }
    };

    ping();
    const id = window.setInterval(ping, PING_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
