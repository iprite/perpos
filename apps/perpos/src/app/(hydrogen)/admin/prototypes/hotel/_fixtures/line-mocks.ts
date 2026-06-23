// line-mocks.ts — Mock data สำหรับ L1 LINE Flex preview (รายงานรายได้รายวัน)
// ใช้ค่าจาก fixture วันล่าสุด (2026-06-23) + AI insight canned
// header CHARCOAL #3C3B3D ตาม line-flex-card-guide.md
// ไม่ยิง LINE จริง — render preview ในหน้าเว็บเท่านั้น

// ---- ตั้งค่าแจ้งเตือน (L1 config) ----
export interface LineNotifyConfig {
  enabled: boolean;
  send_time: string; // "HH:MM"
  recipients: {
    owner: boolean;
    manager: boolean;
  };
}

export const defaultLineNotifyConfig: LineNotifyConfig = {
  enabled: true,
  send_time: "20:00",
  recipients: {
    owner: true,
    manager: true,
  },
};

// ---- Flex Card Data สำหรับ preview ----
// ค่าทั้งหมดตรงกับ aiSummaryToday + fixture วันนี้ (2026-06-23)
// occupancy = 14/22 = 64% · rooms_occupied = occupied(11)+reserved(3) = 14
// checkins = 3 (bk-0013,0014,0015) · checkouts = 3 (bk-0001,0007,0012)
export interface L1FlexCardData {
  date_label: string; // แสดง พ.ศ. ในการ์ด
  date_iso: string; // ISO CE
  revenue_today: number; // 16,600 ฿
  occupancy_pct: number; // 64%
  rooms_occupied: number; // 14 (occupied+reserved)
  rooms_total: number; // 22 (sellable)
  adr: number; // 1,664 ฿
  revpar: number; // 1,065 ฿
  checkins_today: number; // 3
  checkouts_today: number; // 3
  outstanding_amount: number; // 49,000 ฿
  outstanding_count: number; // 11 booking
  ai_insight: string; // canned H1 insight สั้น
  report_url: string; // deep link
}

export const l1FlexCardData: L1FlexCardData = {
  date_label: "23 มิ.ย. 2569",
  date_iso: "2026-06-23",
  revenue_today: 16600,
  occupancy_pct: 64,
  rooms_occupied: 14,
  rooms_total: 22,
  adr: 1664,
  revpar: 1065,
  checkins_today: 3,
  checkouts_today: 3,
  outstanding_amount: 49000,
  outstanding_count: 11,
  ai_insight:
    "occupancy 64% (14/22 ห้อง) · Walk-in นำรายได้วันนี้ 45% · ค้างชำระ 49,000 ฿ ควรตามเก็บ",
  report_url: "/admin/prototypes/hotel/reports",
};

// ---- Flex Message JSON structure (preview render ใน div) ----
// ใช้ค่าจาก l1FlexCardData — ui-designer render เป็น div จำลองการ์ด LINE
export const l1FlexMessagePreview = {
  type: "flex",
  altText: `สรุปรายได้โรงแรมสุขใจ — ${l1FlexCardData.date_label}`,
  contents: {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#3C3B3D",
      paddingAll: "14px",
      contents: [
        {
          type: "text",
          text: `📊 สรุปรายได้ — ${l1FlexCardData.date_label}`,
          color: "#ffffff",
          weight: "bold",
          size: "md",
          wrap: false,
        },
        {
          type: "text",
          text: "โรงแรมสุขใจ",
          color: "#cccccc",
          size: "sm",
          margin: "xs",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "sm",
      contents: [
        // Revenue chip (success)
        {
          type: "box",
          layout: "horizontal",
          backgroundColor: "#F2FCF9",
          cornerRadius: "6px",
          paddingAll: "10px",
          contents: [
            {
              type: "text",
              text: "รายได้วันนี้",
              color: "#065F46",
              size: "sm",
              flex: 1,
            },
            {
              type: "text",
              text: `${l1FlexCardData.revenue_today.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿`,
              color: "#065F46",
              size: "sm",
              weight: "bold",
              align: "end",
            },
          ],
        },
        // Occupancy line (rooms_occupied = occupied+reserved = 14/22 = 64%)
        {
          type: "text",
          text: `เข้าพัก ${l1FlexCardData.rooms_occupied}/${l1FlexCardData.rooms_total} ห้อง · occupancy ${l1FlexCardData.occupancy_pct}%`,
          color: "#1A1A1B",
          size: "sm",
          margin: "sm",
        },
        // ADR / RevPAR
        {
          type: "text",
          text: `ADR ${l1FlexCardData.adr.toLocaleString("th-TH")} ฿ · RevPAR ${l1FlexCardData.revpar.toLocaleString("th-TH")} ฿`,
          color: "#1A1A1B",
          size: "sm",
        },
        // Checkin / Checkout
        {
          type: "text",
          text: `เช็คอิน ${l1FlexCardData.checkins_today} · เช็คเอาท์ ${l1FlexCardData.checkouts_today}`,
          color: "#656D78",
          size: "sm",
        },
        // Separator
        {
          type: "separator",
          margin: "sm",
        },
        // Outstanding (warning color from RUBY)
        {
          type: "box",
          layout: "horizontal",
          margin: "sm",
          contents: [
            {
              type: "text",
              text: "ค้างชำระ",
              color: "#D8334A",
              size: "sm",
              flex: 1,
            },
            {
              type: "text",
              text: `${l1FlexCardData.outstanding_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿ (${l1FlexCardData.outstanding_count} booking)`,
              color: "#D8334A",
              size: "sm",
              weight: "bold",
              align: "end",
            },
          ],
        },
        // AI Insight
        {
          type: "text",
          text: `✨ ${l1FlexCardData.ai_insight}`,
          color: "#9CA3AF",
          size: "xs",
          wrap: true,
          margin: "sm",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      contents: [
        {
          type: "button",
          action: {
            type: "uri",
            label: "เปิดรายงานเต็ม",
            uri: l1FlexCardData.report_url,
          },
          style: "primary",
          color: "#3C3B3D",
          height: "sm",
        },
      ],
    },
  },
};
