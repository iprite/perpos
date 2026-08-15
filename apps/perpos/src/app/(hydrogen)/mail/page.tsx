import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MailWarning } from "lucide-react";
import { PageShell, PageCard } from "@/components/ui/page-shell";
import { Text } from "@/components/ui/typography";
import { MailWorkspace } from "@/components/mail/mail-workspace";
import { MAIL_BOX_LABELS, resolveMailBox } from "@/components/mail/mail-boxes";

/**
 * /mail — หน้าอ่านเมล (webmail M1)
 *
 * top-level ไม่ผูก org โดยตั้งใจ: ตัวตนของ webmail คือ **mail account ที่ผ่าน OAuth ของ Stalwart**
 * ไม่ใช่ profile/org ของ PERPOS (contract §1 invariant ข้อ 2)
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
  const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    return (
      <PageShell title="อีเมล" width="default">
        <PageCard>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 rounded-full bg-gray-100 p-4">
              <MailWarning className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900">ยังไม่ได้ตั้งค่าระบบอีเมล</p>
            <Text className="mt-1 max-w-md text-sm text-gray-500">
              ผู้ดูแลระบบต้องตั้งค่าการเชื่อมต่อเซิร์ฟเวอร์อีเมลก่อนจึงจะใช้งานหน้านี้ได้
            </Text>
          </div>
        </PageCard>
      </PageShell>
    );
  }

  const jar = await cookies();
  const connected =
    jar.get("__Host-perpos_mail_connected")?.value === "1" ||
    jar.get("perpos_mail_connected")?.value === "1";
  if (!connected) redirect("/mail/connect");

  const params = await searchParams;
  const box = resolveMailBox(params.box);

  return (
    <PageShell width="full">
      <MailWorkspace box={box} boxLabel={MAIL_BOX_LABELS[box]} />
    </PageShell>
  );
}
