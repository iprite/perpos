import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "../../_lib/auth";
import { runScheduler } from "@/lib/scheduler/run";

export const dynamic = "force-dynamic";

/**
 * ทางสำรอง/ยิงมือของ scheduler — ตัวรันหลักบน VPS คือ worker process (`src/worker/scheduler-worker.ts`,
 * container `perpos-worker`) · logic ทั้งหมดอยู่ `lib/scheduler/run.ts` · มี lease กันรันซ้อนกับ worker
 */
export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const cronErr = requireCron(req);
  if (cronErr) return cronErr;
  const res = await runScheduler({ owner: `http:${process.pid}:${Date.now()}` });
  return NextResponse.json(res.body, { status: res.status });
}
