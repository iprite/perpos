"use client";

// flex-preview.tsx — "ภาพจำลอง" การ์ด LINE Flex ของ mattii_ops เรนเดอร์ในหน้าเว็บ (mock ไม่ยิง LINE จริง)
//
// ⚠️ ข้อยกเว้นที่ตั้งใจ (บันทึกใน Review Log): ไฟล์นี้ไฟล์เดียวของโมดูลที่ใช้ hex ตรง ๆ ได้
//    เพราะ LINE เรนเดอร์การ์ดนอกแอป (Tailwind ใช้ไม่ได้) → ต้องจำลองค่าสีจริงของ Flex JSON
//    ทุก hex มาจากตาราง token ใน docs/line-flex-card-guide.md §2 เท่านั้น (header CHARCOAL พื้นเรียบ
//    ห้าม gradient · RUBY เฉพาะการ์ดที่ผิดพลาดจริง) — ไฟล์อื่นของโมดูลห้ามมี hex เด็ดขาด
//
// ผู้ใช้เคาะแล้ว: LINE ส่ง "หารายคน" เท่านั้น ไม่ส่งเข้ากลุ่ม (contract §6)
// audience: owner = การ์ดที่มีตัวเลขเงิน/ต้นทุน · team = การ์ดเดียวกันแต่ "ตัวเลขเงินหายทั้งหมด" (§2.3)

import type { ReactNode } from "react";

// ── token สีจาก line-flex-card-guide.md §2 ──
const C = {
  headerBg: "#3C3B3D", // CHARCOAL — default ทุกการ์ด
  headerBgError: "#D8334A", // RUBY — เฉพาะเคสผิดพลาด/วิกฤต
  headerText: "#ffffff",
  headerSub: "#cccccc",
  ink: "#1A1A1B",
  inkMuted: "#656D78",
  finePrint: "#9CA3AF",
  infoBg: "#E6F1FB",
  infoText: "#0C447C",
  successBg: "#F2FCF9",
  successText: "#065F46",
  errorBg: "#FCF1F2",
  errorText: "#D8334A",
  surface: "#F5F7FA",
  border: "#E6E9EE",
  cardBg: "#ffffff",
} as const;

export type FlexCardKind =
  | "cf_approved"
  | "qc_failed"
  | "risk_digest"
  | "tracking"
  | "low_stock"
  | "daily_report";

export type FlexAudience = "owner" | "team";

export const FLEX_CARDS: {
  key: FlexCardKind;
  label: string;
  /** ใครได้รับการ์ดนี้ (push รายคน) */
  recipients: string;
  /** true = การ์ดมีตัวเลขเงิน → เนื้อหาต่างกันระหว่างเจ้าของกับทีม */
  audienceAware: boolean;
}[] = [
  {
    key: "cf_approved",
    label: "ลูกค้ายืนยันลายแล้ว",
    recipients: "ทีมผลิตรายคน + เจ้าของ",
    audienceAware: false,
  },
  {
    key: "qc_failed",
    label: "QC ไม่ผ่าน",
    recipients: "ทีมผลิตรายคน + เจ้าของ",
    audienceAware: true,
  },
  {
    key: "risk_digest",
    label: "สรุปงานเสี่ยงเลยกำหนด",
    recipients: "เจ้าของ + ฝ่ายขายที่ถืองาน",
    audienceAware: true,
  },
  {
    key: "tracking",
    label: "แจ้งเลขพัสดุถึงลูกค้า",
    recipients: "ลูกค้าที่ทักผ่าน LINE OA",
    audienceAware: false,
  },
  {
    key: "low_stock",
    label: "วัสดุใกล้หมด",
    recipients: "เจ้าของ (ทีมผลิตได้การ์ดไม่มีราคา)",
    audienceAware: true,
  },
  {
    key: "daily_report",
    label: "สรุปสิ้นวัน",
    recipients: "เจ้าของ (รายงานตอน 20:00)",
    audienceAware: true,
  },
];

const baht = (n: number) =>
  `${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿`;

// ── ชิ้นส่วนการ์ด ──

