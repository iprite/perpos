/**
 * Scheduler worker — process ยาวที่ตื่นอยู่ตลอด แทน cron ยิง HTTP ทุกนาที (ย้ายมา VPS 2026-08-19)
 *
 * รันเป็น container `perpos-worker` ใน docker compose (image node เดียวกับแอป, artifact เดียวกัน,
 * env ไฟล์เดียวกัน) · CI bundle ไฟล์นี้ด้วย esbuild → `apps/perpos/worker/scheduler-worker.js`
 * (ดู `scripts/build-worker.mjs`) — **ห้าม import อะไรที่ลาก `next/*` เข้ามา**
 *
 * ข้อควรระวังที่อุดไว้แล้ว:
 * - ไม่รันซ้อน: รอบเดียวจบก่อนถึงเริ่มนับรอบใหม่ (single-flight) + lease ใน DB กัน worker 2 ตัว/HTTP ยิงพร้อมกัน
 * - graceful shutdown: SIGTERM/SIGINT → หยุดรับรอบใหม่ รอรอบปัจจุบันจบ (เพดาน SHUTDOWN_GRACE_MS) แล้ว exit
 *   compose ตั้ง `stop_grace_period` ยาวกว่าเพดานนี้ ⇒ deploy/restart ไม่ตัดงานกลางคัน
 * - crash → compose `restart: unless-stopped` ปลุกใหม่ · lease ค้างหมดอายุเอง (TTL)
 */
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { runScheduler } from "@/lib/scheduler/run";

const INTERVAL_MS = Math.max(15_000, Number(process.env.SCHEDULER_INTERVAL_MS ?? 60_000) || 60_000);
/** รอรอบปัจจุบันจบตอนถูกสั่งหยุดได้นานสุด — ต้องน้อยกว่า stop_grace_period ใน compose (120s) */
const SHUTDOWN_GRACE_MS = 100_000;
const OWNER = `worker:${os.hostname()}:${process.pid}`;

let stopping = false;
let inFlight: Promise<unknown> | null = null;
let wake: (() => void) | null = null;

const log = (msg: string, extra?: unknown) =>
  console.log(
    `[scheduler-worker ${new Date().toISOString()}] ${msg}`,
    extra === undefined ? "" : JSON.stringify(extra),
  );

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      wake = null;
      resolve();
    }, ms);
    // ให้ shutdown ปลุกได้ทันที ไม่ต้องรอ interval หมด
    wake = () => {
      clearTimeout(t);
      wake = null;
      resolve();
    };
  });
}

async function tick() {
  const t0 = Date.now();
  try {
    const res = await runScheduler({ owner: OWNER });
    const b = res.body;
    if (b.skipped) log("skipped (lease held by another runner)");
    else if (b.ok) {
      const { ok: _ok, ...rest } = b;
      const summary = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => typeof v === "number" && v !== 0),
      );
      log(`tick ok in ${Date.now() - t0}ms`, Object.keys(summary).length ? summary : undefined);
    } else log(`tick failed in ${Date.now() - t0}ms`, b);
  } catch (e) {
    // runScheduler จับ error เองแล้ว — มาถึงนี่ = พังก่อนเข้า try (เช่น env ขาด) → log แล้วรอรอบหน้า
    log("tick threw", e instanceof Error ? e.message : String(e));
  }
}

async function main() {
  // RELEASE = sha ที่ CI เขียนไว้ที่รากของ artifact (cwd = /app ใน container)
  let release = "?";
  try {
    release = fs.readFileSync(path.join(process.cwd(), "RELEASE"), "utf8").trim().slice(0, 12);
  } catch {
    /* รัน dev นอก artifact */
  }
  log(`start owner=${OWNER} interval=${INTERVAL_MS}ms release=${release}`);
  while (!stopping) {
    const started = Date.now();
    inFlight = tick();
    await inFlight;
    inFlight = null;
    if (stopping) break;
    // จังหวะคงที่: รอบถัดไปเริ่มที่ started+INTERVAL (ไม่ใช่หลังจบ+INTERVAL) แต่ไม่ต่ำกว่า 1 วิ กัน loop รัว
    const wait = Math.max(1_000, INTERVAL_MS - (Date.now() - started));
    await sleep(wait);
  }
  log("stopped");
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log(`${signal} received — finishing current tick then exit`);
  wake?.();
  if (inFlight) {
    const deadline = new Promise<"timeout">((r) =>
      setTimeout(() => r("timeout"), SHUTDOWN_GRACE_MS),
    );
    const outcome = await Promise.race([inFlight.then(() => "done" as const), deadline]);
    if (outcome === "timeout")
      log("current tick exceeded grace period — exiting anyway (lease จะหมดอายุเอง)");
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (e) =>
  log("unhandledRejection", e instanceof Error ? e.message : String(e)),
);

void main();
