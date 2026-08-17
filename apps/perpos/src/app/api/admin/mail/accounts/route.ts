/**
 * กล่องเมล (บัญชีผู้ใช้บนเมลเซิร์ฟเวอร์) — super_admin เท่านั้น
 *
 * 🔴 รหัสผ่านที่คืนออกไปเป็น **ค่าที่แสดงได้ครั้งเดียว**
 *    - ระบบสุ่มให้เสมอ ผู้เรียกส่งรหัสของตัวเองเข้ามาไม่ได้ (กันรหัสซ้ำ/เดาง่าย)
 *    - **ห้าม log / ห้ามเก็บลง DB / ห้ามใส่ใน error message**
 *    - Sentry ตัด body ของ `/api/admin/mail/*` แล้วที่ scrub-mail.ts
 */

import { type NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/app/api/_lib/auth";
import {
  MailAdminError,
  createMailAccount,
  deleteMailAccount,
  readMailAdminConfig,
  resetMailAccountPassword,
  updateMailAccount,
} from "@/lib/mail/admin-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function notConfigured() {
  return NextResponse.json(
    { error: "ยังไม่ได้ตั้งค่ากุญแจแอดมินของเมลเซิร์ฟเวอร์" },
    { status: 503 },
  );
}

function failed(e: unknown, fallback: string) {
  const message = e instanceof MailAdminError ? e.message : fallback;
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const config = readMailAdminConfig();
  if (!config) return notConfigured();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const localPart = typeof body.localPart === "string" ? body.localPart : "";
  const domainId = typeof body.domainId === "string" ? body.domainId : "";
  const displayName = typeof body.displayName === "string" ? body.displayName : null;
  const quotaBytes = typeof body.quotaBytes === "number" ? body.quotaBytes : null;

  try {
    const { id, password } = await createMailAccount(config, {
      localPart,
      domainId,
      displayName,
      quotaBytes,
    });
    // รหัสผ่านโผล่ที่นี่ที่เดียวในระบบ — ฝั่งหน้าเว็บต้องแสดงครั้งเดียวแล้วทิ้ง
    return NextResponse.json({ id, password }, { headers: NO_STORE });
  } catch (e) {
    return failed(e, "สร้างกล่องเมลไม่สำเร็จ");
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const config = readMailAdminConfig();
  if (!config) return notConfigured();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "ต้องระบุรหัสกล่องเมล" }, { status: 400 });

  try {
    if (body.action === "reset_password") {
      const { password } = await resetMailAccountPassword(config, id);
      return NextResponse.json({ password }, { headers: NO_STORE });
    }
    await updateMailAccount(config, id, {
      displayName: typeof body.displayName === "string" ? body.displayName : undefined,
      quotaBytes:
        typeof body.quotaBytes === "number" || body.quotaBytes === null
          ? (body.quotaBytes as number | null)
          : undefined,
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return failed(e, "บันทึกไม่สำเร็จ");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const config = readMailAdminConfig();
  if (!config) return notConfigured();

  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "ต้องระบุรหัสกล่องเมล" }, { status: 400 });

  try {
    await deleteMailAccount(config, id);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return failed(e, "ลบกล่องเมลไม่สำเร็จ");
  }
}
