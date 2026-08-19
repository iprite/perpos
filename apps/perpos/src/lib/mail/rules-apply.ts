/**
 * "ใช้กฎกับเมลที่มีอยู่แล้ว" — งานคนละชิ้นกับตัวกฎกรอง
 *
 * Sieve เป็น **ตัวกรองตอนเมลเข้า** เท่านั้น ย้อนหลังไม่ได้โดยธรรมชาติ
 * ⇒ ของเก่าต้องค้นด้วย `Email/query` แล้วสั่ง `Email/set` เอง (Gmail/Roundcube ก็แยกเป็นคนละปุ่ม)
 *
 * กฎที่ยึดไว้:
 *  - **ทำเฉพาะกล่องขาเข้า** — ของที่ผู้ใช้จัดเก็บ/ลบไปแล้วห้ามถูกกฎใหม่ลากกลับมาขยับ
 *  - **รายฉบับ ไม่ใช่รายเธรด** (กฎกรองทำงานทีละฉบับ — เธรดเดียวอาจมีผู้ส่งหลายคน)
 *  - **มีเพดานต่อครั้ง** (`RULE_APPLY_LIMIT`) — ย้ายพันฉบับใน request เดียวคือทางไปสู่
 *    "ย้ายไปครึ่งเดียวแล้ว timeout" ซึ่งผู้ใช้กู้เองไม่ได้ · เกินเพดานให้กดซ้ำ
 *  - ผลลัพธ์คืน undo token ชุดเดียวกับลบ/ย้าย ⇒ เลิกทำได้ด้วยท่อเดิม
 */

import { MailServiceError, jmapRequest, pickResponse } from "./jmap";
import { MAIL_RULE_APPLY_LIMIT } from "./rule-meta";
import { applyMailPatch, fetchMailboxes, mailboxIdByKey } from "./messages";
import type { MailMutationResult } from "./messages";
import type { MailRule, MailRuleCondition, MailSession } from "./types";

/** เพดานต่อครั้ง — นิยามที่ `rule-meta.ts` เพื่อให้หน้าเว็บกับเซิร์ฟเวอร์พูดตัวเลขเดียวกัน */
export const RULE_APPLY_LIMIT = MAIL_RULE_APPLY_LIMIT;

/** ช่องของกฎ → ช่อง filter ของ JMAP (ความหมายตรงกัน: substring match) */
const FIELD_TO_FILTER: Record<MailRuleCondition["field"], string> = {
  from: "from",
  to: "to",
  cc: "cc",
  subject: "subject",
};

function conditionFilter(c: MailRuleCondition): Record<string, unknown> | null {
  const value = c.value.trim();
  if (!value) return null;
  /**
   * 🔴 JMAP ไม่มี "ตรงกันเป๊ะ" สำหรับช่องพวกนี้ — ถ้าตีเป็น substring เหมือน `contains`
   *    จะย้ายเมลที่ Sieve จริง ๆ ไม่แตะ (กฎ `ผู้ส่ง ตรงกับ a@b.c` จะกวาด `xa@b.c` ไปด้วย)
   *    ⇒ ยอมปฏิเสธดีกว่าย้ายผิด · `not_contains` ปลอดภัยเพราะ NOT ของ substring = ความหมายเดียวกัน
   */
  if (c.op === "is") {
    throw new MailServiceError(
      400,
      "เงื่อนไข “ตรงกับ” ยังใช้ย้อนหลังกับเมลเดิมไม่ได้ (ใช้ “มีคำว่า” แทน)",
    );
  }
  const base = { [FIELD_TO_FILTER[c.field]]: value };
  if (c.op === "not_contains") return { operator: "NOT", conditions: [base] };
  return base;
}

/**
 * เงื่อนไข "ยังไม่ถูกจัดการ" — กันวนซ้ำที่เดิม
 *
 * กฎที่ **ย้ายกล่อง** จะพาเมลออกจากกล่องขาเข้า ⇒ รอบถัดไปไม่เจอมันอีก (เพดาน 200 จึงไล่จนหมดได้)
 * แต่กฎที่ทำแค่ "อ่านแล้ว/ติดดาว" เมลยังอยู่ที่เดิมและยังตรงเงื่อนไขทุกรอบ
 * ⇒ ถ้าไม่ตัดตัวที่ทำไปแล้วออก จะได้ 200 ฉบับเดิมซ้ำ ๆ และ "เหลืออีก N" ไม่มีวันหมด
 */
