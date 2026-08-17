import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { MAIL_CONNECTED_COOKIE, MAIL_HOST_CONNECTED_COOKIE } from "@/lib/mail/session";
import { mailBasePath } from "@/lib/mail/base-path";
import { MailAccountView } from "@/components/mail/mail-account-view";

/**
 * /account — ตั้งค่าบัญชีของผู้ใช้เมลเอง (ชื่อที่แสดง · รูปโปรไฟล์ · รหัสผ่าน)
 *
 * โซนนี้เหมือนหน้าอื่นของ `(mail)`: ตัวตนคือ mail account จาก OAuth ของ Stalwart
 * **ไม่มี AuthGuard/profile/org ของ PERPOS** (contract §1 invariant ข้อ 1)
 * · SSR ทำแค่เช็คว่าเชื่อมกล่องแล้วหรือยัง — ข้อมูลจริงดึงฝั่ง client เพราะ refresh token ต้องเขียน cookie
 */

export const dynamic = "force-dynamic";

export default async function MailAccountPage() {
  const jar = await cookies();
  const connected =
    jar.get(MAIL_HOST_CONNECTED_COOKIE)?.value === "1" ||
    jar.get(MAIL_CONNECTED_COOKIE)?.value === "1";
  const basePath = mailBasePath((await headers()).get("host"));
  if (!connected) redirect(`${basePath}/login`);

  return <MailAccountView basePath={basePath} />;
}
