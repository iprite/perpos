// ai-mocks.ts — canned AI responses สำหรับ prototype HRM (4 จุด §6)
// โครง output ตรงตาม spec §6 — production ต่อ @/lib/ai/client ได้ทันที
// NOTE: ไฟล์นี้ใช้ภาษาไทยล้วน ตามคุณค่า module
// LINE Flex hex color ใน line-mocks.ts เป็นข้อยกเว้นตั้งใจ (LINE render นอก Tailwind)

// ---- AI §6.1 — สรุปต้นทุนพนักงานรายเดือน + insight (dashboard) ----
export const MOCK_AI_COST_SUMMARY: {
  period: string;
  total_employer_cost: number;
  vs_last_month_amount: number;
  vs_last_month_pct: number;
  summary_text: string;
  insights: string[];
  breakdown: Array<{ label: string; amount: number; note?: string }>;
  _ai_model: string;
  _ai_provider: string;
} = {
  period: "มิถุนายน 2569",
  total_employer_cost: 221280,
  vs_last_month_amount: 5980,
  vs_last_month_pct: 2.77,
  summary_text:
    "ต้นทุนพนักงานรวมเดือนมิถุนายน 2569 อยู่ที่ 221,280 บาท เพิ่มขึ้น 5,980 บาท (+2.8%) " +
    "จากเดือนพฤษภาคม สาเหตุหลักมาจากค่าล่วงเวลาที่เพิ่มขึ้นของฝ่ายเทคโนโลยีและการตลาด " +
    "รวม 12.5 ชั่วโมง OT ในเดือนนี้ ซึ่งสูงกว่าค่าเฉลี่ย 3 เดือนที่ผ่านมา (" +
    "เม.ย. 6 ชม. / พ.ค. 8 ชม. / มิ.ย. 12.5 ชม.)\n\n" +
    "ส่วนที่ควรติดตาม: ค่า OT ของนายกิตติศักดิ์ (6 ชม.) สูงสุดในรอบนี้ " +
    "อาจบ่งชี้ถึงปริมาณงานล้นหรือขาดคนช่วยในฝ่ายเทคโนโลยี",
  insights: [
    "OT รวมเดือนนี้ 12.5 ชม. (+56% จากเดือนก่อน) — ฝ่ายเทคโนโลยี+การตลาดทำงานเกินเวลา",
    "ต้นทุนปกส.นายจ้างรวม 4,500 บาท — ครบ 6 คน (ยกเว้นช่างภาพรายวันที่ไม่มี ssn)",
    "ปาลิตา ขาดงาน 1 วัน (22 มิ.ย.) ยังไม่มีใบลา — ควรตรวจสอบ",
    "ธนพล สัญญาหมดอายุ 18 ก.ค. (24 วัน) — ควรตัดสินใจต่อสัญญาเร็วๆ นี้",
  ],
  breakdown: [
    { label: "เงินเดือนรวม", amount: 207501, note: "7 พนักงาน" },
    { label: "ค่าล่วงเวลา (OT)", amount: 3901, note: "12.5 ชม. รวม 4 คน" },
    { label: "เบี้ยขยัน", amount: 1000 },
    { label: "ค่าตำแหน่ง", amount: 3000 },
    { label: "ปกส.ฝั่งนายจ้าง", amount: 4500, note: "6 คน x 750 บาท" },
    { label: "กองทุนสำรองฯ ฝั่งนายจ้าง", amount: 5580, note: "6 คน x 3%" },
  ],
  _ai_model: "claude-sonnet",
  _ai_provider: "anthropic",
};

