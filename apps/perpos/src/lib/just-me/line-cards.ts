/**
 * line-cards.ts — การ์ด LINE Flex ของโมดูล just_me (contract §6.2)
 *
 * ⚠️ **ไฟล์เดียวของโมดูลที่ฮาร์ดโค้ด hex ได้** — LINE เรนเดอร์นอกแอป Tailwind class ใช้ไม่ได้
 *    ค่าสีทุกตัวต้องตรงกับ `docs/line-flex-card-guide.md` §2 (header CHARCOAL พื้นเรียบ ห้าม gradient)
 *
 * กติกา: ทุกการ์ดมี `altText` · ข้อความยาว `wrap: true` · ปุ่มหลัก primary สี CHARCOAL
 */

import type { LineMessage } from "@/lib/line/send-messages";

// ─── token สี (ตรงกับ DESIGN.md §2 / line-flex-card-guide §2) ────────────────
const CHARCOAL = "#3C3B3D";
const RUBY = "#D8334A";
const INK = "#1A1A1B";
const INK_SECONDARY = "#656D78";
const FINE_PRINT = "#9CA3AF";
const CHIP_INFO_BG = "#E6F1FB";
const CHIP_INFO_TEXT = "#0C447C";
const CHIP_ERROR_BG = "#FCF1F2";
const CHIP_SURFACE_BG = "#F5F7FA";
const WHITE = "#ffffff";

