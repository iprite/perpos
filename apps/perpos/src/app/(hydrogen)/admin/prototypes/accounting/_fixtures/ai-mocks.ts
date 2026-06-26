// ai-mocks.ts — canned AI responses ครบ 5 ตัว (§6)
// prototype mock: ไม่ต่อ AI จริง → โชว์ผล canned + loading จำลอง
// production: aiChat(unified client) + prompt versioned + audit

// ---- AI-1: แนะหมวดค่าใช้จ่าย (A2 dialog) ----

export interface CategorizeMockResult {
  category: string;
  confidence: number; // 0–1
  reason: string;
  alternatives: Array<{ category: string; confidence: number }>;
  requires_confirmation: boolean; // conf < 0.8 หรือยอดสูง
}

/** keyword → mock result (AI-1) */
export const categorizeMocks: Record<string, CategorizeMockResult> = {
  เช่า: {
    category: "ค่าเช่า",
    confidence: 0.97,
    reason: "คำว่า 'เช่า' และ 'ค่าเช่าสำนักงาน' ตรงหมวดนี้โดยตรง",
    alternatives: [{ category: "ค่าใช้จ่ายในการบริหาร", confidence: 0.03 }],
    requires_confirmation: false,
  },
  ไฟฟ้า: {
    category: "ค่าสาธารณูปโภค",
    confidence: 0.95,
    reason: "ค่าไฟฟ้าจัดเป็นสาธารณูปโภค",
    alternatives: [{ category: "ค่าใช้จ่ายในการบริหาร", confidence: 0.05 }],
    requires_confirmation: false,
  },
  น้ำ: {
    category: "ค่าสาธารณูปโภค",
    confidence: 0.92,
    reason: "ค่าน้ำประปาจัดเป็นสาธารณูปโภค",
    alternatives: [{ category: "ค่าใช้จ่ายในการบริหาร", confidence: 0.08 }],
    requires_confirmation: false,
  },
  โฆษณา: {
    category: "ค่าการตลาดและโฆษณา",
    confidence: 0.94,
    reason: "ค่าโฆษณา Facebook/Google Ads = หมวดการตลาด",
    alternatives: [{ category: "ค่าใช้จ่ายในการบริหาร", confidence: 0.06 }],
    requires_confirmation: false,
  },
  เงินเดือน: {
    category: "เงินเดือนและค่าจ้าง",
    confidence: 0.99,
    reason: "เงินเดือนพนักงาน = หมวดนี้โดยตรง",
    alternatives: [],
    requires_confirmation: false,
  },
  ฟรีแลนซ์: {
    category: "ต้นทุนขาย/บริการ (COGS)",
    confidence: 0.72,
    reason: "ค่าจ้างฟรีแลนซ์อาจเป็นต้นทุนบริการหรือค่าใช้จ่ายบริหาร",
    alternatives: [
      { category: "ค่าใช้จ่ายในการบริหาร", confidence: 0.2 },
      { category: "เงินเดือนและค่าจ้าง", confidence: 0.08 },
    ],
    requires_confirmation: true, // conf < 0.8
  },
  อุปกรณ์: {
    category: "ค่าวัสดุสิ้นเปลือง",
    confidence: 0.68,
    reason: "อุปกรณ์สำนักงานอาจเป็นวัสดุสิ้นเปลือง หรือสินทรัพย์ถ้าราคาสูง",
    alternatives: [
      { category: "ค่าใช้จ่ายในการบริหาร", confidence: 0.22 },
      { category: "ที่ดิน อาคาร และอุปกรณ์ (สินทรัพย์)", confidence: 0.1 },
    ],
    requires_confirmation: true,
  },
  กาแฟ: {
    category: "ค่าวัสดุสิ้นเปลือง",
    confidence: 0.65,
    reason: "ของใช้ทั่วไปในสำนักงาน อาจเป็นวัสดุหรือสวัสดิการพนักงาน",
    alternatives: [{ category: "ค่าใช้จ่ายในการบริหาร", confidence: 0.35 }],
    requires_confirmation: true,
  },
  // default fallback
  default: {
    category: "ค่าใช้จ่ายในการบริหาร",
    confidence: 0.55,
    reason: "ไม่พบหมวดที่ชัดเจน — AI แนะนำเป็นค่าใช้จ่ายทั่วไป",
    alternatives: [
      { category: "ค่าวัสดุสิ้นเปลือง", confidence: 0.25 },
      { category: "ค่าการตลาดและโฆษณา", confidence: 0.2 },
    ],
    requires_confirmation: true,
  },
};

