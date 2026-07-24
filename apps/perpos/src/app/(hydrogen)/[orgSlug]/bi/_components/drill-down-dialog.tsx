"use client";

/**
 * DrillDownDialog — คลิกจุดบนกราฟแล้วดู "รายการที่อยู่เบื้องหลังตัวเลขนั้น" (P3-D3)
 *
 * ยิง `POST /api/bi/run` ด้วย metric รายละเอียด + params ที่ `buildDrillParams` คำนวณให้
 * — ไม่มี AI · ผลเป็น grain รายการ (metric ติดธง `no_summarize`) จึงแสดงเป็นตารางล้วน
 * error ที่โชว์ = ข้อความไทยจากเซิร์ฟเวอร์เท่านั้น (ห้าม error ดิบ)
 */

import * as React from "react";
import { Text } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BiDirectResult, BiDrillTarget } from "@/lib/bi/types";
import { ChartRenderer } from "./chart-renderer";
import { RawRows } from "./raw-rows";
import { DefinitionLine } from "./answer-card";

async function accessToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

export function DrillDownDialog({
  orgId,
  target,
  label,
  dimensionLabel,
  periodLabel,
  onClose,
}: {
  orgId: string;
  /** null = ปิดอยู่ */
  target: BiDrillTarget | null;
  /** ค่าที่ผู้ใช้คลิก (ใช้ทำหัวข้อ) */
  label: string;
  /** ชื่อไทยของมิติที่คลิก เช่น "บริษัท" — ค่าอย่างเดียวกำกวม (บริษัท? หน่วยงาน?) */
  dimensionLabel?: string;
  /** ช่วงเวลาที่กรองมาด้วย — บอกให้ชัดว่าตารางนี้ไม่ใช่ "ทั้งหมด" */
  periodLabel?: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<BiDirectResult | null>(null);

  React.useEffect(() => {
    if (!target) {
      setResult(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);

    void (async () => {
      try {
        const token = await accessToken();
        const res = await fetch("/api/bi/run", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            orgId,
            metricKey: target.metric_key,
            params: target.params,
          }),
        });
        const json = (await res.json()) as BiDirectResult & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || "ดูรายการเบื้องหลังตัวเลขนี้ไม่สำเร็จ");
          return;
        }
        setResult(json);
      } catch {
        if (!cancelled) setError("ดูรายการเบื้องหลังตัวเลขนี้ไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, target]);

  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent size="3xl">
        <DialogHeader>
          <DialogTitle>
            รายการของ {dimensionLabel ? `${dimensionLabel}: ` : ""}
            {label || "กลุ่มที่เลือก"}
          </DialogTitle>
          {periodLabel ? (
            <Text className="mt-1 text-xs text-gray-500">ช่วงเวลาที่กรอง: {periodLabel}</Text>
          ) : null}
        </DialogHeader>
        <DialogBody>
          {loading ? (
            <div className="animate-pulse space-y-2.5">
              <div className="h-3 w-1/3 rounded bg-gray-100" />
              <div className="h-48 rounded-lg bg-gray-100" />
            </div>
          ) : error ? (
            <Text className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-700">
              {error}
            </Text>
          ) : result ? (
            <div className="space-y-3">
              <Text className="text-sm text-gray-600">
                พบ {new Intl.NumberFormat("en-US").format(result.row_count)} รายการ
              </Text>
              {result.chart ? <ChartRenderer spec={result.chart} rows={result.rows} /> : null}
              <RawRows
                rows={result.rows}
                rowCount={result.row_count}
                title="ข้อมูลดิบของรายการนี้"
              />
              <DefinitionLine text={result.definition_line} />
            </div>
          ) : (
            <Text className="text-sm text-gray-500">ยังไม่มีข้อมูลที่จะแสดง</Text>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
