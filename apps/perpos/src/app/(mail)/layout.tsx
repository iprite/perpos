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

const MAIL_DESCRIPTION = "อีเมลธุรกิจของคุณ";
const MAIL_OG_DESCRIPTION = "อีเมลองค์กรในโดเมนของคุณ ใช้งานผ่านเว็บได้ทุกเครื่อง";

// ทับ openGraph/twitter ของ root ทั้งก้อน — โซนนี้ต้องไม่พ่วงการ์ดโปรโมต Suite/Flow
// การ์ดของ mail มีของตัวเอง (public/og/mail.png · สร้างจาก scripts/og-cards.mjs)
// รูปต้องเป็น URL เต็มของโดเมนเมล เพราะ metadataBase ของ root ชี้ app.perpos.ai
// (ไม่ index อยู่แล้ว — เป็นกล่องเมลของผู้ใช้)
export function generateMetadata(): Metadata {
  const baseUrl = process.env.MAIL_APP_BASE_URL || "https://mail.perpos.ai";
  const image = { url: new URL("/og/mail.png", baseUrl).toString(), width: 1200, height: 630 };
  return {
    title: MAIL_PRODUCT_NAME,
    description: MAIL_DESCRIPTION,
    robots: { index: false, follow: false },
    openGraph: {
      title: MAIL_PRODUCT_NAME,
      description: MAIL_OG_DESCRIPTION,
      type: "website",
      siteName: MAIL_PRODUCT_NAME,
      locale: "th_TH",
      images: [{ ...image, alt: MAIL_OG_DESCRIPTION }],
    },
    twitter: {
      card: "summary_large_image",
      title: MAIL_PRODUCT_NAME,
      description: MAIL_OG_DESCRIPTION,
      images: [image.url],
    },
  };
}

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
