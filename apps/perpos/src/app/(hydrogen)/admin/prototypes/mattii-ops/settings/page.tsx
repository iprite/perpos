"use client";

// settings/page.tsx — ตั้งค่า & การเชื่อมต่อ (contract §4 หน้า 12)
// 5 แท็บ: การเชื่อมต่อ · แจ้งเตือน LINE · ทีม · เครื่องผลิต · ค่าฐานก่อนมีระบบ
// mock: ทุกการแก้ไขเก็บใน client state ของหน้านี้ (ทดสอบการเชื่อมต่อ = action มีผลข้างเคียงจริง ไม่ใช่ปุ่ม refresh)
// 🔒 owner-only §2.3: hourly_rate (ทีม) · hourly_cost (เครื่อง) · ทั้งแท็บค่าฐาน

import { useState, type ReactNode } from "react";
import { Bell, Gauge, Plug, Printer, Settings as SettingsIcon, Users } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { benchmark as seedBenchmark } from "../_fixtures/benchmarks";
import type {
  MattiiBenchmark,
  MattiiIntegration,
  MattiiMachine,
  MattiiStaff,
} from "../_fixtures/types";
import { MattiiShell, NoAccess, useMattiiData, useMattiiRole } from "../_components";
import { ConnectionsTab } from "./connections-tab";
import { LineNotifyTab } from "./line-notify-tab";
import { TeamTab } from "./team-tab";
import { MachinesTab } from "./machines-tab";
import { BenchmarkTab } from "./benchmark-tab";

/** §1.2 NAV_BY_ROLE — หน้าตั้งค่าอยู่ในเมนูของเจ้าของ/ผู้จัดการเท่านั้น */
const ALLOWED_ROLES = ["owner"];

type TabKey = "connections" | "line" | "team" | "machines" | "benchmark";

export default function SettingsPage() {
  const { role, isOwner } = useMattiiRole();
  const seed = useMattiiData();

  const [integrations, setIntegrations] = useState<MattiiIntegration[]>(() => seed.integrations);
  const [staff, setStaff] = useState<MattiiStaff[]>(() => seed.staff);
  const [machines, setMachines] = useState<MattiiMachine[]>(() => seed.machines);
  const [benchmark, setBenchmark] = useState<MattiiBenchmark>(() => seedBenchmark);
  const [tab, setTab] = useState<TabKey>("connections");

  if (!ALLOWED_ROLES.includes(role)) {
    return (
      <NoAccess title="ตั้งค่า & การเชื่อมต่อ" icon={<SettingsIcon className="h-6 w-6" />}>
        หน้าตั้งค่าระบบและการเชื่อมต่อเปิดให้เฉพาะเจ้าของ/ผู้จัดการ
      </NoAccess>
    );
  }

  const tabs: { key: TabKey; label: string; icon: ReactNode }[] = [
    { key: "connections", label: "การเชื่อมต่อ", icon: <Plug className="h-4 w-4" /> },
    { key: "line", label: "แจ้งเตือน LINE", icon: <Bell className="h-4 w-4" /> },
    { key: "team", label: "ทีม", icon: <Users className="h-4 w-4" /> },
    { key: "machines", label: "เครื่องผลิต", icon: <Printer className="h-4 w-4" /> },
    // 🔒 owner-only — ค่าฐานก่อนมีระบบ: ไม่ render แท็บนี้เลยถ้าไม่ใช่เจ้าของ
    ...(isOwner
      ? [
          {
            key: "benchmark" as TabKey,
            label: "ค่าฐานก่อนมีระบบ",
            icon: <Gauge className="h-4 w-4" />,
          },
        ]
      : []),
  ];

  return (
    <MattiiShell
      title="ตั้งค่า & การเชื่อมต่อ"
      description="เชื่อมแชท ขนส่ง และ LINE ไว้ที่เดียว พร้อมจัดการทีม เครื่องผลิต และค่าฐานที่ใช้วัดผล"
      icon={<SettingsIcon className="h-6 w-6" />}
    >
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

      {tab === "connections" && (
        <ConnectionsTab integrations={integrations} onChange={setIntegrations} />
      )}
      {tab === "line" && <LineNotifyTab staff={staff} />}
      {tab === "team" && <TeamTab staff={staff} onChange={setStaff} />}
      {tab === "machines" && <MachinesTab machines={machines} onChange={setMachines} />}
      {tab === "benchmark" && isOwner && (
        <BenchmarkTab benchmark={benchmark} onChange={setBenchmark} />
      )}
    </MattiiShell>
  );
}
