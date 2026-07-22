"use client";

// ai-enrich-panel.tsx — กล่อง AI + แผงความคืบหน้า (POST /enrich → วน POST /enrich/run)
//
// ถ้อยคำบังคับ (P1-5): พูดเป็น **ช่วงลำดับรายการ** — "กำลังทำรายการที่ 33–40 จาก 84"
// C-5: รายการรอบเป็นของ session ปัจจุบันเท่านั้น (ไม่มี entity ใน DB) — เข้าหน้าใหม่เหลือแค่ยอดรวม
//      → ไม่มีปุ่ม retry รายรอบ มีแต่ "ทำต่อ" และ "ลองใหม่เฉพาะที่ล้มเหลว (n)" ระดับชุด
// B4: ล็อกเฉพาะแถวที่ AI ถืออยู่ · ปุ่มระดับชุดถูก disable โดยหน้าแม่

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, PauseCircle, RotateCw, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import { toast } from "@/lib/toast";
import type { Catalog, CatalogItem, CatalogJob } from "@/lib/gov-procure/catalog";
import { govApi } from "../../_components/api";
import { fmtMoney, fmtNum, isEnrichable } from "./format";

interface RunResult {
  done: boolean;
  claimed: number;
  succeeded: number;
  failed: number;
  remaining: number;
  job: CatalogJob | null;
}

interface RoundRow {
  from: number;
  to: number;
  ok: number;
  fail: number;
  seconds: number;
}