/** ดึง mock result จาก description (keyword match) */
export function getCategorizeMock(description: string): CategorizeMockResult {
  const desc = description.toLowerCase();
  const keys = Object.keys(categorizeMocks).filter((k) => k !== "default");
  for (const key of keys) {
    if (desc.includes(key)) return categorizeMocks[key];
  }
  return categorizeMocks.default;
}

// ---- AI-2: ช่วยลงบัญชี Dr/Cr (B1 journal dialog) ----

export interface JournalSuggestLine {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
}

export interface JournalSuggestMockResult {
  lines: JournalSuggestLine[];
  explanation: string;
  confidence: number;
  requires_confirmation: boolean;
}

/** category/description → journal suggestion (AI-2) */
export const journalSuggestMocks: Record<string, JournalSuggestMockResult> = {
  "รายได้จากการขาย/บริการ": {
    lines: [
      { account_code: "1100", account_name: "ลูกหนี้การค้า", debit: 0, credit: 0 }, // จะ fill amount
      { account_code: "4100", account_name: "รายได้จากการขาย/บริการ", debit: 0, credit: 0 },
    ],
    explanation: "รายรับจากบริการ: Dr ลูกหนี้ / Cr รายได้",
    confidence: 0.92,
    requires_confirmation: false,
  },
  ค่าเช่า: {
    lines: [
      { account_code: "5200", account_name: "ค่าเช่า", debit: 0, credit: 0 },
      { account_code: "1010", account_name: "เงินสด", debit: 0, credit: 0 },
    ],
    explanation: "จ่ายค่าเช่า: Dr ค่าเช่า / Cr เงินสด (หรือเงินฝาก)",
    confidence: 0.95,
    requires_confirmation: false,
  },
  ค่าสาธารณูปโภค: {
    lines: [
      { account_code: "5300", account_name: "ค่าสาธารณูปโภค", debit: 0, credit: 0 },
      { account_code: "1020", account_name: "เงินฝากธนาคาร", debit: 0, credit: 0 },
    ],
    explanation: "จ่ายค่าสาธารณูปโภค: Dr ค่าสาธารณูปโภค / Cr เงินฝาก",
    confidence: 0.93,
    requires_confirmation: false,
  },
  ค่าการตลาดและโฆษณา: {
    lines: [
      { account_code: "5500", account_name: "ค่าการตลาดและโฆษณา", debit: 0, credit: 0 },
      { account_code: "1020", account_name: "เงินฝากธนาคาร", debit: 0, credit: 0 },
    ],
    explanation: "ค่าโฆษณา: Dr การตลาด / Cr เงินฝาก",
    confidence: 0.9,
    requires_confirmation: false,
  },
  ค่าวัสดุสิ้นเปลือง: {
    lines: [
      { account_code: "5400", account_name: "ค่าวัสดุสิ้นเปลือง", debit: 0, credit: 0 },
      { account_code: "1010", account_name: "เงินสด", debit: 0, credit: 0 },
    ],
    explanation: "ซื้อวัสดุ: Dr วัสดุ / Cr เงินสด",
    confidence: 0.85,
    requires_confirmation: false,
  },
  default: {
    lines: [
      { account_code: "5600", account_name: "ค่าใช้จ่ายในการบริหาร", debit: 0, credit: 0 },
      { account_code: "1020", account_name: "เงินฝากธนาคาร", debit: 0, credit: 0 },
    ],
    explanation: "AI แนะนำเป็นค่าใช้จ่ายทั่วไป — กรุณาตรวจสอบรหัสบัญชีก่อน post",
    confidence: 0.58,
    requires_confirmation: true,
  },
};

