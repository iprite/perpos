"use client";

/**
 * AnswerCard — โครงคำตอบหนึ่งข้อ ครบ 5 ส่วนตาม contract §3.3
 *   1. bullet สรุป 2–4 ข้อ
 *   2. กราฟ (ChartRenderer เลือกตาม `chart.type`)
 *   3. ตารางข้อมูลดิบ พับเก็บ + คัดลอก/ดาวน์โหลด CSV + เตือนเมื่อถูกตัด
 *   4. บรรทัดนิยาม + ช่วงเวลา (**แสดงเสมอ ห้ามซ่อน**) + คำถามต่อยอด
 *   5. panel "ดูวิธีคำนวณ" พับเก็บ (SQL จริง + params + จำนวนแถว + เวลา)
 * และรองรับ `answer_status` ทุกค่า (answered/clarify/no_match/refused/error)
 */

import * as React from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  CircleAlert,
  HelpCircle,
  Lightbulb,
  RotateCcw,
  ShieldAlert,
  SquareTerminal,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Text, Title } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
import type { BiAnswer, BiMetricSummary } from "@/lib/bi/types";
import { ChartRenderer } from "./chart-renderer";
import { RawRows } from "./raw-rows";
import cn from "@core/utils/class-names";

export interface AnswerCardProps {
  answer: BiAnswer;
  /** metric ที่ role นี้เห็นได้ — ใช้เสนอทางเลือกเมื่อ `no_match`/`refused` */
  metrics: BiMetricSummary[];
  /** slug ขององค์กร — ใช้ลิงก์ไปหน้า "ถามอะไรได้บ้าง" */
  orgSlug: string;
  /** คำถามที่ทำให้เกิดคำตอบนี้ — ใช้ปุ่ม "ลองถามใหม่" ตอน error */
  question?: string;
  /** เวลาที่ถาม (ISO) — แสดงกำกับคำตอบที่มาจากประวัติ */
  createdAt?: string;
  /** ถามต่อ (follow-up / clarify / metric ที่เสนอ) */
  onAsk: (question: string) => void;
  /** ให้คะแนนคำตอบ (viewer = undefined → ไม่แสดงปุ่ม) */
  onFeedback?: (value: "up" | "down", note?: string) => void;
  feedback?: "up" | "down" | null;
  disabled?: boolean;
}

export function AnswerCard(props: AnswerCardProps) {
  const { answer } = props;

  switch (answer.status) {
    case "clarify":
      return <ClarifyCard {...props} />;
    case "no_match":
      return <NoMatchCard {...props} />;
    case "refused":
      return <NoticeCard tone="warning" icon={<ShieldAlert className="h-5 w-5" />} {...props} />;
    case "error":
      return <NoticeCard tone="error" icon={<CircleAlert className="h-5 w-5" />} {...props} />;
    default:
      return <AnsweredCard {...props} />;
  }
}

// ─── สถานะ answered — 5 ส่วนครบ ────────────────────────────────────────────

function AnsweredCard({
  answer,
  onAsk,
  onFeedback,
  feedback,
  disabled,
  createdAt,
}: AnswerCardProps) {
  const coverage = React.useMemo(() => coverageOf(answer.rows), [answer.rows]);
  const columnLabels = React.useMemo(() => columnLabelsOf(answer), [answer]);

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      {/* 1) bullet สรุป */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          {answer.metric ? (
            <Title as="h3" className="min-w-0 text-base font-medium text-gray-900">
              {answer.metric.label_th}
            </Title>
          ) : (
            <span />
          )}
          {createdAt ? (
            <Text className="shrink-0 text-xs text-gray-500">
              ถามเมื่อ {formatThaiDateTime(createdAt)}
            </Text>
          ) : null}
        </div>
        <ul className="space-y-1.5">
          {answer.answer.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <Text className="text-sm leading-6 text-gray-700">{b}</Text>
            </li>
          ))}
        </ul>
      </div>

      {/* คำเตือน "ข้อมูลถูกตัด" — ต้องเห็นก่อนดูกราฟเสมอ ห้ามซ่อนในลิ้นชัก (DESIGN §14) */}
      {answer.truncated ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <Text className="text-xs leading-5 text-amber-700">
            ตัวเลขนี้ยังไม่ครบทุกแถว — ระบบตัดผลที่เพดาน
            กรุณาระบุช่วงเวลา/เงื่อนไขให้แคบลงก่อนนำไปใช้ตัดสินใจ
          </Text>
        </div>
      ) : null}

      {/* 2) กราฟ */}
      {answer.chart ? (
        <ChartRenderer
          spec={answer.chart}
          rows={answer.rows}
          emptyMessage={
            answer.row_count > 0
              ? "ไม่ได้เก็บข้อมูลรายแถวของคำตอบนี้ไว้ (นโยบายข้อมูลอ่อนไหว) — ถามใหม่เพื่อดูข้อมูลล่าสุด"
              : undefined
          }
        />
      ) : null}

      {/* ความครอบคลุม — คำนวณจาก result set ตรง ๆ (ไม่พึ่ง LLM) */}
      {coverage ? <CoverageLine coverage={coverage} /> : null}

      {/* 3) ตารางข้อมูลดิบ (พับเก็บ) */}
      <RawRows rows={answer.rows} rowCount={answer.row_count} columnLabels={columnLabels} />

      {/* 4) นิยาม + ช่วงเวลา (แสดงเสมอ) + คำถามต่อยอด */}
      <DefinitionLine text={answer.definition_line} />
      <FollowUps items={answer.follow_ups} onAsk={onAsk} disabled={disabled} />

      {/* 5) ดูวิธีคำนวณ */}
      {answer.work ? <WorkPanel work={answer.work} /> : null}

      {onFeedback ? <FeedbackRow value={feedback ?? null} onFeedback={onFeedback} /> : null}
    </div>
  );
}

