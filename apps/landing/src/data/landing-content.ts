export const APP_URL = "https://app.perpos.io/signin";

export const navigationItems = [
  { label: "ฟีเจอร์", href: "#features" },
  { label: "โมดูล", href: "#modules" },
  { label: "LINE Bot", href: "#line-assistant" },
  { label: "ราคา", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export const heroContent = {
  badge: "ระบบ ERP & บัญชี สำหรับธุรกิจไทย",
  headline: {
    lead: "บริหารบัญชีและธุรกิจ",
    accent: "ครบ จบ ในที่เดียว",
  },
  subheadline:
    "PERPOS รวมงานขาย งานซื้อ บัญชี ภาษี และเงินเดือน พร้อมผู้ช่วย AI ผ่าน LINE — แพลตฟอร์มเดียวที่ออกแบบมาเพื่อ SME ไทยโดยเฉพาะ",
  primaryCta: {
    label: "ติดต่อทีมงาน",
    href: "mailto:contact@perpos.io",
  },
  secondaryCta: {
    label: "ดูฟีเจอร์ทั้งหมด",
    href: "#features",
  },
  highlights: ["ออกแบบสำหรับ SME ไทย", "รองรับภาษีไทยครบถ้วน", "ผู้ช่วย AI ผ่าน LINE"],
};

export const statsContent = [
  { value: "1,000+", label: "ธุรกิจที่ไว้วางใจ" },
  { value: "20+", label: "ประเภทเอกสารบัญชี" },
  { value: "99.9%", label: "ความเสถียรของระบบ" },
  { value: "24/7", label: "ผู้ช่วยผ่าน LINE" },
];

export const featuresContent = [
  {
    icon: "BookOpen",
    title: "บัญชีและงบการเงิน",
    description:
      "ผังบัญชี สมุดรายวัน งบดุล งบกำไรขาดทุน และงบกระแสเงินสด แบบเรียลไทม์",
  },
  {
    icon: "ShoppingCart",
    title: "งานขายครบวงจร",
    description:
      "ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ใบกำกับภาษี และ e-Tax Invoice ครบทุกขั้นตอน",
  },
  {
    icon: "Package",
    title: "งานซื้อและสต๊อก",
    description:
      "ใบสั่งซื้อ บันทึกค่าใช้จ่าย รับสินค้า และจัดการคลังสินค้าอย่างเป็นระบบ",
  },
  {
    icon: "Percent",
    title: "ภาษีไทยครบถ้วน",
    description:
      "ภ.พ.30 ภ.ง.ด.1/2/3/53 ภาษีหัก ณ ที่จ่าย ตามมาตรฐานกรมสรรพากร",
  },
  {
    icon: "Users",
    title: "เงินเดือนพนักงาน",
    description:
      "คำนวณเงินเดือน ประกันสังคม กองทุนสำรองเลี้ยงชีพ พร้อมบันทึกบัญชีอัตโนมัติ",
  },
  {
    icon: "MessageSquare",
    title: "ผู้ช่วย AI ผ่าน LINE",
    description:
      "บันทึกรายรับรายจ่าย สร้างนัดหมาย และติดตามงานได้ทันทีผ่าน LINE",
  },
];

export const lineCommands = [
  {
    command: "/รายรับ 5000 ขายของ",
    description: "บันทึกรายรับผ่าน LINE",
    result: "✅ บันทึกรายรับ 5,000 บาท เรียบร้อยแล้ว",
  },
  {
    command: "/นัด 14:00 ประชุมลูกค้า",
    description: "สร้างนัดหมายวันนี้",
    result: "📅 สร้างนัดหมายเรียบร้อยแล้ว เวลา 14:00 น.",
  },
  {
    command: "/ข่าว",
    description: "สรุปข่าวอัตโนมัติ",
    result: "📰 สรุปข่าววันนี้: 3 ข่าว ข้อมูลเศรษฐกิจ...",
  },
  {
    command: "/tk",
    description: "ดูรายการงานที่รอ",
    result: "📋 งานที่รอดำเนินการ: 5 รายการ",
  },
];

export const lineBenefits = [
  "บันทึกรายรับ–รายจ่ายได้ทันที ไม่ต้องเปิดคอม",
  "สร้างและติดตามงานพร้อมแจ้งเตือนอัตโนมัติ",
  "จัดการนัดหมายและซิงก์กับ Google Calendar",
  "รับสรุปข่าวและรายงานประจำวันอัตโนมัติ",
];

export const modulesContent = [
  { name: "บัญชี", icon: "Calculator", description: "สมุดรายวัน ผังบัญชี งบการเงิน" },
  { name: "การขาย", icon: "Receipt", description: "ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ" },
  { name: "การซื้อ", icon: "ShoppingBag", description: "ใบสั่งซื้อ บันทึกค่าใช้จ่าย" },
  { name: "สินค้า/สต๊อก", icon: "Boxes", description: "จัดการสินค้าและคลังสินค้า" },
  { name: "เงินเดือน", icon: "Wallet", description: "คำนวณเงินเดือนและกองทุน" },
  { name: "ภาษี", icon: "FileText", description: "ภ.พ.30 ภ.ง.ด. และ WHT" },
  { name: "ธนาคาร", icon: "Landmark", description: "เช็ค กระทบยอด เงินสดย่อย" },
  { name: "นัดหมาย", icon: "CalendarCheck", description: "ตารางงานและการแจ้งเตือน" },
];

export const whyContent = [
  {
    icon: "Globe",
    title: "ออกแบบเพื่อธุรกิจไทย",
    description: "เอกสาร ภาษี และภาษาไทยครบถ้วนตามมาตรฐานกรมสรรพากร",
  },
  {
    icon: "ShieldCheck",
    title: "ปลอดภัยระดับองค์กร",
    description: "ปกป้องข้อมูลด้วย Row Level Security แยกข้อมูลแต่ละองค์กรชัดเจน",
  },
  {
    icon: "Layers",
    title: "รองรับหลายองค์กร",
    description: "บริหารหลายบริษัทในบัญชีเดียว สลับองค์กรได้ในคลิกเดียว",
  },
  {
    icon: "Zap",
    title: "ใช้งานง่าย รวดเร็ว",
    description: "อินเทอร์เฟซที่เข้าใจง่าย เริ่มต้นใช้งานได้ทันทีโดยไม่ต้องอบรม",
  },
];

export const pricingContent = [
  {
    name: "Starter",
    price: "990",
    period: "เดือน",
    description: "สำหรับร้านค้าเล็กที่เพิ่งเริ่มต้น",
    features: [
      "ผู้ใช้ 1-2 คน",
      "บัญชีพื้นฐาน",
      "ใบเสนอราคา/ใบแจ้งหนี้",
      "LINE Bot Assistant",
      "สนับสนุนทางอีเมล",
    ],
    cta: "ติดต่อทีมงาน",
    popular: false,
  },
  {
    name: "Professional",
    price: "2,490",
    period: "เดือน",
    description: "สำหรับธุรกิจที่ต้องการเติบโต",
    features: [
      "ผู้ใช้ 3-10 คน",
      "ระบบครบทุกโมดูล",
      "รายงานภาษีมูลค่าเพิ่ม",
      "LINE Bot + News Agent",
      "สนับสนุน 24/7",
      "Google Calendar Sync",
    ],
    cta: "ติดต่อทีมงาน",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "ติดต่อ",
    period: "",
    description: "สำหรับองค์กรขนาดใหญ่",
    features: [
      "ผู้ใช้ไม่จำกัด",
      "Custom integrations",
      "Dedicated support",
      "On-premise option",
      "Training included",
      "SLA guarantee",
    ],
    cta: "ติดต่อทีมขาย",
    popular: false,
  },
];

export const faqContent = [
  {
    question: "ต้องติดตั้งอะไรไหม?",
    answer:
      "ไม่ต้องติดตั้งอะไรเลย ใช้งานผ่านเว็บเบราว์เซอร์และ LINE ได้ทันที รองรับทั้งคอมพิวเตอร์ แท็บเล็ต และมือถือ",
  },
  {
    question: "ข้อมูลของฉันปลอดภัยไหม?",
    answer:
      "ข้อมูลของคุณถูกเก็บบน Google Cloud ที่ Singapore พร้อมการเข้ารหัสทุก transaction เรามีมาตรการรักษาความปลอดภัยระดับองค์กรและ backup ข้อมูลทุกวัน",
  },
  {
    question: "มีทดลองใช้ฟรีไหม?",
    answer:
      "มีค่ะ คุณสามารถทดลองใช้ PERPOS ได้ฟรี 14 วัน โดยไม่ต้องใส่ข้อมูลบัตรเครดิต หลังจากนั้นสามารถเลือกแพ็กเกจที่เหมาะกับธุรกิจของคุณ",
  },
  {
    question: "Support ภาษาไทยได้ไหม?",
    answer:
      "ได้แน่นอนค่ะ มีทีม support ภาษาไทยตลอด 24 ชั่วโมง ผ่านทาง LINE Official Account และอีเมล",
  },
  {
    question: "สามารถเชื่อมต่อกับระบบอื่นได้ไหม?",
    answer:
      "สามารถเชื่อมต่อกับ Google Drive, Google Calendar ได้ทันที และมี API สำหรับการ integrate กับระบบอื่นๆ ตามแพ็กเกจที่เลือก",
  },
];

export const footerContent = {
  brand: {
    name: "PERPOS",
    description:
      "ระบบบัญชีและ ERP สำหรับธุรกิจ SME ไทย พร้อม LINE Bot assistant อัจฉริยะ บริหารธุรกิจได้ทุกที่ทุกเวลา",
  },
  columns: [
    {
      title: "ผลิตภัณฑ์",
      links: [
        { label: "ฟีเจอร์", href: "#features" },
        { label: "โมดูล", href: "#modules" },
        { label: "LINE Bot", href: "#line-assistant" },
        { label: "ราคา", href: "#pricing" },
      ],
    },
    {
      title: "บริษัท",
      links: [
        { label: "คำถามที่พบบ่อย", href: "#faq" },
        { label: "ติดต่อเรา", href: "mailto:contact@perpos.io" },
        { label: "เข้าสู่ระบบ", href: APP_URL },
      ],
    },
    {
      title: "กฎหมาย",
      links: [
        { label: "นโยบายความเป็นส่วนตัว", href: "/privacy" },
        { label: "เงื่อนไขการใช้งาน", href: "/terms" },
      ],
    },
  ],
  copyright: `© ${new Date().getFullYear()} P2P Solutions. สงวนลิขสิทธิ์.`,
};
