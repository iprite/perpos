"use client";

// flex-preview.tsx — เรนเดอร์ "ภาพจำลอง" LINE Flex card (รายงานรายได้รายวัน L1) ในหน้าเว็บ
// ⚠️ นี่คือ preview ของการ์ด LINE จริง → จงใจใช้สี hex ตรงตาม line-flex-card-guide.md
//    (header CHARCOAL #3C3B3D พื้นเรียบ, ไม่ใช่ UI ของแอป — เป็นการจำลองสิ่งที่ผู้ใช้จะเห็นใน LINE)
//    hex ในไฟล์นี้ = ค่า Flex JSON จาก line-mocks.ts เท่านั้น (self-grep exception)

import { l1FlexCardData } from "../_fixtures/line-mocks";

const C = {
  headerBg: "#3C3B3D",
  headerText: "#ffffff",
  headerSub: "#cccccc",
  positiveBg: "#F2FCF9",
  positiveText: "#065F46",
  ink: "#1A1A1B",
  inkMuted: "#656D78",
  danger: "#D8334A",
  aiText: "#9CA3AF",
  border: "#E6E9EE",
  separator: "#E6E9EE",
  footerBg: "#ffffff",
} as const;

const baht = (n: number) =>
  `${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿`;
const baht0 = (n: number) => `${n.toLocaleString("th-TH")} ฿`;

/** การ์ดจำลอง Flex (กว้าง ~300px เท่าการ์ด LINE จริง) */
export function L1FlexPreview() {
  const d = l1FlexCardData;
  return (
    <div
      className="w-full max-w-[320px] overflow-hidden rounded-2xl shadow-md"
      style={{ border: `1px solid ${C.border}` }}
    >
      {/* header — CHARCOAL พื้นเรียบ */}
      <div style={{ backgroundColor: C.headerBg, padding: "14px" }}>
        <div style={{ color: C.headerText, fontWeight: 700, fontSize: 15 }}>
          📊 สรุปรายได้ — {d.date_label}
        </div>
        <div style={{ color: C.headerSub, fontSize: 13, marginTop: 4 }}>โรงแรมสุขใจ</div>
      </div>

      {/* body */}
      <div style={{ backgroundColor: C.footerBg, padding: "18px" }}>
        {/* รายได้ chip */}
        <div
          style={{
            backgroundColor: C.positiveBg,
            borderRadius: 6,
            padding: "10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ color: C.positiveText, fontSize: 13 }}>รายได้วันนี้</span>
          <span style={{ color: C.positiveText, fontSize: 13, fontWeight: 700 }}>
            {baht(d.revenue_today)}
          </span>
        </div>

        <div style={{ color: C.ink, fontSize: 13, marginTop: 10 }}>
          เข้าพัก {d.rooms_occupied}/{d.rooms_total} ห้อง · occupancy {d.occupancy_pct}%
        </div>
        <div style={{ color: C.ink, fontSize: 13, marginTop: 4 }}>
          ADR {baht0(d.adr)} · RevPAR {baht0(d.revpar)}
        </div>
        <div style={{ color: C.inkMuted, fontSize: 13, marginTop: 4 }}>
          เช็คอิน {d.checkins_today} · เช็คเอาท์ {d.checkouts_today}
        </div>

        <div style={{ height: 1, backgroundColor: C.separator, margin: "12px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: C.danger, fontSize: 13 }}>ค้างชำระ</span>
          <span style={{ color: C.danger, fontSize: 13, fontWeight: 700 }}>
            {baht(d.outstanding_amount)} ({d.outstanding_count} booking)
          </span>
        </div>

        <div style={{ color: C.aiText, fontSize: 11, marginTop: 12, lineHeight: 1.5 }}>
          ✨ {d.ai_insight}
        </div>
      </div>

      {/* footer — ปุ่ม primary CHARCOAL */}
      <div style={{ backgroundColor: C.footerBg, padding: "10px" }}>
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
          เปิดรายงานเต็ม
        </div>
      </div>
    </div>
  );
}
