// lib/gov-procure/line-cards.ts — LINE Flex builders (production) สำหรับ gov_procure T1/T2/T3
// ยึด docs/line-flex-card-guide.md: header CHARCOAL #3C3B3D พื้นเรียบ (ห้าม gradient),
// hex ทุกค่าอยู่ในตาราง §2 (= DESIGN.md §2 palette), เงิน comma-group + ยอดลบ U+2212 (−).
//
// ⚠️ ฮาร์ดโค้ด hex ในไฟล์นี้ = ข้อยกเว้นที่ตั้งใจ (LINE render นอกแอป Tailwind ไม่ทำงาน จึงเป็น
//    "ที่เดียวที่ hex ตรงได้" ตาม line-flex-card-guide §1.2). ทุกค่าต้องตรง palette — ห้ามคิดสีใหม่.
// mirror ภาพจำลอง prototype: settings/flex-preview.tsx (T1OverduePreview/T2WeeklyPreview/T3EventPreview).

import type { LineMessage } from "@/lib/line/send-messages";
import type { GovProcureOrder } from "./types";
import { computeDuration, type GovProcureSummary, type ReceivableRow } from "./summary";

// ── Design tokens (hex ตรงตาม line-flex-card-guide §2 / DESIGN §2) ──
const CHARCOAL = "#3C3B3D"; // header / primary button
const WHITE = "#ffffff";
const INK = "#1A1A1B"; // ข้อความหลัก
const INK_MUTED = "#656D78"; // ข้อความรอง
const FINE = "#9CA3AF"; // fine print / AI hint
const RUBY = "#D8334A"; // negative / overdue
const RUBY_BG = "#FCF1F2"; // error chip bg
const INFO = "#0C447C"; // info chip text
const INFO_BG = "#E6F1FB"; // info chip bg
const SUCCESS = "#065F46"; // success chip text
const SUCCESS_BG = "#F2FCF9"; // success chip bg
const SEPARATOR = "#E6E9EE";

function appBase(): string {
  return (process.env.APP_BASE_URL ?? "https://app.perpos.ai").replace(/\/$/, "");
}

/** URL เข้าหน้าโมดูลต่อ org (production route /[orgSlug]/gov-procure/...) */
function moduleUrl(orgSlug: string, seg = ""): string {
  const path = seg ? `/gov-procure/${seg}` : "/gov-procure";
  return `${appBase()}/${orgSlug}${path}`;
}

/** เงินบาท — comma group + ยอดลบ U+2212 (−, ไม่ใช่ hyphen) ตาม DESIGN §2 */
export function fmtBaht(n: number): string {
  const abs = Math.abs(n).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? "−" : ""}${abs} ฿`;
}

/** เงินแบบไม่มีทศนิยม (สำหรับ split ในการ์ดสรุป) */
function fmtBaht0(n: number): string {
  const abs = Math.abs(n).toLocaleString("th-TH");
  return `${n < 0 ? "−" : ""}${abs} ฿`;
}

/** label หัวรายการงานใน T1 — กอง (ถ้ามี) ไม่งั้นชื่อหน่วยงาน + seq */
function orderTitle(r: {
  department: string | null;
  customer_name: string;
  seq_no: number | null;
}): string {
  const head = r.department?.trim() || r.customer_name;
  return r.seq_no != null ? `${head} · #${r.seq_no}` : head;
}

// ── T1 — เงินค้างรับเกินกำหนด (push รายวัน / reply /ค้างรับ) ──
/**
 * buildReceivableAlertFlex — การ์ดสรุปงาน delivered ที่ค้างรับเกิน SLA.
 * caller ต้อง filter overdue (r.overdue === true) มาแล้ว + ต้องมีอย่างน้อย 1 งาน.
 */
