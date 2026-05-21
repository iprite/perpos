export const navigationItems = [
  { label: "ฟีเจอร์", href: "#features" },
  { label: "LINE Bot", href: "#line-assistant" },
  { label: "ราคา", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export const heroContent = {
  headline: "ระบบบัญชีและ ERP สำหรับ SME ไทย",
  subheadline:
    "บริหารธุรกิจได้ทุกที่ทุกเวลาผ่าน LINE ที่คุณคุ้นเคย พร้อม AI Assistant อัจฉริยะที่ช่วยบันทึกรายรับ รายจ่าย และนัดหมายอัตโนมัติ",
  primaryCta: {
    label: "เริ่มใช้ฟรี",
    href: "https://app.perpos.io/signin",
  },
  secondaryCta: {
    label: "ดูตัวอย่าง",
    href: "#features",
  },
};

export const featuresContent = [
  {
    icon: "BookOpen",
    title: "บัญชีและการเงิน",
    description:
      "ผังบัญชี, สมุดรายวัน, งบการเงิน รายงานภาษี ครบในที่เดียว",
  },
  {
    icon: "ShoppingCart",
    title: "การขาย",
    description:
      "ใบเสนอราคา, ใบแจ้งหนี้, ใบเสร็จ สร้างและติดตามได้ง่าย",
  },
  {
    icon: "Package",
    title: "การซื้อและสต็อก",
    description:
      "ใบสั่งซื้อ, บันทึกค่าใช้จ่าย, จัดการสินค้าและคลังอย่างมีประสิทธิภาพ",
  },
  {
    icon: "Users",
    title: "เงินเดือนและพนักงาน",
    description:
      "ติดตามพนักงาน, กองทุนต่างๆ, ภาษีหัก ณ ที่จ่าย สะดวกรวดเร็ว",
  },
  {
    icon: "Calendar",
    title: "นัดหมายและงาน",
    description:
      "จัดการตารางนัดหมายและงานที่ต้องทำ พร้อมแจ้งเตือนอัตโนมัติ",
  },
  {
    icon: "MessageSquare",
    title: "LINE Bot Assistant",
    description:
      "ทำทุกอย่างผ่าน LINE ที่คุณคุ้นเคย ไม่ต้องเปิดแอปใหม่",
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

export const modulesContent = [
  { name: "บัญชี", icon: "Calculator" },
  { name: "การขาย", icon: "Receipt" },
  { name: "การซื้อ", icon: "ShoppingBag" },
  { name: "สินค้า/สต็อก", icon: "Boxes" },
  { name: "เงินเดือน", icon: "Wallet" },
  { name: "ภาษี", icon: "FileText" },
  { name: "ธนาคาร", icon: "Landmark" },
  { name: "นัดหมาย", icon: "CalendarCheck" },
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
    cta: "เริ่มต้นฟรี",
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
    cta: "เริ่มทดลองใช้",
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
      "ระบบบัญชีและ ERP สำหรับ SME ไทย พร้อม LINE Bot assistant อัจฉริยะ",
  },
  quickLinks: [
    { label: "ฟีเจอร์", href: "#features" },
    { label: "ราคา", href: "#pricing" },
    { label: "ติดต่อเรา", href: "mailto:contact@perpos.io" },
  ],
  legal: [
    { label: "นโยบายความเป็นส่วนตัว", href: "/privacy" },
    { label: "เงื่อนไขการใช้งาน", href: "/terms" },
  ],
  appLinks: [
    {
      label: "เข้าสู่ระบบ",
      href: "https://app.perpos.io/signin",
    },
    {
      label: "สมัครใช้งาน",
      href: "https://app.perpos.io/signup",
    },
  ],
  copyright: `© ${new Date().getFullYear()} PERPOS. สงวนลิขสิทธิ์.`,
};
