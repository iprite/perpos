/**
 * ใช้กฎกับเมลที่มีอยู่แล้วในกล่องขาเข้า (Sieve ทำย้อนหลังไม่ได้ — ดู `lib/mail/rules-apply.ts`)
 *
 * `dryRun` = นับให้ดูก่อนเท่านั้น ไม่แตะเมลสักฉบับ — UI ต้องเรียกอันนี้ก่อนเสมอ
 * เพราะการย้ายเมลหลายสิบฉบับพร้อมกัน ผู้ใช้ต้องเห็นตัวเลขก่อนตัดสินใจ
 */

import { type NextRequest } from "next/server";

import { mailError, mailJson, readJsonBody, withMailSession } from "../../_lib";
import { RULE_APPLY_LIMIT, applyRuleToExisting, findRuleMatches } from "@/lib/mail/rules-apply";
import { normalizeRules } from "@/lib/mail/sieve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  const [rule] = normalizeRules([body.rule]);
  if (!rule || rule.conditions.length === 0) {
    return mailError("mail_bad_request", "กฎไม่ถูกต้อง", 400);
  }
  const dryRun = body.dryRun === true;

  return withMailSession(req, async (session) => {
    if (dryRun) {
      const { total } = await findRuleMatches(session, rule, RULE_APPLY_LIMIT);
      return mailJson({ total, limit: RULE_APPLY_LIMIT });
    }
    const res = await applyRuleToExisting(session, rule, RULE_APPLY_LIMIT);
    return mailJson({
      affected: res.affected,
      total: res.total,
      remaining: res.remaining,
      undo: res.undo,
      limit: RULE_APPLY_LIMIT,
    });
  });
}
