/* Flex MOCK — hex ตรงตาม line-flex-card-guide §2, LINE ไม่ใช้ Tailwind. ไม่ใช่ hardcoded-hex violation */
// line-mocks.ts — LINE Flex card mock data ครบ 5 ตัว (L1–L5, §7)
// header CHARCOAL #3C3B3D พื้นเรียบ (ห้าม gradient)
// ใช้สำหรับ preview ใน prototype (ไม่ยิง LINE จริง)
// production: sendLineMessages / replyFlex จาก lib/line/send-messages.ts

// ===========================================================
// สี token (ตาม line-flex-card-guide + DESIGN.md §2)
// ===========================================================
const COLOR = {
  charcoal: "#3C3B3D", // header background (CHARCOAL)
  white: "#FFFFFF",
  mint: "#48CFAD", // positive / income (MINT)
  ruby: "#D8334A", // negative / error / overdue (RUBY)
  sunflower: "#FFCE54", // warning (SUNFLOWER)
  gray600: "#525866", // body text
  gray400: "#9CA3AF", // secondary / muted
  gray200: "#E6E9EE", // separator
  blue: "#5D9CEC", // accent info (BLUE JEANS)
};

// ===========================================================
// L1 — บันทึกค่าใช้จ่ายผ่าน LINE สำเร็จ
// trigger: /รายจ่าย 3500 ค่าวัสดุสำนักงาน
// ===========================================================
export const lineFlexL1 = {
  type: "bubble",
  header: {
    type: "box",
    layout: "vertical",
    backgroundColor: COLOR.charcoal,
    paddingAll: "16px",
    contents: [
      {
        type: "text",
        text: "บัญชี & การเงิน",
        color: COLOR.gray400,
        size: "xs",
        weight: "regular",
      },
      {
        type: "text",
        text: "บันทึกรายจ่ายแล้ว",
        color: COLOR.white,
        size: "lg",
        weight: "bold",
        margin: "sm",
      },
    ],
  },
  body: {
    type: "box",
    layout: "vertical",
    paddingAll: "16px",
    spacing: "md",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "text",
            text: "ประเภท",
            color: COLOR.gray400,
            size: "sm",
            flex: 2,
          },
          {
            type: "text",
            text: "รายจ่าย",
            color: COLOR.ruby,
            size: "sm",
            weight: "bold",
            flex: 3,
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "text",
            text: "จำนวน",
            color: COLOR.gray400,
            size: "sm",
            flex: 2,
          },
          {
            type: "text",
            text: "3,500.00 ฿",
            color: COLOR.ruby,
            size: "xl",
            weight: "bold",
            flex: 3,
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "text",
            text: "หมวด",
            color: COLOR.gray400,
            size: "sm",
            flex: 2,
          },
          {
            type: "text",
            text: "ค่าวัสดุสิ้นเปลือง",
            color: COLOR.gray600,
            size: "sm",
            flex: 3,
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "text",
            text: "โน้ต",
            color: COLOR.gray400,
            size: "sm",
            flex: 2,
          },
          {
            type: "text",
            text: "ค่าวัสดุสำนักงาน",
            color: COLOR.gray600,
            size: "sm",
            flex: 3,
            align: "end",
          },
        ],
      },
      {
        type: "separator",
        color: COLOR.gray200,
        margin: "md",
      },
      {
        type: "text",
        text: "บันทึก 26 มิ.ย. 2569, 14:32 น.",
        color: COLOR.gray400,
        size: "xs",
        align: "center",
      },
    ],
  },
  footer: {
    type: "box",
    layout: "vertical",
    paddingAll: "12px",
    contents: [
      {
        type: "button",
        action: {
          type: "uri",
          label: "ดูรายรับ-รายจ่ายทั้งหมด",
          uri: "https://app.perpos.ai/admin/prototypes/accounting/entries",
        },
        style: "secondary",
        height: "sm",
      },
    ],
  },
};

