import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { MailShell } from "@/components/mail/mail-shell";
import { MAIL_CONNECTED_COOKIE, MAIL_HOST_CONNECTED_COOKIE } from "@/lib/mail/session";
import { MAIL_PRODUCT_NAME } from "@/lib/mail/boxes";
import { mailBasePath } from "@/lib/mail/base-path";

/**
 * route group ของ **PERPOS Mail** — แยกขาดจาก `(hydrogen)` โดยตั้งใจ
 *
 * ไม่มี `AuthGuard` / `RouteRoleGuard` / org switcher ของ PERPOS เพราะลูกค้าเมล
 * **ไม่จำเป็นต้องมีบัญชี PERPOS** — ด่านเดียวคือ session ของกล่องเมลเอง (OAuth → Stalwart)
 * ⇒ ห้ามเพิ่มลิงก์/ปุ่มที่พาไป Suite/Flow และห้ามอ่าน profile/org ในโซนนี้
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: MAIL_PRODUCT_NAME,
  description: "อีเมลธุรกิจของคุณ",
};

export default async function MailAppLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  // URL ที่ผู้ใช้เห็นต่างกันตามโดเมน — ลิงก์ทุกอันต้องประกอบจากค่านี้ (ดู lib/mail/base-path.ts)
  const basePath = mailBasePath((await headers()).get("host"));
  const connected =
    jar.get(MAIL_HOST_CONNECTED_COOKIE)?.value === "1" ||
    jar.get(MAIL_CONNECTED_COOKIE)?.value === "1";

  return (
    <MailShell connected={connected} basePath={basePath}>
      {children}
    </MailShell>
  );
}
