"use client";

// file-check-panel.tsx — AI §5.2 (mock): ตรวจไฟล์ลายก่อนพิมพ์
// ผลลัพธ์ทั้งหมดมาจากแหล่งเดียว = `_fixtures/ai-mocks.ts` (`aiArtworkCheckFor`) — ห้ามมี canned ซ้ำในหน้า
//
// กติกาที่ต้องคง:
//  · ป้ายแยกที่มา "ตรวจอัตโนมัติ" (item.ruleBased = true) vs "AI" (ruleBased = false)
//  · ผลระดับ "ต้องแก้ก่อน" (fail) → ต้องเปิดสวิตช์รับทราบก่อน จึงกดยืนยันไฟล์ได้
//  · `is_print_ready` **คนกดเท่านั้น** — AI ตั้งให้ไม่ได้
//  · % ความมั่นใจเป็นบรรทัดรอง ไม่ใช่ตัวเลขหลัก

import { useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, ScanLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import {
  AI_DISCLAIMER,
  AI_MOCK_LATENCY_MS,
  AI_MOCK_MODEL_LABEL,
  aiArtworkCheckFor,
  type AiArtworkCheck,
  type AiArtworkCheckItem,
} from "../_fixtures/ai-mocks";
import type { MattiiDesignVersion } from "../_fixtures/types";

function SourceBadge({ ruleBased }: { ruleBased: boolean }) {
  return ruleBased ? (
    <StatusBadge tone="neutral">
      <ShieldCheck className="mr-1 h-3 w-3" />
      ตรวจอัตโนมัติ
    </StatusBadge>
  ) : (
    <StatusBadge tone="info">
      <Bot className="mr-1 h-3 w-3" />
      AI
    </StatusBadge>
  );
}

function ResultBadge({ result }: { result: AiArtworkCheckItem["result"] }) {
  if (result === "fail") return <StatusBadge tone="danger">ต้องแก้ก่อน</StatusBadge>;
  if (result === "warn") return <StatusBadge tone="warning">ควรตรวจ</StatusBadge>;
  return <StatusBadge tone="success">ผ่าน</StatusBadge>;
}

function CheckRow({ item }: { item: AiArtworkCheckItem }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <SourceBadge ruleBased={item.ruleBased} />
        <ResultBadge result={item.result} />
        <span className="text-sm font-medium text-gray-900">{item.label}</span>
      </div>
      <Text className="text-xs text-gray-500">{item.detail}</Text>
    </li>
  );
}

