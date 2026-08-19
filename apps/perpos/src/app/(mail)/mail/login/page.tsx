import { Info, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import { MAIL_PRODUCT_NAME } from "@/lib/mail/boxes";
import { MailWordmark } from "@/components/mail/mail-wordmark";

/**
 * /mail/login — เข้าสู่ระบบกล่องเมล → OAuth ของ Stalwart (contract §2.2)
 *
 * **เข้าหน้านี้สด ๆ จะไม่เห็นหน้านี้เลย** — middleware พาไปฟอร์มกรอกรหัสผ่านของเมลเซิร์ฟเวอร์ทันที
 * หน้านี้จึงเหลือไว้สำหรับกรณีที่มี `reason` (ล็อกอินล้มเหลว/ออกจากระบบ/เซสชันหมดอายุ) เท่านั้น
 * — ดูเหตุผลที่ต้องทำที่ middleware ใน `src/middleware.ts`
 *
 * **ไม่มีบัญชี PERPOS เกี่ยวข้อง** — ลูกค้าที่ซื้อกล่องเมลอย่างเดียวเข้าใช้ได้ด้วย
 * อีเมล+รหัสผ่านของกล่อง (กรอกที่หน้าของ Stalwart ไม่ใช่ที่นี่ — เราไม่เคยเห็นรหัสผ่าน)
 *
 * ⚠️ ข้อความบนหน้านี้ห้ามเขียนว่า "เพิกถอนสิทธิ์แล้ว" — Stalwart ยังไม่มี revoke endpoint
 *    (contract §2.4 / §11 ข้อ 1) "ออกจากระบบ" = ลบสิทธิ์บนอุปกรณ์นี้เท่านั้น
 */

export const dynamic = "force-dynamic";

const REASON_MESSAGE: Record<string, string> = {
  expired: "เซสชันกล่องเมลหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
  denied: "คุณยกเลิกการอนุญาต จึงยังเข้าสู่ระบบไม่สำเร็จ",
  disconnected: "ออกจากระบบบนอุปกรณ์นี้เรียบร้อยแล้ว",
  invalid: "คำขอเข้าสู่ระบบไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง",
  failed: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  no_refresh: "เซิร์ฟเวอร์อีเมลไม่ได้ให้สิทธิ์ค้างการเข้าสู่ระบบ กรุณาติดต่อผู้ดูแลระบบ",
};

export default async function MailLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; returnTo?: string }>;
}) {
  const { reason, returnTo } = await searchParams;
  const message = reason ? REASON_MESSAGE[reason] : undefined;

  return (
    <div className="mx-auto w-full max-w-md space-y-4 py-10 sm:py-16">
      {message && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <Text className="text-sm text-amber-800">{message}</Text>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-mail-600 text-white">
            <Mail className="h-6 w-6" />
          </div>
          <h1>
            <MailWordmark />
            <span className="sr-only">{MAIL_PRODUCT_NAME}</span>
          </h1>
          <Text className="mt-1 max-w-sm text-sm text-gray-500">
            เข้าสู่ระบบด้วยอีเมลและรหัสผ่านของกล่องเมลคุณ เพื่อเริ่มอ่านและจัดการอีเมล
          </Text>
          {/* เป็น API route (302 ไปเซิร์ฟเวอร์เมล) ไม่ใช่หน้าในแอป → ใช้ form GET ไม่ใช่ <Link> */}
          <form action="/api/mail/oauth/start" method="get" className="mt-6 w-full">
            {/* ล็อกอินเสร็จแล้วกลับหน้าที่ตั้งใจเปิด — ค่าถูกกรองอีกชั้นด้วย `sanitizeReturnTo` ที่ start */}
            {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
            <Button type="submit" className="w-full">
              เข้าสู่ระบบ
            </Button>
          </form>
        </div>
      </div>

      <Text className="px-1 text-center text-xs text-gray-400">
        การเข้าสู่ระบบจะให้สิทธิ์อ่านและจัดการอีเมล <strong>บนอุปกรณ์นี้</strong> ถ้าอุปกรณ์สูญหาย
        ให้เปลี่ยนรหัสผ่านกล่องเมลของคุณ
      </Text>
    </div>
  );
}
