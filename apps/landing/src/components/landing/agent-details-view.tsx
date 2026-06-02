"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  X,
  ArrowRight,
  TrendingUp,
  Cpu,
  Layers,
  FileText,
  Clock,
  Play
} from "lucide-react";

// Import all simulation widgets
import SalesWidget from "./agent-widgets/sales-widget";
import MarketingWidget from "./agent-widgets/marketing-widget";
import ProcurementWidget from "./agent-widgets/procurement-widget";
import FinanceWidget from "./agent-widgets/finance-widget";
import HRWidget from "./agent-widgets/hr-widget";
import AdminWidget from "./agent-widgets/admin-widget";
import ExecutiveWidget from "./agent-widgets/executive-widget";
import SimulatorWidget from "./agent-widgets/simulator-widget";

const APP_SIGNIN_URL = "https://app.perpos.io/signin";

const MENU_AGENTS = [
  { name: "Sales Agent", slug: "sales", desc: "เสนอราคาทาง LINE ใน 3 วินาที" },
  { name: "Marketing Agent", slug: "marketing", desc: "วิเคราะห์แคมเปญรายบุคคล" },
  { name: "Procurement Agent", slug: "procurement", desc: "จัดซื้อและมอนิเตอร์สต๊อกสินค้า" },
  { name: "Finance & OCR Agent", slug: "finance", desc: "สแกนบิลและกระทบยอดเงินโอน" },
  { name: "HR & Operations Agent", slug: "hr", desc: "จัดกะกะทัดรัด/สรุป Payroll พนักงาน" },
  { name: "Admin Agent", slug: "admin", desc: "คำนวณแผนการเดินทางขนส่งที่ดีที่สุด" },
  { name: "Executive Assistant", slug: "executive", desc: "สนทนา BI รายงานธุรกิจทันใจ" },
  { name: "Scenario Simulator", slug: "simulator", desc: "ทดลองตัวแปรความเสี่ยง What-If" },
];

interface AgentData {
  title: string;
  category: string;
  role: string;
  metric: string;
  details: string[];
  workflow: string[];
  roi: { label: string; value: string; desc: string }[];
  widgetComponent: React.ComponentType;
  description: string;
}

