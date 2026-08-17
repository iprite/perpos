/**
 * heartbeat จากเมลเซิร์ฟเวอร์ (Stalwart @ Hetzner) — ยิงรายชั่วโมงจาก systemd timer
 *
 * auth = `x-worker-secret` (แบบเดียวกับ callback ของ Cloud Run workers — เทียบแบบ .trim()
 * กัน secret ที่มี trailing newline) · **ไม่ใช่โซน `(mail)` ของลูกค้า** — นี่คือ ops ภายใน
 * จึงอยู่ใต้ /api/admin และเขียนตาราง `mail_server_health` ผ่าน service role ได้
 *
 * ตัวตัดสินใจเตือนอยู่ที่ scheduler (`runMailServerMonitor`) — route นี้แค่บันทึกค่า
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { normalizeHeartbeat } from "@/lib/mail/server-monitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const required = (process.env.WORKER_SECRET ?? "").trim();
  const given = (req.headers.get("x-worker-secret") ?? "").trim();
  if (!required || given !== required) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const heartbeat = normalizeHeartbeat(body);

  const admin = createAdminClient();
  const { error } = await admin.from("mail_server_health").upsert(
    {
      id: "stalwart",
      heartbeat,
      heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
