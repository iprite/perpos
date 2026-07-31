"use client";

/**
 * api-client.ts — ตัวเรียก `/api/just-me/*` ฝั่งเบราว์เซอร์ (mutation เท่านั้น)
 * หน้า server component อ่านข้อมูลผ่าน `lib/just-me/*` ตรง ๆ — ที่นี่ไว้ใช้ตอน "กดบันทึก"
 *
 * route ทุกเส้นต้องมี Bearer token + `?orgId=` (ดู `api/just-me/_lib.ts` → `guard()`)
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function withOrg(path: string, orgId: string): string {
  return `/api/just-me/${path}${path.includes("?") ? "&" : "?"}orgId=${encodeURIComponent(orgId)}`;
}

async function parse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "ทำรายการไม่สำเร็จ");
  }
  return json as T;
}

export async function jmGet<T>(orgId: string, path: string): Promise<T> {
  const res = await fetch(withOrg(path, orgId), { headers: await authHeaders() });
  return parse<T>(res);
}

export async function jmSend<T>(
  orgId: string,
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(withOrg(path, orgId), {
    method,
    headers: await authHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

/** อัปโหลดไฟล์เข้า bucket ผ่าน signed upload URL (ไฟล์ไม่วิ่งผ่าน route ของเรา) */
export async function jmUploadToSignedUrl(signedUrl: string, file: File): Promise<void> {
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error("อัปโหลดไฟล์ไม่สำเร็จ");
}