// ---- AI §6.2 — ตรวจความผิดปกติก่อนปิดรอบเงินเดือน (payroll guard) ----
export const MOCK_AI_PAYROLL_ANOMALIES: {
  run_id: string;
  period: string;
  checked_at: string;
  flags: Array<{
    id: string;
    severity: "warning" | "error" | "info";
    employee_id: string | null;
    employee_name: string | null;
    category: string;
    message: string;
    suggestion: string;
  }>;
  all_clear: boolean;
  _ai_model: string;
  _ai_provider: string;
} = {
  run_id: "run-2026-06",
  period: "มิถุนายน 2569",
  checked_at: "2026-06-24T10:30:00Z",
  flags: [
    {
      id: "flag-001",
      severity: "warning",
      employee_id: "emp-005",
      employee_name: "กิตติศักดิ์ รุ่งโรจน์",
      category: "OT",
      message:
        "OT สะสม 6 ชั่วโมงในสัปดาห์เดียว (1–5 มิ.ย.) ใกล้เกณฑ์ 36 ชม./สัปดาห์ที่กฎหมายคุ้มครองแรงงานกำหนด",
      suggestion:
        "ตรวจสอบรายละเอียด OT รายสัปดาห์ และวางแผนกระจายงาน หากเกิน 36 ชม./สัปดาห์อาจมีความผิดตาม พ.ร.บ.คุ้มครองแรงงาน",
    },
    {
      id: "flag-002",
      severity: "error",
      employee_id: "emp-004",
      employee_name: "ปาลิตา แสงทอง",
      category: "การขาดงาน",
      message: "บันทึก 'ขาดงาน' วันที่ 22 มิ.ย. โดยไม่มีใบลา — ยังไม่มีใบลาอนุมัติหรือแจ้งเหตุผล",
      suggestion:
        "ขอใบรับรองเหตุผลการขาดงานก่อนปิดรอบ หรือหักค่าจ้าง 1 วัน (22,000/22 = 1,000 บาท) ตามนโยบายบริษัท",
    },
    {
      id: "flag-003",
      severity: "warning",
      employee_id: "emp-007",
      employee_name: "อรรถพล สีดา",
      category: "ประกันสังคม",
      message: "ช่างภาพรายวันไม่มีเลขประกันสังคม (ssn=null) — ไม่ได้หักปกส. ในรอบนี้",
      suggestion:
        "ตรวจสอบว่านายอรรถพลเข้าเกณฑ์ประกันสังคม (ทำงาน ≥1 เดือน) หรือไม่ หากเข้าเกณฑ์ให้ขึ้นทะเบียนและแจ้ง สปส.",
    },
    {
      id: "flag-004",
      severity: "info",
      employee_id: "emp-003",
      employee_name: "ธนพล มีสุขทุกวัน",
      category: "สัญญา",
      message:
        "สัญญาจ้างหมดอายุ 18 ก.ค. 2569 (24 วัน) — ใบลาพักร้อน 2 วัน (7–8 ก.ค.) รออนุมัติอยู่",
      suggestion: "แจ้งผลการต่อสัญญาให้พนักงานทราบก่อนสิ้นเดือนมิถุนายน เพื่อวางแผนรับรู้ล่วงหน้า",
    },
  ],
  all_clear: false,
  _ai_model: "gpt-4o-mini",
  _ai_provider: "openai",
};

// ---- AI §6.3 — ร่างหนังสือรับรองเงินเดือน (documents) ----
export const MOCK_AI_SALARY_CERT_DRAFT: {
  employee_id: string;
  employee_name: string;
  purpose: string;
  issued_date: string;
  doc_text: string;
  requires_confirmation: boolean;
  _ai_model: string;
  _ai_provider: string;
} = {
  employee_id: "emp-002",
  employee_name: "นภาพร ดาวเรือง",
  purpose: "ขอกู้รถยนต์ธนาคาร",
  issued_date: "2026-06-24",
  doc_text: `หนังสือรับรองเงินเดือน

วันที่  24  มิถุนายน  พ.ศ. 2569

เรื่อง  รับรองเงินเดือน นางสาวนภาพร ดาวเรือง

เรียน  ผู้เกี่ยวข้อง

          บริษัท ครีเอทีฟ สตูดิโอ จำกัด ขอรับรองว่า นางสาวนภาพร ดาวเรือง อายุ 30 ปี
เลขบัตรประชาชน 3-4005-00234-56-7 ปัจจุบันดำรงตำแหน่ง นักออกแบบกราฟิก
สังกัดแผนกออกแบบ ได้ทำงานกับบริษัทฯ ตั้งแต่วันที่ 1 เมษายน 2566 จนถึงปัจจุบัน
มีอัตราเงินเดือน เดือนละ 28,000 บาท (สองหมื่นแปดพันบาทถ้วน)
และมีสถานภาพการจ้างงานเป็นพนักงานประจำ

          หนังสือรับรองฉบับนี้ออกให้เพื่อใช้ประกอบการยื่นขอสินเชื่อรถยนต์ธนาคาร
และเพื่อเป็นหลักฐานยืนยันรายได้เท่านั้น

ลงชื่อ ...............................................
(นายสุรชัย วงศ์พิทักษ์)
ผู้จัดการทั่วไป / ผู้มีอำนาจลงนาม
บริษัท ครีเอทีฟ สตูดิโอ จำกัด
โทร. 081-234-5678`,
  requires_confirmation: true,
  _ai_model: "claude-sonnet",
  _ai_provider: "anthropic",
};

