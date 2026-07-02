// line-mocks.ts — Mock Flex card preview (T1-T4, spec §5c RESOLVED) — ไม่ยิง LINE จริง
// header CHARCOAL #3C3B3D พื้นเรียบ (ห้าม gradient) ตาม docs/line-flex-card-guide.md
// หมายเหตุ (CONTEXT §0.9 lesson): ไฟล์นี้ใช้ hex ตรงได้ (LINE render นอกแอป Tailwind ไม่ทำงาน)
// — ข้อยกเว้นที่ตั้งใจ ไม่ใช่การหลุด standard (บันทึก Review Log ประกอบ)
//
// ตัวเลขอ้างอิง orders.ts (today = 2026-07-01):
//   T1 overdue: gp-013 (aging 43วัน, ค้างรับ 43,588.79 ฿), gp-014 (aging 48วัน, ค้างรับ 18,822.43 ฿)
//     รวม overdue = 62,411.21 ฿ (2 งาน)
//   T2 weekly: pipeline 2,406,359.00 ฿ · ค้างรับรวม 297,855.05 ฿ (4 งาน) · ปิดใหม่สัปดาห์นี้ = gp-019 (closed)
//     กำไร realized 104,668.86 ฿ / pending 229,012.78 ฿ · split 89 1,879,696.00 ฿ / P2P 526,663.00 ฿
//   T3 event: paid = gp-015 (แม่แรงตะเข้ 5 ตัน, 23,500.00 ฿, duration 38วัน)
//             delivered = gp-005 (วัสดุสำนักงาน, 226,745.00 ฿) — toggle default OFF แต่ preview ให้ดู

// ---- T1: เงินค้างรับเกินกำหนด (push Flex รายวัน 09:00) ----

export interface T1OverdueFlexData {
  date_label: string;
  total_overdue: number;
  overdue_count: number;
  top_items: {
    order_id: string;
    customer_name: string;
    department: string;
    net_receivable: number;
    aging_days: number;
  }[];
  report_url: string;
}

export const T1_OVERDUE_FLEX_DATA: T1OverdueFlexData = {
  date_label: "1 ก.ค. 2569",
  total_overdue: 62411.21,
  overdue_count: 2,
  top_items: [
    {
      order_id: "gp-014",
      customer_name: "เทศบาลเมืองบางแก้ว",
      department: "กองศึกษาฯ",
      net_receivable: 18822.43,
      aging_days: 48,
    },
    {
      order_id: "gp-013",
      customer_name: "เทศบาลเมืองบางแก้ว",
      department: "กองสาธารณสุข",
      net_receivable: 43588.79,
      aging_days: 43,
    },
  ],
  report_url: "/admin/prototypes/gov-procure/receivables",
};

export const T1_OVERDUE_FLEX_PREVIEW = {
  type: "flex",
  altText: `เงินค้างรับเกินกำหนด — ${T1_OVERDUE_FLEX_DATA.overdue_count} งาน`,
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
          text: "⚠️ เงินค้างรับเกินกำหนด",
          color: "#ffffff",
          weight: "bold",
          size: "md",
        },
        {
          type: "text",
          text: `จัดซื้อครุภัณฑ์ภาครัฐ · ${T1_OVERDUE_FLEX_DATA.date_label}`,
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
        {
          type: "box",
          layout: "horizontal",
          backgroundColor: "#FCF1F2",
          cornerRadius: "6px",
          paddingAll: "10px",
          contents: [
            { type: "text", text: "ยอดค้างรับรวม", color: "#C43448", size: "sm", flex: 1 },
            {
              type: "text",
              text: `${T1_OVERDUE_FLEX_DATA.total_overdue.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿`,
              color: "#C43448",
              size: "sm",
              weight: "bold",
              align: "end",
            },
          ],
        },
        {
          type: "text",
          text: `${T1_OVERDUE_FLEX_DATA.overdue_count} งาน เกินกำหนด 30 วัน`,
          color: "#656D78",
          size: "sm",
          margin: "sm",
        },
        { type: "separator", margin: "sm" },
        ...T1_OVERDUE_FLEX_DATA.top_items.flatMap((item) => [
          {
            type: "text",
            text: `${item.department} · ${item.order_id}`,
            color: "#1A1A1B",
            size: "sm",
            weight: "bold",
            margin: "sm",
          },
          {
            type: "text",
            text: `ค้างรับ ${item.net_receivable.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿ · เกินกำหนด ${item.aging_days} วัน`,
            color: "#C43448",
            size: "xs",
          },
        ]),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      contents: [
        {
          type: "button",
          action: { type: "uri", label: "ดูเงินค้างรับทั้งหมด", uri: T1_OVERDUE_FLEX_DATA.report_url },
          style: "primary",
          color: "#3C3B3D",
          height: "sm",
        },
      ],
    },
  },
};

