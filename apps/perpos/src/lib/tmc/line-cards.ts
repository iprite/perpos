// lib/tmc/line-cards.ts — LINE Flex builders ของโมดูล tmc
// ยึด docs/line-flex-card-guide.md: header CHARCOAL #3C3B3D พื้นเรียบ (ห้าม gradient),
// hex ทุกค่าอยู่ในพาเลตต์ DESIGN.md §2, เงิน comma-group + ยอดลบ U+2212 (−)
//
// ⚠️ ฮาร์ดโค้ด hex ในไฟล์นี้ = ข้อยกเว้นที่ตั้งใจ (LINE render นอกแอป Tailwind ไม่ทำงาน)
//    — ห้ามคิดสีใหม่ ใช้เฉพาะค่าใน token ด้านล่าง

import type { LineMessage } from "@/lib/line/send-messages";
import type { TmcDailyOccupancy } from "./daily-occupancy";

const CHARCOAL = "#3C3B3D";
const WHITE = "#ffffff";
const INK = "#1A1A1B";
const INK_MUTED = "#656D78";
const FINE = "#9CA3AF";
const INFO = "#0C447C";
const INFO_BG = "#E6F1FB";
const SUCCESS = "#065F46";
const SUCCESS_BG = "#F2FCF9";
const WARN = "#8A6100";
const WARN_BG = "#FFFCF3";
const SEPARATOR = "#E6E9EE";

/** เกณฑ์สีของ chip อัตราการเข้าพัก — ≥90% เขียว · <40% เหลือง · นอกนั้นน้ำเงิน */
const RATE_HIGH = 90;
const RATE_LOW = 40;

