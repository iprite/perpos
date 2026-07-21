"use client";

// flex-preview.tsx — เรนเดอร์ "ภาพจำลอง" LINE Flex card (T1/T3/T4/T5/T6) ในหน้าเว็บ
// ⚠️ นี่คือ preview ของการ์ด LINE จริง → จงใจใช้สี hex ตรงตาม docs/line-flex-card-guide.md §2
//    (header CHARCOAL #3C3B3D พื้นเรียบ · T5 ยกเลิก = RUBY #D8334A · ไม่ใช่ UI ของแอป —
//     เป็นการจำลองสิ่งที่ผู้ใช้จะเห็นใน LINE ที่ render "นอก" Tailwind)
//    hex ในไฟล์นี้ = ค่า Flex JSON จาก line-mocks.ts เท่านั้น (self-grep exception — บันทึกใน Review Log)
//    ห้ามเลียนแบบ hex นี้ในไฟล์ UI แอปจริง (รวม mobile-frame/line-preview) ที่ต้องใช้ Tailwind palette

import type { CSSProperties, ReactNode } from "react";
import { lineAnchor, t6OwnerReportData } from "../_fixtures/line-mocks";

export type FlexCardKey = "t1" | "t3" | "t4" | "t5" | "t6";

// ── token (ตรง line-flex-card-guide §2 / DESIGN.md §2) ──
const C = {
  charcoal: "#3C3B3D",
  ruby: "#D8334A",
  headerText: "#ffffff",
  headerSub: "#cccccc",
  ink: "#1A1A1B",
  inkMuted: "#656D78",
  fine: "#9CA3AF",
  infoBg: "#E6F1FB",
  infoText: "#0C447C",
  successBg: "#F2FCF9",
  successText: "#065F46",
  errorBg: "#FCF1F2",
  errorText: "#D8334A",
  surface: "#F5F7FA",
  border: "#E6E9EE",
  white: "#ffffff",
} as const;

const money = (n: number) =>
  `${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿`;

// ── primitives (inline style เท่านั้น — จำลอง Flex render) ──
function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className="w-full max-w-[320px] overflow-hidden rounded-2xl shadow-md"
      style={{ border: `1px solid ${C.border}`, backgroundColor: C.white }}
    >
      {children}
    </div>
  );
}

