// line-mocks.ts — canned LINE card content สำหรับ preview prototype (5 จุด §7)
// ข้อมูล object {title, lines[], footer} ให้ ui-designer เรนเดอร์ภาพจำลองการ์ด
// ไม่ใช่ Flex JSON จริง — เป็น structured data สำหรับ FlexCardPreview component
// NOTE: ไฟล์นี้ใช้ hex สีสำหรับ LINE card preview (LINE render นอก Tailwind)
//       ตั้งใจ = บทเรียน Review Log hotel. header CHARCOAL #3C3B3D ตาม DESIGN.md §2 + line-flex-card-guide.md

export type LineCardPreviewData = {
  id: string;
  event: string; // ชื่อเหตุการณ์ (แสดงใน settings toggle)
  title: string; // header ของการ์ด
  headerColor: "#3C3B3D"; // CHARCOAL เสมอ (binding)
  lines: Array<{
    label: string;
    value: string;
    highlight?: boolean; // true = ตัวหนา/สีเข้ม
  }>;
  footer: string; // ข้อความ CTA ล่างการ์ด
  badge?: string; // pill สถานะ (optional)
  badgeColor?: string; // hex สี pill
};

// ---- §7.1 — แจ้งสลิปออก (push ให้พนักงานแต่ละคน หลังปิดรอบ) ----
export const LINE_CARD_PAYSLIP: LineCardPreviewData = {
  id: "line-payslip",
  event: "แจ้งสลิปเงินเดือนออก",
  title: "สลิปเงินเดือน มิถุนายน 2569",
  headerColor: "#3C3B3D",
  lines: [
    { label: "พนักงาน", value: "นภาพร ดาวเรือง (EMP-002)" },
    { label: "แผนก", value: "ออกแบบ" },
    { label: "เงินเดือนฐาน", value: "28,000.00 ฿" },
    { label: "เบี้ยขยัน", value: "500.00 ฿" },
    { label: "ปกส. (หัก)", value: "−750.00 ฿" },
    { label: "กองทุนสำรองฯ (หัก)", value: "−840.00 ฿" },
    { label: "ภาษีหัก ณ ที่จ่าย", value: "−167.00 ฿" },
    { label: "เงินสุทธิที่รับ", value: "26,743.00 ฿", highlight: true },
    { label: "วันที่จ่าย", value: "25 มิถุนายน 2569" },
  ],
  footer: "กดปุ่มด้านล่างเพื่อดูสลิปฉบับเต็ม (PDF)",
  badge: "จ่ายแล้ว",
  badgeColor: "#48CFAD", // MINT
};

// ---- §7.2 — เตือนวันสำคัญ (cron push ให้ผู้ดูแล) ----
export const LINE_CARD_REMINDER: LineCardPreviewData = {
  id: "line-reminder",
  event: "เตือนวันสำคัญ (ครบทดลองงาน/ต่อสัญญา)",
  title: "แจ้งเตือน: วันสำคัญพนักงาน",
  headerColor: "#3C3B3D",
  lines: [
    { label: "ประเภท", value: "ครบกำหนดทดลองงาน", highlight: true },
    { label: "พนักงาน", value: "ปาลิตา แสงทอง (EMP-004)" },
    { label: "ตำแหน่ง", value: "Copywriter" },
    { label: "วันครบกำหนด", value: "10 กรกฎาคม 2569", highlight: true },
    { label: "เหลืออีก", value: "16 วัน" },
    { label: "วันเริ่มงาน", value: "10 เมษายน 2569" },
  ],
  footer: "กดเพื่อดูแฟ้มพนักงานและตัดสินใจต่อสัญญา",
  badge: "ใกล้ถึง",
  badgeColor: "#FFCE54", // SUNFLOWER/warning
};

