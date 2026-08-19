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

/**
 * PUT รับ **บางช่อง** ได้ — รวมกับค่าเดิมในกล่องเมลก่อนเขียนทับ
 * (ผู้เรียกมีหลายตัว: workspace เขียน pane/listWidth · หน้าบัญชีเขียน locale —
 *  ถ้าเขียนทับทั้งไฟล์ ตัวหนึ่งจะรีเซ็ตช่องของอีกตัวเงียบ ๆ)
 */
export async function PUT(req: NextRequest) {
  const body = await readJsonBody(req);
  const patch = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return withMailSession(req, async (session) => {
    const existing = await readMailPrefs(session);
    const prefs = normalizeMailPrefs({ ...existing, ...patch });
    await writeMailPrefs(session, prefs);
    return mailJson({ ok: true, ...prefs });
  });
}