function Header({ bg = C.charcoal, title, sub }: { bg?: string; title: string; sub?: string }) {
  return (
    <div style={{ backgroundColor: bg, padding: "14px" }}>
      <div style={{ color: C.headerText, fontWeight: 700, fontSize: 15 }}>{title}</div>
      {sub && <div style={{ color: C.headerSub, fontSize: 13, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <div style={{ backgroundColor: C.white, padding: "18px" }}>{children}</div>;
}

function Line({
  children,
  color = C.ink,
  size = 13,
  bold = false,
  mt = 4,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
  bold?: boolean;
  mt?: number;
}) {
  return (
    <div style={{ color, fontSize: size, marginTop: mt, fontWeight: bold ? 700 : 400, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

function Chip({ bg, color, children }: { bg: string; color: string; children: ReactNode }) {
  return (
    <div style={{ backgroundColor: bg, borderRadius: 6, padding: "10px", marginTop: 10 }}>
      <span style={{ color, fontSize: 13, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

function Row({
  label,
  value,
  color = C.ink,
  bold = false,
  mt = 8,
}: {
  label: string;
  value: string;
  color?: string;
  bold?: boolean;
  mt?: number;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: mt }}>
      <span style={{ color, fontSize: 13, fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ color, fontSize: 13, fontWeight: bold ? 700 : 400 }}>{value}</span>
    </div>
  );
}

function Separator() {
  return <div style={{ height: 1, backgroundColor: C.border, margin: "12px 0" }} />;
}

function Footer({ buttons }: { buttons: { label: string; kind: "primary" | "secondary" | "danger" }[] }) {
  return (
    <div style={{ backgroundColor: C.white, padding: "10px", display: "flex", flexDirection: "column", gap: 8 }}>
      {buttons.map((b, i) => {
        const style: CSSProperties =
          b.kind === "primary"
            ? { backgroundColor: C.charcoal, color: C.white }
            : b.kind === "danger"
              ? { backgroundColor: C.ruby, color: C.white }
              : { backgroundColor: C.surface, color: C.ink, border: `1px solid ${C.border}` };
        return (
          <div
            key={i}
            style={{ ...style, borderRadius: 6, padding: "8px", textAlign: "center", fontSize: 13, fontWeight: 600 }}
          >
            {b.label}
          </div>
        );
      })}
    </div>
  );
}

// ==================== T1 — Welcome / Provisioning ====================
function T1() {
  return (
    <Card>
      <Header title="🏌️ ยินดีต้อนรับ" sub={lineAnchor.org_name} />
      <Body>
        <Line mt={0}>{lineAnchor.member_name} เพิ่มเราเป็นเพื่อนเรียบร้อยแล้ว ✅</Line>
        <Chip bg={C.successBg} color={C.successText}>
          คุณเป็นสมาชิกแล้ว — จองได้ทันที
        </Chip>
        <Line color={C.inkMuted} mt={10}>
          • จองสนาม/ไดร์ฟ 24 ชม. ผ่าน LINE
          <br />• รับแจ้งเตือนยืนยัน + เตือนก่อนถึงคิว
          <br />• ดู/ยกเลิกคิวได้เอง
        </Line>
        <Line mt={10}>แตะปุ่มด้านล่าง หรือใช้เมนูด้านล่างจอเพื่อเริ่มจอง</Line>
        <Separator />
        <Line color={C.fine} size={11} mt={0}>
          🔒 ข้อมูลการจองของคุณผูกกับสนามนี้เท่านั้น
        </Line>
      </Body>
      <Footer
        buttons={[
          { label: "⛳ จองเลย", kind: "primary" },
          { label: "ดูคิวของฉัน", kind: "secondary" },
        ]}
      />
    </Card>
  );
}

// ==================== T3 — ยืนยันการจอง (canonical) ====================
function T3() {
  return (
    <Card>
      <Header title="✅ ยืนยันการจองแล้ว" sub={`เลขที่ ${lineAnchor.booking_ref}`} />
      <Body>
        <Line mt={0}>
          ⛳ {lineAnchor.resource_name} · {lineAnchor.org_name}
        </Line>
        <Chip bg={C.infoBg} color={C.infoText}>
          🕐 ยืนยันแล้ว · กรุณามาถึงก่อน tee-off 30 นาที
        </Chip>
        <Line mt={10}>วันที่เล่น {lineAnchor.date_label}</Line>
        <Line>Tee-off {lineAnchor.start_time} น.</Line>
        <Line>
          ผู้เล่น {lineAnchor.party_size} คน · แคดดี้ {lineAnchor.caddie_count} · รถ {lineAnchor.cart_count}
        </Line>
        <Separator />
        <Row label="ค่าบริการรวม" value={money(lineAnchor.total_amount)} bold mt={0} />
        <Row label="ชำระแล้ว (มัดจำ)" value={money(lineAnchor.paid_amount)} color={C.successText} mt={6} />
        <Line color={C.inkMuted} mt={8}>
          ยอดคงเหลือ {money(lineAnchor.outstanding_amount)} ชำระที่เคาน์เตอร์วันเล่น
        </Line>
        <Separator />
        <Line color={C.fine} size={11} mt={0}>
          🔒 ยกเลิกฟรีก่อนเวลาเล่น 12 ชม. · เกินกำหนดมัดจำไม่คืน
        </Line>
      </Body>
      <Footer
        buttons={[
          { label: "ยกเลิกการจอง", kind: "secondary" },
          { label: "ดูคิวของฉัน", kind: "secondary" },
        ]}
      />
    </Card>
  );
}

// ==================== T4 — เตือนก่อนถึงคิว ====================
function T4() {
  return (
    <Card>
      <Header title="⏰ เตือนคิวของคุณ" />
      <Body>
        <Line mt={0}>พรุ่งนี้คุณมีคิวออกรอบ 🏌️</Line>
        <div style={{ backgroundColor: C.surface, borderRadius: 6, padding: "10px", marginTop: 10 }}>
          <div style={{ color: C.ink, fontSize: 13, fontWeight: 700 }}>{lineAnchor.resource_name}</div>
          <div style={{ color: C.inkMuted, fontSize: 12, marginTop: 2 }}>
            {lineAnchor.date_label} · Tee-off {lineAnchor.start_time} น. · {lineAnchor.party_size} คน
          </div>
          <div style={{ color: C.fine, fontSize: 12, marginTop: 2 }}>เลขที่ {lineAnchor.booking_ref}</div>
        </div>
        <Line color={C.inkMuted} size={12} mt={10}>
          กรุณามาถึงก่อน tee-off 30 นาที · หากมาไม่ได้ โปรดกดยกเลิกล่วงหน้าเพื่อเปิดคิวให้ท่านอื่น
        </Line>
      </Body>
      <Footer buttons={[{ label: "ยกเลิกคิวนี้", kind: "secondary" }]} />
    </Card>
  );
}

// ==================== T5 — แจ้งยกเลิก (RUBY header) ====================
function T5() {
  return (
    <Card>
      <Header bg={C.ruby} title="❌ การจองถูกยกเลิก" />
      <Body>
        <Line mt={0}>
          เลขที่ {lineAnchor.booking_ref} · {lineAnchor.resource_name} · {lineAnchor.date_label}{" "}
          {lineAnchor.start_time} น.
        </Line>
        <Chip bg={C.errorBg} color={C.errorText}>
          เหตุผล: สนามปิดปรับปรุงกะทันหันจากสภาพอากาศ ขออภัยในความไม่สะดวก
        </Chip>
        <Line mt={10}>
          เราได้คืนมัดจำ {money(lineAnchor.deposit_amount)} ให้ท่านแล้ว (คืนเข้าช่องทางเดิม 3–5 วันทำการ)
        </Line>
        <Line color={C.inkMuted} size={12} mt={8}>
          ขออภัยอีกครั้ง — จองรอบใหม่ได้ผ่านเมนูด้านล่างจอ
        </Line>
      </Body>
      <Footer buttons={[{ label: "⛳ จองรอบใหม่", kind: "primary" }]} />
    </Card>
  );
}

// ==================== T6 — รีพอตเจ้าของรายวัน ====================
function T6() {
  const d = t6OwnerReportData;
  return (
    <Card>
      <Header title={`📊 สรุปสนามวันนี้ — ${d.date_label}`} sub={lineAnchor.org_name} />
      <Body>
        <div
          style={{
            backgroundColor: C.successBg,
            borderRadius: 6,
            padding: "10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ color: C.successText, fontSize: 13 }}>รายได้วันนี้</span>
          <span style={{ color: C.successText, fontSize: 13, fontWeight: 700 }}>{money(d.revenue_today)}</span>
        </div>
        <Line mt={10}>
          จองวันนี้ {d.bookings_today} รอบ · เช็คอินแล้ว {d.checked_in_today}
        </Line>
        <Line>
          Utilization สนาม {d.course_util_pct}% · ไดร์ฟ {d.range_util_pct}%
        </Line>
        <Line color={C.inkMuted}>
          ช่วงพีค {d.peak_band} · ว่างมาก {d.quiet_band}
        </Line>
        <Separator />
        <Row
          label="No-show วันนี้"
          value={`${d.no_show_today} รอบ (−${d.no_show_loss.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿)`}
          color={C.errorText}
          bold
          mt={0}
        />
        <Line color={C.fine} size={11} mt={10}>
          {d.ai_tip}
        </Line>
      </Body>
      <Footer buttons={[{ label: "เปิดรายงานเต็ม", kind: "primary" }]} />
    </Card>
  );
}

const CARDS: Record<FlexCardKey, () => ReactNode> = { t1: T1, t3: T3, t4: T4, t5: T5, t6: T6 };

export const FLEX_CARD_LABEL: Record<FlexCardKey, string> = {
  t1: "T1 · ต้อนรับ (add OA)",
  t3: "T3 · ยืนยันการจอง",
  t4: "T4 · เตือนก่อนถึงคิว",
  t5: "T5 · แจ้งยกเลิก",
  t6: "T6 · รีพอตเจ้าของรายวัน",
};

/** เรนเดอร์การ์ด Flex จำลอง 1 ใบ ตาม key */
export function GolfFlexPreview({ card }: { card: FlexCardKey }) {
  return <>{CARDS[card]()}</>;
}
