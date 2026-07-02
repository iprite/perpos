"use client";

// flex-preview.tsx — เรนเดอร์ "ภาพจำลอง" LINE Flex card (T1–T4, spec §5c) ในหน้าเว็บ
// ⚠️ Flex mock preview — hex ตรงตาม docs/line-flex-card-guide.md (header CHARCOAL #3C3B3D พื้นเรียบ,
//    ห้าม gradient). LINE render นอกแอป → Tailwind ไม่ทำงาน จึงจงใจใช้ hex ตรงในไฟล์นี้
//    (self-grep exception ที่ตั้งใจ — บันทึก Review Log). ค่าสีอ้างอิง _fixtures/line-mocks.ts
//    T1/T2 รับ data จาก useData สด (SLA/ผู้รับ toggle ในหน้า settings → preview อัปเดต)

import type { Receivable } from "../_components";
import {
  T3_PAID_FLEX_DATA,
  T3_DELIVERED_FLEX_DATA,
  T4_COMMAND_EXAMPLES,
  type T3EventFlexData,
} from "../_fixtures/line-mocks";

// พาเลตต์ Flex (hex ตรง — LINE ไม่ใช้ Tailwind) ตาม line-flex-card-guide.md + DESIGN §2
const C = {
  headerBg: "#3C3B3D", // CHARCOAL
  headerText: "#ffffff",
  headerSub: "#cccccc",
  positiveBg: "#F2FCF9", // MINT bg
  positiveText: "#065F46",
  warningBg: "#FFFCF3", // SUNFLOWER bg
  warningText: "#8A6D1D",
  dangerBg: "#FCF1F2", // RUBY bg
  danger: "#C43448", // RUBY
  ink: "#1A1A1B",
  inkMuted: "#656D78",
  aiText: "#9CA3AF",
  border: "#E6E9EE",
  separator: "#E6E9EE",
  surface: "#ffffff",
} as const;

const baht = (n: number) =>
  `${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿`;
const baht0 = (n: number) => `${n.toLocaleString("th-TH")} ฿`;

/** กรอบการ์ด LINE จำลอง (กว้าง ~320px เท่าการ์ดจริง) */
function FlexBubble({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full max-w-[320px] overflow-hidden rounded-2xl shadow-md"
      style={{ border: `1px solid ${C.border}` }}
    >
      {children}
    </div>
  );
}

function FlexHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ backgroundColor: C.headerBg, padding: "14px" }}>
      <div style={{ color: C.headerText, fontWeight: 700, fontSize: 15 }}>{title}</div>
      <div style={{ color: C.headerSub, fontSize: 13, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function FlexFooterButton({ label }: { label: string }) {
  return (
    <div style={{ backgroundColor: C.surface, padding: "10px" }}>
      <div
        style={{
          backgroundColor: C.headerBg,
          color: C.headerText,
          borderRadius: 6,
          padding: "8px",
          textAlign: "center",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
    </div>
  );
}

/**
 * T1 — เงินค้างรับเกินกำหนด (push รายวัน 09:00)
 * รับ overdue list + SLA สด จาก settings → toggle SLA เปลี่ยน → การ์ดอัปเดตจำนวน/ยอดทันที
 */
export function T1OverduePreview({
  overdue,
  overdueAmount,
  slaThreshold,
  dateLabel,
}: {
  overdue: Receivable[];
  overdueAmount: number;
  slaThreshold: number;
  dateLabel: string;
}) {
  const top = overdue.slice(0, 5);
  return (
    <FlexBubble>
      <FlexHeader title="⚠️ เงินค้างรับเกินกำหนด" sub={`จัดซื้อครุภัณฑ์ภาครัฐ · ${dateLabel}`} />
      <div style={{ backgroundColor: C.surface, padding: "18px" }}>
        {overdue.length === 0 ? (
          <div style={{ color: C.inkMuted, fontSize: 13 }}>
            ไม่มีงานค้างรับเกินกำหนด {slaThreshold} วัน — การ์ดนี้จะไม่ถูกส่ง
          </div>
        ) : (
          <>
            <div
              style={{
                backgroundColor: C.dangerBg,
                borderRadius: 6,
                padding: "10px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ color: C.danger, fontSize: 13 }}>ยอดค้างรับรวม</span>
              <span style={{ color: C.danger, fontSize: 13, fontWeight: 700 }}>
                {baht(overdueAmount)}
              </span>
            </div>
            <div style={{ color: C.inkMuted, fontSize: 13, marginTop: 8 }}>
              {overdue.length} งาน เกินกำหนด {slaThreshold} วัน
            </div>
            <div style={{ height: 1, backgroundColor: C.separator, margin: "10px 0" }} />
            {top.map((r) => (
              <div key={r.order.id} style={{ marginTop: 8 }}>
                <div style={{ color: C.ink, fontSize: 13, fontWeight: 700 }}>
                  {r.order.department ?? "ไม่ระบุกอง"} · {r.order.id}
                </div>
                <div style={{ color: C.danger, fontSize: 11, marginTop: 2 }}>
                  ค้างรับ {baht(r.amount)} · เกินกำหนด {r.agingDays} วัน
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      <FlexFooterButton label="ดูเงินค้างรับทั้งหมด" />
    </FlexBubble>
  );
}

/**
 * T2 — รายงานพอร์ตรายสัปดาห์ (ส่งรีพอต จันทร์ 08:00)
 * รับ summary สด จาก settings/useData
 */
export function T2WeeklyPreview({
  weekLabel,
  pipelineValue,
  split89,
  splitP2p,
  closedThisWeek,
  receivableTotal,
  receivableCount,
  profitRealized,
  profitPending,
  aiInsight,
}: {
  weekLabel: string;
  pipelineValue: number;
  split89: number;
  splitP2p: number;
  closedThisWeek: number;
  receivableTotal: number;
  receivableCount: number;
  profitRealized: number;
  profitPending: number;
  aiInsight: string;
}) {
  return (
    <FlexBubble>
      <FlexHeader title="📊 รายงานพอร์ตรายสัปดาห์" sub={weekLabel} />
      <div style={{ backgroundColor: C.surface, padding: "18px" }}>
        <div style={{ color: C.ink, fontSize: 13, fontWeight: 700 }}>
          มูลค่าพอร์ตรวม {baht(pipelineValue)}
        </div>
        <div style={{ color: C.inkMuted, fontSize: 11, marginTop: 2 }}>
          แยก 89 Global Work {baht0(split89)} · P2P Supply {baht0(splitP2p)}
        </div>
        <div style={{ height: 1, backgroundColor: C.separator, margin: "10px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ color: C.ink, fontSize: 13 }}>ปิดงานใหม่สัปดาห์นี้</span>
          <span style={{ color: C.positiveText, fontSize: 13, fontWeight: 700 }}>
            {closedThisWeek} งาน
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ color: C.danger, fontSize: 13 }}>เงินค้างรับ</span>
          <span style={{ color: C.danger, fontSize: 13, fontWeight: 700 }}>
            {baht(receivableTotal)} ({receivableCount} งาน)
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ color: C.inkMuted, fontSize: 13 }}>กำไร realized / pending</span>
          <span style={{ color: C.ink, fontSize: 11 }}>
            {profitRealized.toLocaleString("th-TH", { minimumFractionDigits: 0 })} /{" "}
            {profitPending.toLocaleString("th-TH", { minimumFractionDigits: 0 })} ฿
          </span>
        </div>
        <div style={{ color: C.aiText, fontSize: 11, marginTop: 12, lineHeight: 1.5 }}>
          ✨ {aiInsight}
        </div>
      </div>
      <FlexFooterButton label="เปิดรายงานเต็ม" />
    </FlexBubble>
  );
}

/** T3 — แจ้ง stage สำคัญ (event delivered/paid) — canned จาก line-mocks */
export function T3EventPreview({ data }: { data: T3EventFlexData }) {
  const isPaid = data.kind === "paid";
  return (
    <FlexBubble>
      <FlexHeader
        title={isPaid ? "✅ รับเช็คแล้ว" : "📦 ส่งมอบแล้ว รอรับเช็ค"}
        sub={data.department}
      />
      <div style={{ backgroundColor: C.surface, padding: "18px" }}>
        <div style={{ color: C.ink, fontSize: 13 }}>{data.product_description}</div>
        <div
          style={{
            backgroundColor: isPaid ? C.positiveBg : C.warningBg,
            borderRadius: 6,
            padding: "10px",
            marginTop: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ color: isPaid ? C.positiveText : C.warningText, fontSize: 13 }}>
            มูลค่างาน
          </span>
          <span
            style={{
              color: isPaid ? C.positiveText : C.warningText,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {baht(data.amount)}
          </span>
        </div>
        <div style={{ color: C.inkMuted, fontSize: 11, marginTop: 8 }}>{data.extra_label}</div>
      </div>
      <FlexFooterButton label="ดูรายละเอียดงาน" />
    </FlexBubble>
  );
}

export const T3_PAID_PREVIEW_DATA = T3_PAID_FLEX_DATA;
export const T3_DELIVERED_PREVIEW_DATA = T3_DELIVERED_FLEX_DATA;

/** T4 — คำสั่ง LINE (/พอร์ต, /ค้างรับ) reuse การ์ด T1/T2 — แสดงเป็นบับเบิลแชท */
export function T4CommandPreview() {
  return (
    <div className="space-y-3">
      {T4_COMMAND_EXAMPLES.map((cmd) => (
        <div key={cmd.command} className="flex flex-col items-end gap-1.5">
          {/* bubble คำสั่งของผู้ใช้ — LINE bubble จำลอง (hex chat green) */}
          <div
            className="max-w-[80%] rounded-2xl px-4 py-2 text-sm"
            style={{ backgroundColor: "#8DE055", color: "#1A1A1B" }}
          >
            {cmd.command}
          </div>
          {/* คำตอบบอท */}
          <div
            className="self-start rounded-2xl px-4 py-2 text-sm"
            style={{
              backgroundColor: C.surface,
              border: `1px solid ${C.border}`,
              color: C.inkMuted,
            }}
          >
            บอทตอบด้วยการ์ด {cmd.reused_card === "T1" ? "เงินค้างรับ (T1)" : "รายงานพอร์ต (T2)"} —{" "}
            {cmd.description}
          </div>
        </div>
      ))}
    </div>
  );
}