export function buildReceivableAlertFlex(
  overdue: ReceivableRow[],
  slaThreshold: number,
  orgSlug: string,
): LineMessage {
  const total = overdue.reduce((s, r) => s + r.amount, 0);
  const top = overdue.slice(0, 5);

  const rows = top.map((r) => ({
    type: "box" as const,
    layout: "vertical" as const,
    margin: "md" as const,
    contents: [
      {
        type: "text" as const,
        text: orderTitle(r),
        size: "sm" as const,
        weight: "bold" as const,
        color: INK,
        wrap: true,
      },
      {
        type: "text" as const,
        text: `ค้างรับ ${fmtBaht(r.amount)} · เกินกำหนด ${r.aging_days} วัน`,
        size: "xs" as const,
        color: RUBY,
        margin: "xs" as const,
        wrap: true,
      },
    ],
  }));

  return {
    type: "flex",
    altText: `⚠️ เงินค้างรับเกินกำหนด ${overdue.length} งาน รวม ${fmtBaht(total)}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "horizontal",
        backgroundColor: CHARCOAL,
        paddingAll: "14px",
        contents: [
          {
            type: "text",
            text: "⚠️ เงินค้างรับเกินกำหนด",
            color: WHITE,
            weight: "bold",
            size: "md",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "18px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            backgroundColor: RUBY_BG,
            cornerRadius: "8px",
            paddingAll: "10px",
            contents: [
              { type: "text", text: "ยอดค้างรับรวม", size: "sm", color: RUBY, flex: 1 },
              {
                type: "text",
                text: fmtBaht(total),
                size: "sm",
                weight: "bold",
                color: RUBY,
                align: "end",
              },
            ],
          },
          {
            type: "text",
            text: `${overdue.length} งาน · เกินกำหนด ${slaThreshold} วัน`,
            size: "xs",
            color: INK_MUTED,
            margin: "md",
          },
          { type: "separator", margin: "md" },
          ...rows,
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: CHARCOAL,
            action: {
              type: "uri",
              label: "ดูเงินค้างรับทั้งหมด",
              uri: moduleUrl(orgSlug, "receivables"),
            },
          },
        ],
      },
    },
  };
}

// ── T2 — รายงานพอร์ตรายสัปดาห์ (push จันทร์ / reply /พอร์ต) ──
export function buildWeeklyPortfolioFlex(args: {
  summary: GovProcureSummary;
  closedThisWeek: number;
  weekLabel: string;
  orgSlug: string;
  aiInsight?: string;
}): LineMessage {
  const { summary, closedThisWeek, weekLabel, orgSlug, aiInsight } = args;
  // แสดงเฉพาะบริษัทที่มีมูลค่าจริง — กันบรรทัดยาวเกินความกว้าง Flex bubble
  const companyLine =
    summary.by_company
      .filter((c) => c.pipeline_value > 0)
      .map((c) => `${c.company} ${fmtBaht0(c.pipeline_value)}`)
      .join(" · ") || "ยังไม่มีมูลค่าพอร์ต";

  const kpiRow = (label: string, value: string, color: string, bold = false) => ({
    type: "box" as const,
    layout: "horizontal" as const,
    margin: "sm" as const,
    contents: [
      { type: "text" as const, text: label, size: "sm" as const, color: INK_MUTED, flex: 1 },
      {
        type: "text" as const,
        text: value,
        size: "sm" as const,
        weight: bold ? ("bold" as const) : ("regular" as const),
        color,
        align: "end" as const,
        wrap: true,
      },
    ],
  });

  const bodyContents: unknown[] = [
    {
      type: "text",
      text: `มูลค่าพอร์ตรวม ${fmtBaht(summary.pipeline_value)}`,
      size: "sm",
      weight: "bold",
      color: INK,
      wrap: true,
    },
    {
      type: "text",
      text: companyLine,
      size: "xxs",
      color: FINE,
      margin: "xs",
      wrap: true,
    },
    { type: "separator", margin: "md" },
    kpiRow("ปิดงานใหม่สัปดาห์นี้", `${closedThisWeek} งาน`, SUCCESS, true),
    kpiRow(
      "เงินค้างรับ",
      `${fmtBaht(summary.receivable_total)} (${summary.receivable_count} งาน)`,
      summary.overdue_count > 0 ? RUBY : INK,
      true,
    ),
    kpiRow(
      "กำไร realized / pending",
      `${fmtBaht0(summary.profit_realized)} / ${fmtBaht0(summary.profit_pending)}`,
      INK,
    ),
  ];

  if (aiInsight && aiInsight.trim()) {
    bodyContents.push({
      type: "text",
      text: `✨ ${aiInsight.trim()}`,
      size: "xs",
      color: FINE,
      margin: "md",
      wrap: true,
    });
  }

  return {
    type: "flex",
    altText: `📊 รายงานพอร์ตรายสัปดาห์ · มูลค่า ${fmtBaht(summary.pipeline_value)}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: CHARCOAL,
        paddingAll: "14px",
        contents: [
          {
            type: "text",
            text: "📊 รายงานพอร์ตรายสัปดาห์",
            color: WHITE,
            weight: "bold",
            size: "md",
          },
          { type: "text", text: weekLabel, color: "#CCD1D9", size: "xs", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "18px",
        contents: bodyContents,
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: CHARCOAL,
            action: { type: "uri", label: "เปิดรายงานเต็ม", uri: moduleUrl(orgSlug) },
          },
        ],
      },
    },
  };
}

