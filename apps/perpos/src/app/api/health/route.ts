import { existsSync } from "node:fs";
import { NextResponse } from "next/server";

// liveness probe สำหรับ uptime monitor (Better Stack / Uptime Robot) + health check ของ Caddy (blue/green)
// เจตนาเบาที่สุด — ไม่แตะ DB เพื่อเลี่ยง false-negative จาก DB hiccup ชั่วคราว
// (ถ้าต้องการ readiness ที่เช็ค Supabase ด้วย ค่อยเพิ่ม endpoint แยก /api/health/ready)
export const dynamic = "force-dynamic";

/**
 * ไฟล์ drain: สคริปต์ deploy (deploy/vps/switch-perpos.sh) แตะไฟล์นี้ในสีเก่า → ตอบ 503 →
 * Caddy ตัด container นี้ออกจาก pool ก่อนถูก stop ⇒ ไม่มี request ค้างโดนตัดกลางคัน
 * (อยู่ใน /tmp ของ container — หายเองเมื่อ container ถูกสร้างใหม่)
 */
const DRAIN_FILE = "/tmp/perpos-drain";

export function GET() {
  if (existsSync(DRAIN_FILE)) {
    return NextResponse.json({ ok: false, draining: true, ts: Date.now() }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ts: Date.now() });
}
