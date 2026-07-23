"use client";

// risk-briefing.tsx — AI must §5.5 "เตือนงานเสี่ยงเลยกำหนด" (หน้าภาพรวม)
// ชั้น 1 rule-based: คัดงานเสี่ยงจาก metrics.ts (แหล่งเดียว) · ชั้น 2 AI: เรียบเรียงเป็นภาษาคน + ลำดับงาน
// prototype = mock: กดปุ่ม → หน่วงเวลาจำลอง → หยิบผลจาก _fixtures/ai-mocks.ts (ไม่ยิง API จริง)
// 🔒 §2.3 ข้อ 5: ผลลัพธ์ไม่มีตัวเลขต้นทุน/กำไร — แสดงเฉพาะจำนวนงาน/เลขที่ออเดอร์/จำนวนวัน

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/typography";
import {
  AI_DISCLAIMER,
  AI_MOCK_LATENCY_MS,
  AI_MOCK_MODEL_LABEL,
  aiRiskBriefing,
  type AiRiskBriefing,
} from "./_fixtures/ai-mocks";
import { ORDER_STATUS_LABEL } from "./_fixtures/labels";
import {
  atRiskOrders,
  lowStockMaterials,
  overdueOrders,
  staleAwaitingCfOrders,
} from "./_fixtures/metrics";
import { MATTII_BASE, SectionHeading, ageInDays, daysUntil, useMattiiData } from "./_components";

export function RiskBriefingPanel() {
  const { orders, materials, customerOf } = useMattiiData();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiRiskBriefing | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  // ชั้น 1 (rule-based) — คัดงานเสี่ยงจากสูตรกลางใน metrics.ts เสมอ ห้ามคิดเกณฑ์เองที่นี่
  const input = useMemo(() => {
    const nameOf = (customerId: string) => customerOf(customerId)?.display_name ?? "ลูกค้า";
    return {
      overdue: overdueOrders(orders)
        .map((o) => ({
          orderNo: o.order_no,
          customerName: nameOf(o.customer_id),
          daysLate: Math.abs(daysUntil(o.due_date) ?? 0),
          statusLabel: ORDER_STATUS_LABEL[o.status],
        }))
        .sort((a, b) => b.daysLate - a.daysLate),
      atRisk: atRiskOrders(2, orders)
        .map((o) => ({
          orderNo: o.order_no,
          customerName: nameOf(o.customer_id),
          daysLeft: daysUntil(o.due_date) ?? 0,
          statusLabel: ORDER_STATUS_LABEL[o.status],
        }))
        .sort((a, b) => a.daysLeft - b.daysLeft),
      staleCf: staleAwaitingCfOrders(2, orders)
        .map((o) => ({
          orderNo: o.order_no,
          customerName: nameOf(o.customer_id),
          daysWaiting: ageInDays(o.created_at),
        }))
        .sort((a, b) => b.daysWaiting - a.daysWaiting),
      lowStockNames: lowStockMaterials(materials).map((m) => m.name),
    };
  }, [orders, materials, customerOf]);

  const riskCount = input.overdue.length + input.atRisk.length + input.staleCf.length;

  function handleRun() {
    setLoading(true);
    setResult(null);
    // ชั้น 2 (AI) — จำลองเวลาเรียกโมเดล แล้วหยิบผลที่เตรียมไว้ (ผลอ้างอิงออเดอร์จริงจาก state)
    timerRef.current = window.setTimeout(() => {
      setResult(aiRiskBriefing(input));
      setLoading(false);
    }, AI_MOCK_LATENCY_MS);
  }

  return (
    <div>
      <SectionHeading>ผู้ช่วย AI สรุปงานเสี่ยงวันนี้</SectionHeading>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <Text className="text-sm font-medium text-gray-900">
              ให้ AI อ่านงานที่เสี่ยงตอนนี้ แล้วบอกว่าควรทำอะไรก่อน
            </Text>
            <Text className="mt-0.5 text-xs text-gray-500">
              ระบบคัดงานเสี่ยงด้วยกฎ (เลยกำหนด · ใกล้ครบกำหนด · ค้างรอลูกค้ายืนยันลาย ·
              วัสดุใกล้หมด) แล้วให้ AI เรียบเรียงเป็นภาษาคน — ตอนนี้พบ {riskCount} งานที่เข้าเกณฑ์
            </Text>
          </div>
          <Button onClick={handleRun} disabled={loading} className="shrink-0">
            {loading ? (
              "กำลังสรุป…"
            ) : (
              <>
                <Sparkles className="mr-1.5 h-4 w-4" />
                {result ? "สรุปใหม่อีกครั้ง" : "ให้ AI สรุปงานเสี่ยงวันนี้"}
              </>
            )}
          </Button>
        </div>

        {loading && (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-4/5 rounded" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        )}

        {!loading && result && (
          <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
            <Text className="text-sm leading-relaxed text-gray-700">{result.summary}</Text>

            {result.actions.length > 0 && (
              <ol className="space-y-2">
                {result.actions.map((a, idx) => (
                  <li
                    key={a.key}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3 transition-colors duration-150 hover:bg-white"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium tabular-nums text-white">
                        {idx + 1}
                      </span>
                      <Text className="min-w-0 flex-1 text-sm font-medium text-gray-900">
                        {a.label}
                      </Text>
                      {a.priority === "high" ? (
                        <StatusBadge tone="danger">ทำก่อน</StatusBadge>
                      ) : (
                        <StatusBadge tone="warning">ตามคิว</StatusBadge>
                      )}
                    </div>
                    <Text className="mt-1 text-xs leading-relaxed text-gray-600">{a.reason}</Text>
                    {a.orderNos.length > 0 ? (
                      <Button asChild size="sm" variant="ghost" className="mt-1.5 h-8 px-2">
                        <Link
                          href={
                            a.key === "stale_cf"
                              ? `${MATTII_BASE}/orders?filter=stale_cf`
                              : `${MATTII_BASE}/orders?filter=overdue`
                          }
                        >
                          เปิดรายการงานเหล่านี้
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm" variant="ghost" className="mt-1.5 h-8 px-2">
                        <Link href={`${MATTII_BASE}/materials?low=1`}>เปิดวัสดุที่ใกล้หมด</Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
            )}

            <Text
              className="text-xs text-gray-400"
              title={`ความมั่นใจของผลลัพธ์ ${Math.round(result.confidence * 100)}%`}
            >
              {AI_DISCLAIMER} · {AI_MOCK_MODEL_LABEL}
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}