// ─── ความครอบคลุมของตัวเลข (นับจากกี่รายการ / กี่รายการที่กรอกราคาแล้ว) ────

interface Coverage {
  orderCount: number;
  pricedCount: number | null;
}

/**
 * รวม `order_count` / `priced_count` จากทุกแถวของผลลัพธ์
 * — กับดัก D1: ยอด "รวม VAT" นับเฉพาะใบที่กรอกราคาแล้ว ขณะที่ "ก่อน VAT" ครบทุกใบ
 *   ถ้าไม่บอกจำนวนใบ ผู้ใช้จะเอาสองยอดมาลบกันแล้วเข้าใจว่าเป็นภาษี ซึ่งผิด
 */
function coverageOf(rows: Array<Record<string, unknown>>): Coverage | null {
  if (!rows || rows.length === 0) return null;
  const sum = (key: string): number | null => {
    let total = 0;
    let found = false;
    for (const r of rows) {
      const v = r[key];
      if (typeof v === "number" && Number.isFinite(v)) {
        total += v;
        found = true;
      }
    }
    return found ? total : null;
  };

  const orderCount = sum("order_count");
  if (orderCount === null) return null;
  return { orderCount, pricedCount: sum("priced_count") };
}

const intFmt = new Intl.NumberFormat("en-US");

function CoverageLine({ coverage }: { coverage: Coverage }) {
  const { orderCount, pricedCount } = coverage;
  const incomplete = pricedCount !== null && pricedCount < orderCount;

  // เซลล์ผสมเลข+คำไทย → tabular-nums เท่านั้น ห้าม font-mono (DESIGN §5 ข้อ 8)
  if (!incomplete) {
    return (
      <Text className="px-1 text-xs tabular-nums text-gray-500">
        ความครอบคลุม: นับจาก {intFmt.format(orderCount)} รายการ
      </Text>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <Text className="text-xs tabular-nums leading-5 text-amber-700">
        นับจาก {intFmt.format(pricedCount as number)} รายการที่กรอกราคาแล้ว (จากทั้งหมด{" "}
        {intFmt.format(orderCount)} รายการ) — อีก{" "}
        {intFmt.format(orderCount - (pricedCount as number))}{" "}
        รายการยังไม่กรอกราคาจึงไม่ถูกรวมในยอดนี้
      </Text>
    </div>
  );
}

/** ชื่อคอลัมน์ไทยของตารางดิบ — เอาจาก chart spec (CSV ยังใช้คีย์ดิบ) */
function columnLabelsOf(answer: BiAnswer): Record<string, string> {
  const map: Record<string, string> = {};
  const chart = answer.chart;
  if (!chart) return map;
  if (chart.x) map[chart.x] = chart.title;
  for (const s of chart.series) map[s.key] = s.label_th;
  return map;
}

/** วันเวลาแบบไทย พ.ศ. — "24 ก.ค. 2569 14:32" */
function formatThaiDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DefinitionLine({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <Text className="text-xs leading-5 text-gray-600">{text}</Text>
    </div>
  );
}

function FollowUps({
  items,
  onAsk,
  disabled,
}: {
  items: string[];
  onAsk: (q: string) => void;
  disabled?: boolean;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <Text className="px-1 text-xs font-medium text-gray-500">ถามต่อได้</Text>
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 3).map((q, i) => (
          <Button
            key={i}
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onAsk(q)}
            className="max-w-full whitespace-normal text-left"
          >
            <Lightbulb className="mr-1.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            {q}
          </Button>
        ))}
      </div>
    </div>
  );
}

