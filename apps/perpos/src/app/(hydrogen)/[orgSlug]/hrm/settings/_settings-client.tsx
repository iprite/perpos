"use client";

// _settings-client.tsx — shell หน้าตั้งค่า HRM (5 แท็บ)
// 4 แท็บแรก = CRUD จริง (อยู่ใน _settings-tabs) · แท็บ "แจ้งเตือน LINE" = placeholder "เร็ว ๆ นี้"
// initial มาจาก server (lib/hrm/settings + leave) · mutation ทำใน tab component ผ่าน hrmMutate

import { useState } from "react";
import { CalendarOff, Coins, Landmark, BookOpen, MessageSquare } from "lucide-react";
import cn from "@core/utils/class-names";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import type { LeaveType, PayItem, Fund, AccountSetting } from "@/lib/hrm/types";
import { LeaveTab, PayItemTab, FundTab, AccountTab, SectionCard } from "./_settings-tabs";

type TabKey = "leave" | "payitem" | "fund" | "account" | "line";
const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: "leave", label: "ประเภทการลา & โควตา", icon: <CalendarOff className="h-4 w-4" /> },
  { key: "payitem", label: "เงินเพิ่ม/เงินหัก", icon: <Coins className="h-4 w-4" /> },
  { key: "fund", label: "กองทุน & ประกันสังคม", icon: <Landmark className="h-4 w-4" /> },
  { key: "account", label: "การบันทึกบัญชี", icon: <BookOpen className="h-4 w-4" /> },
  { key: "line", label: "แจ้งเตือน LINE", icon: <MessageSquare className="h-4 w-4" /> },
];

export function SettingsClient({
  payItems,
  funds,
  accountSettings,
  leaveTypes,
  orgId,
  canWrite,
}: {
  payItems: PayItem[];
  funds: Fund[];
  accountSettings: AccountSetting[];
  leaveTypes: LeaveType[];
  orgId: string;
  canWrite: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("leave");

  return (
    <div className="space-y-5">
      {/* Tab navigation — row เดียว, ล้นแล้วเลื่อนซ้าย-ขวา (ไม่ตกบรรทัด) */}
      <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? "secondary" : "ghost"}
            size="sm"
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

      {tab === "leave" && <LeaveTab rows={leaveTypes} orgId={orgId} canWrite={canWrite} />}
      {tab === "payitem" && <PayItemTab rows={payItems} orgId={orgId} canWrite={canWrite} />}
      {tab === "fund" && <FundTab rows={funds} orgId={orgId} canWrite={canWrite} />}
      {tab === "account" && <AccountTab rows={accountSettings} orgId={orgId} canWrite={canWrite} />}
      {tab === "line" && <LineTabPlaceholder />}
    </div>
  );
}

// ─── แท็บ "แจ้งเตือน LINE" = placeholder (production เลื่อน) ───
function LineTabPlaceholder() {
  return (
    <SectionCard
      title="แจ้งเตือน LINE"
      description="แจ้งเตือนอัตโนมัติทาง LINE เมื่อมีใบลา/สลิปเงินเดือน — กำลังพัฒนา"
    >
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <div className="mb-4 rounded-full bg-gray-100 p-4">
          <MessageSquare className="h-8 w-8 text-gray-400" />
        </div>
        <Text className="text-sm font-medium text-gray-700">เร็ว ๆ นี้</Text>
        <p className="mt-1 max-w-md text-sm text-gray-500">
          ระบบจะแจ้งเตือนผ่าน LINE อัตโนมัติเมื่อมีใบลารออนุมัติ ผลอนุมัติ และสลิปเงินเดือนใหม่ —
          กำลังพัฒนาและจะเปิดให้ตั้งค่าในเร็ว ๆ นี้
        </p>
      </div>
    </SectionCard>
  );
}
