// api.ts — client helper เรียก /api/p2p-group/* ด้วย access token
// pattern เดียวกับ hrm/_components/api.ts

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

async function authHeader(): Promise<Record<string, string>> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** POST/PATCH/DELETE ไป /api/p2p-group/* — โยน Error(ข้อความไทย) ถ้า !ok */
export async function p2pgMutate<T = unknown>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown> = {},
): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(path, { method, headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || "เกิดข้อผิดพลาด");
  }
  return (await res.json().catch(() => ({}))) as T;
}

/** ต่อ query orgId ให้ path */
export function withOrg(path: string, orgId: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}orgId=${encodeURIComponent(orgId)}`;
}
