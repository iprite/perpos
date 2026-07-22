"use client";

// benchmark-tab.tsx — 🔒 owner-only: แก้ค่าฐาน "ก่อนมีระบบ" (mattii_benchmarks §3.22)
// ค่าเหล่านี้คือตัวตั้งต้นที่หน้าภาพรวม/รายงานเอาไปเทียบ before/after — เป็น "ค่าประมาณการจากเจ้าของร้าน"
// ไม่ใช่สถิติที่ระบบวัดเอง · ค่า "ตอนนี้" ยังคำนวณจากงานจริงผ่าน metrics.ts เสมอ

import { useState } from "react";
import { Gauge, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import type { MattiiBenchmark } from "../_fixtures/types";
import { SectionHeading, useMattiiRole } from "../_components";

type FieldKey =
  | "lead_time_baseline_days"
  | "cf_wait_baseline_days"
  | "reprint_rate_baseline"
  | "late_rate_baseline"
  | "orders_per_month_baseline"
  | "reply_time_baseline_minutes";

const FIELDS: { key: FieldKey; label: string; unit: string; hint: string }[] = [
  {
    key: "lead_time_baseline_days",
    label: "เวลารับออเดอร์ → ส่งถึงมือลูกค้า",
    unit: "วัน",
    hint: "เดิมใช้เวลากี่วันต่อออเดอร์โดยเฉลี่ย",
  },
  {
    key: "cf_wait_baseline_days",
    label: "เวลารอลูกค้ายืนยันลาย (CF)",
    unit: "วัน",
    hint: "นับจากส่งลายให้ดูจนลูกค้าตอบกลับ",
  },
  {
    key: "reprint_rate_baseline",
    label: "อัตราพิมพ์ซ้ำจากงานไม่ผ่าน",
    unit: "%",
    hint: "สัดส่วนงานที่ต้องพิมพ์ใหม่",
  },
  {
    key: "late_rate_baseline",
    label: "อัตราส่งช้ากว่าที่สัญญาไว้",
    unit: "%",
    hint: "สัดส่วนออเดอร์ที่เลยกำหนดส่ง",
  },
  {
    key: "orders_per_month_baseline",
    label: "จำนวนออเดอร์ต่อเดือน",
    unit: "ออเดอร์",
    hint: "ปริมาณงานเฉลี่ยก่อนใช้ระบบ",
  },
  {
    key: "reply_time_baseline_minutes",
    label: "เวลาตอบแชทลูกค้า",
    unit: "นาที",
    hint: "เดิมต้องสลับ 3 แอปกว่าจะตอบได้",
  },
];

export function BenchmarkTab({
  benchmark,
  onChange,
}: {
  benchmark: MattiiBenchmark;
  onChange: (next: MattiiBenchmark) => void;
}) {
  const { isOwner } = useMattiiRole();

  const [form, setForm] = useState<Record<FieldKey, string>>(() => ({
    lead_time_baseline_days: String(benchmark.lead_time_baseline_days),
    cf_wait_baseline_days: String(benchmark.cf_wait_baseline_days),
    reprint_rate_baseline: String(benchmark.reprint_rate_baseline),
    late_rate_baseline: String(benchmark.late_rate_baseline),
    orders_per_month_baseline: String(benchmark.orders_per_month_baseline),
    reply_time_baseline_minutes: String(benchmark.reply_time_baseline_minutes),
  }));
  const [note, setNote] = useState(benchmark.source_note);
  const [touched, setTouched] = useState(false);

  // กันพลาด: แท็บนี้ถูก render เฉพาะเจ้าของอยู่แล้ว — เช็คซ้ำอีกชั้นตาม §2.3
  if (!isOwner) return null;

  const invalidKeys = FIELDS.filter((f) => {
    const v = Number(form[f.key]);
    return !(Number.isFinite(v) && v > 0);
  }).map((f) => f.key);

  function setField(key: FieldKey, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setTouched(true);
    if (invalidKeys.length > 0) {
      notify.error("ค่าฐานทุกช่องต้องเป็นตัวเลขมากกว่า 0");
      return;
    }
    onChange({
      ...benchmark,
      lead_time_baseline_days: Number(form.lead_time_baseline_days),
      cf_wait_baseline_days: Number(form.cf_wait_baseline_days),
      reprint_rate_baseline: Number(form.reprint_rate_baseline),
      late_rate_baseline: Number(form.late_rate_baseline),
      orders_per_month_baseline: Number(form.orders_per_month_baseline),
      reply_time_baseline_minutes: Number(form.reply_time_baseline_minutes),
      source_note: note.trim() || benchmark.source_note,
      updated_at: new Date().toISOString(),
    });
    notify.updated("บันทึกค่าฐานก่อนมีระบบแล้ว — รายงานเปรียบเทียบจะใช้ค่าใหม่นี้");
  }

  function handleReset() {
    setForm({
      lead_time_baseline_days: String(benchmark.lead_time_baseline_days),
      cf_wait_baseline_days: String(benchmark.cf_wait_baseline_days),
      reprint_rate_baseline: String(benchmark.reprint_rate_baseline),
      late_rate_baseline: String(benchmark.late_rate_baseline),
      orders_per_month_baseline: String(benchmark.orders_per_month_baseline),
      reply_time_baseline_minutes: String(benchmark.reply_time_baseline_minutes),
    });
    setNote(benchmark.source_note);
    setTouched(false);
    notify.info("คืนค่าที่บันทึกไว้ล่าสุดแล้ว");
  }

  return (
    <div className="space-y-4">
      <SectionHeading>ค่าฐาน “ก่อนมีระบบ”</SectionHeading>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <Text className="text-xs text-amber-700">
          ค่าชุดนี้เป็น “ค่าประมาณการจากเจ้าของร้าน” ที่ใช้เป็นจุดเปรียบเทียบผลลัพธ์เท่านั้น
          ไม่ใช่ตัวเลขที่ระบบวัดได้เอง — ส่วนค่า “ตอนนี้” ในรายงานคำนวณจากงานจริงที่เดินในระบบเสมอ
        </Text>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`mt-bmk-${f.key}`}>
                {f.label} ({f.unit}) *
              </Label>
              <Input
                id={`mt-bmk-${f.key}`}
                type="number"
                value={form[f.key]}
                onChange={(e) => setField(f.key, e.target.value)}
                className="mt-1"
              />
              {touched && invalidKeys.includes(f.key) ? (
                <Text className="mt-1 text-xs text-red-600">กรอกตัวเลขมากกว่า 0</Text>
              ) : (
                <Text className="mt-1 text-xs text-gray-400">{f.hint}</Text>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4">
          <Label htmlFor="mt-bmk-note">ที่มาของตัวเลข</Label>
          <Input
            id="mt-bmk-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น ประมาณการจากเจ้าของร้าน ก.ค. 2569"
            className="mt-1"
          />
          <Text className="mt-1 text-xs text-gray-400">
            ข้อความนี้จะแสดงกำกับใต้ตารางเปรียบเทียบในหน้ารายงาน เพื่อให้คนอ่านรู้ที่มาของค่าฐาน
          </Text>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={handleSave}>
            <Gauge className="mr-1.5 h-4 w-4" /> บันทึกค่าฐาน
          </Button>
          <Button variant="outline" onClick={handleReset}>
            คืนค่าที่บันทึกไว้
          </Button>
        </div>
      </div>
    </div>
  );
}