function fmtBaht(n: number): string {
  const abs = Math.abs(n).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? "−" : ""}${abs} ฿`;
}

function fmtBaht0(n: number): string {
  const abs = Math.abs(n).toLocaleString("th-TH", { maximumFractionDigits: 0 });
  return `${n < 0 ? "−" : ""}${abs} ฿`;
}

/** เปอร์เซ็นต์ 1 ตำแหน่ง — ไม่มีข้อมูล = "—" (ห้ามแทนด้วย 0) */
const fmtPct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);

/** วันที่ไทยเต็ม (พ.ศ.) เช่น "พฤหัสบดี 31 กรกฎาคม 2568" */
function thaiFullDate(iso: string): string {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

/** วันที่สั้นสำหรับ altText เช่น "31 ก.ค." */
function thaiShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
  });
}

/**
 * แถว KPI ซ้าย-ขวา · สัดส่วน 5:4
 * ⚠️ label ต้องสั้น (~15 ตัวอักษรไทย) — Flex ตัดท้ายเป็น "…" ไม่ขึ้นบรรทัดใหม่ให้
 */
function kpiRow(label: string, value: string, opts?: { color?: string; bold?: boolean }) {
  return {
    type: "box" as const,
    layout: "horizontal" as const,
    margin: "sm" as const,
    contents: [
      { type: "text" as const, text: label, size: "sm" as const, color: INK_MUTED, flex: 5 },
      {
        type: "text" as const,
        text: value,
        size: "sm" as const,
        weight: opts?.bold ? ("bold" as const) : ("regular" as const),
        color: opts?.color ?? INK,
        align: "end" as const,
        flex: 4,
        wrap: true,
      },
    ],
  };
}

/**
 * การ์ดรายงานยอดห้องพักประจำวัน (ปิดยอด 20:00) — ส่งให้ทีมผู้บริหาร TMC
 * ไม่มีปุ่ม/ลิงก์ในการ์ด (ตามที่ตกลง) — เป็นรายงานอ่านอย่างเดียว
 */
export function buildTmcDailyOccupancyFlex(d: TmcDailyOccupancy): LineMessage {
  const rate = d.rate;
  const tone =
    rate === null
      ? { fg: INFO, bg: INFO_BG }
      : rate >= RATE_HIGH
        ? { fg: SUCCESS, bg: SUCCESS_BG }
        : rate < RATE_LOW
          ? { fg: WARN, bg: WARN_BG }
          : { fg: INFO, bg: INFO_BG };

  const barPct = Math.max(1, Math.min(100, Math.round(rate ?? 0)));
  const vacant = d.rooms - d.occupied;
  const bt = d.bookedToday;

  return {
    type: "flex",
    altText: `🏨 ยอดห้องพัก ${thaiShortDate(d.date)} · เข้าพัก ${d.occupied}/${d.rooms} ห้อง (${fmtPct(rate)}) · จองใหม่ ${fmtBaht0(bt.value)}`,
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
            text: "🏨 ยอดห้องพักประจำวัน",
            color: WHITE,
            weight: "bold",
            size: "md",
            wrap: true,
          },
          {
            type: "text",
            text: `${thaiFullDate(d.date)} · ปิดยอด 20:00 น.`,
            color: "#C9C8CA",
            size: "xxs",
            margin: "xs",
            wrap: true,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "none",
        paddingAll: "18px",
        contents: [
          // chip อัตราการเข้าพัก + แถบระดับ
          {
            type: "box",
            layout: "vertical",
            backgroundColor: tone.bg,
            cornerRadius: "8px",
            paddingAll: "10px",
            contents: [
              {
                type: "text",
                text: `เข้าพักคืนนี้ ${d.occupied} / ${d.rooms} ห้อง`,
                size: "sm",
                weight: "bold",
                color: tone.fg,
                wrap: true,
              },
              {
                type: "box",
                layout: "horizontal",
                height: "6px",
                backgroundColor: SEPARATOR,
                cornerRadius: "3px",
                margin: "md",
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    width: `${barPct}%`,
                    backgroundColor: tone.fg,
                    cornerRadius: "3px",
                    contents: [],
                  },
                ],
              },
            ],
          },
          kpiRow("อัตราการเข้าพัก", fmtPct(rate), { color: tone.fg, bold: true }),
          kpiRow("ห้องว่างคืนนี้", vacant > 0 ? `${vacant} ห้อง` : "— เต็ม", { bold: true }),
          kpiRow(
            "ห้องฟรีคืนนี้",
            d.freeOccupied > 0 ? `${d.freeOccupied} ห้อง · ${fmtPct(d.freeRate)}` : "—",
            { color: d.freeOccupied > 0 ? WARN : INK },
          ),
          kpiRow("เช็คอินวันนี้", `${d.checkIns.rooms} ห้อง · ${d.checkIns.guests} ท่าน`),
          kpiRow("เช็คเอาต์วันนี้", `${d.checkOuts.rooms} ห้อง`),
          kpiRow("พักต่อเนื่อง", `${d.stayThrough} ห้อง`),
          { type: "separator", margin: "md", color: SEPARATOR },
          kpiRow("บันทึกจองเข้ามาวันนี้", bt.rooms > 0 ? `${bt.rooms} รายการ` : "ยังไม่มี"),
          kpiRow("รวมคืนที่จองเข้ามา", `${bt.nights} คืน`),
          kpiRow("มูลค่าจองวันนี้", fmtBaht(bt.value), {
            color: bt.value > 0 ? SUCCESS : INK,
            bold: true,
          }),
          ...(d.vacantCodes.length
            ? [
                {
                  type: "text",
                  text: `ห้องว่าง · ${d.vacantCodes.join(" · ")}`,
                  size: "xxs",
                  color: INK_MUTED,
                  margin: "md",
                  wrap: true,
                },
              ]
            : []),
          { type: "separator", margin: "md", color: SEPARATOR },
          kpiRow("เข้าพักเดือนนี้", fmtPct(d.mtd.rate), { bold: true }),
          kpiRow("ห้อง×คืนที่ใช้จริง", `${d.mtd.soldNights} / ${d.mtd.availableNights} คืน`),
          kpiRow(
            "ห้องฟรีเดือนนี้",
            d.mtd.freeNights > 0 ? `${d.mtd.freeNights} คืน · ${fmtPct(d.mtd.freeRate)}` : "—",
            { color: d.mtd.freeNights > 0 ? WARN : INK },
          ),
          kpiRow("รายได้เข้าพัก", fmtBaht0(d.mtd.stayRevenue), { color: SUCCESS, bold: true }),
          kpiRow("มูลค่าจองเดือนนี้", fmtBaht0(d.mtd.value), { bold: true }),
          {
            type: "text",
            text: "🔒 รายงานอัตโนมัติจากระบบ TMC · ส่งเฉพาะทีมผู้บริหารที่กำหนดไว้",
            size: "xxs",
            color: FINE,
            margin: "md",
            wrap: true,
          },
        ],
      },
    },
  };
}

// ─── ผู้ช่วยขาย @tmcvilla — การ์ดแจ้งแอดมินว่ามีลูกค้ารอคนจริง ─────────────────

export interface TmcEscalationCard {
  reason: "no_answer" | "request_human";
  customerName: string;
  question: string;
  /** ลิงก์ห้องแชทของลูกค้าใน LINE OA Manager */
  chatUrl: string;
  /** ลิงก์หน้า "ผู้ช่วยขาย" ในเว็บ (ดูประวัติ/คืนให้บอท) */
  consoleUrl: string;
  askedAt: Date;
}

export function buildTmcEscalationFlex(c: TmcEscalationCard): LineMessage {
  const isRequest = c.reason === "request_human";
  const tone = isRequest ? { fg: INFO, bg: INFO_BG } : { fg: WARN, bg: WARN_BG };
  const label = isRequest ? "ลูกค้าขอคุยกับแอดมิน" : "บอทตอบไม่ได้";
  const time = c.askedAt.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });

  return {
    type: "flex",
    altText: `🔔 ${label} · ${c.customerName}: ${c.question.slice(0, 60)}`,
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
            text: "🔔 ลูกค้ารอแอดมิน",
            color: WHITE,
            weight: "bold",
            size: "md",
            wrap: true,
          },
          {
            type: "text",
            text: `TMC Villa · ${time} น.`,
            color: "#C9C8CA",
            size: "xs",
            margin: "xs",
            wrap: true,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: tone.bg,
            cornerRadius: "6px",
            paddingAll: "8px",
            contents: [
              { type: "text", text: label, size: "xs", weight: "bold", color: tone.fg, wrap: true },
            ],
          },
          {
            type: "text",
            text: c.customerName,
            size: "sm",
            weight: "bold",
            color: INK,
            margin: "md",
            wrap: true,
          },
          {
            type: "text",
            text: `“${c.question}”`,
            size: "sm",
            color: INK_MUTED,
            margin: "sm",
            wrap: true,
          },
          { type: "separator", margin: "md", color: SEPARATOR },
          {
            type: "text",
            text: "บอทหยุดตอบลูกค้ารายนี้ชั่วคราวแล้ว — กดปุ่มด้านล่างเพื่อเข้าไปคุยต่อได้เลย",
            size: "xxs",
            color: FINE,
            margin: "md",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: CHARCOAL,
            action: { type: "uri", label: "เข้าไปคุยกับลูกค้า", uri: c.chatUrl },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: { type: "uri", label: "เปิดหน้าผู้ช่วยขาย", uri: c.consoleUrl },
          },
        ],
      },
    },
  };
}

// ─── ผู้ช่วยขาย: การ์ดทวนความรู้ก่อนบันทึก (แท็ก @perpos ในกลุ่มทีมแอดมิน) ────────

export interface TmcKbDraftCard {
  draftId: string;
  /** article = ความรู้เข้าคลัง · rule = กฎประจำตัวที่บอทต้องทำทุกข้อความ */
  draftKind?: "article" | "rule";
  action: "create" | "update";
  /** ชื่อบทความเดิมที่จะถูกเขียนทับ (เฉพาะ action=update) */
  targetTitle: string | null;
  category: string;
  title: string;
  content: string;
}

/** ตัดข้อความยาวให้พอดีการ์ด — Flex ไม่มี scroll ในตัว */
function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export function buildTmcKbDraftFlex(c: TmcKbDraftCard): LineMessage {
  const isUpdate = c.action === "update";
  const isRule = c.draftKind === "rule";
  const tone = isUpdate ? { fg: WARN, bg: WARN_BG } : { fg: SUCCESS, bg: SUCCESS_BG };
  const label = isRule
    ? isUpdate
      ? "แทนที่กฎประจำตัวเดิม"
      : "เพิ่มกฎประจำตัวใหม่"
    : isUpdate
      ? "เขียนทับความรู้เดิม"
      : "เพิ่มความรู้ใหม่";
  const heading = isRule ? "🎛️ ทวนก่อนตั้งกฎประจำตัวบอท" : "📝 ทวนก่อนบันทึกเข้าคลังความรู้";

  return {
    type: "flex",
    altText: `${isRule ? "🎛️ ทวนก่อนตั้งกฎ" : "📝 ทวนก่อนบันทึก"}: ${clip(c.title, 60)} — กดยืนยันในแชท`,
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
            text: heading,
            color: WHITE,
            weight: "bold",
            size: "md",
            wrap: true,
          },
          {
            type: "text",
            text: "ยังไม่มีอะไรถูกบันทึก จนกว่าจะกดยืนยัน",
            color: "#C9C8CA",
            size: "xs",
            margin: "xs",
            wrap: true,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: tone.bg,
            cornerRadius: "6px",
            paddingAll: "8px",
            contents: [
              { type: "text", text: label, size: "xs", weight: "bold", color: tone.fg, wrap: true },
              ...(isUpdate && c.targetTitle
                ? [
                    {
                      type: "text" as const,
                      text: `ของเดิม: ${clip(c.targetTitle, 60)}`,
                      size: "xxs" as const,
                      color: tone.fg,
                      margin: "xs" as const,
                      wrap: true,
                    },
                  ]
                : []),
            ],
          },
          kpiRow("หมวด", c.category),
          { type: "separator", margin: "md", color: SEPARATOR },
          {
            type: "text",
            text: clip(c.title, 90),
            size: "sm",
            weight: "bold",
            color: INK,
            margin: "md",
            wrap: true,
          },
          {
            type: "text",
            text: clip(c.content, 700),
            size: "sm",
            color: INK_MUTED,
            margin: "sm",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: CHARCOAL,
            action: { type: "postback", label: "ยืนยันบันทึก", data: `tmckb:ok:${c.draftId}` },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: { type: "postback", label: "ยกเลิก", data: `tmckb:no:${c.draftId}` },
          },
          {
            type: "text",
            text: isRule
              ? "กดยืนยันแล้วบอทจะทำตามกฎนี้ทุกข้อความ จนกว่าจะมีคนแก้หรือปิดกฎนะคะ"
              : "ตรวจตัวเลขและเงื่อนไขให้ครบก่อนกดยืนยันนะคะ — บอทจะเอาไปตอบลูกค้าจริง",
            size: "xxs",
            color: FINE,
            margin: "sm",
            wrap: true,
          },
        ],
      },
    },
  };
}
