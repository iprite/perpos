/**
 * ล้างกล่อง (ถังขยะ / จดหมายขยะ) — **ลบถาวร ไม่มีเลิกทำ**
 *
 * ต่างจากปุ่มลบทั่วไปในแอปที่แค่ "ย้ายเข้าถังขยะ" (ย้อนกลับได้) — ตัวนี้คือ `Email/set destroy`
 * ⇒ ทุกเส้นทางที่เรียกต้องให้ผู้ใช้ยืนยันพร้อม **จำนวนที่จะหาย** ก่อนเสมอ
 *
 * กฎที่ยึดไว้:
 *  - **เฉพาะถังขยะกับจดหมายขยะ** — สองกล่องนี้เท่านั้นที่ "ล้างทิ้ง" เป็นความหมายปกติของผู้ใช้
 *  - ทำเป็นก้อน (`EMPTY_BOX_LIMIT`) ต่อ request เหมือนงานอื่น กันลบครึ่ง ๆ กลาง ๆ ตอน timeout
 *  - ลบจาก "เก่าสุดก่อน" — กดซ้ำแล้วเดินหน้าเสมอ ไม่วนที่เดิม
 */

import { MailServiceError, jmapRequest, pickResponse } from "./jmap";
import { fetchMailboxes, mailboxIdByKey } from "./messages";
import { MAIL_RULE_APPLY_LIMIT } from "./rule-meta";
import type { MailBoxKey, MailSession } from "./types";

/**
 * ก้อนละกี่ฉบับต่อหนึ่ง request — ใช้ตัวเลขเดียวกับ bulk อื่นทั้งระบบ
 * (ไม่ใช่ความชอบ: เป็นขนาดที่พิสูจน์แล้วว่าอยู่ใต้ `maxObjectsInSet`/ขนาด request ของเซิร์ฟเวอร์นี้จริง)
 */
export const EMPTY_BOX_LIMIT = MAIL_RULE_APPLY_LIMIT;

/** กล่องที่ "ล้าง" ได้ — ห้ามเพิ่มกล่องอื่นเด็ดขาด (กล่องขาเข้า/ส่งแล้วคือข้อมูลจริงของผู้ใช้) */
export const EMPTYABLE_BOXES = ["trash", "junk"] as const;
export type EmptyableBox = (typeof EMPTYABLE_BOXES)[number];

export function isEmptyableBox(value: unknown): value is EmptyableBox {
  return typeof value === "string" && (EMPTYABLE_BOXES as readonly string[]).includes(value);
}

async function boxId(session: MailSession, key: MailBoxKey): Promise<string> {
  const id = mailboxIdByKey(await fetchMailboxes(session))[key];
  if (!id) throw new MailServiceError(404, "ไม่พบกล่องนี้ในกล่องเมล");
  return id;
}

export interface EmptyBoxResult {
  /** ลบไปรอบนี้กี่ฉบับ */
  destroyed: number;
  /** เหลืออีกกี่ฉบับ (กดซ้ำเพื่อทำต่อ) */
  remaining: number;
}

export async function emptyMailbox(
  session: MailSession,
  box: EmptyableBox,
  limit = EMPTY_BOX_LIMIT,
): Promise<EmptyBoxResult> {
  const mailboxId = await boxId(session, box);
  const query = await jmapRequest(session, [
    [
      "Email/query",
      {
        accountId: session.accountId,
        filter: { inMailbox: mailboxId },
        sort: [{ property: "receivedAt", isAscending: true }],
        limit,
        calculateTotal: true,
      },
      "q",
    ],
  ]);
  const result = pickResponse(query, "q");
  const ids = Array.isArray(result.ids) ? (result.ids as string[]) : [];
  const total = typeof result.total === "number" ? result.total : ids.length;
  if (ids.length === 0) return { destroyed: 0, remaining: 0 };

  const responses = await jmapRequest(session, [
    ["Email/set", { accountId: session.accountId, destroy: ids }, "d"],
  ]);
  const set = pickResponse(responses, "d");
  const destroyed = Array.isArray(set.destroyed) ? (set.destroyed as string[]).length : 0;
  return { destroyed, remaining: Math.max(0, total - destroyed) };
}
