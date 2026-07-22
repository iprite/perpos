"use client";

// reports/page.tsx — รายงาน & กำไร
// ตัวเลขทุกตัวมาจาก _fixtures/metrics.ts (แหล่งคำนวณเดียว) + baseline.ts สำหรับเทียบ "ก่อน/หลังมีระบบ"
// 🔒 owner-only §2.3: แท็บ "ต้นทุน & กำไร" ไม่ render เลยเมื่อไม่ใช่เจ้าของ (ไม่ใช่ disable)
// ปุ่ม "ส่งรายงานเข้า LINE" → พรีวิวการ์ด Flex (mock ไม่ยิง LINE จริง)

import { useMemo, useState, type ReactNode } from "react";
import { BarChart3, Coins, Factory, Send, TrendingUp, Wallet } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import { Text } from "@/components/ui/typography";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { notify } from "@/lib/toast";
import {
  avgCfWaitDays,
  avgLeadTimeDays,
  lateRatePercent,
  reprintRatePercent,
  salesCostProfitTotals,
} from "../_fixtures/metrics";
import {
  MattiiShell,
  NoAccess,
  fmtMoney,
  fmtNum,
  fmtPercent,
  useMattiiData,
  useMattiiRole,
} from "../_components";
import { MattiiFlexPreview, type FlexAudience } from "../settings/flex-preview";
import { SalesTab } from "./sales-tab";
import { ProductionTab } from "./production-tab";
import { EfficiencyTab } from "./efficiency-tab";
import { ProfitTab } from "./profit-tab";

/** §1.2 NAV_BY_ROLE — หน้ารายงานอยู่ในเมนูของเจ้าของ/ผู้จัดการเท่านั้น */
const ALLOWED_ROLES = ["owner"];

type TabKey = "sales" | "production" | "efficiency" | "profit";