// ===========================================================
// L2 — เตือนภาษีใกล้ครบกำหนด (cron)
// trigger: cron tax-reminders, PND1 พ.ค. due 7 มิ.ย.
// ===========================================================
export const lineFlexL2 = {
  type: "bubble",
  header: {
    type: "box",
    layout: "vertical",
    backgroundColor: COLOR.charcoal,
    paddingAll: "16px",
    contents: [
      {
        type: "text",
        text: "แจ้งเตือนภาษี",
        color: COLOR.gray400,
        size: "xs",
      },
      {
        type: "text",
        text: "ครบกำหนดยื่นภาษีเร็วๆ นี้",
        color: COLOR.white,
        size: "lg",
        weight: "bold",
        margin: "sm",
      },
    ],
  },
  body: {
    type: "box",
    layout: "vertical",
    paddingAll: "16px",
    spacing: "md",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: COLOR.sunflower,
            cornerRadius: "8px",
            paddingAll: "6px",
            width: "40px",
            height: "40px",
            justifyContent: "center",
            alignItems: "center",
            contents: [
              {
                type: "text",
                text: "11",
                size: "xl",
                weight: "bold",
                color: COLOR.charcoal,
                align: "center",
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            contents: [
              {
                type: "text",
                text: "อีก 11 วัน",
                weight: "bold",
                color: COLOR.charcoal,
                size: "md",
              },
              {
                type: "text",
                text: "7 มิ.ย. 2569",
                color: COLOR.gray400,
                size: "sm",
              },
            ],
          },
        ],
      },
      { type: "separator", color: COLOR.gray200 },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "แบบภาษี", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "ภาษีเงินเดือนพนักงาน (PND1)",
            color: COLOR.gray600,
            size: "sm",
            flex: 3,
            align: "end",
            wrap: true,
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "งวด", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "พฤษภาคม 2569",
            color: COLOR.gray600,
            size: "sm",
            flex: 3,
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "ยอดต้องชำระ", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "3,150.00 ฿",
            color: COLOR.charcoal,
            size: "md",
            weight: "bold",
            flex: 3,
            align: "end",
          },
        ],
      },
    ],
  },
  footer: {
    type: "box",
    layout: "vertical",
    paddingAll: "12px",
    contents: [
      {
        type: "button",
        action: {
          type: "uri",
          label: "ดูรายละเอียดภาษี",
          uri: "https://app.perpos.ai/admin/prototypes/accounting/tax-closing",
        },
        style: "primary",
        color: COLOR.charcoal,
        height: "sm",
      },
    ],
  },
};

// ===========================================================
// L2b — เตือน ภ.พ.30 VAT ใกล้ครบกำหนด (cron, is_vat_registered=true)
// trigger: cron tax-reminders, PP30 มิ.ย. due 15 ก.ค.
// ===========================================================
export const lineFlexL2pp30 = {
  type: "bubble",
  header: {
    type: "box",
    layout: "vertical",
    backgroundColor: COLOR.charcoal,
    paddingAll: "16px",
    contents: [
      {
        type: "text",
        text: "แจ้งเตือนภาษี VAT",
        color: COLOR.gray400,
        size: "xs",
      },
      {
        type: "text",
        text: "ครบกำหนดยื่น ภ.พ.30",
        color: COLOR.white,
        size: "lg",
        weight: "bold",
        margin: "sm",
      },
    ],
  },
  body: {
    type: "box",
    layout: "vertical",
    paddingAll: "16px",
    spacing: "md",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: COLOR.sunflower,
            cornerRadius: "8px",
            paddingAll: "6px",
            width: "40px",
            height: "40px",
            justifyContent: "center",
            alignItems: "center",
            contents: [
              {
                type: "text",
                text: "19",
                size: "xl",
                weight: "bold",
                color: COLOR.charcoal,
                align: "center",
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            contents: [
              {
                type: "text",
                text: "อีก 19 วัน",
                weight: "bold",
                color: COLOR.charcoal,
                size: "md",
              },
              {
                type: "text",
                text: "15 ก.ค. 2569",
                color: COLOR.gray400,
                size: "sm",
              },
            ],
          },
        ],
      },
      { type: "separator", color: COLOR.gray200 },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "แบบภาษี", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "ภาษีมูลค่าเพิ่ม (PP30)",
            color: COLOR.gray600,
            size: "sm",
            flex: 3,
            align: "end",
            wrap: true,
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "งวด", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "มิถุนายน 2569",
            color: COLOR.gray600,
            size: "sm",
            flex: 3,
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "VAT ขาออก", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "8,491.00 ฿",
            color: COLOR.gray600,
            size: "sm",
            flex: 3,
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "VAT ซื้อเข้า", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "−3,850.00 ฿",
            color: COLOR.mint,
            size: "sm",
            flex: 3,
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "สุทธิต้องชำระ", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "4,641.00 ฿",
            color: COLOR.charcoal,
            size: "md",
            weight: "bold",
            flex: 3,
            align: "end",
          },
        ],
      },
    ],
  },
  footer: {
    type: "box",
    layout: "vertical",
    paddingAll: "12px",
    contents: [
      {
        type: "button",
        action: {
          type: "uri",
          label: "ดูรายละเอียด ภ.พ.30",
          uri: "https://app.perpos.ai/admin/prototypes/accounting/tax-closing",
        },
        style: "primary",
        color: COLOR.charcoal,
        height: "sm",
      },
    ],
  },
};

