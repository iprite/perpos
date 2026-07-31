/**
 * LINE OA ของ TMC (@tmcvilla) — คนละ channel กับบอท PERPOS
 *
 * ⚠️ ห้ามใช้ LINE_MESSAGING_CHANNEL_* (ของ PERPOS) กับ OA ตัวนี้เด็ดขาด
 *    signature จะไม่ผ่าน และข้อความจะถูกส่งออกผิด OA
 *
 * env ที่ต้องตั้ง
 *   TMC_LINE_CHANNEL_SECRET        — ใช้ verify webhook signature
 *   TMC_LINE_CHANNEL_ACCESS_TOKEN  — ใช้ reply/push/ดึงโปรไฟล์
 *   TMC_BOT_ORG_SLUG (optional)    — ระบุ org เจ้าของ OA ถ้ามีหลาย org ที่เปิด module tmc
 */
import crypto from "crypto";

const LINE_API = "https://api.line.me/v2/bot";

export function tmcLineConfigured(): boolean {
  return !!(process.env.TMC_LINE_CHANNEL_SECRET && process.env.TMC_LINE_CHANNEL_ACCESS_TOKEN);
}

export function verifyTmcSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.TMC_LINE_CHANNEL_SECRET ?? "";
  if (!secret || !signature) return false;
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  try {
    const a = Buffer.from(computed);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function token(): string {
  return process.env.TMC_LINE_CHANNEL_ACCESS_TOKEN ?? "";
}

export async function tmcReplyText(replyToken: string, text: string): Promise<void> {
  if (!token() || !replyToken) return;
  await fetch(`${LINE_API}/message/reply`, {
    method: "POST",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
  }).catch(() => undefined);
}

export async function tmcPushText(to: string, text: string): Promise<void> {
  if (!token() || !to) return;
  await fetch(`${LINE_API}/message/push`, {
    method: "POST",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
  }).catch(() => undefined);
}

/** push ข้อความใด ๆ (รวม Flex) ออกจาก @tmcvilla — ใช้ส่งการ์ดแจ้งเตือนเข้ากลุ่มทีมแอดมิน */
export async function tmcPushMessages(to: string, messages: unknown[]): Promise<boolean> {
  if (!token() || !to || !messages.length) return false;
  const res = await fetch(`${LINE_API}/message/push`, {
    method: "POST",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify({ to, messages }),
  }).catch(() => null);
  return !!res?.ok;
}

/** ชื่อกลุ่ม (โชว์ในหน้าตั้งค่าให้แอดมินรู้ว่าผูกกลุ่มไหนอยู่) */
export async function tmcGetGroupName(groupId: string): Promise<string | null> {
  if (!token()) return null;
  const res = await fetch(`${LINE_API}/group/${groupId}/summary`, {
    headers: { authorization: `Bearer ${token()}` },
  }).catch(() => null);
  if (!res?.ok) return null;
  const json = (await res.json().catch(() => null)) as { groupName?: string } | null;
  return json?.groupName ?? null;
}

export interface TmcLineProfile {
  displayName?: string;
  pictureUrl?: string;
}

export async function tmcGetProfile(lineUserId: string): Promise<TmcLineProfile | null> {
  if (!token()) return null;
  const res = await fetch(`${LINE_API}/profile/${lineUserId}`, {
    headers: { authorization: `Bearer ${token()}` },
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as TmcLineProfile | null;
}

/** userId ของ OA เอง — ใช้ประกอบลิงก์ห้องแชทใน LINE Official Account Manager */
export async function tmcGetBotUserId(): Promise<string | null> {
  if (!token()) return null;
  const res = await fetch(`${LINE_API}/info`, {
    headers: { authorization: `Bearer ${token()}` },
  }).catch(() => null);
  if (!res?.ok) return null;
  const json = (await res.json().catch(() => null)) as { userId?: string } | null;
  return json?.userId ?? null;
}

/** ลิงก์เปิดห้องแชทของลูกค้าคนนั้นใน LINE OA Manager (แอดมินกดแล้วคุยต่อได้ทันที) */
export function tmcChatUrl(botUserId: string | null, customerLineUserId: string): string {
  if (!botUserId) return "https://chat.line.biz/";
  return `https://chat.line.biz/${botUserId}/chat/${customerLineUserId}`;
}