const MONEY = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** null = ยังไม่มีข้อมูล → "—" (ห้ามแสดง 0 แทน) */
function baht(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v < 0 ? "−" : ""}${MONEY.format(Math.abs(v))} ฿`;
}

interface CardRow {
  label: string;
  value: string;
}

function rows(items: CardRow[]) {
  return items.map((r) => ({
    type: "box" as const,
    layout: "baseline" as const,
    spacing: "sm" as const,
    contents: [
      { type: "text" as const, text: r.label, size: "xs" as const, color: INK_SECONDARY, flex: 4 },
      {
        type: "text" as const,
        text: r.value,
        size: "sm" as const,
        color: INK,
        flex: 6,
        wrap: true,
        align: "end" as const,
      },
    ],
  }));
}

function card(args: {
  headerText: string;
  headerColor?: string;
  altText: string;
  chip?: { text: string; bg: string; color: string };
  title: string;
  detail: CardRow[];
  footNote?: string;
  button?: { label: string; uri: string };
}): LineMessage {
  const body: unknown[] = [
    { type: "text", text: args.title, size: "sm", color: INK, weight: "bold", wrap: true },
  ];
  if (args.chip) {
    body.push({
      type: "box",
      layout: "horizontal",
      backgroundColor: args.chip.bg,
      cornerRadius: "8px",
      paddingAll: "10px",
      margin: "sm",
      contents: [
        { type: "text", text: args.chip.text, size: "sm", color: args.chip.color, wrap: true },
      ],
    });
  }
  body.push({
    type: "box",
    layout: "vertical",
    backgroundColor: CHIP_SURFACE_BG,
    cornerRadius: "8px",
    paddingAll: "10px",
    margin: "md",
    spacing: "sm",
    contents: rows(args.detail),
  });
  if (args.footNote) {
    body.push({ type: "separator", margin: "md" });
    body.push({
      type: "text",
      text: args.footNote,
      size: "xxs",
      color: FINE_PRINT,
      wrap: true,
      margin: "md",
    });
  }

  return {
    type: "flex",
    altText: args.altText,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "horizontal",
        backgroundColor: args.headerColor ?? CHARCOAL,
        paddingAll: "14px",
        contents: [
          {
            type: "text",
            text: args.headerText,
            color: WHITE,
            weight: "bold",
            size: "md",
            wrap: true,
          },
        ],
      },
      body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "18px", contents: body },
      ...(args.button
        ? {
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
                  action: { type: "uri", label: args.button.label, uri: args.button.uri },
                },
              ],
            },
          }
        : {}),
    },
  };
}

// ─── 1. ใบขอซื้อส่งขออนุมัติ ────────────────────────────────────────────────
export function buildPrSubmittedCard(args: {
  prCode: string;
  projectName: string | null;
  estimatedCost: number | null;
  neededDate: string | null;
  itemCount: number;
  submitterName: string | null;
  url: string;
}): LineMessage {
  return card({
    headerText: "ใบขอซื้อรออนุมัติ",
    altText: `ใบขอซื้อ ${args.prCode} รออนุมัติ`,
    chip: {
      text: `${args.prCode} · ยอดประเมิน ${baht(args.estimatedCost)}`,
      bg: CHIP_INFO_BG,
      color: CHIP_INFO_TEXT,
    },
    title: args.projectName ?? "ใบขอซื้อที่ไม่ผูกโครงการ",
    detail: [
      { label: "จำนวนรายการ", value: `${args.itemCount} รายการ` },
      { label: "ต้องการใช้ภายใน", value: args.neededDate ?? "—" },
      { label: "ผู้ขอ", value: args.submitterName ?? "—" },
    ],
    footNote: "เปิดหน้าใบขอซื้อเพื่อตรวจราคาผู้ขายก่อนกดอนุมัติ",
    button: { label: "เปิดหน้าอนุมัติ", uri: args.url },
  });
}

// ─── 2. ต้นทุนเกินงบ ────────────────────────────────────────────────────────
export function buildOverBudgetCard(args: {
  projectCode: string;
  projectName: string;
  budgetCost: number | null;
  actualCost: number;
  committedCost: number;
  variance: number | null;
  url: string;
}): LineMessage {
  return card({
    headerText: "ต้นทุนเกินงบโครงการ",
    headerColor: RUBY,
    altText: `โครงการ ${args.projectCode} ต้นทุนเกินงบแล้ว`,
    chip: {
      text: `เกินงบ ${baht(args.variance)}`,
      bg: CHIP_ERROR_BG,
      color: RUBY,
    },
    title: `${args.projectCode} ${args.projectName}`,
    detail: [
      { label: "งบต้นทุน", value: baht(args.budgetCost) },
      { label: "ต้นทุนจริงสะสม", value: baht(args.actualCost) },
      { label: "ผูกพันที่ยังไม่รับของ", value: baht(args.committedCost) },
    ],
    footNote: "แจ้งครั้งเดียวตอนข้ามเส้นงบ — ตรวจใบขอซื้อที่ยังไม่รับของก่อนสั่งเพิ่ม",
    button: { label: "เปิดหน้าโครงการ", uri: args.url },
  });
}

// ─── 3. งวดงาน (พร้อมวางบิล / วางบิลแล้ว) ───────────────────────────────────
export function buildBillingCard(args: {
  event: "ready" | "invoiced";
  projectCode: string;
  projectName: string;
  seq: number;
  title: string | null;
  amount: number;
  dueDate: string | null;
  docNumber: string | null;
  url: string;
}): LineMessage {
  const isReady = args.event === "ready";
  return card({
    headerText: isReady ? "งวดงานถึงกำหนดวางบิล" : "วางบิลงวดงานแล้ว",
    altText: isReady
      ? `งวดที่ ${args.seq} ของ ${args.projectCode} พร้อมวางบิล`
      : `วางบิลงวดที่ ${args.seq} ของ ${args.projectCode} แล้ว`,
    chip: {
      text: `งวดที่ ${args.seq}${args.title ? ` · ${args.title}` : ""} · ${baht(args.amount)}`,
      bg: CHIP_INFO_BG,
      color: CHIP_INFO_TEXT,
    },
    title: `${args.projectCode} ${args.projectName}`,
    detail: [
      { label: "ยอดงวด", value: baht(args.amount) },
      { label: "กำหนดชำระ", value: args.dueDate ?? "—" },
      ...(isReady ? [] : [{ label: "เลขที่เอกสาร", value: args.docNumber ?? "—" }]),
    ],
    footNote: isReady
      ? "กดเข้าไปออกใบแจ้งหนี้ที่แท็บงวดงานของโครงการ"
      : "ติดตามการรับเงินที่แท็บงวดงานของโครงการ",
    button: { label: "เปิดแท็บงวดงาน", uri: args.url },
  });
}