// ---- AI §6.4 — Q&A กฎ HR ไทย (ตัวอย่าง 3 คำถาม) ----
export const MOCK_AI_HR_QA: Array<{
  id: string;
  question: string;
  answer: string;
  sources: string[];
  _ai_model: string;
  _ai_provider: string;
}> = [
  {
    id: "qa-001",
    question: "ลาป่วยกี่วันได้รับค่าจ้าง?",
    answer:
      "ตามพระราชบัญญัติคุ้มครองแรงงาน พ.ศ. 2541 มาตรา 32 ลูกจ้างมีสิทธิลาป่วยได้เท่าที่ป่วยจริง " +
      "และนายจ้างต้องจ่ายค่าจ้างในวันลาป่วยไม่เกิน 30 วันทำงาน/ปี\n\n" +
      "หมายเหตุ: ถ้าลาป่วยเกิน 3 วันทำงานติดต่อกัน นายจ้างมีสิทธิ์ขอใบรับรองแพทย์",
    sources: ["พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541 มาตรา 32"],
    _ai_model: "gpt-4o-mini",
    _ai_provider: "openai",
  },
  {
    id: "qa-002",
    question: "ประกันสังคมหักเงินเดือนเท่าไหร่ และนายจ้างต้องจ่ายเพิ่มไหม?",
    answer:
      "ประกันสังคม (สปส.) หักจากเงินเดือนลูกจ้าง 5% ของเงินเดือน แต่ไม่เกินฐาน 15,000 บาท " +
      "ดังนั้นหักสูงสุด 750 บาท/เดือน\n\n" +
      "นายจ้างต้องสมทบในอัตราเท่ากัน 5% สูงสุด 750 บาท/เดือน\n\n" +
      "รวมนำส่ง สปส. = 1,500 บาท/คน/เดือน (ลูกจ้าง 750 + นายจ้าง 750)\n\n" +
      "ต้องนำส่งภายในวันที่ 15 ของเดือนถัดไป",
    sources: ["พ.ร.บ.ประกันสังคม พ.ศ. 2533 มาตรา 46", "ประกาศ สปส. อัตราเงินสมทบ ปี 2566"],
    _ai_model: "gpt-4o-mini",
    _ai_provider: "openai",
  },
  {
    id: "qa-003",
    question: "พนักงานทดลองงานครบกำหนดแล้ว ต้องทำอะไรบ้าง?",
    answer:
      "เมื่อพนักงานครบระยะทดลองงาน (ปกติ 90-120 วัน) นายจ้างควรดำเนินการ:\n\n" +
      "1. แจ้งผลการทดลองงาน — ผ่านหรือไม่ผ่าน (เป็นลายลักษณ์อักษร)\n" +
      "2. หากผ่าน: ออกหนังสือยืนยันการบรรจุ + เริ่มสิทธิ์พักร้อน/ลากิจตามสัญญา\n" +
      "3. หากไม่ผ่าน: แจ้งยุติการจ้างงาน โดยไม่ต้องจ่ายค่าชดเชยถ้าทำงาน < 120 วัน\n\n" +
      "ข้อควรระวัง: ถ้าไม่แจ้งผลและยังให้ทำงานต่อ → ถือว่าบรรจุถาวรโดยปริยาย",
    sources: ["พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541 มาตรา 17, 118"],
    _ai_model: "gpt-4o-mini",
    _ai_provider: "openai",
  },
];

// ---- Dashboard AI Summary Card (compact — ใช้ใน dashboard) ----
export const MOCK_AI_DASHBOARD_INSIGHTS = [
  {
    id: "ai-hrm-001",
    type: "cost_alert" as const,
    priority: "warning" as const,
    title: "OT พุ่ง +56% จากเดือนก่อน",
    detail: "ฝ่ายเทคโนโลยีและการตลาด OT รวม 12.5 ชม. — อาจต้องวางแผนกำลังคน",
    action_label: "ดูรายงานต้นทุน",
  },
  {
    id: "ai-hrm-002",
    type: "anomaly" as const,
    priority: "error" as const,
    title: "ขาดงานไม่มีใบลา — ปาลิตา (22 มิ.ย.)",
    detail: "พบบันทึกขาดงานโดยไม่มีใบลาอนุมัติ ควรแก้ไขก่อนปิดรอบ",
    action_label: "ดูรอบเงินเดือน",
  },
  {
    id: "ai-hrm-003",
    type: "reminder" as const,
    priority: "info" as const,
    title: "สัญญาธนพลหมด 24 วัน",
    detail: "ต้องตัดสินใจต่อสัญญาก่อน 18 ก.ค. 2569",
    action_label: "ดูแฟ้มพนักงาน",
  },
] as const;
