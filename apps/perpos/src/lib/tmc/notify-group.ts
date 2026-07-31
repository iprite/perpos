/**
 * กลุ่ม LINE ของทีมแอดมิน TMC — ช่องทางรับแจ้งเตือน "ลูกค้ารอแอดมิน" ของผู้ช่วยขาย @tmcvilla
 *
 * ⚠️ กลุ่มนี้อยู่กับ **บอท PERPOS** (@perpos) ไม่ใช่ @tmcvilla
 *    - @tmcvilla = OA ที่คุยกับลูกค้า (ห้ามเอาเข้ากลุ่มภายใน)
 *    - @perpos   = บอทภายในที่ทีมใช้อยู่แล้ว → รหัสผูกกลุ่มจึงถูกรับที่ /api/line/webhook
 *      และการ์ดแจ้งเตือนก็ push ออกจาก channel ของ PERPOS
 *
 * กติกาเดียวกับกลุ่มลูกค้าของ acc_firm: กลุ่มที่ยังไม่ผูก บอทเงียบเสมอ ·
 * รหัสใช้ครั้งเดียว หมดอายุ 24 ชม. · รหัสผิด/ไม่รู้จัก = ไม่ตอบ (กันเดารหัส)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** อายุรหัสผูกกลุ่ม (ชั่วโมง) */
export const TMC_LINK_CODE_TTL_HOURS = 24;

/** ตัวอักษรที่อ่านผิดยาก (ไม่มี 0/O, 1/I/L) — แอดมินอ่านจากจอไปพิมพ์ในกลุ่ม */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const TMC_LINK_CODE_RE = /^TMC-[A-Z0-9]{6}$/;

export function generateTmcLinkCode(randomBytes: (n: number) => Uint8Array | Buffer): string {
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `TMC-${out}`;
}

export function normalizeTmcLinkCode(raw: string): string | null {
  const t = raw.trim().toUpperCase().replace(/\s+/g, "");
  return TMC_LINK_CODE_RE.test(t) ? t : null;
}

/**
 * ข้อความนี้ "อาจ" เป็นรหัสผูกกลุ่มของ TMC ไหม — เช็คด้วยสตริงล้วน ไม่แตะ DB
 * ใช้เป็นด่านหน้าใน webhook เพื่อไม่ให้ข้อความคุยกันธรรมดาในกลุ่มยิง query
 */
export function isTmcGroupInput(text: string): boolean {
  return normalizeTmcLinkCode(text) !== null;
}

/** ชื่อกลุ่ม (ใช้ token ของ PERPOS) — โชว์ในหน้าตั้งค่าให้รู้ว่าผูกกลุ่มไหนอยู่ */
async function getGroupName(groupId: string): Promise<string | null> {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? "";
  if (!token) return null;
  const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!res?.ok) return null;
  const json = (await res.json().catch(() => null)) as { groupName?: string } | null;
  return json?.groupName ?? null;
}

/**
 * รับข้อความจากกลุ่มที่ webhook ของ PERPOS
 * คืนข้อความที่จะตอบกลับ · คืน null = ไม่ใช่เรื่องของโมดูลนี้ (บอทต้องเงียบ)
 */
export async function handleTmcGroupMessage(
  admin: SupabaseClient,
  groupId: string,
  text: string,
): Promise<{ text: string } | null> {
  const code = normalizeTmcLinkCode(text);
  if (!code) return null;

  const { data } = await admin
    .from("tmc_bot_settings")
    .select("org_id, link_code, link_code_expires_at")
    .eq("link_code", code)
    .maybeSingle();

  const row = data as { org_id: string; link_code: string; link_code_expires_at: string } | null;
  if (!row) return null; // รหัสไม่ตรงกับของ org ไหนเลย → เงียบ (กันเดารหัส)

  const expires = row.link_code_expires_at ? new Date(row.link_code_expires_at) : null;
  if (!expires || expires < new Date()) {
    return { text: "รหัสนี้หมดอายุแล้วค่ะ 🙏 กรุณาขอรหัสใหม่จากหน้า “ผู้ช่วยขาย LINE” ในระบบ" };
  }

  const groupName = await getGroupName(groupId);
  await admin
    .from("tmc_bot_settings")
    .update({
      notify_group_id: groupId,
      notify_group_name: groupName,
      notify_linked_at: new Date().toISOString(),
      link_code: null, // ใช้ครั้งเดียว
      link_code_expires_at: null,
    })
    .eq("org_id", row.org_id);

  return {
    text: "ผูกกลุ่มสำเร็จแล้วค่ะ ✅\nต่อจากนี้ ถ้าผู้ช่วยขาย @tmcvilla ตอบลูกค้าไม่ได้ หรือลูกค้าขอคุยกับแอดมิน ระบบจะแจ้งเข้ากลุ่มนี้ทันทีค่ะ",
  };
}

/** บอทถูกเตะ/ออกจากกลุ่ม → ปลดการผูก ไม่งั้นจะ push ไปที่ที่ส่งไม่ถึง */
export async function unlinkTmcGroupOnLeave(admin: SupabaseClient, groupId: string): Promise<void> {
  await admin
    .from("tmc_bot_settings")
    .update({ notify_group_id: null, notify_group_name: null, notify_linked_at: null })
    .eq("notify_group_id", groupId);
}