const AGENTS_DATA: Record<string, AgentData> = {
  sales: {
    title: "Sales Agent",
    category: "Front-Office",
    role: "10x Responsiveness",
    metric: "Automated quotation in 3s",
    details: [
      "สกัดความต้องการลูกค้าจาก LINE OA และเสนอราคาทันทีใน 3 วินาที",
      "มี Lead Scoring คาดการณ์ความน่าจะเป็นในการปิดดีลพร้อมจัดลำดับความสำคัญ",
      "เชื่อมประวัติการซื้อขายในอดีตมาช่วยคำนวณส่วนลดและเสนอขายอัพเซลล์"
    ],
    workflow: [
      "ลูกค้าส่งข้อความสอบถามราคาหรือสั่งซื้อสินค้าผ่านช่องทาง LINE OA",
      "AI Sales Agent ถอดรหัสเจตนาและความต้องการสั่งซื้อด้วย NLP และเช็คระดับสต๊อกคงเหลือ",
      "ดึงข้อมูลลูกค้าสัมพันธ์ ประวัติส่วนลดเฉพาะราย และคำนวณยอดเงินที่ดีที่สุดโดยอัตโนมัติ",
      "ร่างใบเสนอราคาและสร้าง Flex Message ส่งกลับหาลูกค้าเพื่อให้กดยืนยันการสั่งซื้อใน 3 วินาที"
    ],
    roi: [
      { label: "ความเร็วตอบกลับ", value: "ลดลงเหลือ 3 วินาที", desc: "จากเดิมทีมงานเฉลี่ย 15 - 30 นาที" },
      { label: "อัตราการปิดการขาย", value: "เพิ่มขึ้น 35%", desc: "ตอบสนองทันทีก่อนลูกค้าจะเปลี่ยนใจ" },
      { label: "การใช้ทรัพยากร", value: "ประหยัดแรงงาน 80%", desc: "แอดมินไม่ต้องคอยคีย์ข้อมูลใบเสนอราคามือ" }
    ],
    widgetComponent: SalesWidget,
    description: "ปฏิวัติการบริการลูกค้าด้วยแชทบอทอัจฉริยะที่สามารถออกเอกสารใบเสนอราคา ร่างรายการสินค้า และตรวจเช็คโปรโมชันได้อัตโนมัติผ่านการเชื่อมโยงระบบ ERP ส่วนหลังอย่างราบรื่น"
  },
  marketing: {
    title: "Marketing Agent",
    category: "Front-Office",
    role: "Data-Driven Growth",
    metric: "Pattern recognition campaigns",
    details: [
      "ตรวจหาความสอดคล้อง (Pattern Recognition) ของพฤติกรรมการซื้อเพื่อส่งโปรโมชันรายบุคคล",
      "วิเคราะห์แคมเปญโฆษณาออนไลน์และปรับงบประมาณโฆษณาตาม ROI แบบเรียลไทม์",
      "เขียน Copywriting และสร้างคอนเทนต์สำหรับช่องทางโซเชียลอัตโนมัติ"
    ],
    workflow: [
      "ระบบประมวลหาความสอดคล้องความถี่และปริมาณการซื้อขายในอดีตของลูกค้าแต่ละกลุ่ม",
      "AI คัดแยกกลุ่มเป้าหมายเชิงลึก (Hyper-Segmentation) พร้อมวิเคราะห์จังหวะเวลาเสนอสินค้าที่ดีที่สุด",
      "รัน Generative AI สร้างคำโฆษณา รูปภาพประกอบ และจัดโปรโมชันที่จูงใจเฉพาะกลุ่มคน",
      "ส่งแคมเปญแบบเฉพาะรายอัตโนมัติผ่าน LINE OA หรือประสานงานส่งข้อมูลกลุ่มเป้าหมายให้ ad network"
    ],
    roi: [
      { label: "อัตราการคลิกเปิด (CTR)", value: "เพิ่มขึ้น 45%", desc: "ข้อความโฆษณามีความตรงใจระดับบุคคลสูง" },
      { label: "ผลตอบแทนโฆษณา (ROAS)", value: "สูงขึ้น 2.4 เท่า", desc: "ตัดงบโฆษณาที่ประสิทธิภาพต่ำไปจุดที่ได้ผลจริง" },
      { label: "ความเร็วแคมเปญ", value: "ออกแคมเปญใน 1 นาที", desc: "ทดแทนการประชุมเตรียมงานโปรโมทเป็นสัปดาห์" }
    ],
    widgetComponent: MarketingWidget,
    description: "เข้าถึงและกระตุ้นยอดขายอย่างชาญฉลาดโดยอ้างอิงจากข้อมูลธุรกรรมจริงใน ERP ทำให้แคมเปญการตลาดสร้างยอดขายกลับคืนมาได้อย่างคุ้มค่าและตรงเป้าหมายที่สุด"
  },
  procurement: {
    title: "Procurement Agent",
    category: "Back-Office",
    role: "Zero Stockout",
    metric: "Predictive replenishment",
    details: [
      "คำนวณจุดสั่งซื้อใหม่ (Reorder Point) จากอัตราขายจริงเพื่อป้องกันสินค้าหมดสต๊อก",
      "เปรียบเทียบซัพพลายเออร์ (Supplier Benchmarking) ทั้งด้านราคา ระยะเวลาส่งมอบ และคุณภาพ",
      "ออกใบสั่งซื้อ (PO) แบบร่างส่งให้ผู้จัดการอนุมัติโดยอิงจากประวัติการขายที่ดีที่สุด"
    ],
    workflow: [
      "มอนิเตอร์ระดับสต๊อกสินค้าอย่างใกล้ชิดและตรวจจับจังหวะอัตราการขายผันผวน",
      "คำนวณปริมาณการสั่งซื้อที่คุ้มทุนที่สุด (EOQ) เพื่อหลีกเลี่ยงต้นทุนจมและป้องกันสินค้าหมด",
      "ประมวลผลประวัติของซัพพลายเออร์ที่ให้เงื่อนไขและราคาที่ดีที่สุดในระบบประวัติการซื้อ",
      "ออกร่างเอกสารใบสั่งซื้อ (Draft PO) ส่งเข้าห้องแชทของผู้อนุมัติเพื่อรอการยืนยัน"
    ],
    roi: [
      { label: "สินค้าขาดสต๊อก (Stockout)", value: "ลดลงเหลือ 0.2%", desc: "เทียบกับเดิม 5.4% รักษาทุกโอกาสขายได้ครบ" },
      { label: "ต้นทุนการจัดซื้อ", value: "ลดลง 8% - 12%", desc: "จากการคัดเลือกซัพพลายเออร์ที่เหมาะสมที่สุดเสมอ" },
      { label: "เวลาจัดเตรียมเอกสาร", value: "ลดกระบวนการ 75%", desc: "ลดภาระการเปรียบเทียบราคาส่งและพิมพ์เอกสารใหม่" }
    ],
    widgetComponent: ProcurementWidget,
    description: "ป้องกันธุรกิจหยุดชะงักและสินค้าขาดมือด้วย AI จัดซื้อเชิงรุก วิเคราะห์ซัพพลายเออร์ คำนวณสต๊อกปลอดภัย และเตรียมเอกสารจัดซื้อให้อัตโนมัติอย่างชาญฉลาด"
  },
  finance: {
    title: "Finance & OCR Agent",
    category: "Back-Office",
    role: "10x Faster Processing",
    metric: "Instant OCR to JSON & Reconcile",
    details: [
      "สแกนใบแจ้งหนี้/ใบเสร็จแปลงเป็นข้อมูลโครงสร้าง JSON และบันทึกบัญชีอัตโนมัติ",
      "จับคู่เงินโอนเข้าธนาคาร (Instant Reconciliation) กับใบแจ้งหนี้เพื่อปิดหนี้ใน 3 วินาที",
      "ตรวจจับความผิดปกติ เช่น การเบิกเงินซ้ำซ้อนหรือรายการราคาของเกินจริง"
    ],
    workflow: [
      "รับรูปภาพหรือ PDF ใบเสร็จ/ใบกำกับภาษีที่ถ่ายผ่านมือถือหรืออัปโหลดเข้าสู่ระบบ",
      "AI OCR สกัดวิเคราะห์ข้อมูล เช่น เลขประจำตัวผู้เสียภาษี ยอดเงินสุทธิ และ VAT",
      "จับคู่กระทบยอด (Reconcile) รายการเดินบัญชีธนาคารกับเอกสารค้างชำระโดยอัตโนมัติ",
      "บันทึกสมุดรายวันแยกประเภทและอัปเดตรายงานภาษีซื้อ-ขายให้ทันทีแบบเรียลไทม์"
    ],
    roi: [
      { label: "ความเร็วคีย์สมุดบัญชี", value: "2 วินาที ต่อใบเสร็จ", desc: "เร็วกว่าการกรอกมือปกติถึง 30 เท่า" },
      { label: "ความถูกต้องข้อมูล", value: "ความแม่นยำ 99.8%", desc: "หมดปัญหาพิมพ์ยอดเงินสลับหลักหรือสะกดผิด" },
      { label: "ระยะเวลาปิดบัญชี", value: "ปิดงบรายวันเรียลไทม์", desc: "ไม่ต้องดองเอกสารไว้ทำช่วงสิ้นเดือน" }
    ],
    widgetComponent: FinanceWidget,
    description: "สะสางงานบัญชีที่น่าเบื่อหน่ายและซับซ้อนให้เสร็จสิ้นในไม่กี่วินาที ด้วยการผสานพลังเทคโนโลยี OCR ล่าสุดและการจับคู่ยอดเงินโอนกระทบยอดกับใบแจ้งหนี้ทันทีแบบ 24 ชั่วโมง"
  },
  hr: {
    title: "HR & Operations Agent",
    category: "Operations & Support",
    role: "Workforce Optimization",
    metric: "Smart shift optimizer",
    details: [
      "วิเคราะห์ตารางเข้างานของพนักงานและจัดกะการทำงาน (Shift Planning) ให้ประหยัดงบที่สุด",
      "ตรวจสอบสิทธิ์และกฎหมายแรงงาน (Compliance Monitor) ป้องกันปัญหาทางกฎหมาย",
      "คำนวณเบี้ยขยัน ค่าคอมมิชชัน และสรุป Payroll ประจำเดือนส่งธนาคารในไม่กี่คลิก"
    ],
    workflow: [
      "วิเคราะห์สถิติจำนวนพนักงาน ความต้องการกำลังคนในแต่ละกะ และค่าเหนื่อยเฉลี่ย",
      "รันระบบจับคู่และจัดกะทำงานอัตโนมัติ โดยหลีกเลี่ยงข้อจำกัดการทำงานล่วงเวลาผิดกฎหมายแรงงาน",
      "ส่งตารางเวรให้พนักงานแต่ละคนตรวจสอบผ่าน LINE พร้อมเปิดระบบขอสลับวันทำงาน",
      "คำนวณค่าแรง เบี้ยขยัน เงินหัก และจัดเตรียมไฟล์นำส่งจ่ายเงินเดือนผ่านระบบธนาคารอัตโนมัติ"
    ],
    roi: [
      { label: "ค่าล่วงเวลา (OT Cost)", value: "ลดลง 22%", desc: "จากการจัดคนเข้ากะที่ตรงกับช่วงงานชุกอย่างมีประสิทธิภาพ" },
      { label: "เวลาจัดเตรียมตารางเวร", value: "ลดลง 90%", desc: "ทดแทนการใช้นิ้วชี้จัดลงตาราง Excel ด้วยตัวเอง" },
      { label: "ความพึงพอใจของพนักงาน", value: "อัตราลาออกลดลง 15%", desc: "จากการขอสลับเวรที่ยุติธรรม โปร่งใส และทราบล่วงหน้า" }
    ],
    widgetComponent: HRWidget,
    description: "ดูแลพนักงานและจัดการทรัพยากรบุคคลอย่างแม่นยำ จัดตารางงานให้คุ้มค่าแรงที่สุด พร้อมคำนวณงบประมาณเงินเดือนและสวัสดิการให้อัตโนมัติถูกต้องตามกฎหมาย"
  },
  admin: {
    title: "Admin Agent",
    category: "Operations & Support",
    role: "Opcost Optimization",
    metric: "Smart document router",
    details: [
      "คัดแยกประเภทเอกสารสัญญาและจัดเส้นทางอนุมัติไปยังแผนกที่เกี่ยวข้องโดยอัตโนมัติ",
      "จัดเส้นทางวิ่งงานขนส่งสินค้า (Fleet/Route Optimization) เพื่อประหยัดพลังงาน",
      "จัดการงานทั่วไป เช่น ปฏิทินจองห้องประชุม ตรวจสอบเครื่องเขียนและอะไหล่คงเหลือ"
    ],
    workflow: [
      "รับเอกสารส่งคำขออนุมัติ ค่าซ่อมบำรุง หรือเอกสารภายในจากพนักงานผ่านแชทบอท",
      "สแกนหัวข้อสำคัญและวงเงินเพื่อคัดแยกประเภทเอกสาร พร้อมวิเคราะห์ความเสี่ยงเบื้องต้น",
      "ส่งการแจ้งเตือนไปยังแอดมินหรือจัดเส้นทางผู้อนุมัติตามโครงสร้างสายการบริหารขององค์กร",
      "จัดวางแผนการวิ่งงานขนส่ง เลือกใช้เส้นทางที่ดีที่สุดเพื่อประหยัดเชื้อเพลิงและเวลา"
    ],
    roi: [
      { label: "ระยะเวลาเซ็นอนุมัติ", value: "ลดเหลือ 4 ชั่วโมง", desc: "จากเดิมที่ต้องตามล่าลายเซ็นเอกสารกระดาษหลายวัน" },
      { label: "ค่าขนส่ง/เชื้อเพลิง", value: "ประหยัดลง 26%", desc: "จากการจัดสรรแผนผังตำแหน่งและเส้นทางจัดส่งสินค้า" },
      { label: "การลดลงของงานธุรการ", value: "ลดงานซ้ำซ้อน 70%", desc: "ปล่อยให้งานกรอกคิวจองและตรวจเช็คอุปกรณ์คงคลังเป็นเรื่องของ AI" }
    ],
    widgetComponent: AdminWidget,
    description: "ช่วยจัดการระบบปฏิบัติการหลังบ้านและงานธุรการภายในองค์กรได้อย่างเป็นระบบ ตั้งแต่การควบคุมเส้นทางขนส่งสินค้า การจองทรัพยากรส่วนกลาง ไปจนถึงการส่งอนุมัติสัญญาอย่างรวดเร็ว"
  },
  executive: {
    title: "Executive Assistant",
    category: "Executive Management",
    role: "Real-time Insights",
    metric: "Conversational Natural Language BI",
    details: [
      "แปลงคำถามภาษาธรรมชาติ (Natural Language) เป็น SQL query เพื่อดึงรายงานธุรกิจทันที",
      "สรุปข้อมูลด้านบัญชี การเงิน และการจัดซื้อเป็นสรุปบทวิเคราะห์เชิงกลยุทธ์ส่งตรงถึงมือถือ",
      "รายงานเหตุการณ์วิกฤต เช่น กระแสเงินสดติดลบ หรือลูกค้าชั้นดีกำลังจะย้ายค่าย"
    ],
    workflow: [
      "ผู้บริหารพิมพ์หรือป้อนเสียงคำถามทางธุรกิจธรรมดาด้วยภาษาไทย (เช่น ยอดขายเฉลี่ยรายสาขา)",
      "ระบบ NLP แปลงเจตนาออกมาเป็นคำสั่ง Database Query (Postgres SQL) ที่ซับซ้อนในทันที",
      "ประมวลผลดึงค่าดิบและสร้างกราฟรายงานสถิติ พร้อมถอดสรุปเป็นใจความสั้นๆ",
      "แจ้งเตือนกรณีฉุกเฉิน (Anomalies) เช่น ค้นพบสัดส่วนหนี้สูญสูงผิดปกติ หรือระดับความคุ้มทุนสั่นคลอน"
    ],
    roi: [
      { label: "ความเร็ววิเคราะห์รายงาน", value: "ลดลงเหลือ 5 วินาที", desc: "ไม่ต้องส่งคำขอรายงานไปให้ทีมไอทีทำยอดส่งให้ทีละวัน" },
      { label: "ความพร้อมในการตัดสินใจ", value: "ข้อมูลอัปเดตแบบ 24/7", desc: "ข้อมูลอัปเดตเรียลไทม์ตลอดเวลาบนหน้าจอมือถือ" },
      { label: "ค่าใช้จ่ายจัดทำรายงาน", value: "ลดต้นทุนไอที 70%", desc: "ผู้บริหารสามารถดึงรายงานได้เองตามต้องการผ่านกล่องแชท" }
    ],
    widgetComponent: ExecutiveWidget,
    description: "มอบเลขาส่วนตัวอัจฉริยะที่พร้อมตอบทุกข้อสงสัยทางธุรกิจ ช่วยให้ผู้บริหารเข้าถึงตัวเลขยอดขาย งบการเงิน และภาพรวมกำไรขาดทุนของบริษัทได้ทันทีผ่านคำถามภาษาคนทั่วไป"
  },
  simulator: {
    title: "Scenario Simulator",
    category: "Executive Management",
    role: "What-If Analysis Engine",
    metric: "Financial simulations & risks",
    details: [
      "จำลองความเสี่ยงทางการเงินและทิศทางธุรกิจ (Financial Scenario Simulation)",
      "ทำนายผลกระทบของการเปลี่ยนแปลงต้นทุนสินค้าต่อผลกำไรและงบการเงินสะสม",
      "พยากรณ์ความเสี่ยงและจุดคุ้มทุน (Risk Forecasting) สำหรับการขยายสาขาหรือขยายสินค้าใหม่"
    ],
    workflow: [
      "ผู้ใช้กำหนดตัวแปรทดลอง (เช่น เพิ่มงบโฆษณา 20%, ปรับราคาขายลดลง 5%, ค่าวัสดุเพิ่มขึ้น 10%)",
      "แบบจำลองทางคณิตศาสตร์คำนวณผลกระทบแบบลูกโซ่บนโครงสร้างงบกำไรขาดทุน (P&L Simulation)",
      "เปรียบเทียบจุดคุ้มทุน (Breakeven Analysis) และประเมินสัดส่วนของระยะปลอดภัยทางการเงิน (Safety Margin)",
      "สรุปความคุ้มค่าและผลการจำลองในรูปแบบคำแนะนำข้อควรระวังหรือการวางนโยบายที่ถูกต้อง"
    ],
    roi: [
      { label: "ลดความผิดพลาดด้านทุน", value: "ลดความเสี่ยง 85%", desc: "จากการทดสอบโมเดลสมมติฐานบนกระดาษจำลองก่อนลงทุนโครงการจริง" },
      { label: "ความเร็วทดสอบสมมติฐาน", value: "1 วินาทีต่อการทดลอง", desc: "ไม่ต้องเขียนสูตรสูญเสียในสเปรดชีต Excel หลายแผ่นซับซ้อน" },
      { label: "การตอบสนองความเสี่ยง", value: "ปรับตัวล่วงหน้า 3 เดือน", desc: "ช่วยวิเคราะห์ผลกระทบของสภาวะเงินเฟ้อต่อแผนกำไรล่วงหน้า" }
    ],
    widgetComponent: SimulatorWidget,
    description: "ติดปีกการวางแผนเชิงกลยุทธ์ด้วยระบบจำลองจำลองทางการเงิน ช่วยทำนายผลลัพธ์ของการปรับกลยุทธ์ราคา การเผชิญหน้ากับความผันผวนของต้นทุน และจำลองความเสี่ยงทางการเงินได้อย่างแม่นยำก่อนตัดสินใจจริง"
  }
};

