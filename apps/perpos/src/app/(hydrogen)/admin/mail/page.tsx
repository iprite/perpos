/**
 * หลังบ้านของ **เรา** สำหรับ PERPOS Mail (MAIL_UI_SPEC §6) — super_admin เท่านั้น
 *
 * เป้าหมาย: "ดูแลลูกค้าหลายรายได้โดยไม่ต้อง ssh"
 * ⚠️ หน้านี้ **ห้ามมีทางเข้าไปอ่านเนื้อหาเมลของลูกค้าเด็ดขาด** — เห็นได้แค่ metadata
 *    (ด่านจริงอยู่ที่ `ADMIN_OBJECTS` ใน lib/mail/admin-api.ts)
 */

import { requireSuperAdminPage } from "@/lib/admin/guard";
import {
  MailAdminError,
  fetchMailAdminStatus,
  readMailAdminConfig,
  type MailAdminStatus,
} from "@/lib/mail/admin-api";
import { AdminMailView } from "./_view";

export const dynamic = "force-dynamic";

export default async function AdminMailPage() {
  await requireSuperAdminPage();

  const config = readMailAdminConfig();
  let status: MailAdminStatus | null = null;
  let error: string | null = null;

  if (!config) {
    error = "ยังไม่ได้ตั้งค่า MAIL_JMAP_URL / MAIL_ADMIN_API_KEY";
  } else {
    try {
      status = await fetchMailAdminStatus(config);
    } catch (e) {
      error = e instanceof MailAdminError ? e.message : "เรียกเมลเซิร์ฟเวอร์ไม่สำเร็จ";
    }
  }

  return <AdminMailView status={status} error={error} />;
}
