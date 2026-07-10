// api.ts — client helper เรียก /api/gov-procure/* ด้วย access token (RLS-scoped)
// pattern เดียวกับ hrm/_components/api.ts: getSession().access_token → Authorization: Bearer
// ทุก endpoint รับ ?orgId= + Bearer token (ดู api/gov-procure/_lib.ts)

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

async function authToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");
  return token;
}

/** JSON call ไป /api/gov-procure/* — โยน Error(message ไทย) ถ้า !ok */
export async function govApi<T = unknown>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  body?: Record<string, unknown>,
): Promise<T> {
  const token = await authToken();
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || "เกิดข้อผิดพลาด");
  }
  return (await res.json().catch(() => ({}))) as T;
}

/** FormData upload (attachments) — browser ตั้ง Content-Type multipart boundary เอง */
export async function govForm<T = unknown>(
  path: string,
  method: "POST",
  form: FormData,
): Promise<T> {
  const token = await authToken();
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || "อัปโหลดไม่สำเร็จ");
  }
  return (await res.json().catch(() => ({}))) as T;
}
