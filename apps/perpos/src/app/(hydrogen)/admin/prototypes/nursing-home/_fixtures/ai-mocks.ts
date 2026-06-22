// ai-mocks.ts — canned AI responses สำหรับ prototype (A1, A3, A4, A6)
// โครง output ตรงตาม spec §8 — production ต่อ @/lib/ai/client ได้ทันที

// ---- A1 — เตือนความเสี่ยงจาก vital (res-001 สมจิตร) ----
// trigger: flag = abnormal ความดัน 172/101 วันที่ 3
export const MOCK_VITAL_INSIGHT_A1: {
  resident_id: string;
  resident_name: string;
  flag: "normal" | "watch" | "abnormal";
  confidence: number;
  reason: string;
  suggestion: string;
  trend_note: string;
  requires_confirmation: boolean;
  _ai_model: string;
  _ai_provider: string;
} = {
  resident_id: "res-001",
  resident_name: "คุณสมจิตร พันธุ์ดี",
  flag: "abnormal",
  confidence: 0.91,
  reason:
    "ความดันโลหิตของคุณสมจิตรไต่ขึ้นต่อเนื่อง 3 วัน (158/95 → 165/98 → 172/101 mmHg) " +
    "ค่า SBP วันนี้ 172 mmHg เกินค่าเฝ้าระวัง (≥160 mmHg ตามแผนการดูแล) " +
    "พร้อมชีพจรเพิ่มเป็น 88 bpm และ SpO2 ลดเหลือ 96%",
  suggestion:
    "แนะนำแจ้งพยาบาลวิชาชีพทันที และแจ้งแพทย์ที่ดูแลเพื่อพิจารณาปรับยา Amlodipine หรือเพิ่ม antihypertensive " +
    "ให้ผู้พักพักนิ่งๆ หลีกเลี่ยงความเครียด ห้ามออกแรง บันทึก vital ทุก 2 ชั่วโมง",
  trend_note:
    "แนวโน้ม 3 วัน: SBP +7, +7 mmHg/วัน — ถ้าไม่ควบคุมอาจแตะ 180+ ภายใน 1–2 วัน ซึ่งเป็น hypertensive urgency",
  requires_confirmation: true,
  _ai_model: "claude-sonnet",
  _ai_provider: "anthropic",
};

// ---- A3 — ร่างรายงานเหตุการณ์ (res-004 สมศักดิ์ล้ม) ----
// input จำลอง: "ลุงศักดิ์ล้มในห้องน้ำตีห้าครึ่ง สะโพกเจ็บ"
export const MOCK_INCIDENT_DRAFT_A3: {
  incident_type: string;
  description: string;
  action_taken: string;
  follow_up: string;
  severity_suggestion: "low" | "moderate" | "high" | "critical";
  confidence: number;
  show_severity_banner: boolean;
  banner_message: string | null;
  _ai_model: string;
  _ai_provider: string;
} = {
  incident_type: "fall",
  description:
    "เวลาประมาณ 05:30 น. พบผู้พัก (คุณสมศักดิ์ ทองมา) นอนอยู่บนพื้นห้องน้ำ ห้อง 104 " +
    "ผู้พักลุกขึ้นไปห้องน้ำคนเดียวโดยไม่กดกริ่งเรียก มีอาการปวดบริเวณสะโพกขวา " +
    "สามารถเดินได้แต่มีอาการปวดชัดเจน ไม่มีบาดแผลเปิดที่มองเห็น สติสัมปชัญญะปกติ",
  action_taken:
    "ประเมิน vital signs: BP 138/85, HR 78, SpO2 97% — ทุกค่าอยู่ในเกณฑ์ปกติ " +
    "ตรวจสอบข้อสะโพกเบื้องต้น ไม่พบรูปทรงผิดปกติ จัดให้นอนพักบนเตียง ใส่หมอนรองสะโพกขวา " +
    "บันทึกเหตุการณ์และแจ้งพยาบาลวิชาชีพทันที",
  follow_up:
    "1) นัด X-ray สะโพกขวาภายใน 24 ชั่วโมง เพื่อตัดข้อแตกหรือบาดเจ็บภายใน " +
    "2) ปรึกษาแพทย์ผู้ดูแลทราบ " +
    "3) ทบทวนอุปกรณ์ราวจับในห้องน้ำ ห้อง 104 " +
    "4) แจ้งญาติ (ภรรยา — คุณอารีย์) ทราบ " +
    "5) ทบทวนแผนการดูแล — พิจารณา sensor เตียงเพิ่มเติม",
  severity_suggestion: "moderate",
  confidence: 0.85,
  show_severity_banner: false,
  banner_message: null,
  _ai_model: "gpt-4o-mini",
  _ai_provider: "openai",
};

