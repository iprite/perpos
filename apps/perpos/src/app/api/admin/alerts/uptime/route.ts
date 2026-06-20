import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/api/_lib/supabase";
import { alertAdminLine } from "@/lib/admin/alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// รับ webhook จาก uptime monitor (Better Stack / Uptime Robot) → แจ้งเข้า LINE admin
// auth: shared secret ผ่าน header `x-alert-secret` หรือ query `?secret=`
function authed(req: NextRequest): boolean {
  const expected = process.env.ALERT_WEBHOOK_SECRET ?? "";
  if (!expected) return false;
  const got =
    req.headers.get("x-alert-secret") ?? new URL(req.url).searchParams.get("secret") ?? "";
  return got === expected;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown> | null = null;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  // payload ต่างกันตาม provider — ดึงชื่อ monitor + สถานะเท่าที่มี
  const b = body ?? {};
  const data = (b.data as Record<string, unknown>) ?? {};
  const name =
    (b.monitor_name as string) ?? (data["name"] as string) ?? (b.url as string) ?? "monitor";
  const status = (b.status as string) ?? (data["status"] as string) ?? (b.state as string) ?? "";
  const isUp = /up|resolved|ok/i.test(status);
  const icon = isUp ? "✅" : "🔴";

  const admin = createAdminClient();
  await alertAdminLine(
    admin,
    [`${icon} Uptime: ${name}`, status && `status: ${status}`].filter(Boolean).join("\n"),
  );

  return NextResponse.json({ ok: true });
}