interface AgentDetailsViewProps {
  slug: string;
}

export default function AgentDetailsView({ slug }: AgentDetailsViewProps) {
  const agent = AGENTS_DATA[slug];

  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "loading" | "success">("idle");
  const [formState, setFormState] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    details: ""
  });

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus("loading");

    setTimeout(() => {
      setSubmitStatus("success");

      const emailTo = "admin@perpos.io";
      const subject = `Request Demo PERPOS - ${formState.company} (via ${agent?.title || slug})`;
      const body = `เรียน ทีมงาน PERPOS,\n\nมีความประสงค์ขอรับการสาธิตการใช้งานระบบ PERPOS ERP (Request Demo)\n\nรายละเอียดผู้ติดต่อ:\n- ชื่อผู้ติดต่อ: ${formState.name}\n- บริษัท/องค์กร: ${formState.company}\n- อีเมล: ${formState.email}\n- เบอร์โทรศัพท์: ${formState.phone}\n- โมดูล/เอเจนต์ที่สนใจ: ${agent?.title || slug}\n- ความต้องการเพิ่มเติม: ${formState.details || "ไม่มี"}\n\nขอแสดงความนับถือ,\n${formState.name}`;
      
      const mailtoUrl = `mailto:${emailTo}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoUrl;
    }, 1200);
  };

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsScrolled(currentScrollY > 16);

      if (currentScrollY > lastScrollY && currentScrollY > 80) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      lastScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!agent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white text-slate-800 p-4">
        <Cpu size={48} className="text-slate-350 animate-bounce mb-4" />
        <h1 className="text-xl font-bold">ไม่พบข้อมูล AI Agent</h1>
        <Link href="/" className="mt-4 text-sm text-[#292e91] hover:underline font-bold">
          กลับหน้าแรก
        </Link>
      </div>
    );
  }

  const Widget = agent.widgetComponent;

  return (
    <div className="bg-white text-slate-850 font-sans antialiased min-h-screen overflow-x-hidden selection:bg-blue-500 selection:text-white">
      {/* HEADER NAVBAR */}
      <header className={`fixed top-0 left-0 right-0 w-full z-50 bg-white/80 backdrop-blur-md transition-all duration-300 ${
        isVisible ? "translate-y-0" : "-translate-y-full"
      } ${
        isScrolled ? "shadow-sm border-b border-slate-200/50" : "border-b border-transparent"
      }`}>
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="PERPOS" className="h-8 w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <Link href="/" className="hover:text-[#292e91] transition-colors">หน้าแรก</Link>
            {/* AI Agents Dropdown Menu */}
            <div className="relative group py-4">
              <button className="flex items-center gap-1 hover:text-[#292e91] transition-colors font-semibold cursor-pointer outline-none text-slate-600">
                AI Agents
                <svg className="w-4 h-4 transition-transform duration-200 group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Dropdown Container */}
              <div className="absolute top-[80%] left-1/2 -translate-x-1/2 w-[520px] bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-3 grid grid-cols-2 gap-1.5 origin-top mt-2">
                {MENU_AGENTS.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/agents/${item.slug}`}
                    className="flex flex-col text-left p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all font-semibold"
                  >
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      {item.name}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1 pl-3 font-normal leading-normal">{item.desc}</span>
                  </Link>
                ))}
              </div>
            </div>
          </nav>
          <div className="flex items-center gap-4">
            <a
              href={APP_SIGNIN_URL}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            >
              เข้าสู่ระบบ
            </a>
            <button
              onClick={() => setIsModalOpen(true)}
              className="rounded-lg bg-brand-gradient hover:opacity-90 px-4 py-2 text-sm font-bold text-white shadow transition-all duration-300 cursor-pointer"
            >
              ขอเดโมระบบ
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="pt-28 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Back Link */}
        <div className="mb-8">
          <Link
            href="/#features"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-[#292e91] transition-colors"
          >
            <ArrowLeft size={14} />
            กลับไปยัง AI Agent Network
          </Link>
        </div>

        {/* Hero Meta Info */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Left Column: Details & Insights */}
          <div className="lg:col-span-7 space-y-8">
            <div className="space-y-3">
              <span className="text-xs uppercase tracking-wider font-bold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full inline-block">
                {agent.category}
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                {agent.title}
              </h1>
              <p className="text-base sm:text-lg text-emerald-600 font-bold flex items-center gap-2">
                <Sparkles size={16} />
                {agent.role} — {agent.metric}
              </p>
              <p className="text-slate-600 text-sm leading-relaxed max-w-2xl pt-2">
                {agent.description}
              </p>
            </div>

            {/* Core Features / Details */}
            <div className="border-t border-slate-100 pt-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">ฟังก์ชันการทำงานหลัก</h3>
              <ul className="space-y-3">
                {agent.details.map((detail, idx) => (
                  <li key={idx} className="flex gap-3 items-start text-sm text-slate-650 leading-relaxed">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Behind the Scenes Flowchart/Workflow */}
            <div className="border-t border-slate-100 pt-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">ขั้นตอนการทำงานอัตโนมัติ (Automated Workflow)</h3>
              <div className="relative border-l border-blue-100 ml-3 pl-6 space-y-6">
                {agent.workflow.map((flow, idx) => (
                  <div key={idx} className="relative">
                    {/* Node Dot */}
                    <div className="absolute -left-[31px] top-1 w-4.5 h-4.5 rounded-full bg-white border-2 border-blue-500 flex items-center justify-center text-[10px] font-bold text-blue-600 shadow-sm">
                      {idx + 1}
                    </div>
                    <p className="text-sm text-slate-650 leading-relaxed font-medium">
                      {flow}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Business Impact Metrics / ROI */}
            <div className="border-t border-slate-100 pt-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <TrendingUp size={16} className="text-[#292e91]" />
                ผลลัพธ์เชิงธุรกิจ (ROI & Business Impact)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {agent.roi.map((item, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4.5 space-y-1">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{item.label}</div>
                    <div className="text-base font-black text-[#292e91]">{item.value}</div>
                    <div className="text-[10.5px] text-slate-550 leading-normal">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Live Simulation Widget */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-5 md:p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Play size={14} className="text-blue-600 fill-blue-600" />
                  Interactive Simulation
                </h3>
                <p className="text-xs text-slate-500">
                  ทดลองจำลองและเรียนรู้กลไกเชิงปฏิบัติงานจริงของ {agent.title} ผ่านแผงควบคุมด้านล่างนี้
                </p>
              </div>

              {/* The Live Widget */}
              <Widget />
            </div>

            {/* Bottom CTA Card */}
            <div className="bg-brand-gradient text-white rounded-3xl p-6 shadow-lg text-center space-y-4 relative overflow-hidden">
              {/* Decorative light effect */}
              <div className="absolute -top-12 -left-12 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none" />
              <div className="absolute -bottom-12 -right-12 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none" />

              <h4 className="text-base font-bold">พร้อมเพิ่มขีดความสามารถให้ธุรกิจของคุณแล้วหรือยัง?</h4>
              <p className="text-xs text-blue-100 leading-relaxed max-w-sm mx-auto">
                เชื่อมต่อและตั้งค่า AI Agents เหล่านี้เข้ากับ LINE OA, บัญชีธนาคาร และคลังสินค้าของคุณทันทีผ่านระบบ PERPOS ERP
              </p>
              <div className="pt-2">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="w-full bg-white hover:bg-slate-50 text-indigo-700 font-bold text-sm py-3 px-6 rounded-xl transition-colors cursor-pointer shadow-md inline-flex items-center justify-center gap-2"
                >
                  ปรึกษาผู้เชี่ยวชาญ / ขอรับเดโม
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-200/80 bg-slate-50 py-12 text-left">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-2 space-y-4">
              <img src="/logo.svg" alt="PERPOS" className="h-8 w-auto" />
              <p className="text-base text-slate-550 max-w-md leading-relaxed">
                Next-Gen Agentic AI ERP — Tailored to Empower Your Business Flow.
                ระบบบัญชีและ ERP สำหรับธุรกิจ SME ยุคใหม่ ปฏิบัติงานเชิงรุกด้วย AI Agents แบบ Real-time
              </p>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">เอกสาร</h4>
              <ul className="mt-4 space-y-2 text-sm text-slate-500">
                <li>
                  <Link href="/privacy" className="hover:text-[#292e91] transition-colors">
                    นโยบายความเป็นส่วนตัว
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-[#292e91] transition-colors">
                    ข้อกำหนดการให้บริการ
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">การเชื่อมต่อ</h4>
              <ul className="mt-4 space-y-2 text-sm text-slate-500">
                <li>LINE OA</li>
                <li>Google Workspace</li>
                <li>Supabase Cloud</li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-slate-200/60 pt-8 flex flex-col sm:flex-row items-center justify-between text-sm text-slate-400">
            <div>© 2026 P2P Solutions. All Rights Reserved.</div>
            <div className="mt-4 sm:mt-0 flex gap-6">
              <span className="text-slate-400/80 whitespace-nowrap">Enterprise Cloud Hosting</span>
            </div>
          </div>
        </div>
      </footer>

      {/* REQUEST DEMO MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-scale-up text-left flex flex-col">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-slate-900">ขอสาธิตการใช้งาน PERPOS</h3>
                <p className="text-xs text-slate-500 mt-1">กรอกรายละเอียดเพื่อให้ทีมงานติดต่อกลับแนะนำระบบสาธิต</p>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setSubmitStatus("idle");
                  setFormState({ name: "", company: "", email: "", phone: "", details: "" });
                }}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {submitStatus === "success" ? (
              <div className="p-8 text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 animate-bounce mx-auto">
                  <CheckCircle2 size={32} />
                </div>
                <h4 className="text-lg font-bold text-slate-900">ส่งข้อมูลสำเร็จแล้ว!</h4>
                <p className="text-sm text-slate-600 leading-relaxed max-w-xs mx-auto">
                  ระบบได้บันทึกคำขอของคุณและเปิดโปรแกรมอีเมลของคุณเพื่อส่งข้อมูลแจ้งเตือนไปยัง <strong className="text-slate-800">admin@perpos.io</strong> เรียบร้อยแล้ว ทีมงานของเราจะติดต่อกลับภายใน 24 ชั่วโมง
                </p>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setSubmitStatus("idle");
                    setFormState({ name: "", company: "", email: "", phone: "", details: "" });
                  }}
                  className="w-full max-w-xs mt-4 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold text-sm py-3 transition-all shadow-md mx-auto duration-300"
                >
                  ตกลง
                </button>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">ชื่อผู้ติดต่อ *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น สมชาย ใจดี"
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors"
                  />
                </div>

                {/* Company */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">ชื่อบริษัท / องค์กร *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น บริษัท เอ็มเอสอี จำกัด"
                    value={formState.company}
                    onChange={(e) => setFormState({ ...formState, company: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors"
                  />
                </div>

                {/* Grid for Email & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">อีเมลผู้ติดต่อ *</label>
                    <input
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={formState.email}
                      onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">เบอร์โทรศัพท์ *</label>
                    <input
                      type="tel"
                      required
                      placeholder="081-234-5678"
                      value={formState.phone}
                      onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">รายละเอียดเพิ่มเติม / ข้อความ</label>
                  <textarea
                    rows={3}
                    placeholder="ความต้องการพิเศษของธุรกิจ หรือโมดูล AI ที่สนใจทดลองใช้เป็นพิเศษ..."
                    value={formState.details}
                    onChange={(e) => setFormState({ ...formState, details: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setFormState({ name: "", company: "", email: "", phone: "", details: "" });
                    }}
                    className="w-1/3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm py-3 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={submitStatus === "loading"}
                    className="w-2/3 flex items-center justify-center gap-2 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold text-sm py-3 transition-all shadow-md disabled:opacity-70 duration-300 hover:shadow-lg"
                  >
                    {submitStatus === "loading" ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                        <span>กำลังส่ง...</span>
                      </>
                    ) : (
                      <span>ส่งข้อมูลขอสาธิตระบบ</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* STYLE ANIMATIONS */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fadeIn 0.25s ease-out forwards;
        }
        .animate-scale-up {
          animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      ` }} />
    </div>
  );
}