// ---- AI-3: สรุปภาษีภาษาคน (A5 "ภาษีของฉัน") ----

export interface TaxSummaryMockResult {
  summary: string;
  action_required: boolean;
  urgency: "urgent" | "normal" | "info";
}

export const taxSummaryMocks: Record<string, TaxSummaryMockResult> = {
  pnd1_ready: {
    summary:
      "เดือนพฤษภาคมมีภาษีเงินเดือนพนักงานที่ต้องยื่น 3,150 บาท ภายในวันที่ 7 มิถุนายน 2569 — อีก 11 วัน แนะนำยื่นออนไลน์ผ่านระบบ e-Filing กรมสรรพากร",
    action_required: true,
    urgency: "urgent",
  },
  pnd1_draft: {
    summary:
      "เดือนมิถุนายนมีภาษีเงินเดือนรออยู่ที่ 3,150 บาท (ยังเป็นฉบับร่าง) — กำหนดยื่น 7 กรกฎาคม 2569 นักบัญชีจะจัดการให้",
    action_required: false,
    urgency: "info",
  },
  no_vat: {
    summary:
      "ธุรกิจของคุณยังไม่ได้จด VAT จึงไม่มี ภ.พ.30 ถ้ายอดขายเกิน 1.8 ล้านบาท/ปี ควรจด VAT ปรึกษานักบัญชีได้",
    action_required: false,
    urgency: "info",
  },
};

// ---- AI-4: ตรวจรายการผิดปกติ (A1 dashboard การ์ดเตือน) ----

export interface AnomalyMockItem {
  entry_id: string;
  description: string;
  issue: string;
  severity: "high" | "medium" | "low";
  suggestion: string;
}

export interface AnomalyMockResult {
  anomalies: AnomalyMockItem[];
  checked_at: string;
  total_checked: number;
}

export const anomalyMocks: AnomalyMockResult = {
  checked_at: "2026-06-26T09:00:00.000Z",
  total_checked: 30,
  anomalies: [
    {
      entry_id: "ent-007",
      description: "ค่าโฆษณา Facebook และ Google Ads เดือนเมษายน",
      issue:
        "หมวด 'ค่าการตลาดและโฆษณา' แต่มีการหักภาษี ณ ที่จ่าย 3% — ปกติโฆษณาออนไลน์ไม่หัก WHT ถ้าจ่ายตรงให้ Meta/Google",
      severity: "medium",
      suggestion: "ตรวจสอบว่าจ่ายผ่านตัวแทนไทยหรือจ่ายโดยตรง ถ้าจ่ายโดยตรงควรลบ WHT ออก",
    },
    {
      entry_id: "ent-016",
      description: "ค่าจ้างฟรีแลนซ์รายโปรเจกต์ 35,000 บาท",
      issue:
        "จัดหมวดเป็น 'ต้นทุนขาย' แต่ขาด journal entry เชื่อมโยง — ยังไม่ถูกลงบัญชี double-entry",
      severity: "medium",
      suggestion: "ขอให้นักบัญชีลง journal entry Dr ต้นทุน Cr เงินฝาก",
    },
    {
      entry_id: "ent-009",
      description: "รายได้ดอกเบี้ยเงินฝาก 8,000 บาท",
      issue:
        "หักภาษี ณ ที่จ่าย 15% ยอดสูงมาก — ดอกเบี้ย 8,000 บาท ปกติธนาคารพาณิชย์ไทยให้ดอกเบี้ยต่ำมาก อาจเป็นตัวเลขคลาดเคลื่อน",
      severity: "high",
      suggestion: "ตรวจสอบ Statement ธนาคาร และยืนยันยอดดอกเบี้ยที่ได้รับจริง",
    },
  ],
};