export default function ReportsPage() {
  const { role, isOwner } = useMattiiRole();
  const { orders, printJobs } = useMattiiData();

  const [tab, setTab] = useState<TabKey>("sales");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [lineOpen, setLineOpen] = useState(false);
  const [audience, setAudience] = useState<FlexAudience>("owner");
  const [sending, setSending] = useState(false);

  const scoped = useMemo(() => {
    if (!from && !to) return orders;
    return orders.filter((o) => {
      const day = o.created_at.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [orders, from, to]);

  // KPI หัวหน้า — ผ่าน metrics.ts ทั้งหมด (ห้ามคิดสูตรซ้ำในหน้า)
  const head = useMemo(() => {
    const totals = salesCostProfitTotals(scoped);
    return {
      ...totals,
      leadTime: avgLeadTimeDays(scoped),
      cfWait: avgCfWaitDays(scoped),
      lateRate: lateRatePercent(scoped),
      reprintRate: reprintRatePercent(scoped, printJobs),
      count: scoped.length,
    };
  }, [scoped, printJobs]);

  if (!ALLOWED_ROLES.includes(role)) {
    return (
      <NoAccess title="รายงาน & กำไร" icon={<BarChart3 className="h-6 w-6" />}>
        รายงานภาพรวมและกำไรเปิดให้เฉพาะเจ้าของ/ผู้จัดการ — สลับบทบาทที่แถบด้านบนเพื่อดูตัวอย่าง
      </NoAccess>
    );
  }

  const tabs: { key: TabKey; label: string; icon: ReactNode }[] = [
    { key: "sales", label: "ยอดขาย", icon: <Wallet className="h-4 w-4" /> },
    { key: "production", label: "งานผลิต & ของเสีย", icon: <Factory className="h-4 w-4" /> },
    { key: "efficiency", label: "ก่อน/หลังมีระบบ", icon: <TrendingUp className="h-4 w-4" /> },
    // 🔒 owner-only — ไม่ render แท็บนี้เลยถ้าไม่ใช่เจ้าของ
    ...(isOwner
      ? [{ key: "profit" as TabKey, label: "ต้นทุน & กำไร", icon: <Coins className="h-4 w-4" /> }]
      : []),
  ];

  function handleSend() {
    setSending(true);
    window.setTimeout(() => {
      setSending(false);
      setLineOpen(false);
      notify.success(
        audience === "owner"
          ? "ส่งสรุปเข้า LINE ของเจ้าของแล้ว (ตัวอย่างจำลอง)"
          : "ส่งสรุปเข้า LINE ของทีมผลิตรายคนแล้ว (ตัวอย่างจำลอง)",
      );
    }, 900);
  }

  return (
    <MattiiShell
      title="รายงาน & กำไร"
      description="ตัวเลขจริงจากงานที่เดินในระบบ — ดูว่าเงินหายไปตรงไหน และดีขึ้นแค่ไหนจากก่อนมีระบบ"
      icon={<BarChart3 className="h-6 w-6" />}
      actions={
        <Button variant="outline" onClick={() => setLineOpen(true)}>
          <Send className="mr-1.5 h-4 w-4" /> ส่งรายงานเข้า LINE
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <Text className="text-xs text-gray-500">ช่วงวันที่รับออเดอร์</Text>
        <ThaiDatePicker value={from} onChange={setFrom} placeholder="ตั้งแต่วันที่" />
        <ThaiDatePicker value={to} onChange={setTo} placeholder="ถึงวันที่" />
        {(from || to) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            ล้างช่วงวัน
          </Button>
        )}
        <Text className="ms-auto text-xs tabular-nums text-gray-500">
          ครอบคลุม {fmtNum(head.count)} ออเดอร์
        </Text>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="ยอดขายในช่วงที่เลือก"
          value={fmtMoney(head.totalSales)}
          sub={`${fmtNum(head.count)} ออเดอร์`}
          tone="info"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="รับออเดอร์ → ส่งถึงเฉลี่ย"
          value={`${fmtNum(head.leadTime, 1)} วัน`}
          sub="เดิมก่อนมีระบบ ~9 วัน"
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<Factory className="h-4 w-4" />}
          label="อัตราพิมพ์ซ้ำจาก QC ไม่ผ่าน"
          value={fmtPercent(head.reprintRate)}
          sub="ทุกครั้งที่พิมพ์ซ้ำ = ผ้าและเวลาที่หายไป"
          tone={head.reprintRate > 10 ? "negative" : "warning"}
          valueColored
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="อัตราส่งช้ากว่ากำหนด"
          value={fmtPercent(head.lateRate)}
          sub={`รอลูกค้ายืนยันลายเฉลี่ย ${fmtNum(head.cfWait, 1)} วัน`}
          tone={head.lateRate > 12 ? "negative" : "positive"}
          valueColored
        />
      </div>

      {/* แถบแท็บ — row เดียว ล้นแล้วเลื่อน (DESIGN §4) */}
      <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={tab === t.key ? "secondary" : "ghost"}
            className={cn(
              "shrink-0 whitespace-nowrap",
              tab === t.key && "bg-gray-100 text-gray-900",
            )}
            onClick={() => setTab(t.key)}
          >
            <span className="mr-1.5">{t.icon}</span>
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "sales" && <SalesTab orders={scoped} />}
      {tab === "production" && <ProductionTab orders={scoped} />}
      {tab === "efficiency" && <EfficiencyTab orders={scoped} />}
      {tab === "profit" && isOwner && <ProfitTab orders={scoped} />}

      <Dialog open={lineOpen} onOpenChange={setLineOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>ส่งสรุปรายงานเข้า LINE</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <SegmentedControl
                value={audience}
                onChange={setAudience}
                ariaLabel="ผู้รับรายงาน"
                options={[
                  { value: "owner", label: "ส่งถึงเจ้าของ" },
                  { value: "team", label: "ส่งถึงทีมผลิต" },
                ]}
              />
              <Text className="text-xs text-gray-500">
                ระบบส่งให้ผู้รับทีละคนตามที่ตั้งไว้ในหน้าตั้งค่า (ไม่ส่งเข้ากลุ่ม LINE) —
                การ์ดของทีมผลิตจะไม่มีตัวเลขยอดขาย/กำไร
              </Text>
              <div className="flex justify-center rounded-xl bg-gray-50 p-4">
                <MattiiFlexPreview kind="daily_report" audience={audience} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLineOpen(false)}>
              ยกเลิก
            </Button>
            <Button disabled={sending} onClick={handleSend}>
              {sending ? "กำลังส่ง…" : "ส่งเข้า LINE"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MattiiShell>
  );
}