export function AiEnrichPanel({
  catalog,
  items,
  orgId,
  canWrite,
  costPerCallThb,
  chunkSize,
  onRoundFinished,
  onCatalogStatusChanged,
  onRunningChange,
}: {
  catalog: Catalog;
  items: CatalogItem[];
  orgId: string;
  canWrite: boolean;
  /** ค่าใช้จ่ายเฉลี่ยต่อ 1 คำขอ AI (บาท) — คำนวณฝั่ง server จาก lib/gov-procure/catalog-cost */
  costPerCallThb: number;
  chunkSize: number;
  onRoundFinished: () => void | Promise<void>;
  onCatalogStatusChanged: (status: Catalog["status"]) => void;
  onRunningChange: (running: boolean) => void;
}) {
  const [job, setJobState] = useState<CatalogJob | null>(null);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const stopRef = useRef(false);
  /** ลำดับรายการที่รอบถัดไปจะเริ่ม (ใช้พูดว่า "รายการที่ 33–40") */
  const cursorRef = useRef(1);
  /** job ล่าสุดแบบอ่านได้ทันทีใน loop (state async เกินไปสำหรับลูป) */
  const jobRef = useRef<CatalogJob | null>(null);
  const roundCountRef = useRef(0);

  const setJob = useCallback((next: CatalogJob | null) => {
    jobRef.current = next;
    setJobState(next);
  }, []);

  const enrichable = items.filter(isEnrichable).length;
  const failedCount = items.filter((i) => i.enrich_state === "failed").length;
  const pendingQueue = items.filter(
    (i) => i.enrich_state === "queued" || i.enrich_state === "running",
  ).length;
  const estThb = Math.ceil(enrichable / chunkSize) * costPerCallThb;

  // สถานะรอบล่าสุด (หลัง refresh เหลือแค่ยอดรวม — C-5)
  useEffect(() => {
    let alive = true;
    govApi<{ job: CatalogJob | null; catalogStatus?: string }>(
      `/api/gov-procure/catalogs/${catalog.id}/enrich?orgId=${encodeURIComponent(orgId)}`,
      "GET",
    )
      .then((res) => {
        if (alive) setJob(res.job);
      })
      .catch(() => {
        /* อ่านสถานะไม่ได้ → แสดงกล่องแบบเริ่มต้น */
      });
    return () => {
      alive = false;
    };
  }, [catalog.id, orgId, setJob]);

  // เตือนก่อนปิดแท็บระหว่างงานยังเดินอยู่
  useEffect(() => {
    if (!running) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  useEffect(() => {
    onRunningChange(running);
  }, [running, onRunningChange]);

  const loop = useCallback(async () => {
    stopRef.current = false;
    setRunning(true);
    // กด "ทำต่อ" หลังเข้าหน้าใหม่ → เริ่มนับช่วงลำดับต่อจากที่ทำไปแล้ว (ไม่ใช่ 1)
    if (roundCountRef.current === 0) {
      const j = jobRef.current;
      cursorRef.current = (j?.done_items ?? 0) + (j?.failed_items ?? 0) + 1;
    }
    try {
      // วนทีละรอบจนคิวหมด (แต่ละรอบ = 1 คำขอ AI ต่อ chunkSize รายการ)
      for (;;) {
        if (stopRef.current) break;
        const t0 = Date.now();
        const res = await govApi<RunResult>(
          `/api/gov-procure/catalogs/${catalog.id}/enrich/run?orgId=${encodeURIComponent(orgId)}`,
          "POST",
        );
        if (res.job) setJob(res.job);

        if (res.claimed > 0) {
          const from = cursorRef.current;
          const to = from + res.claimed - 1;
          cursorRef.current = to + 1;
          roundCountRef.current += 1;
          setRounds((prev) => [
            ...prev,
            {
              from,
              to,
              ok: res.succeeded,
              fail: res.failed,
              seconds: Math.round((Date.now() - t0) / 1000),
            },
          ]);
        }

        await onRoundFinished();

        if (res.done) {
          onCatalogStatusChanged(res.job?.done_items ? "review" : "draft");
          toast.success(
            `AI เติมข้อมูลเสร็จแล้ว — สำเร็จ ${fmtNum(res.job?.done_items ?? 0)} รายการ` +
              (res.job?.failed_items ? ` · ล้มเหลว ${fmtNum(res.job.failed_items)} รายการ` : ""),
          );
          break;
        }
        if (res.claimed === 0 && res.remaining === 0) break;
      }
    } catch (e) {
      toast.error((e as Error).message || "งาน AI หยุดกลางคัน — กด 'ทำต่อ' เพื่อทำต่อจากเดิม");
    } finally {
      setRunning(false);
    }
  }, [catalog.id, orgId, onRoundFinished, onCatalogStatusChanged, setJob]);

  const start = useCallback(
    async (onlyFailed: boolean) => {
      setStarting(true);
      setRounds([]);
      roundCountRef.current = 0;
      try {
        const res = await govApi<{ job: CatalogJob; queued: number }>(
          `/api/gov-procure/catalogs/${catalog.id}/enrich?orgId=${encodeURIComponent(orgId)}`,
          "POST",
          { onlyFailed },
        );
        setJob(res.job);
        cursorRef.current = 1;
        onCatalogStatusChanged("enriching");
        toast.success(`เข้าคิวให้ AI เติมข้อมูล ${fmtNum(res.queued)} รายการ`);
        await onRoundFinished();
        await loop();
      } catch (e) {
        toast.error((e as Error).message || "เริ่มงาน AI ไม่สำเร็จ");
      } finally {
        setStarting(false);
      }
    },
    [catalog.id, orgId, loop, onRoundFinished, onCatalogStatusChanged, setJob],
  );

  const total = job?.total_items ?? 0;
  const finished = (job?.done_items ?? 0) + (job?.failed_items ?? 0);
  const pct = total > 0 ? Math.min(100, Math.round((finished / total) * 100)) : 0;
  const busy = running || starting;
  const collapsed =
    !busy && (catalog.status === "review" || catalog.status === "approved") && pendingQueue === 0;

  // โหมดยุบ 1 บรรทัด — ตอนตรวจงานอยู่ ไม่ให้กล่อง AI กินพื้นที่เหนือตาราง (P1-3)
  if (collapsed) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.03] px-4 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <Text className="text-xs text-gray-600">
          {job
            ? `AI เติมให้ ${fmtNum(job.done_items)} รายการ · ล้มเหลว ${fmtNum(job.failed_items)} · จากทั้งหมด ${fmtNum(job.total_items)}`
            : "ยังไม่เคยสั่งให้ AI เติมข้อมูลชุดนี้"}
        </Text>
        {canWrite && failedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => void start(true)}
            disabled={busy}
          >
            <RotateCw className="mr-1.5 h-3.5 w-3.5" /> ลองใหม่เฉพาะที่ล้มเหลว (
            {fmtNum(failedCount)})
          </Button>
        )}
        {canWrite && failedCount === 0 && enrichable > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => void start(false)}
            disabled={busy}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> ให้ AI เติมอีก {fmtNum(enrichable)} รายการ
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className={busy ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <Text className="text-sm font-semibold text-gray-900">
                ให้ AI เติมรายละเอียดสินค้า
              </Text>
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                <ShieldCheck className="h-3 w-3" /> ต้องตรวจก่อนใช้งาน
              </span>
            </div>
            <Text className="text-xs text-gray-500">
              เติมสเปกรุ่น ขนาด/บรรจุ รายละเอียด 5–12 ข้อ หมวดหมู่ และราคาประมาณการ — ทุกค่าที่ AI
              เดา จะติดป้าย &quot;AI เดา&quot; จนกว่าคนจะยืนยัน
            </Text>
          </div>
        </div>

        {canWrite && !busy && (
          <div className="flex flex-wrap items-center gap-2">
            {pendingQueue > 0 ? (
              <Button size="sm" onClick={() => void loop()}>
                <Sparkles className="mr-1.5 h-4 w-4" /> ทำต่อ (เหลือ {fmtNum(pendingQueue)} รายการ)
              </Button>
            ) : enrichable > 0 ? (
              <Button size="sm" onClick={() => void start(false)}>
                <Sparkles className="mr-1.5 h-4 w-4" /> ให้ AI เติมข้อมูล ({fmtNum(enrichable)}{" "}
                รายการ)
              </Button>
            ) : (
              <StatusBadge tone="neutral">ไม่มีรายการที่ต้องให้ AI เติม</StatusBadge>
            )}
            {failedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => void start(true)}>
                <RotateCw className="mr-1.5 h-3.5 w-3.5" /> ลองใหม่เฉพาะที่ล้มเหลว (
                {fmtNum(failedCount)})
              </Button>
            )}
          </div>
        )}
      </div>

      {!busy && enrichable > 0 && (
        <Text className="mt-3 text-xs text-gray-500">
          ประมาณค่าใช้จ่ายครั้งนี้ {fmtMoney(estThb)} ({fmtNum(Math.ceil(enrichable / chunkSize))}{" "}
          คำขอ × ครั้งละ {fmtNum(chunkSize)} รายการ) · รายการที่ยืนยันแล้วจะถูกข้ามเสมอ
        </Text>
      )}

      {busy && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Text className="flex items-center gap-2 text-sm text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              {rounds.length > 0
                ? `กำลังทำรายการที่ ${fmtNum(rounds[rounds.length - 1].to + 1)}–${fmtNum(
                    Math.min(rounds[rounds.length - 1].to + chunkSize, total),
                  )} จาก ${fmtNum(total)}`
                : "กำลังเริ่มงาน…"}
            </Text>
            <Text className="text-xs tabular-nums text-gray-500">
              เสร็จแล้ว {fmtNum(job?.done_items ?? 0)} · ล้มเหลว {fmtNum(job?.failed_items ?? 0)}
            </Text>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>

          {rounds.length > 0 && (
            <ul className="space-y-1">
              {rounds.map((r) => (
                <li
                  key={`${r.from}-${r.to}`}
                  className="flex items-center justify-between text-xs text-gray-600"
                >
                  <span>
                    รายการ {fmtNum(r.from)}–{fmtNum(r.to)}
                  </span>
                  <span className="tabular-nums">
                    สำเร็จ {fmtNum(r.ok)}
                    {r.fail > 0 ? ` · ล้มเหลว ${fmtNum(r.fail)}` : ""} · {fmtNum(r.seconds)} วิ
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text className="text-xs text-gray-600">
              ต้องเปิดหน้านี้ไว้จนกว่าจะเสร็จ (~2–4 นาที) — ถ้าปิด งานจะหยุดค้างไว้ กลับมากด
              &quot;ทำต่อ&quot; ได้
            </Text>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                stopRef.current = true;
                toast.success("จะหยุดหลังรอบปัจจุบันทำเสร็จ");
              }}
            >
              <PauseCircle className="mr-1.5 h-4 w-4" /> หยุดชั่วคราว
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
