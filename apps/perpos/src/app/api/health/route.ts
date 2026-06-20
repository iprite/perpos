import { NextResponse } from "next/server";

// liveness probe สำหรับ uptime monitor (Better Stack / Uptime Robot)
// เจตนาเบาที่สุด — ไม่แตะ DB เพื่อเลี่ยง false-negative จาก DB hiccup ชั่วคราว
// (ถ้าต้องการ readiness ที่เช็ค Supabase ด้วย ค่อยเพิ่ม endpoint แยก /api/health/ready)
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
