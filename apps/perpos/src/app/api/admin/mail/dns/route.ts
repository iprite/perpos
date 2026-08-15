/**
 * ตรวจ DNS ของโดเมนหนึ่ง แล้วคืน record ที่ต้องตั้ง + สถานะจริง (ตัวช่วยตั้ง DNS §5.1)
 *
 * รับ `zoneFile` จาก client ไม่ได้ — ต้องอ่านจากเมลเซิร์ฟเวอร์เองทุกครั้ง
 * (ไม่งั้นคนแก้ค่า DKIM ใน request แล้วหน้าเว็บจะบอกลูกค้าให้ตั้งค่าปลอม)
 */

import { type NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/app/api/_lib/auth";
import { MailAdminError, fetchMailAdminStatus, readMailAdminConfig } from "@/lib/mail/admin-api";
import { checkMailDns } from "@/lib/mail/dns-check";
import { buildMailDnsRecords } from "@/lib/mail/dns-records";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const config = readMailAdminConfig();
  if (!config) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่ากุญแจแอดมินของเมลเซิร์ฟเวอร์" },
      { status: 503 },
    );
  }

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุรหัสโดเมน" }, { status: 400 });

  try {
    const status = await fetchMailAdminStatus(config);
    const domain = status.domains.find((d) => d.id === id);
    if (!domain) return NextResponse.json({ error: "ไม่พบโดเมนนี้" }, { status: 404 });

    const records = buildMailDnsRecords(domain.name, domain.zoneFile);
    const checks = await checkMailDns(records);
    return NextResponse.json(
      { domain: domain.name, records, checks, checkedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const message = e instanceof MailAdminError ? e.message : "ตรวจ DNS ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
