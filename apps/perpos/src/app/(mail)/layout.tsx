import type { Metadata } from "next";
import { cookies } from "next/headers";

import { MailShell } from "@/components/mail/mail-shell";
import { MAIL_CONNECTED_COOKIE, MAIL_HOST_CONNECTED_COOKIE } from "@/lib/mail/session";
import { MAIL_PRODUCT_NAME } from "@/lib/mail/boxes";

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
  const connected =
    jar.get(MAIL_HOST_CONNECTED_COOKIE)?.value === "1" ||
    jar.get(MAIL_CONNECTED_COOKIE)?.value === "1";

  return <MailShell connected={connected}>{children}</MailShell>;
}