// ---- T2: รายงานพอร์ตรายสัปดาห์ (ส่งรีพอต Flex — จันทร์ 08:00) ----

export interface T2WeeklyFlexData {
  week_label: string;
  pipeline_value: number;
  receivable_total: number;
  receivable_count: number;
  closed_this_week: number;
  profit_realized: number;
  profit_pending: number;
  split_89: number;
  split_p2p: number;
  ai_insight: string;
  report_url: string;
}

export const T2_WEEKLY_FLEX_DATA: T2WeeklyFlexData = {
  week_label: "29 มิ.ย. – 5 ก.ค. 2569",
  pipeline_value: 2406359.0,
  receivable_total: 297855.05,
  receivable_count: 4,
  closed_this_week: 1,
  profit_realized: 104668.86,
  profit_pending: 229012.78,
  split_89: 1879696.0,
  split_p2p: 526663.0,
  ai_insight:
    "ปิดงานใหม่ 1 งาน (ตู้เก็บของห้องนายก 275,000 ฿) · เงินค้างรับ 297,855.05 ฿ ยังมี 2 งานเกิน SLA ควรทวงก่อนสัปดาห์หน้า",
  report_url: "/admin/prototypes/gov-procure/reports",
};

export const T2_WEEKLY_FLEX_PREVIEW = {
  type: "flex",
  altText: `รายงานพอร์ตรายสัปดาห์ — ${T2_WEEKLY_FLEX_DATA.week_label}`,
  contents: {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#3C3B3D",
      paddingAll: "14px",
      contents: [
        { type: "text", text: "📊 รายงานพอร์ตรายสัปดาห์", color: "#ffffff", weight: "bold", size: "md" },
        {
          type: "text",
          text: T2_WEEKLY_FLEX_DATA.week_label,
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
        {
          type: "text",
          text: `มูลค่าพอร์ตรวม ${T2_WEEKLY_FLEX_DATA.pipeline_value.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿`,
          color: "#1A1A1B",
          weight: "bold",
          size: "sm",
        },
        {
          type: "text",
          text: `แยก 89 Global Work ${T2_WEEKLY_FLEX_DATA.split_89.toLocaleString("th-TH")} ฿ · P2P Supply ${T2_WEEKLY_FLEX_DATA.split_p2p.toLocaleString("th-TH")} ฿`,
          color: "#656D78",
          size: "xs",
        },
        { type: "separator", margin: "sm" },
        {
          type: "box",
          layout: "horizontal",
          margin: "sm",
          contents: [
            { type: "text", text: "ปิดงานใหม่สัปดาห์นี้", color: "#1A1A1B", size: "sm", flex: 1 },
            {
              type: "text",
              text: `${T2_WEEKLY_FLEX_DATA.closed_this_week} งาน`,
              color: "#065F46",
              size: "sm",
              weight: "bold",
              align: "end",
            },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "เงินค้างรับ", color: "#D8334A", size: "sm", flex: 1 },
            {
              type: "text",
              text: `${T2_WEEKLY_FLEX_DATA.receivable_total.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿ (${T2_WEEKLY_FLEX_DATA.receivable_count} งาน)`,
              color: "#D8334A",
              size: "sm",
              weight: "bold",
              align: "end",
            },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "กำไร realized / pending", color: "#656D78", size: "sm", flex: 1 },
            {
              type: "text",
              text: `${T2_WEEKLY_FLEX_DATA.profit_realized.toLocaleString("th-TH", { minimumFractionDigits: 0 })} / ${T2_WEEKLY_FLEX_DATA.profit_pending.toLocaleString("th-TH", { minimumFractionDigits: 0 })} ฿`,
              color: "#1A1A1B",
              size: "xs",
              align: "end",
            },
          ],
        },
        {
          type: "text",
          text: `✨ ${T2_WEEKLY_FLEX_DATA.ai_insight}`,
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
          action: { type: "uri", label: "เปิดรายงานเต็ม", uri: T2_WEEKLY_FLEX_DATA.report_url },
          style: "primary",
          color: "#3C3B3D",
          height: "sm",
        },
      ],
    },
  },
};

// ---- T3: แจ้ง stage สำคัญ (event push — delivered/paid) ----

