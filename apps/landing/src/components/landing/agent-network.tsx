"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Sparkles, Database, ArrowRight, Cpu } from "lucide-react";

interface Agent {
  id: number;
  name: string;
  category: "Front-Office" | "Back-Office" | "Operations & Support" | "Executive Management";
  role: string;
  metric: string;
  details: string[];
  x: number; // Circle positioning coordinates (width/height = 360px)
  y: number;
}

const AGENTS: Agent[] = [
  {
    id: 1,
    name: "Sales Agent",
    category: "Front-Office",
    role: "10x Responsiveness",
    metric: "Automated quotation in 3s",
    details: [
      "สกัดความต้องการลูกค้าจาก LINE OA และเสนอราคาทันทีใน 3 วินาที",
      "มี Lead Scoring คาดการณ์ความน่าจะเป็นในการปิดดีลพร้อมจัดลำดับความสำคัญ",
      "เชื่อมประวัติการซื้อขายในอดีตมาช่วยคำนวณส่วนลดและเสนอขายอัพเซลล์"
    ],
    x: 270,
    y: 160
  },
  {
    id: 2,
    name: "Marketing Agent",
    category: "Front-Office",
    role: "Data-Driven Growth",
    metric: "Pattern recognition campaigns",
    details: [
      "ตรวจหาความสอดคล้อง (Pattern Recognition) ของพฤติกรรมการซื้อเพื่อส่งโปรโมชันรายบุคคล",
      "วิเคราะห์แคมเปญโฆษณาออนไลน์และปรับงบประมาณโฆษณาตาม ROI แบบเรียลไทม์",
      "เขียน Copywriting และสร้างคอนเทนต์สำหรับช่องทางโซเชียลอัตโนมัติ"
    ],
    x: 238,
    y: 238
  },
  {
    id: 3,
    name: "Procurement Agent",
    category: "Back-Office",
    role: "Zero Stockout",
    metric: "Predictive replenishment",
    details: [
      "คำนวณจุดสั่งซื้อใหม่ (Reorder Point) จากอัตราขายจริงเพื่อป้องกันสินค้าหมดสต๊อก",
      "เปรียบเทียบซัพพลายเออร์ (Supplier Benchmarking) ทั้งด้านราคา ระยะเวลาส่งมอบ และคุณภาพ",
      "ออกใบสั่งซื้อ (PO) แบบร่างส่งให้ผู้จัดการอนุมัติโดยอิงจากประวัติการขายที่ดีที่สุด"
    ],
    x: 160,
    y: 270
  },
  {
    id: 4,
    name: "Finance & OCR Agent",
    category: "Back-Office",
    role: "10x Faster Processing",
    metric: "Instant OCR to JSON & Reconcile",
    details: [
      "สแกนใบแจ้งหนี้/ใบเสร็จแปลงเป็นข้อมูลโครงสร้าง JSON และบันทึกบัญชีอัตโนมัติ",
      "จับคู่เงินโอนเข้าธนาคาร (Instant Reconciliation) กับใบแจ้งหนี้เพื่อปิดหนี้ใน 3 วินาที",
      "ตรวจจับความผิดปกติ เช่น การเบิกเงินซ้ำซ้อนหรือรายการราคาของเกินจริง"
    ],
    x: 82,
    y: 238
  },
  {
    id: 5,
    name: "HR & Operations Agent",
    category: "Operations & Support",
    role: "Workforce Optimization",
    metric: "Smart shift optimizer",
    details: [
      "วิเคราะห์ตารางเข้างานของพนักงานและจัดกะการทำงาน (Shift Planning) ให้ประหยัดงบที่สุด",
      "ตรวจสอบสิทธิ์และกฎหมายแรงงาน (Compliance Monitor) ป้องกันปัญหาทางกฎหมาย",
      "คำนวณเบี้ยขยัน ค่าคอมมิชชัน และสรุป Payroll ประจำเดือนส่งธนาคารในไม่กี่คลิก"
    ],
    x: 50,
    y: 160
  },
  {
    id: 6,
    name: "Admin Agent",
    category: "Operations & Support",
    role: "Opcost Optimization",
    metric: "Smart document router",
    details: [
      "คัดแยกประเภทเอกสารสัญญาและจัดเส้นทางอนุมัติไปยังแผนกที่เกี่ยวข้องโดยอัตโนมัติ",
      "จัดเส้นทางวิ่งงานขนส่งสินค้า (Fleet/Route Optimization) เพื่อประหยัดพลังงาน",
      "จัดการงานทั่วไป เช่น ปฏิทินจองห้องประชุม ตรวจสอบเครื่องเขียนและอะไหล่คงเหลือ"
    ],
    x: 82,
    y: 82
  },
  {
    id: 7,
    name: "Executive Assistant",
    category: "Executive Management",
    role: "Real-time Insights",
    metric: "Conversational Natural Language BI",
    details: [
      "แปลงคำถามภาษาธรรมชาติ (Natural Language) เป็น SQL query เพื่อดึงรายงานธุรกิจทันที",
      "สรุปข้อมูลด้านบัญชี การเงิน และการจัดซื้อเป็นสรุปบทวิเคราะห์เชิงกลยุทธ์ส่งตรงถึงมือถือ",
      "รายงานเหตุการณ์วิกฤต เช่น กระแสเงินสดติดลบ หรือลูกค้าชั้นดีกำลังจะย้ายค่าย"
    ],
    x: 160,
    y: 50
  },
  {
    id: 8,
    name: "Scenario Simulator",
    category: "Executive Management",
    role: "What-If Analysis Engine",
    metric: "Financial simulations & risks",
    details: [
      "จำลองความเสี่ยงทางการเงินและทิศทางธุรกิจ (Financial Scenario Simulation)",
      "ทำนายผลกระทบของการเปลี่ยนแปลงต้นทุนสินค้าต่อผลกำไรและงบการเงินสะสม",
      "พยากรณ์ความเสี่ยงและจุดคุ้มทุน (Risk Forecasting) สำหรับการขยายสาขาหรือขยายสินค้าใหม่"
    ],
    x: 238,
    y: 82
  }
];