// ===========================================================
// L3 — สรุปรายรับ-รายจ่ายรายสัปดาห์ (cron จันทร์)
// สัปดาห์ 16–22 มิ.ย. 2569
// ===========================================================
export const lineFlexL3 = {
  type: "bubble",
  header: {
    type: "box",
    layout: "vertical",
    backgroundColor: COLOR.charcoal,
    paddingAll: "16px",
    contents: [
      {
        type: "text",
        text: "สรุปรายสัปดาห์",
        color: COLOR.gray400,
        size: "xs",
      },
      {
        type: "text",
        text: "16–22 มิ.ย. 2569",
        color: COLOR.white,
        size: "lg",
        weight: "bold",
        margin: "sm",
      },
    ],
  },
  body: {
    type: "box",
    layout: "vertical",
    paddingAll: "16px",
    spacing: "md",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            contents: [
              { type: "text", text: "รายรับ", color: COLOR.gray400, size: "xs", align: "center" },
              {
                type: "text",
                text: "41,800 ฿",
                color: COLOR.mint,
                size: "md",
                weight: "bold",
                align: "center",
              },
            ],
          },
          { type: "separator", color: COLOR.gray200 },
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            contents: [
              { type: "text", text: "รายจ่าย", color: COLOR.gray400, size: "xs", align: "center" },
              {
                type: "text",
                text: "81,700 ฿",
                color: COLOR.ruby,
                size: "md",
                weight: "bold",
                align: "center",
              },
            ],
          },
        ],
      },
      { type: "separator", color: COLOR.gray200 },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "คงเหลือสุทธิ", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "−39,900 ฿",
            color: COLOR.ruby,
            size: "md",
            weight: "bold",
            flex: 3,
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        margin: "md",
        backgroundColor: "#F8FAFC",
        cornerRadius: "8px",
        paddingAll: "10px",
        contents: [
          { type: "text", text: "รายจ่ายหลักสัปดาห์นี้", color: COLOR.gray400, size: "xs" },
          {
            type: "text",
            text: "• เงินเดือน 58,500 ฿",
            color: COLOR.gray600,
            size: "sm",
            margin: "sm",
          },
          { type: "text", text: "• ค่าการตลาด 15,000 ฿", color: COLOR.gray600, size: "sm" },
          { type: "text", text: "• ค่าวัสดุ 7,200 ฿", color: COLOR.gray600, size: "sm" },
        ],
      },
    ],
  },
  footer: {
    type: "box",
    layout: "vertical",
    paddingAll: "12px",
    contents: [
      {
        type: "button",
        action: {
          type: "uri",
          label: "ดูรายรับ-รายจ่ายทั้งหมด",
          uri: "https://app.perpos.ai/admin/prototypes/accounting/entries",
        },
        style: "secondary",
        height: "sm",
      },
    ],
  },
};

// ===========================================================
// L4 — ส่งใบแจ้งหนี้ให้ลูกค้าทาง LINE
// INV-2026-0005 บ.ไทยดีไซน์ 55,000 บาท
// ===========================================================
export const lineFlexL4 = {
  type: "bubble",
  header: {
    type: "box",
    layout: "vertical",
    backgroundColor: COLOR.charcoal,
    paddingAll: "16px",
    contents: [
      {
        type: "text",
        text: "ใบแจ้งหนี้",
        color: COLOR.gray400,
        size: "xs",
      },
      {
        type: "text",
        text: "INV-2026-0005",
        color: COLOR.white,
        size: "xl",
        weight: "bold",
        margin: "sm",
      },
    ],
  },
  body: {
    type: "box",
    layout: "vertical",
    paddingAll: "16px",
    spacing: "md",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "ถึง", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "บ.ไทยดีไซน์ สตูดิโอ",
            color: COLOR.gray600,
            size: "sm",
            weight: "bold",
            flex: 3,
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "ออกวันที่", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "2 มิ.ย. 2569",
            color: COLOR.gray600,
            size: "sm",
            flex: 3,
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "ชำระภายใน", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "2 ก.ค. 2569",
            color: COLOR.sunflower,
            size: "sm",
            weight: "bold",
            flex: 3,
            align: "end",
          },
        ],
      },
      { type: "separator", color: COLOR.gray200 },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "รายการหลัก", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "Analytics Dashboard Q2",
            color: COLOR.gray600,
            size: "sm",
            flex: 3,
            align: "end",
            wrap: true,
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "ยอดชำระ", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "55,000.00 ฿",
            color: COLOR.charcoal,
            size: "xl",
            weight: "bold",
            flex: 3,
            align: "end",
          },
        ],
      },
    ],
  },
  footer: {
    type: "box",
    layout: "vertical",
    paddingAll: "12px",
    spacing: "sm",
    contents: [
      {
        type: "button",
        action: {
          type: "uri",
          label: "ดูใบแจ้งหนี้ฉบับเต็ม (PDF)",
          uri: "https://app.perpos.ai/admin/prototypes/accounting/documents",
        },
        style: "primary",
        color: COLOR.charcoal,
        height: "sm",
      },
      {
        type: "button",
        action: {
          type: "uri",
          label: "โอนเงิน QR Code",
          uri: "https://app.perpos.ai",
        },
        style: "secondary",
        height: "sm",
      },
    ],
  },
};