// ---- A4 — สรุปสถานะผู้พักให้ญาติ (res-001 สมจิตร) ----
// ส่งให้: สมชาย พันธุ์ดี (ลูกชาย)
export const MOCK_FAMILY_SUMMARY_A4: {
  resident_id: string;
  resident_name: string;
  generated_for: string;
  period: string;
  summary_text: string;
  highlights: string[];
  tone: "reassuring" | "informative" | "urgent";
  requires_confirmation: boolean;
  _ai_model: string;
  _ai_provider: string;
} = {
  resident_id: "res-001",
  resident_name: "คุณสมจิตร พันธุ์ดี",
  generated_for: "สมชาย พันธุ์ดี (ลูกชาย)",
  period: "17–22 มิถุนายน 2569",
  summary_text:
    "สวัสดีครับ คุณสมชาย\n\n" +
    "คุณสมจิตรในช่วงสัปดาห์ที่ผ่านมาโดยรวมยังแข็งแรงดี ทานอาหารได้ดีทุกมื้อ " +
    "อาบน้ำและทำกิจวัตรประจำวันได้ด้วยตัวเอง\n\n" +
    "อย่างไรก็ตาม ทีมพยาบาลสังเกตพบว่าความดันโลหิตของท่านสูงขึ้นเล็กน้อยในช่วง 3 วันนี้ " +
    "เราได้แจ้งพยาบาลวิชาชีพดูแลอย่างใกล้ชิดแล้ว และกำลังติดตามอย่างต่อเนื่อง " +
    "ท่านได้รับยาตามกำหนดสม่ำเสมอ\n\n" +
    "หากมีคำถามหรือต้องการพูดคุยกับทีมดูแล ยินดีเป็นอย่างยิ่งครับ 🙏",
  highlights: [
    "ทานอาหารได้ดี ครบ 3 มื้อ",
    "ทำกิจวัตรประจำวันได้ด้วยตัวเอง",
    "รับยาสม่ำเสมอตามแผนการรักษา",
    "⚠️ ความดันโลหิตสูงขึ้น — ทีมกำลังติดตามใกล้ชิด",
  ],
  tone: "informative",
  requires_confirmation: true,
  _ai_model: "claude-sonnet",
  _ai_provider: "anthropic",
};

