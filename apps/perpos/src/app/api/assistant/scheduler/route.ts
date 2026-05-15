import { NextResponse } from "next/server";

import { runScheduler } from "@/lib/assistant/task-notifier";

export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured → open (dev only)

  // Vercel Cron sends the secret in this header automatically
  const vercelHeader = req.headers.get("x-vercel-cron-secret");
  if (vercelHeader === secret) return true;

  // Generic cron providers (cron-job.org, etc.)
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    await runScheduler();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[assistant/scheduler]", err);
    return NextResponse.json({ ok: false, error: String(err?.message ?? "unknown") }, { status: 500 });
  }
}

// Allow GET for simple cron triggers that only support GET (e.g. Vercel Cron)
export async function GET(req: Request) {
  return POST(req);
}
