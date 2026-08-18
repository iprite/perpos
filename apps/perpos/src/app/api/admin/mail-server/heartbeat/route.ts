/**
 * heartbeat จากเมลเซิร์ฟเวอร์ (Stalwart @ Contabo) — ยิงทุก 5 นาทีจาก systemd timer
 *
 * auth = `x-worker-secret` (แบบเดียวกับ callback ของ Cloud Run workers — เทียบแบบ .trim()
 * กัน secret ที่มี trailing newline) · **ไม่ใช่โซน `(mail)` ของลูกค้า** — นี่คือ ops ภายใน
 * จึงอยู่ใต้ /api/admin และเขียนตาราง `mail_server_health` ผ่าน service role ได้
 *
 * ตัวตัดสินใจเตือนอยู่ที่ scheduler (`runMailServerMonitor`) — route นี้แค่บันทึกค่า
 *
 * บันทึก 2 ที่คนละหน้าที่ (ดู lib/mail/server-metrics.ts):
 *   - `mail_server_health` แถวเดียว = ค่าล่าสุดที่เกณฑ์เตือนใช้
 *   - `mail_server_samples` ต่อท้าย = ประวัติไว้ดูแนวโน้มในหน้า /admin/mail
 *   ⇒ ประวัติพังต้องไม่ทำให้ heartbeat ล้ม (เตือนสำคัญกว่ากราฟ) — insert แยก ไม่โยนต่อ
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { normalizeHeartbeat } from "@/lib/mail/server-monitor";
import { sampleRowFromPayload } from "@/lib/mail/server-metrics";

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
  const takenAt = new Date().toISOString();
  const { error } = await admin.from("mail_server_health").upsert(
    {
      id: "stalwart",
      heartbeat,
      heartbeat_at: takenAt,
      updated_at: takenAt,
    },
    { onConflict: "id" },
  );
  if (error) return NextResponse.json({ ok: false }, { status: 500 });

  const { error: sampleError } = await admin
    .from("mail_server_samples")
    .insert(sampleRowFromPayload(body, takenAt));
  if (sampleError) console.error("[mail-heartbeat] เก็บประวัติไม่สำเร็จ:", sampleError.message);

  return NextResponse.json({ ok: true });
}
