/**
 * กฎกรองอัตโนมัติ (M3) — อ่าน/บันทึกทั้งชุด
 *
 * บันทึก = เขียนสคริปต์ Sieve ทับทั้งใบเสมอ (ไม่มีการแก้ทีละกฎบนเซิร์ฟเวอร์)
 * ⇒ ถ้าบนเซิร์ฟเวอร์มีสคริปต์ที่ไม่ได้มาจากหน้านี้ (`foreignScript`) ต้องให้ผู้ใช้
 *   **ยืนยันด้วย `overwriteForeign: true`** ก่อน ห้ามทับเงียบ ๆ (กฎเดิมอาจกันเมลสำคัญอยู่)
 */

import { type NextRequest } from "next/server";

import { mailError, mailJson, readJsonBody, withMailSession } from "../_lib";
import { getMailRules, saveMailRules } from "@/lib/mail/rules";
import { normalizeRules } from "@/lib/mail/sieve";
import { MAIL_RULE_MAX } from "@/lib/mail/rule-meta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withMailSession(req, async (session) => mailJson(await getMailRules(session)));
}

export async function PUT(req: NextRequest) {
  const body = await readJsonBody(req);
  if (!Array.isArray(body.rules)) {
    return mailError("mail_bad_request", "รูปแบบกฎไม่ถูกต้อง", 400);
  }
  if (body.rules.length > MAIL_RULE_MAX) {
    return mailError("mail_bad_request", `ตั้งกฎได้สูงสุด ${MAIL_RULE_MAX} ข้อ`, 400);
  }
  const rules = normalizeRules(body.rules);
  const overwriteForeign = body.overwriteForeign === true;

  return withMailSession(req, async (session) => {
    const current = await getMailRules(session);
    if (current.foreignScript && !overwriteForeign) {
      return mailError(
        "mail_rules_foreign_script",
        "กล่องเมลนี้มีกฎกรองเดิมที่ตั้งจากที่อื่นอยู่ ยืนยันก่อนจึงจะเขียนทับได้",
        409,
      );
    }
    await saveMailRules(session, rules);
    return mailJson({ ok: true, rules, foreignScript: false });
  });
}
