import type { SupabaseClient } from "@supabase/supabase-js";
import { sendLineMessages } from "@/lib/line/send-messages";

/**
 * แจ้งเตือน admin ผ่าน LINE — ช่องทางแจ้งปัญหาระบบ (Phase 1 monitoring)
 *
 * ปลายทาง: super_admin ทุกคนที่ link LINE (มี line_user_id)
 *   override ได้ด้วย env `ALERT_LINE_USER_IDS` (คั่นด้วย comma) — ใช้เวลาอยากจำกัด/ทดสอบ
 *
 * best-effort เสมอ: ไม่ throw — ถ้าการแจ้งเตือนล้ม จะไม่ทำให้งานหลัก (scheduler/webhook) พัง
 * รับ `admin` client เป็น argument ตาม convention ของ codebase (เหมือน token-billing.ts)
 */
export async function alertAdminLine(admin: SupabaseClient, text: string): Promise<void> {
  try {
    const envIds = process.env.ALERT_LINE_USER_IDS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    let ids = envIds && envIds.length > 0 ? envIds : undefined;

    if (!ids) {
      const { data } = await admin
        .from("profiles")
        .select("line_user_id")
        .eq("role", "super_admin")
        .not("line_user_id", "is", null);
      ids = (data ?? []).map((r) => r.line_user_id as string).filter(Boolean);
    }

    if (!ids.length) return;

    // LINE text cap = 5000 ตัวอักษร — เผื่อ prefix ไว้
    await sendLineMessages({ to: ids, messages: [{ type: "text", text: text.slice(0, 4900) }] });
  } catch (e) {
    console.error("[alertAdminLine] failed:", e instanceof Error ? e.message : String(e));
  }
}
