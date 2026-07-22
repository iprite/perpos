"use client";

// download.ts — ดาวน์โหลดไฟล์จาก API ที่ต้องแนบ Bearer token (PDF ของชุดแคตตาล็อก)
// `govApi` อ่านเป็น JSON อย่างเดียว จึงต้องมีตัวนี้แยกสำหรับ binary (ไม่แตะไฟล์เดิม)

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** ยิง GET พร้อม token → บันทึกไฟล์ผ่าน object URL (ปล่อยคืนทันทีหลังใช้) */
export async function downloadWithAuth(path: string, filename: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");

  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || "ดาวน์โหลดไม่สำเร็จ");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
