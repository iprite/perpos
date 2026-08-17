/**
 * ความชอบส่วนตัวของผู้ใช้เมล — เก็บในกล่องเมลของเจ้าตัว (ดู `lib/mail/prefs.ts`)
 *
 * ค่าพวกนี้ไม่ใช่ข้อมูลสำคัญ: อ่านพลาด = ใช้ค่าเริ่มต้น · เขียนพลาด = ผู้ใช้กดใหม่ได้
 * ⇒ หน้าเว็บต้อง**ไม่**บล็อกอะไรเพื่อรอ route นี้
 */

import { type NextRequest } from "next/server";

import { mailJson, readJsonBody, withMailSession } from "../_lib";
import { normalizeMailPrefs, readMailPrefs, writeMailPrefs } from "@/lib/mail/prefs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withMailSession(req, async (session) => mailJson(await readMailPrefs(session)));
}

export async function PUT(req: NextRequest) {
  const body = await readJsonBody(req);
  const prefs = normalizeMailPrefs(body);
  return withMailSession(req, async (session) => {
    await writeMailPrefs(session, prefs);
    return mailJson({ ok: true, ...prefs });
  });
}