export interface T3EventFlexData {
  kind: "delivered" | "paid";
  order_id: string;
  department: string;
  product_description: string;
  amount: number;
  extra_label: string; // "รับเช็คภายใน N วัน" (delivered) | duration (paid)
  detail_url: string;
}

export const T3_PAID_FLEX_DATA: T3EventFlexData = {
  kind: "paid",
  order_id: "gp-015",
  department: "กองสาธารณสุข",
  product_description: "แม่แรงตะเข้ ขนาด 5 ตัน",
  amount: 23500.0,
  extra_label: "ใช้เวลา 38 วัน (สัญญา → รับเช็ค)",
  detail_url: "/admin/prototypes/gov-procure/orders/gp-015",
};

export const T3_DELIVERED_FLEX_DATA: T3EventFlexData = {
  kind: "delivered",
  order_id: "gp-008",
  department: "กองการเจ้าหน้าที่",
  product_description: "น้ำหอมปรับอากาศ",
  amount: 10920.0,
  extra_label: "เข้าเกณฑ์ SLA 30 วัน — รับเช็คภายใน 4 วัน",
  detail_url: "/admin/prototypes/gov-procure/orders/gp-008",
};

export function buildT3FlexPreview(data: T3EventFlexData) {
  const isPaid = data.kind === "paid";
  return {
    type: "flex",
    altText: isPaid ? `รับเช็คแล้ว — ${data.order_id}` : `ส่งมอบแล้ว — ${data.order_id}`,
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
            text: isPaid ? "✅ รับเช็คแล้ว" : "📦 ส่งมอบแล้ว รอรับเช็ค",
            color: "#ffffff",
            weight: "bold",
            size: "md",
          },
          { type: "text", text: data.department, color: "#cccccc", size: "sm", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "18px",
        spacing: "sm",
        contents: [
          { type: "text", text: data.product_description, color: "#1A1A1B", size: "sm", wrap: true },
          {
            type: "box",
            layout: "horizontal",
            backgroundColor: isPaid ? "#F2FCF9" : "#FFFCF3",
            cornerRadius: "6px",
            paddingAll: "10px",
            margin: "sm",
            contents: [
              { type: "text", text: "มูลค่างาน", color: isPaid ? "#065F46" : "#8A6D1D", size: "sm", flex: 1 },
              {
                type: "text",
                text: `${data.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿`,
                color: isPaid ? "#065F46" : "#8A6D1D",
                size: "sm",
                weight: "bold",
                align: "end",
              },
            ],
          },
          { type: "text", text: data.extra_label, color: "#656D78", size: "xs", margin: "sm" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        contents: [
          {
            type: "button",
            action: { type: "uri", label: "ดูรายละเอียดงาน", uri: data.detail_url },
            style: "primary",
            color: "#3C3B3D",
            height: "sm",
          },
        ],
      },
    },
  };
}

export const T3_PAID_FLEX_PREVIEW = buildT3FlexPreview(T3_PAID_FLEX_DATA);
export const T3_DELIVERED_FLEX_PREVIEW = buildT3FlexPreview(T3_DELIVERED_FLEX_DATA);

// ---- T4: คำสั่ง /พอร์ต, /ค้างรับ (webhook command reply) ----
// reuse การ์ด T2 (/พอร์ต) และ T1 (/ค้างรับ) — role ขั้นต่ำ viewer (spec §5c N5)

export interface T4CommandExample {
  command: string;
  description: string;
  reused_card: "T1" | "T2";
  min_role: "viewer";
}

export const T4_COMMAND_EXAMPLES: T4CommandExample[] = [
  {
    command: "/พอร์ต",
    description: "ดูสรุปพอร์ตล่าสุด (reuse การ์ด T2 รายงานรายสัปดาห์)",
    reused_card: "T2",
    min_role: "viewer",
  },
  {
    command: "/ค้างรับ",
    description: "ดูรายการเงินค้างรับที่เกินกำหนด (reuse การ์ด T1)",
    reused_card: "T1",
    min_role: "viewer",
  },
];

// ---- LINE notify settings preview (หน้า settings — toggle + ผู้รับ) ----

export interface LineNotifySettingsPreview {
  line_alert_enabled: boolean;
  line_weekly_enabled: boolean;
  line_event_paid: boolean;
  line_event_delivered: boolean;
  recipients_label: string;
}

export const LINE_NOTIFY_SETTINGS_PREVIEW: LineNotifySettingsPreview = {
  line_alert_enabled: true,
  line_weekly_enabled: true,
  line_event_paid: true,
  line_event_delivered: false,
  recipients_label: "เจ้าของกิจการ + ผู้จัดการงาน",
};
