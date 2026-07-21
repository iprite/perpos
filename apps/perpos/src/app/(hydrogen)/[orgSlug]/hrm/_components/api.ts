// api.ts — client helper เรียก /api/hrm/* ด้วย access token (RLS-scoped)
// pattern เดียวกับ crm/tmc client: getSession().access_token → Authorization: Bearer
// ใช้ใน client view ที่ทำ mutation (เพิ่ม/แก้พนักงาน ฯลฯ)

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

async function authHeader(): Promise<Record<string, string>> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** POST/PATCH ไป /api/hrm/* — โยน Error(message ไทย) ถ้า !ok */
export async function hrmMutate<T = unknown>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown>,
): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(path, { method, headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || "เกิดข้อผิดพลาด");
  }
  return (await res.json().catch(() => ({}))) as T;
}