function WorkPanel({ work }: { work: NonNullable<BiAnswer["work"]> }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="space-y-2">
      <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <SquareTerminal className="mr-1.5 h-4 w-4" />
        ดูวิธีคำนวณ
        <ChevronDown className={cn("ml-1.5 h-4 w-4 transition-transform", open && "rotate-180")} />
      </Button>
      {open ? (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Meta label="จำนวนแถว" value={new Intl.NumberFormat("en-US").format(work.row_count)} />
            <Meta
              label="เวลารัน (มิลลิวินาที)"
              value={new Intl.NumberFormat("en-US").format(work.elapsed_ms)}
            />
          </div>
          <div className="space-y-1">
            <Text className="text-xs font-medium text-gray-500">พารามิเตอร์ที่ตีความได้</Text>
            <pre className="overflow-x-auto rounded-md border border-gray-200 bg-white p-2.5 text-xs leading-5 text-gray-700">
              {JSON.stringify(work.params, null, 2)}
            </pre>
          </div>
          <div className="space-y-1">
            <Text className="text-xs font-medium text-gray-500">คำสั่ง SQL ที่รันจริง</Text>
            <pre className="overflow-x-auto rounded-md border border-gray-200 bg-white p-2.5 text-xs leading-5 text-gray-700">
              {work.sql}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <Text className="text-xs text-gray-500">{label}</Text>
      <Text className="font-mono text-xs tabular-nums text-gray-900">{value}</Text>
    </div>
  );
}

function FeedbackRow({
  value,
  onFeedback,
}: {
  value: "up" | "down" | null;
  onFeedback: (v: "up" | "down", note?: string) => void;
}) {
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [note, setNote] = React.useState("");

  return (
    <div className="space-y-2 border-t border-gray-200 pt-3">
      <div className="flex items-center gap-2">
        <Text className="text-xs text-gray-500">คำตอบนี้ตรงกับที่ต้องการไหม</Text>
        <Button
          size="sm"
          variant={value === "up" ? "secondary" : "ghost"}
          onClick={() => onFeedback("up")}
          aria-label="คำตอบนี้ตรงกับที่ต้องการ"
        >
          <ThumbsUp className={cn("h-4 w-4", value === "up" && "text-green-600")} />
        </Button>
        <Button
          size="sm"
          variant={value === "down" ? "secondary" : "ghost"}
          onClick={() => setNoteOpen(true)}
          aria-label="คำตอบนี้ยังไม่ตรง"
        >
          <ThumbsDown className={cn("h-4 w-4", value === "down" && "text-red-600")} />
        </Button>
      </div>

      {noteOpen ? (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="บอกสั้น ๆ ว่าคำตอบยังไม่ตรงตรงไหน (ไม่บังคับ)"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onFeedback("down", note.trim() || undefined);
                setNoteOpen(false);
              }}
            >
              ส่งความเห็น
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── สถานะ clarify — ถามกลับพร้อมปุ่มให้กด (D1 รวม/ไม่รวม VAT) ─────────────

function ClarifyCard({ answer, onAsk, disabled, question, orgSlug }: AnswerCardProps) {
  const options = answer.clarify?.options ?? [];
  // ประวัติเก่ายังไม่ได้เก็บตัวเลือกไว้ (answer_meta ไม่มี clarify.options)
  // → อย่าปล่อยให้ตัน: ให้ถามคำถามเดิมซ้ำเพื่อเรียกตัวเลือกกลับมาใหม่
  const fallbackQuestion = options.length === 0 ? question?.trim() : "";
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 rounded-full bg-gray-100 p-1.5 text-gray-600">
          <HelpCircle className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <StatusBadge tone="info">ขอความชัดเจนก่อนตอบ</StatusBadge>
          <Text className="text-sm leading-6 text-gray-700">
            {answer.clarify?.question ?? answer.answer.bullets[0] ?? "กรุณาระบุให้ชัดขึ้นอีกนิด"}
          </Text>
        </div>
      </div>

      {/* จุดที่ผู้ใช้ต้องเลือกให้ถูกที่สุดของทั้งโมดูล (D1) → ปุ่มเต็มแถว ชื่อ + นิยามอยู่ในปุ่มเดียวกัน */}
      <div className="space-y-2">
        {options.map((o) => (
          <Button
            key={o.metric_key}
            variant="outline"
            disabled={disabled}
            onClick={() => onAsk(o.label_th)}
            className="h-auto w-full flex-col items-start gap-0.5 whitespace-normal px-3.5 py-2.5 text-left"
          >
            <span className="text-sm font-medium text-gray-900">{o.label_th}</span>
            <span className="text-xs font-normal leading-5 text-gray-500">{o.definition_th}</span>
          </Button>
        ))}
      </div>

      {options.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {fallbackQuestion ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onAsk(fallbackQuestion)}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              ถามคำถามนี้อีกครั้งเพื่อเลือกตัวเลือก
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/${orgSlug}/bi/metrics`}>
              <BookOpen className="mr-1.5 h-4 w-4" />
              ดูตัวชี้วัดทั้งหมดที่ถามได้
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ─── สถานะ no_match — บอกตรง ๆ + เสนอ metric ใกล้เคียง ─────────────────────

function NoMatchCard({ answer, metrics, onAsk, disabled, orgSlug }: AnswerCardProps) {
  // engine คำนวณคำแนะนำที่ตรงกับคำถามไว้ใน follow_ups แล้ว — ใช้อันนั้นก่อนเสมอ
  const suggestions =
    answer.follow_ups.length > 0
      ? answer.follow_ups.slice(0, 3)
      : metrics.slice(0, 3).map((m) => m.label_th);
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 rounded-full bg-amber-50 p-1.5 text-amber-600">
          <CircleAlert className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <StatusBadge tone="warning">ยังตอบคำถามนี้ไม่ได้</StatusBadge>
          {answer.answer.bullets.map((b, i) => (
            <Text key={i} className="text-sm leading-6 text-gray-700">
              {b}
            </Text>
          ))}
        </div>
      </div>

      {suggestions.length > 0 ? (
        <SuggestionRow
          title="ลองถามเรื่องที่ระบบตอบได้"
          items={suggestions}
          onAsk={onAsk}
          disabled={disabled}
          orgSlug={orgSlug}
        />
      ) : null}
    </div>
  );
}

// ─── สถานะ refused / error ─────────────────────────────────────────────────

/** แถวปุ่มคำแนะนำ + ทางออกไปหน้า "ถามอะไรได้บ้าง" — ใช้ร่วมกันใน no_match / refused */
function SuggestionRow({
  title,
  items,
  onAsk,
  disabled,
  orgSlug,
}: {
  title: string;
  items: string[];
  onAsk: (q: string) => void;
  disabled?: boolean;
  orgSlug: string;
}) {
  return (
    <div className="space-y-1.5">
      <Text className="px-1 text-xs font-medium text-gray-500">{title}</Text>
      <div className="flex flex-wrap gap-2">
        {items.map((q, i) => (
          <Button
            key={`${q}-${i}`}
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onAsk(q)}
            className="max-w-full whitespace-normal text-left"
          >
            {q}
          </Button>
        ))}
        <Button size="sm" variant="ghost" asChild>
          <Link href={`/${orgSlug}/bi/metrics`}>
            <BookOpen className="mr-1.5 h-4 w-4" />
            ดูตัวชี้วัดทั้งหมดที่ถามได้
          </Link>
        </Button>
      </div>
    </div>
  );
}

function NoticeCard({
  tone,
  icon,
  answer,
  metrics,
  onAsk,
  disabled,
  orgSlug,
  question,
}: AnswerCardProps & {
  tone: "warning" | "error";
  icon: React.ReactNode;
}) {
  const text =
    answer.answer.bullets.length > 0
      ? answer.answer.bullets
      : tone === "error"
        ? ["ระบบขัดข้องชั่วคราว กรุณาลองถามใหม่อีกครั้ง"]
        : ["ยังตอบคำถามนี้ให้ไม่ได้ในตอนนี้"];

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border p-4 shadow-sm sm:p-5",
        tone === "error" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 rounded-full bg-white p-1.5",
            tone === "error" ? "text-red-600" : "text-amber-600",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 space-y-1">
          {text.map((b, i) => (
            <Text
              key={i}
              className={cn(
                "text-sm leading-6",
                tone === "error" ? "text-red-700" : "text-amber-700",
              )}
            >
              {b}
            </Text>
          ))}
        </div>
      </div>

      {/* ทางออกจากกล่อง — ห้ามให้ผู้ใช้ตัน */}
      {tone === "error" ? (
        question ? (
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onAsk(question)}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            ลองถามใหม่
          </Button>
        ) : null
      ) : (
        <SuggestionRow
          title="เรื่องที่ระบบตอบได้ตอนนี้"
          items={metrics.slice(0, 3).map((m) => m.label_th)}
          onAsk={onAsk}
          disabled={disabled}
          orgSlug={orgSlug}
        />
      )}
    </div>
  );
}
