/**
 * document-share.ts — ลิงก์สาธารณะของเอกสารขาย (Phase 2)
 *
 * ลูกค้าปลายทางของ SME ไม่มีบัญชีในระบบ → ส่ง capability URL ให้เปิดดู/โหลด PDF
 * ความปลอดภัยอยู่ที่ "token เดาไม่ได้ + เพิกถอนได้ + ผูกกับเอกสารใบเดียว"
 * (ไม่ใช่ที่ login) — logic ตัดสินว่าลิงก์ยังใช้ได้ไหมอยู่ที่นี่ที่เดียว
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DocumentShareRow {
  org_id: string;
  document_id: string;
  token: string;
  expires_at: string | null;
  revoked_at: string | null;
}

/** ลิงก์ที่ให้ลูกค้า — ใช้ APP_BASE_URL (แอปอยู่ที่ app.perpos.ai ไม่ใช่ perpos.ai) */
export function shareUrlFromToken(token: string): string {
  const base = (process.env.APP_BASE_URL || "https://app.perpos.ai").replace(/\/$/, "");
  return `${base}/d/${token}`;
}

export type ShareLookup =
  | { ok: true; share: DocumentShareRow }
  | { ok: false; reason: "not_found" | "revoked" | "expired" };

/**
 * หา share ที่ยังใช้ได้จาก token — แยกเหตุผลออกมาเพื่อให้หน้า public บอกลูกค้าได้ตรง
 * (ลิงก์ถูกยกเลิก ≠ ลิงก์ผิด — คนละข้อความ)
 */
export async function lookupShare(db: SupabaseClient, token: string): Promise<ShareLookup> {
  if (!token || token.length < 20) return { ok: false, reason: "not_found" };
  const { data } = await db
    .from("acc_document_shares")
    .select("org_id, document_id, token, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  const row = data as DocumentShareRow | null;
  if (!row) return { ok: false, reason: "not_found" };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now())
    return { ok: false, reason: "expired" };
  return { ok: true, share: row };
}

/**
 * นับยอดเปิดดู (best-effort — ห้ามทำให้หน้าลูกค้าพัง)
 * ต้องเพิ่มจากค่าปัจจุบัน "ในฐาน" ไม่ใช่ค่าที่ caller เดามา — ไม่งั้นเปิดกี่ครั้งก็ค้างที่ 1
 * (RPC atomic ทำให้เปิดพร้อมกันหลายคนก็ไม่ทับกัน)
 */
export async function touchShare(db: SupabaseClient, token: string) {
  await db.rpc("bump_document_share_view", { p_token: token }).then(
    () => undefined,
    () => undefined,
  );
}