function pendingFilter(rule: MailRule): Record<string, unknown> | null {
  if (rule.moveToMailboxId) return null;
  const parts: Record<string, unknown>[] = [];
  if (rule.markRead) parts.push({ notKeyword: "$seen" });
  if (rule.star) parts.push({ operator: "NOT", conditions: [{ hasKeyword: "$flagged" }] });
  if (parts.length === 0) return null;
  // ทำหลายอย่าง = ยังค้างถ้ายังขาดอย่างใดอย่างหนึ่ง
  return parts.length === 1 ? parts[0]! : { operator: "OR", conditions: parts };
}

/** ประกอบ filter ของ `Email/query` ให้ตรงกับกฎ + จำกัดอยู่ในกล่องขาเข้า */
export function buildRuleQueryFilter(rule: MailRule, inboxId: string): Record<string, unknown> {
  if (rule.moveToMailboxId === inboxId) {
    throw new MailServiceError(400, "ปลายทางเป็นกล่องขาเข้าอยู่แล้ว");
  }
  const parts = rule.conditions.map(conditionFilter).filter(Boolean) as Record<string, unknown>[];
  if (parts.length === 0) throw new MailServiceError(400, "กฎนี้ยังไม่มีเงื่อนไข");
  const inner =
    parts.length === 1
      ? parts[0]!
      : { operator: rule.match === "any" ? "OR" : "AND", conditions: parts };
  const conditions: Record<string, unknown>[] = [{ inMailbox: inboxId }, inner];
  const pending = pendingFilter(rule);
  if (pending) conditions.push(pending);
  return { operator: "AND", conditions };
}

async function inboxId(session: MailSession): Promise<string> {
  const id = mailboxIdByKey(await fetchMailboxes(session)).inbox;
  if (!id) throw new MailServiceError(404, "ไม่พบกล่องขาเข้า");
  return id;
}

export interface RuleMatchResult {
  /** จำนวนทั้งหมดที่ตรงกฎในกล่องขาเข้า (ไม่ใช่แค่รอบนี้) */
  total: number;
  /** id ที่จะลงมือรอบนี้ — ไม่เกิน `RULE_APPLY_LIMIT` */
  ids: string[];
}

/** ค้นฉบับที่ตรงกฎ — ใช้ทั้งตอนนับให้ดูก่อน (dry run) และตอนลงมือจริง */
export async function findRuleMatches(
  session: MailSession,
  rule: MailRule,
  limit = RULE_APPLY_LIMIT,
): Promise<RuleMatchResult> {
  const filter = buildRuleQueryFilter(rule, await inboxId(session));
  const responses = await jmapRequest(session, [
    [
      "Email/query",
      {
        accountId: session.accountId,
        filter,
        // เก่าสุดก่อน — ย้ายจากล่างขึ้นบน กดซ้ำได้เรื่อย ๆ จนหมดโดยไม่ข้ามฉบับ
        sort: [{ property: "receivedAt", isAscending: true }],
        limit,
        calculateTotal: true,
      },
      "q",
    ],
  ]);
  const result = pickResponse(responses, "q");
  const ids = Array.isArray(result.ids) ? (result.ids as string[]) : [];
  const total = typeof result.total === "number" ? result.total : ids.length;
  return { total, ids };
}

/**
 * ลงมือจริง — ทำ action ของกฎ (ย้าย/อ่านแล้ว/ติดดาว) กับฉบับที่ตรงในกล่องขาเข้า
 * คืน `remaining` = ที่ยังเหลือหลังรอบนี้ (ผู้ใช้กดซ้ำได้)
 */
export async function applyRuleToExisting(
  session: MailSession,
  rule: MailRule,
  limit = RULE_APPLY_LIMIT,
): Promise<MailMutationResult & { total: number; remaining: number }> {
  if (!rule.moveToMailboxId && !rule.markRead && !rule.star) {
    throw new MailServiceError(400, "กฎนี้ไม่มีการกระทำ จึงไม่มีอะไรให้ทำกับเมลเดิม");
  }
  const { total, ids } = await findRuleMatches(session, rule, limit);
  if (ids.length === 0) {
    return { affected: 0, undo: { action: "read", by: "email", items: [] }, total, remaining: 0 };
  }
  const res = await applyMailPatch(session, {
    ids,
    by: "email",
    patch: {
      ...(rule.moveToMailboxId ? { moveToMailboxId: rule.moveToMailboxId } : {}),
      ...(rule.markRead ? { isUnread: false } : {}),
      ...(rule.star ? { isFlagged: true } : {}),
    },
  });
  return { ...res, total, remaining: Math.max(0, total - res.affected) };
}