// ── T3 — แจ้ง stage สำคัญ (event delivered/paid) ──
export function buildStageEventFlex(
  order: GovProcureOrder,
  stage: "delivered" | "paid",
  slaThreshold: number,
  orgSlug: string,
): LineMessage {
  const isPaid = stage === "paid";
  const amount = order.net_receivable ?? order.price_incl_vat ?? 0;
  const duration = isPaid ? computeDuration(order) : null;

  const chipBg = isPaid ? SUCCESS_BG : INFO_BG;
  const chipText = isPaid ? SUCCESS : INFO;
  const chipLabel = isPaid ? `รับเช็คแล้ว ${fmtBaht(amount)}` : `รับเช็คภายใน ${slaThreshold} วัน`;

  const extraLine = isPaid
    ? duration != null
      ? `ใช้เวลา ${duration} วัน (สัญญา → รับเช็ค)`
      : `มูลค่างาน ${fmtBaht(amount)}`
    : `มูลค่างานที่รอรับเช็ค ${fmtBaht(amount)}`;

  return {
    type: "flex",
    altText: isPaid ? `✅ รับเช็คแล้ว ${fmtBaht(amount)}` : `📦 ส่งมอบแล้ว รอรับเช็ค`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "horizontal",
        backgroundColor: CHARCOAL,
        paddingAll: "14px",
        contents: [
          {
            type: "text",
            text: isPaid ? "✅ รับเช็คแล้ว" : "📦 ส่งมอบแล้ว รอรับเช็ค",
            color: WHITE,
            weight: "bold",
            size: "md",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "18px",
        contents: [
          {
            type: "text",
            text: order.department?.trim() || order.customer_name,
            size: "sm",
            weight: "bold",
            color: INK,
            wrap: true,
          },
          ...(order.product_description
            ? [
                {
                  type: "text" as const,
                  text: order.product_description,
                  size: "xs" as const,
                  color: INK_MUTED,
                  wrap: true,
                },
              ]
            : []),
          {
            type: "box",
            layout: "horizontal",
            backgroundColor: chipBg,
            cornerRadius: "8px",
            paddingAll: "10px",
            margin: "sm",
            contents: [
              {
                type: "text",
                text: chipLabel,
                size: "sm",
                color: chipText,
                weight: "bold",
                wrap: true,
              },
            ],
          },
          { type: "text", text: extraLine, size: "xs", color: FINE, margin: "md", wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: CHARCOAL,
            action: {
              type: "uri",
              label: "ดูรายละเอียดงาน",
              uri: moduleUrl(orgSlug, `orders/${order.id}`),
            },
          },
        ],
      },
    },
  };
}