// ---- AI-5: ถาม-ตอบบัญชี (A1 ช่องถาม) ----

export interface AskMockResult {
  question: string;
  answer: string;
  references: string[];
  confidence: number;
}

export const askMocks: AskMockResult[] = [
  {
    question: "กำไรเดือนนี้เท่าไหร่",
    answer:
      "เดือนมิถุนายน 2569 รายรับรวม 121,300 บาท รายจ่ายรวม 109,550 บาท กำไรสุทธิประมาณ 11,750 บาท (ยังไม่รวมค่าเสื่อมราคาสินทรัพย์ และรายการที่ยังไม่ลงบัญชี)",
    references: ["acc_entries มิถุนายน 2569"],
    confidence: 0.88,
  },
  {
    question: "ใบแจ้งหนี้ค้างชำระมีกี่ใบ",
    answer:
      "มีใบแจ้งหนี้ค้างชำระ (overdue) 2 ใบ รวมมูลค่า 103,000 บาท ได้แก่ INV-2026-0003 (75,000 บาท จาก ห้างหุ้นส่วน วังทองก่อสร้าง เกินกำหนด 26 วัน) และ INV-2026-0007 (28,000 บาท จาก บ.ครีเอทีฟ เน็ตเวิร์ค เกินกำหนด 40 วัน)",
    references: ["acc_documents status=overdue"],
    confidence: 0.95,
  },
  {
    question: "รายจ่ายหมวดไหนมากสุด",
    answer:
      "ช่วง 3 เดือน (เม.ย.–มิ.ย. 2569) หมวดค่าใช้จ่ายสูงสุด คือ เงินเดือนและค่าจ้าง รวม 175,500 บาท (58,500 บาท/เดือน) รองลงมาคือ ต้นทุนขาย/บริการ 35,000 บาท และค่าเช่า 54,000 บาท",
    references: ["acc_entries kind=expense เม.ย.–มิ.ย. 2569"],
    confidence: 0.91,
  },
  {
    question: "ค่าเสื่อมราคาเดือนนี้เท่าไหร่",
    answer:
      "ค่าเสื่อมราคาสินทรัพย์เดือนมิถุนายน 2569 รวมประมาณ 13,556.67 บาท จาก 5 รายการ (คอมพิวเตอร์ 1,527.78 + จอมอนิเตอร์ 500.00 + กล้อง 1,250.00 + รถยนต์ 9,666.67 + เครื่องพิมพ์ 611.11 บาท)",
    references: ["acc_assets active", "jv-depr-01"],
    confidence: 0.93,
  },
  {
    question: "ต้องยื่นภาษีอะไรเดือนนี้",
    answer:
      "เดือนนี้มี ภาษีเงินเดือนพนักงาน (PND1) พฤษภาคม ยอด 3,150 บาท กำหนดยื่น 7 มิถุนายน 2569 — เหลืออีก 11 วัน ควรรีบดำเนินการ ยื่นออนไลน์ผ่าน e-Filing กรมสรรพากรได้เลย",
    references: ["acc_tax_filings status=ready"],
    confidence: 0.9,
  },
];

/** หา mock ตอบกลับตามคำถาม (keyword match) */
export function getAskMock(question: string): AskMockResult {
  const q = question.toLowerCase();
  for (const mock of askMocks) {
    const keywords = mock.question.toLowerCase().replace(/[?]/g, "").split(" ");
    if (keywords.some((kw) => kw.length > 2 && q.includes(kw))) {
      return mock;
    }
  }
  // fallback
  return {
    question,
    answer:
      "ขออภัย ไม่พบข้อมูลที่ตรงกับคำถามในระบบ prototype นี้ ในระบบจริง AI จะดึงข้อมูลจากบัญชีของคุณโดยตรง",
    references: [],
    confidence: 0,
  };
}
