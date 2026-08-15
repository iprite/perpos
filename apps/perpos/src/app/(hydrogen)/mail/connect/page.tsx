import { AtSign, Info, ShieldAlert } from "lucide-react";
import { PageShell, PageCard } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";

/**
 * /mail/connect — เชื่อมกล่องเมลด้วย OAuth ของ Stalwart (contract §2.2)
 *
 * ⚠️ ข้อความบนหน้านี้ห้ามเขียนว่า "เพิกถอนสิทธิ์แล้ว" — Stalwart ยังไม่มี revoke endpoint
 *    (contract §2.4 / §11 ข้อ 1) "ตัดการเชื่อมต่อ" = ลบสิทธิ์บนอุปกรณ์นี้เท่านั้น
 */

export const dynamic = "force-dynamic";

const REASON_MESSAGE: Record<string, string> = {
  expired: "เซสชันกล่องเมลหมดอายุ กรุณาเชื่อมต่อใหม่อีกครั้ง",
  denied: "คุณยกเลิกการอนุญาต จึงยังเชื่อมกล่องเมลไม่สำเร็จ",
  disconnected: "ตัดการเชื่อมต่อบนอุปกรณ์นี้เรียบร้อยแล้ว",
  invalid: "คำขอเชื่อมต่อไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง",
};

export default async function MailConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = reason ? REASON_MESSAGE[reason] : undefined;

  return (
    <PageShell
      title="อีเมล"
      description="เชื่อมกล่องเมลของคุณเพื่อเริ่มอ่านอีเมลใน PERPOS"
      width="narrow"
    >
      {message && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <Text className="text-sm text-amber-800">{message}</Text>
        </div>
      )}

      <PageCard>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="mb-4 rounded-full bg-gray-100 p-4">
            <AtSign className="h-8 w-8 text-gray-500" />
          </div>
          <p className="text-sm font-medium text-gray-900">ยังไม่ได้เชื่อมกล่องเมล</p>
          <Text className="mt-1 max-w-sm text-sm text-gray-500">
            เข้าสู่ระบบด้วยบัญชีอีเมลของคุณเพื่ออนุญาตให้ PERPOS อ่านและจัดการอีเมลแทนคุณ
          </Text>
          {/* เป็น API route (302 ไป Stalwart) ไม่ใช่หน้าในแอป → ใช้ form GET ไม่ใช่ <Link> */}
          <form action="/api/mail/oauth/start" method="get" className="mt-5">
            <Button type="submit">เชื่อมกล่องเมล</Button>
          </form>
        </div>
      </PageCard>

      <PageCard title="จัดการการเชื่อมต่อ">
        <div className="flex flex-wrap items-start gap-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <div className="min-w-0 flex-1">
            <Text className="text-sm text-gray-600">
              การตัดการเชื่อมต่อจะลบสิทธิ์เข้าถึงกล่องเมล <strong>บนอุปกรณ์นี้</strong>{" "}
              ถ้าอุปกรณ์สูญหาย ให้เปลี่ยนรหัสผ่านกล่องเมลของคุณด้วย
            </Text>
          </div>
          <form action="/api/mail/oauth/disconnect" method="post">
            <Button type="submit" variant="outline">
              ตัดการเชื่อมต่อ
            </Button>
          </form>
        </div>
      </PageCard>
    </PageShell>
  );
}
