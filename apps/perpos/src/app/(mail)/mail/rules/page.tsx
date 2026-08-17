import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { MAIL_CONNECTED_COOKIE, MAIL_HOST_CONNECTED_COOKIE } from "@/lib/mail/session";
import { mailBasePath } from "@/lib/mail/base-path";
import { MailRulesView } from "@/components/mail/mail-rules-view";

/**
 * /rules — กฎกรองอัตโนมัติ (M3)
 *
 * เหมือนหน้าอื่นของโซน `(mail)`: ตัวตนคือ mail account จาก OAuth ของ Stalwart
 * **ไม่มี AuthGuard/profile/org ของ PERPOS** · SSR เช็คแค่ว่าเชื่อมกล่องแล้วหรือยัง
 */

export const dynamic = "force-dynamic";

export default async function MailRulesPage() {
  const jar = await cookies();
  const connected =
    jar.get(MAIL_HOST_CONNECTED_COOKIE)?.value === "1" ||
    jar.get(MAIL_CONNECTED_COOKIE)?.value === "1";
  const basePath = mailBasePath((await headers()).get("host"));
  if (!connected) redirect(`${basePath}/login`);

  return <MailRulesView />;
}