export function FileCheckPanel({
  version,
  approvedVersionId,
  canConfirm,
  onSetPrintReady,
}: {
  version: MattiiDesignVersion;
  /** เวอร์ชันที่ลูกค้ายืนยัน — ใช้เตือนเมื่อกำลังดูไฟล์คนละเวอร์ชัน (ข้อมูลจริง ไม่ใช่ผล AI) */
  approvedVersionId: string | null;
  /** บทบาทนี้กด "ไฟล์พร้อมพิมพ์" ได้ไหม */
  canConfirm: boolean;
  onSetPrintReady: (value: boolean) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "checking" | "done">("idle");
  const [check, setCheck] = useState<AiArtworkCheck | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  function runCheck() {
    setPhase("checking");
    setAcknowledged(false);
    window.setTimeout(() => {
      setCheck(aiArtworkCheckFor(version.id));
      setPhase("done");
    }, AI_MOCK_LATENCY_MS);
  }

  const items = check?.items ?? [];
  const blockers = items.filter((c) => c.result === "fail");
  const warns = items.filter((c) => c.result === "warn");
  const mustAcknowledge = blockers.length > 0 || check?.overall === "fail";
  const readyDisabled = !canConfirm || (mustAcknowledge && !acknowledged);
  const wrongVersion = !!approvedVersionId && approvedVersionId !== version.id;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScanLine className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-900">ตรวจไฟล์ลายก่อนพิมพ์</span>
          {version.is_print_ready && <StatusBadge tone="success">ไฟล์พร้อมพิมพ์</StatusBadge>}
        </div>
        <Button size="sm" variant="outline" disabled={phase === "checking"} onClick={runCheck}>
          {phase === "checking"
            ? "กำลังตรวจไฟล์…"
            : phase === "done"
              ? "ตรวจอีกครั้ง"
              : "ตรวจไฟล์นี้"}
        </Button>
      </div>

      <Text className="mt-1.5 text-xs text-gray-500">
        ตรวจ 2 ชั้น: ค่าไฟล์ (ความละเอียด/สัดส่วน/ระยะตัดตก/โหมดสี) ตรวจอัตโนมัติด้วยกฎตายตัว + AI
        ดูองค์ประกอบลาย — เป็นตัวช่วยเตือน ไม่ใช่ผู้อนุมัติ คนเป็นผู้ตัดสินใจเสมอ
      </Text>

      {wrongVersion && (
        <Text className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
          ไฟล์ที่กำลังดูอยู่ไม่ใช่เวอร์ชันที่ลูกค้ายืนยัน —
          ถ้าส่งพิมพ์ไฟล์นี้จะถือว่าพิมพ์ผิดเวอร์ชัน
        </Text>
      )}

      {phase === "checking" && (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {phase === "done" && check && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {check.overall === "fail" ? (
              <StatusBadge tone="danger">
                <AlertTriangle className="mr-1 h-3 w-3" />
                ยังไม่ควรส่งพิมพ์
              </StatusBadge>
            ) : check.overall === "warn" ? (
              <StatusBadge tone="warning">
                <AlertTriangle className="mr-1 h-3 w-3" />
                พิมพ์ได้ แต่ควรแก้ก่อน
              </StatusBadge>
            ) : (
              <StatusBadge tone="success">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                ไม่พบปัญหาที่ต้องแก้
              </StatusBadge>
            )}
            {blockers.length > 0 && (
              <StatusBadge tone="danger">ต้องแก้ {blockers.length} จุด</StatusBadge>
            )}
            {warns.length > 0 && (
              <StatusBadge tone="warning">ควรตรวจ {warns.length} จุด</StatusBadge>
            )}
          </div>

          <Text className="text-sm text-gray-900">{check.headline}</Text>

          <ul className="space-y-2">
            {items.map((c) => (
              <CheckRow key={c.key} item={c} />
            ))}
          </ul>

          {mustAcknowledge && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <Switch id="ack-blockers" checked={acknowledged} onChange={setAcknowledged} />
              <Label htmlFor="ack-blockers" className="text-xs font-normal text-red-700">
                รับทราบว่าระบบแจ้งว่าไฟล์นี้ยังไม่ควรส่งพิมพ์
                และยืนยันจะเดินงานต่อด้วยความรับผิดชอบของฉันเอง
              </Label>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={readyDisabled}
              title={
                canConfirm
                  ? mustAcknowledge && !acknowledged
                    ? "ติ๊กรับทราบผลตรวจก่อนจึงจะยืนยันได้"
                    : undefined
                  : "บทบาทของคุณไม่มีสิทธิ์ยืนยันไฟล์"
              }
              onClick={() => {
                onSetPrintReady(true);
                notify.success(`ยืนยันแล้วว่า v${version.version_no} พร้อมพิมพ์`);
              }}
            >
              ยืนยันว่าไฟล์นี้พร้อมพิมพ์
            </Button>
            {version.is_print_ready && (
              <Button
                size="sm"
                variant="ghost"
                disabled={!canConfirm}
                onClick={() => {
                  onSetPrintReady(false);
                  notify.info(`ยกเลิกสถานะพร้อมพิมพ์ของ v${version.version_no}`);
                }}
              >
                ยกเลิกสถานะพร้อมพิมพ์
              </Button>
            )}
          </div>

          <Text className="text-xs text-gray-400">
            {AI_DISCLAIMER} · ความมั่นใจโดยประมาณ {Math.round(check.confidence * 100)}% ·{" "}
            {AI_MOCK_MODEL_LABEL}
          </Text>
        </div>
      )}
    </div>
  );
}