// ---- §7.3 — เตือนใบลารออนุมัติ (push ให้ผู้อนุมัติ) ----
export const LINE_CARD_LEAVE_APPROVAL: LineCardPreviewData = {
  id: "line-leave-approval",
  event: "เตือนใบลารออนุมัติ",
  title: "มีใบลาใหม่รออนุมัติ",
  headerColor: "#3C3B3D",
  lines: [
    { label: "พนักงาน", value: "นภาพร ดาวเรือง (EMP-002)" },
    { label: "ประเภทลา", value: "ลากิจ" },
    { label: "วันที่ลา", value: "26 มิถุนายน 2569 (1 วัน)", highlight: true },
    { label: "เหตุผล", value: "พาแม่ไปหาหมอ" },
    { label: "ยื่นเมื่อ", value: "24 มิ.ย. 2569 เวลา 08:00 น." },
    { label: "โควตาลากิจคงเหลือ", value: "2 วัน / 3 วัน" },
  ],
  footer: "กด อนุมัติ หรือ ปฏิเสธ เพื่อแจ้งผลให้พนักงานทันที",
  badge: "รออนุมัติ",
  badgeColor: "#FFCE54", // SUNFLOWER
};

// ---- §7.4 — ยื่นลาผ่าน LINE (command preview — mock UX flow) ----
export const LINE_CARD_LEAVE_SUBMIT: LineCardPreviewData = {
  id: "line-leave-submit",
  event: "ยื่นลาผ่าน LINE (พนักงาน)",
  title: "ยืนยันการยื่นลา",
  headerColor: "#3C3B3D",
  lines: [
    { label: "คำสั่ง", value: "/ยื่นลา" },
    { label: "ประเภทลา", value: "ลาป่วย" },
    { label: "วันที่", value: "25 มิถุนายน 2569 (1 วัน)" },
    { label: "เหตุผล", value: "ปวดท้อง ไม่สามารถมาทำงานได้" },
    { label: "สถานะ", value: "รออนุมัติ", highlight: true },
    { label: "โควตาลาป่วยคงเหลือ", value: "29 วัน / 30 วัน" },
  ],
  footer: "ระบบส่งใบลาให้ผู้จัดการแล้ว จะแจ้งผลกลับทาง LINE",
  badge: "รออนุมัติ",
  badgeColor: "#FFCE54",
};

// ---- §7.5 — เตือนวันลาคงเหลือสิ้นปี ----
export const LINE_CARD_LEAVE_BALANCE: LineCardPreviewData = {
  id: "line-leave-balance",
  event: "เตือนวันลาคงเหลือสิ้นปี",
  title: "แจ้งเตือน: วันลาพักร้อนคงเหลือ",
  headerColor: "#3C3B3D",
  lines: [
    { label: "พนักงาน", value: "ธนพล มีสุขทุกวัน (EMP-003)" },
    { label: "ลาพักร้อนคงเหลือ", value: "6 วัน", highlight: true },
    { label: "โควตาทั้งปี", value: "6 วัน / ปี" },
    { label: "หมดอายุ", value: "31 ธันวาคม 2569" },
    { label: "เหลือเวลา", value: "190 วัน" },
    { label: "หมายเหตุ", value: "วันลาที่ไม่ใช้จะหมดอายุสิ้นปี" },
  ],
  footer: "กดเพื่อยื่นลาพักร้อนก่อนหมดปี",
  badge: "ควรใช้",
  badgeColor: "#5D9CEC", // BLUE JEANS/info
};

// รวม array ทั้งหมดสำหรับ settings หน้า LINE
export const ALL_LINE_CARD_PREVIEWS: LineCardPreviewData[] = [
  LINE_CARD_PAYSLIP,
  LINE_CARD_REMINDER,
  LINE_CARD_LEAVE_APPROVAL,
  LINE_CARD_LEAVE_SUBMIT,
  LINE_CARD_LEAVE_BALANCE,
];

// การตั้งค่าเริ่มต้น (event toggle) สำหรับหน้า settings LINE
export const LINE_DEFAULT_SETTINGS: Record<string, boolean> = {
  "line-payslip": true,
  "line-reminder": true,
  "line-leave-approval": true,
  "line-leave-submit": true,
  "line-leave-balance": false, // ปิด default — ส่งเฉพาะปลายปี
};
