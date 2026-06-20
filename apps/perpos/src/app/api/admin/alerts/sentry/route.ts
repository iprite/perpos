import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/api/_lib/supabase";
import { alertAdminLine } from "@/lib/admin/alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// รับ webhook จาก Sentry (Alert → Webhook) → แจ้งเข้า LINE admin
// auth: shared secret ผ่าน header `x-alert-secret` หรือ query `?secret=` (ใส่ใน URL ตอนตั้ง Sentry)
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

  // Sentry payload มีหลายรูปแบบ (legacy webhook / issue alert) — ดึงเท่าที่มี ไม่งั้น fallback
  const b = body ?? {};
  const data = (b.data as Record<string, unknown>) ?? {};
  const ev = (data.event as Record<string, unknown>) ?? (b.event as Record<string, unknown>) ?? {};
  const issue = (data.issue as Record<string, unknown>) ?? {};

  const title =
    (ev.title as string) ?? (b.message as string) ?? (issue.title as string) ?? "Sentry alert";
  const level = (ev.level as string) ?? (b.level as string) ?? "";
  const culprit = (ev.culprit as string) ?? "";
  const url = (b.url as string) ?? (ev["web_url"] as string) ?? (issue.url as string) ?? "";

  const admin = createAdminClient();
  await alertAdminLine(
    admin,
    [`🔴 Sentry: ${title}`, level && `level: ${level}`, culprit, url].filter(Boolean).join("\n"),
  );

  return NextResponse.json({ ok: true });
}