// ---- A6 — สรุปส่งเวร (เวรเช้า 22 มิ.ย. → บ่าย) ----
// pre-aggregate ด้วย rule-based ก่อนส่ง AI
export const MOCK_SHIFT_HANDOVER_A6: {
  shift_date: string;
  shift_type: "morning" | "afternoon" | "night";
  handover_from: string;
  handover_to: string;
  handover_summary: string;
  watch_list: Array<{
    resident_id: string;
    resident_name: string;
    reason: string;
    priority: "high" | "medium" | "low";
  }>;
  pending_actions: string[];
  stats: {
    total_residents: number;
    vitals_abnormal: number;
    vitals_watch: number;
    meds_missed: number;
    meds_refused: number;
    meds_held: number;
    incidents_open: number;
  };
  _ai_model: string;
  _ai_provider: string;
} = {
  shift_date: "2026-06-22",
  shift_type: "morning",
  handover_from: "นิภา มีสุข (เวรเช้า)",
  handover_to: "ศิริพร แดงดี + วิทยา ทองใหม่ (เวรบ่าย)",
  handover_summary:
    "เวรเช้า 22 มิ.ย. 69 — ผู้พักอยู่ดูแล 10 คน มีเหตุการณ์สำคัญ 2 จุดต้องติดตามต่อ\n\n" +
    "จุดสำคัญที่สุด: (1) คุณบุญมี (ห้อง 201) SpO2 ลดลง 93% ช่วงเช้า ให้ O2 nasal แล้ว SpO2 กลับมา 96% " +
    "แต่ยังต้องติดตามทุก 2 ชม. และรอแพทย์ review " +
    "(2) คุณสมจิตร (ห้อง 101) ความดันสูงต่อเนื่อง 3 วัน วันนี้ 172/101 พยาบาลแจ้งแล้ว รอคำสั่งปรับยา\n\n" +
    "ยา: เวรนี้ให้ยาครบ 10 รอบ ยกเว้น Allopurinol ของคุณสมศักดิ์ (ปฏิเสธ) และ Bisoprolol ของคุณประเสริฐ (hold HR ต่ำ) " +
    "และ Furosemide ของคุณบุญมีที่พลาดตอนเช้า กรุณาติดตามครบในเวรบ่าย\n\n" +
    "incident: คุณสมศักดิ์ล้มในห้องน้ำตีห้าครึ่ง สะโพกเจ็บ — กำลังสืบสวน รอ X-ray พรุ่งนี้เช้า",
  watch_list: [
    {
      resident_id: "res-005",
      resident_name: "คุณบุญมี รุ่งเรือง (ห้อง 201)",
      reason: "SpO2 93% ช่วงเช้า — กำลังให้ O2, รอแพทย์ review, ติดตาม SpO2 ทุก 2 ชม.",
      priority: "high",
    },
    {
      resident_id: "res-001",
      resident_name: "คุณสมจิตร พันธุ์ดี (ห้อง 101)",
      reason: "ความดันสูงต่อเนื่อง 3 วัน วันนี้ 172/101 — รอคำสั่งปรับยาจากแพทย์",
      priority: "high",
    },
    {
      resident_id: "res-004",
      resident_name: "คุณสมศักดิ์ ทองมา (ห้อง 104)",
      reason: "ล้มในห้องน้ำ 05:30 — สะโพกเจ็บ, รอ X-ray, ห้ามลุกเองคนเดียว",
      priority: "high",
    },
    {
      resident_id: "res-010",
      resident_name: "คุณประเสริฐ วงษ์ทอง (ห้อง 301)",
      reason: "HR 52 bpm — hold Bisoprolol รอ review, น้ำหนักขึ้น 1.5 กก. เฝ้าระวังบวมน้ำ",
      priority: "medium",
    },
    {
      resident_id: "res-008",
      resident_name: "คุณมานพ ศรีสุข (ห้อง 203)",
      reason: "ไข้ต่ำๆ 37.7°C ตอนเช้า — ติดตามอุณหภูมิเวรบ่าย",
      priority: "medium",
    },
  ],
  pending_actions: [
    "ติดตาม SpO2 คุณบุญมี — ทุก 2 ชม. บันทึกผล",
    "รอคำสั่งแพทย์เรื่องยา Bisoprolol คุณประเสริฐ (HR ต่ำ)",
    "ให้ยา Furosemide คุณบุญมีที่พลาดช่วงเช้า — ตามแนวทางพยาบาล",
    "ให้ยา Allopurinol คุณสมศักดิ์ทดแทน ถ้ายินยอม หรือบันทึกสาเหตุ",
    "วัด vital ซ้ำคุณสมจิตร 15:00 น. และรายงานแพทย์",
    "นัด X-ray สะโพก คุณสมศักดิ์ — ประสานฝ่ายธุรการ",
    "ติดตามอุณหภูมิ คุณมานพ หากสูงถึง 38°C แจ้งพยาบาลวิชาชีพ",
    "ยา Donepezil คุณนงลักษณ์ (21:00) และ Insulin คุณบุญมี (22:00) — pending เวรดึก",
  ],
  stats: {
    total_residents: 10,
    vitals_abnormal: 2,
    vitals_watch: 3,
    meds_missed: 1,
    meds_refused: 1,
    meds_held: 1,
    incidents_open: 2,
  },
  _ai_model: "claude-sonnet",
  _ai_provider: "anthropic",
};

// ---- A2 — mock เบา (voice-to-log placeholder) ----
export const MOCK_VOICE_LOG_PLACEHOLDER = {
  feature: "A2 — บันทึกด้วยเสียง",
  status: "coming_soon",
  label: "เร็วๆ นี้",
  message:
    "ฟีเจอร์บันทึกด้วยเสียง (Voice → Daily Care Log) กำลังพัฒนา " +
    "ต้องการเปิดใช้งานเพิ่มเติม (bucket เก็บเสียง + STT worker) " +
    "ติดต่อทีม PERPOS เพื่อเปิดใช้",
  requires_setup: ["storage_bucket", "stt_worker"],
} as const;

// ---- Dashboard AI Insight Card (ใช้ใน dashboard) ----
export const MOCK_DASHBOARD_AI_INSIGHTS = [
  {
    id: "ai-dash-001",
    type: "vital_alert",
    priority: "high",
    title: "ความดันสูงต่อเนื่อง 3 วัน",
    detail: "คุณสมจิตร พันธุ์ดี — SBP ขึ้นจาก 158 → 172 mmHg ควรแจ้งแพทย์",
    resident_id: "res-001",
    action_label: "ดูแนวโน้ม",
    action_href: "/vitals?resident=res-001",
  },
  {
    id: "ai-dash-002",
    type: "vital_alert",
    priority: "high",
    title: "SpO2 ต่ำ",
    detail: "คุณบุญมี รุ่งเรือง — SpO2 93% ช่วงเช้า อยู่ระหว่างรับ O2",
    resident_id: "res-005",
    action_label: "ดูรายละเอียด",
    action_href: "/vitals?resident=res-005",
  },
  {
    id: "ai-dash-003",
    type: "incident_open",
    priority: "high",
    title: "Incident ใหม่ — ล้ม",
    detail: "คุณสมศักดิ์ ทองมา ล้มห้องน้ำ 05:30 สะโพกเจ็บ — กำลังสืบสวน",
    resident_id: "res-004",
    action_label: "ดู Incident",
    action_href: "/incidents?id=inc-001",
  },
] as const;
