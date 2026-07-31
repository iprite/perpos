/**
 * LINE OA ของ TMC (@tmcvilla) — คนละ channel กับบอท PERPOS
 *
 * ⚠️ ห้ามใช้ LINE_MESSAGING_CHANNEL_* (ของ PERPOS) กับ OA ตัวนี้เด็ดขาด
 *    signature จะไม่ผ่าน และข้อความจะถูกส่งออกผิด OA
 *
 * env ที่ต้องตั้ง
 *   TMC_LINE_CHANNEL_SECRET        — ใช้ verify webhook signature
 *   TMC_LINE_CHANNEL_ACCESS_TOKEN  — ใช้ reply / ดึงโปรไฟล์ลูกค้า / อ่าน bot info
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

/** ตอบหลายข้อความในครั้งเดียว (LINE จำกัด 5 ข้อความต่อ reply) — ใช้ตอนส่งรูปห้องพัก */
export async function tmcReplyMessages(replyToken: string, messages: unknown[]): Promise<void> {
  if (!token() || !replyToken || !messages.length) return;
  await fetch(`${LINE_API}/message/reply`, {
    method: "POST",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  }).catch(() => undefined);
}

export async function tmcReplyText(replyToken: string, text: string): Promise<void> {
  if (!token() || !replyToken) return;
  await fetch(`${LINE_API}/message/reply`, {
    method: "POST",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
  }).catch(() => undefined);
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
