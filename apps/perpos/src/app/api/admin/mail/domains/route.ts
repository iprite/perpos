/**
 * เพิ่ม/ลบโดเมนในเมลเซิร์ฟเวอร์ — super_admin เท่านั้น (`requireAdmin`)
 *
 * ⚠️ route นี้ถือกุญแจแอดมินของ Stalwart — **ห้ามเปิดให้ role อื่น** และห้ามรับ id/ชื่อจาก body
 *    ไปต่อสตริงเอง (ทุกค่าเข้า JMAP เป็น JSON parameter อยู่แล้ว)
 */

import { type NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/app/api/_lib/auth";
import {
  MailAdminError,
  createMailDomain,
  deleteMailDomain,
  readMailAdminConfig,
} from "@/lib/mail/admin-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function configOr503() {
  const config = readMailAdminConfig();
  if (!config) {
    return {
      config: null,
      response: NextResponse.json(
        { error: "ยังไม่ได้ตั้งค่า MAIL_JMAP_URL / MAIL_ADMIN_API_KEY" },
        { status: 503 },
      ),
    };
  }
  return { config, response: null };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const { config, response } = configOr503();
  if (!config) return response;

  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name : "";
  if (!name.trim()) return NextResponse.json({ error: "ต้องระบุชื่อโดเมน" }, { status: 400 });

  try {
    const id = await createMailDomain(config, name);
    return NextResponse.json({ id });
  } catch (e) {
    const message = e instanceof MailAdminError ? e.message : "เพิ่มโดเมนไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const { config, response } = configOr503();
  if (!config) return response;

  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "ต้องระบุรหัสโดเมน" }, { status: 400 });

  try {
    await deleteMailDomain(config, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof MailAdminError ? e.message : "ลบโดเมนไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