function Bubble({
  title,
  subtitle,
  error,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  error?: boolean;
  children: ReactNode;
  footer?: string;
}) {
  return (
    <div
      className="w-full max-w-[320px] overflow-hidden rounded-2xl shadow-md"
      style={{ border: `1px solid ${C.border}`, backgroundColor: C.cardBg }}
    >
      <div style={{ backgroundColor: error ? C.headerBgError : C.headerBg, padding: "14px" }}>
        <div style={{ color: C.headerText, fontWeight: 700, fontSize: 15 }}>{title}</div>
        {subtitle && (
          <div style={{ color: C.headerSub, fontSize: 13, marginTop: 4 }}>{subtitle}</div>
        )}
      </div>
      <div style={{ padding: "18px" }}>{children}</div>
      {footer && (
        <div style={{ padding: "0 14px 14px" }}>
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
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ tone, children }: { tone: "info" | "success" | "error"; children: ReactNode }) {
  const bg = tone === "success" ? C.successBg : tone === "error" ? C.errorBg : C.infoBg;
  const fg = tone === "success" ? C.successText : tone === "error" ? C.errorText : C.infoText;
  return (
    <div style={{ backgroundColor: bg, borderRadius: 8, padding: "10px", marginTop: 8 }}>
      <span style={{ color: fg, fontSize: 13, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

function Line({ muted, children }: { muted?: boolean; children: ReactNode }) {
  return (
    <div style={{ color: muted ? C.inkMuted : C.ink, fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        marginTop: 6,
        fontSize: 13,
      }}
    >
      <span style={{ color: C.inkMuted }}>{label}</span>
      <span style={{ color: danger ? C.errorText : C.ink, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Separator() {
  return <div style={{ height: 1, backgroundColor: C.border, margin: "12px 0" }} />;
}

function Fine({ children }: { children: ReactNode }) {
  return (
    <div style={{ color: C.finePrint, fontSize: 11, marginTop: 12, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

/**
 * MattiiFlexPreview — การ์ด LINE จำลอง 1 ใบ
 * `audience="team"` = การ์ดชุดเดียวกันที่ส่งหาทีม → ตัวเลขเงิน/ต้นทุนหายทั้งหมด (พิสูจน์กฎ §2.3)
 */
export function MattiiFlexPreview({
  kind,
  audience = "owner",
}: {
  kind: FlexCardKind;
  audience?: FlexAudience;
}) {
  const owner = audience === "owner";

  if (kind === "cf_approved") {
    return (
      <Bubble title="✅ ลูกค้ายืนยันลายแล้ว" subtitle="MT-2026-0028 · คุณศิริพร (LINE)">
        <Line>พรมเช็ดเท้ากำมะหยี่ 60 × 90 ซม. × 2 ผืน</Line>
        <Chip tone="success">พร้อมเข้าคิวพิมพ์ — ใช้ไฟล์ลาย v3 (ลายแมวส้มพื้นครีม)</Chip>
        <Line muted>กำหนดส่ง 28 ก.ค. 2569 · เหลืออีก 3 วัน</Line>
        <Separator />
        <Fine>🔒 ตรวจเวอร์ชันไฟล์ก่อนพิมพ์ทุกครั้ง — พิมพ์ผิดเวอร์ชันคือของเสียทั้งผืน</Fine>
      </Bubble>
    );
  }

  if (kind === "qc_failed") {
    return (
      <Bubble error title="⚠️ QC ไม่ผ่าน — ต้องพิมพ์ซ้ำ" subtitle="MT-2026-0016 · คุณธนดล">
        <Line>พรมห้องนั่งเล่นขนสั้น 100 × 150 ซม.</Line>
        <Chip tone="error">สีเพี้ยน · เสีย 1 ผืน · ตรวจโดย อรุณี ช่างเย็บ</Chip>
        <Line muted>ระบบสร้างงานพิมพ์ซ้ำให้แล้ว และย้ายออเดอร์กลับสถานะ “กำลังพิมพ์”</Line>
        {owner && (
          <>
            <Separator />
            <Row label="มูลค่าของเสียรอบนี้" value={baht(430)} danger />
            <Row label="ของเสียสะสมเดือนนี้" value={baht(1940)} danger />
          </>
        )}
        <Fine>
          {owner
            ? "🔒 การ์ดที่มีมูลค่าของเสียส่งถึงเจ้าของเท่านั้น"
            : "การ์ดของทีมผลิตไม่แสดงตัวเลขต้นทุน/มูลค่าความเสียหาย"}
        </Fine>
      </Bubble>
    );
  }

  if (kind === "risk_digest") {
    return (
      <Bubble title="⏰ งานเสี่ยงเลยกำหนด 3 ใบ" subtitle="สรุป ณ 09:00 · ร้าน Mattii">
        <Chip tone="info">ต้องจัดการก่อนบ่ายนี้ — เรียงตามความเร่งด่วน</Chip>
        <Line>1. MT-2026-0016 · เลยกำหนดแล้ว 1 วัน · กำลังพิมพ์ซ้ำ</Line>
        <Line>2. MT-2026-0021 · ครบกำหนดวันนี้ · รอ QC</Line>
        <Line>3. MT-2026-0030 · เหลือ 1 วัน · ยังไม่แพ็ค</Line>
        <Separator />
        <Line muted>ค้างรอลูกค้ายืนยันลายเกิน 2 วัน: 2 ใบ</Line>
        {owner && <Row label="ยอดขายที่ค้างอยู่ในงานเสี่ยง" value={baht(11480)} />}
        <Fine>✨ ระบบเรียงลำดับจากกำหนดส่งจริง + งานด่วน — ตรวจสอบก่อนสั่งงานทุกครั้ง</Fine>
      </Bubble>
    );
  }

  if (kind === "tracking") {
    return (
      <Bubble
        title="📦 พัสดุออกจากร้านแล้ว"
        subtitle="MT-2026-0021 · ร้าน Mattii"
        footer="ติดตามพัสดุ J&T"
      >
        <Line>พรมหน้าบ้านไมโครไฟเบอร์ 60 × 90 ซม. × 2 ผืน</Line>
        <Chip tone="info">เลขพัสดุ J&T: 620188473921</Chip>
        <Line muted>ปลายทาง: เขตบางแค กรุงเทพฯ · คาดว่าถึง 26 ก.ค. 2569</Line>
        <Separator />
        <Fine>
          ขอบคุณที่อุดหนุนร้าน Mattii 🧡 ได้รับของแล้วรบกวนส่งรูปพรมที่ใช้จริงให้ชมด้วยนะคะ
        </Fine>
      </Bubble>
    );
  }

  if (kind === "low_stock") {
    return (
      <Bubble title="🧵 วัสดุต่ำกว่าจุดสั่งซื้อ 2 รายการ" subtitle="ตรวจสต๊อกอัตโนมัติ 08:00">
        <Chip tone="error">ผ้าพรมกำมะหยี่ 1.6 ม. · เหลือ 45.5 จากจุดสั่งซื้อ 60 ตร.ม.</Chip>
        <Chip tone="error">หมึกซับลิเมชัน CMYK · เหลือ 8.5 จากจุดสั่งซื้อ 15 ลิตร</Chip>
        <Line muted>ใช้กับงานพิมพ์แทบทุกออเดอร์ — เสี่ยงหยุดสายพิมพ์กลางสัปดาห์</Line>
        {owner && (
          <>
            <Separator />
            <Row label="มูลค่าที่ต้องสั่งเพิ่ม (ประมาณ)" value={baht(12960)} />
          </>
        )}
        <Fine>
          {owner
            ? "🔒 ราคา/มูลค่าแสดงเฉพาะการ์ดของเจ้าของ"
            : "การ์ดของทีมผลิตแจ้งเฉพาะจำนวนคงเหลือ ไม่มีราคา"}
        </Fine>
      </Bubble>
    );
  }

  return (
    <Bubble title="📊 สรุปสิ้นวัน — 25 ก.ค. 2569" subtitle="ร้าน Mattii · ส่งถึงเจ้าของ">
      <Chip tone="success">ปิดงานได้ 6 ใบ · ออเดอร์ใหม่ 4 ใบ</Chip>
      <Line>รอลูกค้ายืนยันลาย 5 ใบ · อยู่ในคิวผลิต 7 ใบ</Line>
      <Line>ส่งออกวันนี้ 3 ใบ · ของเสีย 1 ผืน</Line>
      {owner ? (
        <>
          <Separator />
          <Row label="ยอดขายวันนี้" value={baht(18640)} />
          <Row label="กำไรขั้นต้นวันนี้" value={baht(9320)} />
          <Row label="COD ค้างเก็บ" value={baht(4380)} danger />
        </>
      ) : (
        <>
          <Separator />
          <Line muted>คิวพรุ่งนี้: พิมพ์ 5 ใบ · แพ็ค 3 ใบ · เบิกผ้ากำมะหยี่ 6.4 ตร.ม.</Line>
        </>
      )}
      <Fine>
        {owner
          ? "🔒 ตัวเลขยอดขาย/กำไรส่งถึงเจ้าของเท่านั้น (ส่งหารายคน ไม่ส่งเข้ากลุ่ม)"
          : "การ์ดสรุปเช้าของทีมผลิตไม่มีตัวเลขเงินใด ๆ"}
      </Fine>
    </Bubble>
  );
}