// ===========================================================
// L5 — เตือนหนี้เกินกำหนด (cron)
// INV-2026-0003 วังทองก่อสร้าง 75,000 บาท เกิน 26 วัน
// ===========================================================
export const lineFlexL5 = {
  type: "bubble",
  header: {
    type: "box",
    layout: "vertical",
    backgroundColor: COLOR.charcoal,
    paddingAll: "16px",
    contents: [
      {
        type: "text",
        text: "แจ้งเตือน",
        color: COLOR.gray400,
        size: "xs",
      },
      {
        type: "text",
        text: "หนี้เกินกำหนดชำระ",
        color: COLOR.white,
        size: "lg",
        weight: "bold",
        margin: "sm",
      },
    ],
  },
  body: {
    type: "box",
    layout: "vertical",
    paddingAll: "16px",
    spacing: "md",
    contents: [
      {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FCF1F2",
        cornerRadius: "8px",
        paddingAll: "12px",
        contents: [
          { type: "text", text: "เกินกำหนด 26 วัน", color: COLOR.ruby, size: "sm", weight: "bold" },
          {
            type: "text",
            text: "INV-2026-0003",
            color: COLOR.charcoal,
            size: "md",
            weight: "bold",
            margin: "sm",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "ลูกค้า", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "ห้างหุ้นส่วน วังทองก่อสร้าง",
            color: COLOR.gray600,
            size: "sm",
            flex: 3,
            align: "end",
            wrap: true,
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "ครบกำหนด", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "31 พ.ค. 2569",
            color: COLOR.ruby,
            size: "sm",
            weight: "bold",
            flex: 3,
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "ยอดค้างชำระ", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "75,000.00 ฿",
            color: COLOR.ruby,
            size: "xl",
            weight: "bold",
            flex: 3,
            align: "end",
          },
        ],
      },
      { type: "separator", color: COLOR.gray200 },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "หนี้ค้างรวม (2 ใบ)", color: COLOR.gray400, size: "sm", flex: 2 },
          {
            type: "text",
            text: "103,000.00 ฿",
            color: COLOR.ruby,
            size: "sm",
            weight: "bold",
            flex: 3,
            align: "end",
          },
        ],
      },
    ],
  },
  footer: {
    type: "box",
    layout: "vertical",
    paddingAll: "12px",
    spacing: "sm",
    contents: [
      {
        type: "button",
        action: {
          type: "uri",
          label: "ดูใบแจ้งหนี้ทั้งหมด",
          uri: "https://app.perpos.ai/admin/prototypes/accounting/documents",
        },
        style: "primary",
        color: COLOR.ruby,
        height: "sm",
      },
      {
        type: "button",
        action: {
          type: "uri",
          label: "ส่งเตือนลูกค้า",
          uri: "https://app.perpos.ai/admin/prototypes/accounting/documents",
        },
        style: "secondary",
        height: "sm",
      },
    ],
  },
};

/** รายชื่อ LINE flex cards ทั้งหมด (สำหรับ hub preview ใน B6 ตั้งค่า) */
export const lineFlexPreviews = [
  { id: "L1", label: "บันทึกรายจ่ายผ่าน LINE", flex: lineFlexL1 },
  { id: "L2", label: "เตือนภาษี PND1 ใกล้ครบกำหนด", flex: lineFlexL2 },
  { id: "L2b", label: "เตือน ภ.พ.30 VAT ใกล้ครบกำหนด (VAT)", flex: lineFlexL2pp30 },
  { id: "L3", label: "สรุปรายรับ-รายจ่ายรายสัปดาห์", flex: lineFlexL3 },
  { id: "L4", label: "ส่งใบแจ้งหนี้ให้ลูกค้าทาง LINE", flex: lineFlexL4 },
  { id: "L5", label: "เตือนหนี้เกินกำหนด", flex: lineFlexL5 },
];
