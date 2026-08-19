import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { MailWarning } from "lucide-react";
import { Text } from "@/components/ui/typography";
import { MailWorkspace } from "@/components/mail/mail-workspace";
import { folderBoxValue, resolveBoxSelector } from "@/lib/mail/boxes";
import { MAIL_LOCALE_COOKIE, mailTranslator, normalizeMailLocale } from "@/lib/mail/i18n";
import { MAIL_CONNECTED_COOKIE, MAIL_HOST_CONNECTED_COOKIE } from "@/lib/mail/session";
import { mailBasePath } from "@/lib/mail/base-path";

/**
 * /mail — หน้าอ่านเมลของ PERPOS Mail (webmail M1)
 *
 * ไม่ผูก org/profile โดยตั้งใจ: ตัวตนคือ **mail account ที่ผ่าน OAuth ของ Stalwart**
 * ไม่ใช่ผู้ใช้ของ PERPOS (contract §1 invariant ข้อ 2)
 *
 * SSR ทำแค่ 2 อย่าง: (1) env ครบไหม (2) เชื่อมกล่องแล้วหรือยัง
 * — ข้อมูลเมลทั้งหมดดึงฝั่ง client เพราะการ refresh token ต้องเขียน cookie (contract §1)
 */

export const dynamic = "force-dynamic";

const REQUIRED_ENV = [
  "MAIL_JMAP_URL",
  "MAIL_OAUTH_ISSUER",
  "MAIL_OAUTH_CLIENT_ID",
  "MAIL_SESSION_SECRET",
] as const;

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ box?: string }>;
}) {
  const jar = await cookies();
  // ภาษาจาก cookie (ตัวเดียวกับที่ layout ใช้) — จอ SSR นี้ไม่มี provider ให้ hook
  const t = mailTranslator(normalizeMailLocale(jar.get(MAIL_LOCALE_COOKIE)?.value));
  const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-4 rounded-full bg-gray-100 p-4">
            <MailWarning className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-900">{t("workspace.setup.title")}</p>
          <Text className="mt-1 max-w-md text-sm text-gray-500">{t("workspace.setup.desc")}</Text>
        </div>
      </div>
    );
  }

  const connected =
    jar.get(MAIL_HOST_CONNECTED_COOKIE)?.value === "1" ||
    jar.get(MAIL_CONNECTED_COOKIE)?.value === "1";
  const basePath = mailBasePath((await headers()).get("host"));
  const params = await searchParams;
  if (!connected) {
    // เปิดลิงก์ตรงมาที่กล่องใดกล่องหนึ่ง แล้วต้องล็อกอินก่อน → กลับมาที่กล่องเดิม ไม่ใช่หน้าแรก
    const target = `${basePath}/${params.box ? `?box=${encodeURIComponent(params.box)}` : ""}`;
    redirect(`${basePath}/login?returnTo=${encodeURIComponent(target)}`);
  }

  const selector = resolveBoxSelector(params.box);
  // ป้ายกล่องคิดฝั่ง workspace ตามภาษาผู้ใช้ (`mailBoxLabel(key, locale)`) — SSR ส่งแค่คีย์
  // โฟลเดอร์ที่ผู้ใช้สร้างเอง: SSR ไม่รู้ชื่อ (cookie ของเมลจำกัด path ไว้ที่ /api/mail)
  // → workspace ขึ้นป้ายชั่วคราวแล้วเปลี่ยนเป็นชื่อจริงเมื่อโหลดรายการกล่องเสร็จ
  const box = selector.kind === "system" ? selector.key : folderBoxValue(selector.mailboxId);

  return <MailWorkspace box={box} basePath={basePath} />;
}