function getAgentSlug(name: string): string {
  const mapping: Record<string, string> = {
    "Sales Agent": "sales",
    "Marketing Agent": "marketing",
    "Procurement Agent": "procurement",
    "Finance & OCR Agent": "finance",
    "HR & Operations Agent": "hr",
    "Admin Agent": "admin",
    "Executive Assistant": "executive",
    "Scenario Simulator": "simulator",
  };
  return mapping[name] ?? "sales";
}

export default function AgentNetwork() {
  const [hoveredAgent, setHoveredAgent] = useState<Agent | null>(AGENTS[6]); // Defaults to Executive Assistant

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-[#f8fafc]/50 border border-slate-200 rounded-3xl p-6 lg:p-8 text-slate-700">
      {/* Network Node Column (Left/Center) */}
      <div className="lg:col-span-6 flex justify-center py-10 md:py-14 relative overflow-visible">
        <div className="w-[320px] h-[320px] relative select-none scale-110 sm:scale-120 md:scale-125 transition-transform origin-center">
          {/* SVG Connection Lines */}
          <svg width="320" height="320" className="absolute top-0 left-0 z-0 pointer-events-none overflow-visible">
            {/* Ambient Pulse in center */}
            <circle cx="160" cy="160" r="45" fill="#3b82f6" fillOpacity="0.04" className="animate-pulse" />
            <circle cx="160" cy="160" r="70" fill="#3b82f6" fillOpacity="0.01" />

            {/* Render lines connecting outer agents to center */}
            {AGENTS.map((agent) => {
              const isHovered = hoveredAgent?.id === agent.id;
              return (
                <g key={`lines-${agent.id}`}>
                  {/* Outer glow stroke path */}
                  <line
                    x1="160"
                    y1="160"
                    x2={agent.x}
                    y2={agent.y}
                    stroke={isHovered ? "#2563eb" : "#e2e8f0"}
                    strokeWidth={isHovered ? "2.5" : "1.5"}
                    strokeOpacity={isHovered ? "0.9" : "0.6"}
                    className="transition-all duration-300"
                  />
                  {/* Moving neon data pulses along line */}
                  {isHovered && (
                    <circle r="3.5" fill="#3b82f6" className="animate-node-pulse">
                      <animateMotion
                        path={`M 160 160 L ${agent.x} ${agent.y}`}
                        dur="1.2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Central database engine node */}
          <div className="absolute top-[125px] left-[125px] w-[70px] h-[70px] rounded-full bg-white border-2 border-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.2)] flex flex-col items-center justify-center z-10">
            <Database className="text-blue-600" size={24} />
            <span className="text-[7px] text-blue-700 font-bold text-center mt-1 scale-90 uppercase">PERPOS DB</span>
          </div>

          {/* Outer Agent Nodes */}
          {AGENTS.map((agent) => {
            const isHovered = hoveredAgent?.id === agent.id;
            return (
              <button
                key={`node-${agent.id}`}
                onMouseEnter={() => setHoveredAgent(agent)}
                className="absolute w-[44px] h-[44px] rounded-full border transition-all duration-300 flex items-center justify-center z-10 cursor-pointer shadow-md outline-none"
                style={{
                  left: agent.x - 22,
                  top: agent.y - 22,
                  backgroundColor: isHovered ? "#eff6ff" : "#ffffff",
                  borderColor: isHovered ? "#3b82f6" : "#e2e8f0",
                  boxShadow: isHovered ? "0 0 15px rgba(59,130,246,0.25)" : "0 2px 4px rgba(0,0,0,0.02)"
                }}
              >
                <Cpu size={16} className={isHovered ? "text-blue-600" : "text-slate-400"} />
                {/* Micro badge indicator */}
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] scale-90 font-semibold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-500">
                  {agent.name.split(" ")[0]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Description Panel (Right Column) */}
      <div className="lg:col-span-6 space-y-5 animate-fade-in">
        {hoveredAgent ? (
          <div className="space-y-4 text-left">
            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wider font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full inline-block">
                {hoveredAgent.category}
              </span>
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mt-2">
                {hoveredAgent.name}
              </h3>
              <p className="text-xs sm:text-sm text-emerald-600 font-bold flex items-center gap-1.5 mt-0.5">
                <Sparkles size={12} />
                {hoveredAgent.role} — {hoveredAgent.metric}
              </p>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <ul className="space-y-3 text-sm text-slate-650">
                {hoveredAgent.details.map((detail, idx) => (
                  <li key={idx} className="flex gap-2.5 items-start">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                    <span className="leading-relaxed">{detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5 flex items-center gap-3 text-xs text-slate-550">
              <div className="p-2 rounded bg-blue-50 border border-blue-100 text-blue-600 shrink-0">
                <ArrowRight size={14} />
              </div>
              <p className="leading-relaxed">
                เชื่อมต่อชุดข้อมูลร่วมกับ Agent แผนกอื่นผ่าน <strong className="text-slate-800">Central Data Engine</strong> บนระบบคลาวด์ ป้องกันการทำงานซ้ำซ้อน
              </p>
            </div>

            <div className="pt-2">
              <Link
                href={`/agents/${getAgentSlug(hoveredAgent.name)}`}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold text-sm py-3.5 transition-all shadow-md duration-300 hover:shadow-lg"
              >
                ดูเจาะลึกฟีเจอร์และการทำงานจริง
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col justify-center items-center text-center py-12 text-slate-400">
            <Cpu size={32} className="text-slate-300 animate-bounce mb-3" />
            <p className="text-sm">เอาเมาส์ชี้ที่ Node แผนก AI เพื่อดูข้อมูลความสามารถและผลลัพธ์</p>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes node-pulse-anim {
          from {
            opacity: 1;
          }
          to {
            opacity: 0.1;
          }
        }
        .animate-node-pulse {
          animation: node-pulse-anim 0.3s ease-in-out infinite alternate;
        }
      ` }} />
    </div>
  );
}
