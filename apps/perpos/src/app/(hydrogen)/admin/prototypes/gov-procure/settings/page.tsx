"use client";

// settings/page.tsx — ตั้งค่า/แจ้งเตือน (spec §5 #7 · §3.2b GovProcureSettings · §5c LINE T1-T4 · §5b AI)
// 3 section: (1) SLA & % default · (2) แจ้งเตือน LINE (toggle event/ผู้รับ/cron + Flex preview) · (3) AI mock
// prototype = client state ผ่าน updateSettings (ไม่มี DB) — เปลี่ยน SLA มีผลกับ receivables/dashboard สด
// viewer = read-only (banner + controls disabled) · ทุก mutation → toast · ห้ามปุ่ม refresh
//
// self-grep (ไฟล์นี้): ห้าม raw button/input/select/label/h1-6, rizzui ตรง, hardcoded hex, slate-*, hyphen ยอดลบ
//   (hex อยู่ใน flex-preview.tsx เท่านั้น = Flex mock exception)

import { useMemo, useState } from "react";
import {
  Settings,
  SlidersHorizontal,
  MessageSquare,
  Sparkles,
  Bell,
  BellOff,
  Percent,
  Timer,
  Users,
  CalendarClock,
  Info,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import { notify } from "@/lib/toast";
import cn from "@core/utils/class-names";
import {
  GovProcureShell,
  useData,
  useRole,
  fmtNum,
  pipelineValue,
  profitSplit,
  receivableSummary,
} from "../_components";
import type { GovProcureOrder, GovProcureSettings, ModuleRole } from "../_fixtures/types";
import {
  T1OverduePreview,
  T2WeeklyPreview,
  T3EventPreview,
  T3_PAID_PREVIEW_DATA,
  T3_DELIVERED_PREVIEW_DATA,
  T4CommandPreview,
} from "./flex-preview";
import { T2_WEEKLY_FLEX_DATA } from "../_fixtures/line-mocks";

const TODAY_LABEL = "1 ก.ค. 2569";

// สรุปพอร์ตแยกตามบริษัท (split 89 / P2P) — rule ล้วน (ใช้ป้อน T2 preview สด)
function companySplit(orders: GovProcureOrder[]): { split89: number; splitP2p: number } {
  let split89 = 0;
  let splitP2p = 0;
  for (const o of orders) {
    const v = o.price_incl_vat ?? 0;
    if (o.company === "89 Global Work") split89 += v;
    else if (o.company === "P2P Supply") splitP2p += v;
  }
  return { split89, splitP2p };
}

export default function GovProcureSettingsPage() {
  const { orders, settings, updateSettings } = useData();
  const { isViewer } = useRole();
  const locked = isViewer; // viewer = ดูอย่างเดียว

  return (
    <GovProcureShell
      title="ตั้งค่า/แจ้งเตือน"
      description="ปรับเกณฑ์ SLA · % ค่าเริ่มต้น · การแจ้งเตือนผ่าน LINE และผู้ช่วย AI ให้ตรงกับธุรกิจ"
      icon={<Settings className="h-6 w-6" />}
    >
      {locked && (
        <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            โหมดดูอย่างเดียว — การแก้ตั้งค่าสงวนไว้สำหรับเจ้าของกิจการและผู้จัดการงาน
            (ลองสลับบทบาทที่แถบด้านบนเพื่อแก้ไข)
          </span>
        </div>
      )}

      <SlaAndPercentSection settings={settings} onChange={updateSettings} locked={locked} />
      <LineNotifySection
        orders={orders}
        settings={settings}
        onChange={updateSettings}
        locked={locked}
      />
      <AiSection locked={locked} />
    </GovProcureShell>
  );
}

// ───────────────────────── SectionCard (เปลือก section ตั้งค่า) ─────────────────────────

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <Text className="text-sm font-semibold text-gray-900">{title}</Text>
          {description && <Text className="mt-0.5 text-xs text-gray-500">{description}</Text>}
        </div>
      </div>
      <div className="space-y-5 p-5">{children}</div>
    </div>
  );
}

/** แถวตั้งค่า toggle เปิด/ปิด (ใช้ SegmentedControl มาตรฐาน — ห้าม raw checkbox/switch) */
function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
  badge,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Text className="text-sm font-medium text-gray-900">{label}</Text>
          {badge}
        </div>
        {hint && <Text className="mt-0.5 text-xs text-gray-500">{hint}</Text>}
      </div>
      <div className={cn("shrink-0", disabled && "pointer-events-none opacity-50")}>
        <SegmentedControl<"on" | "off">
          size="sm"
          ariaLabel={label}
          value={value ? "on" : "off"}
          onChange={(v) => onChange(v === "on")}
          options={[
            { value: "on", label: "เปิด", activeClassName: "bg-green-600" },
            { value: "off", label: "ปิด" },
          ]}
        />
      </div>
    </div>
  );
}

// ───────────────────────── Section 1: SLA & % default ─────────────────────────

function SlaAndPercentSection({
  settings,
  onChange,
  locked,
}: {
  settings: GovProcureSettings;
  onChange: (patch: Partial<GovProcureSettings>) => void;
  locked: boolean;
}) {
  const setNum = (key: keyof GovProcureSettings, raw: string, label: string) => {
    const n = raw === "" ? null : Number(raw);
    if (n != null && (Number.isNaN(n) || n < 0)) return;
    onChange({ [key]: n } as Partial<GovProcureSettings>);
    notify.updated(`อัปเดต${label}แล้ว`);
  };

  return (
    <SectionCard
      icon={<SlidersHorizontal className="h-5 w-5" />}
      title="เกณฑ์ SLA และเปอร์เซ็นต์ค่าเริ่มต้น"
      description="เกณฑ์วันเงินค้างรับ (มีผลกับหน้าเงินค้างรับ/แดชบอร์ดทันที) และ % ช่วยกรอกตอนคำนวณการเงิน"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="sla">
            <span className="flex items-center gap-1.5">
              <Timer className="h-4 w-4 text-gray-400" /> เกณฑ์เงินค้างรับเกินกำหนด (วัน)
            </span>
          </Label>
          <Input
            id="sla"
            type="number"
            min={1}
            className="mt-1 w-full max-w-[180px] tabular-nums"
            value={settings.sla_threshold}
            disabled={locked}
            onChange={(e) => setNum("sla_threshold", e.target.value, "เกณฑ์ SLA")}
          />
          <Text className="mt-1 text-xs text-gray-500">
            งานที่ส่งของแล้วเกิน {fmtNum(settings.sla_threshold)} วันโดยยังไม่รับเช็ค = เกินกำหนด
            (แดง) — ลองปรับแล้วดูผลที่หน้า “เงินค้างรับ”
          </Text>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <Text className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Percent className="h-3.5 w-3.5" /> เปอร์เซ็นต์ช่วยกรอก (ต่อยอดสุทธิรับ)
        </Text>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <PercentField
            id="pct-change"
            label="ทอนลูกค้า"
            value={settings.pct_customer_change}
            disabled={locked}
            onCommit={(raw) => setNum("pct_customer_change", raw, "% ทอนลูกค้า")}
          />
          <PercentField
            id="pct-petty"
            label="Petty cash"
            value={settings.pct_petty}
            disabled={locked}
            onCommit={(raw) => setNum("pct_petty", raw, "% petty cash")}
          />
          <PercentField
            id="pct-operate"
            label="ค่าดำเนินการ 89"
            value={settings.pct_operate}
            disabled={locked}
            onCommit={(raw) => setNum("pct_operate", raw, "% ค่าดำเนินการ")}
          />
        </div>
      </div>
    </SectionCard>
  );
}

function PercentField({
  id,
  label,
  value,
  disabled,
  onCommit,
}: {
  id: string;
  label: string;
  value: number | null;
  disabled?: boolean;
  onCommit: (raw: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-1">
        <Input
          id={id}
          type="number"
          min={0}
          max={100}
          className="w-full pr-8 tabular-nums"
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onCommit(e.target.value)}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
          %
        </span>
      </div>
    </div>
  );
}

// ───────────────────────── Section 2: แจ้งเตือน LINE ─────────────────────────

const RECIPIENT_OPTIONS: { key: ModuleRole; label: string }[] = [
  { key: "owner", label: "เจ้าของกิจการ" },
  { key: "manager", label: "ผู้จัดการงาน" },
  { key: "staff", label: "ทีมหน้างาน" },
];

type LineTab = "T1" | "T2" | "T3" | "T4";

function LineNotifySection({
  orders,
  settings,
  onChange,
  locked,
}: {
  orders: GovProcureOrder[];
  settings: GovProcureSettings;
  onChange: (patch: Partial<GovProcureSettings>) => void;
  locked: boolean;
}) {
  const [tab, setTab] = useState<LineTab>("T1");
  const recipients = settings.line_recipients ?? [];

  const toggleRecipient = (role: ModuleRole) => {
    const has = recipients.includes(role);
    const next = has ? recipients.filter((r) => r !== role) : [...recipients, role];
    onChange({ line_recipients: next });
    notify.updated(has ? `นำ${roleLabel(role)}ออกจากผู้รับแล้ว` : `เพิ่ม${roleLabel(role)}เป็นผู้รับแล้ว`);
  };

  // ── live data ป้อน preview (rule ล้วน) ──
  const live = useMemo(() => {
    const recv = receivableSummary(orders, settings.sla_threshold);
    const pipeline = pipelineValue(orders);
    const profit = profitSplit(orders);
    const { split89, splitP2p } = companySplit(orders);
    const closedThisWeek = orders.filter((o) => o.stage === "closed").length;
    return { recv, pipeline, profit, split89, splitP2p, closedThisWeek };
  }, [orders, settings.sla_threshold]);

  const recipientsLabel =
    recipients.length === 0
      ? "ยังไม่ได้เลือกผู้รับ"
      : recipients.map((r) => roleLabel(r)).join(" + ");

  const LINE_TABS: { key: LineTab; label: string }[] = [
    { key: "T1", label: "T1 เงินค้างรับ" },
    { key: "T2", label: "T2 พอร์ตรายสัปดาห์" },
    { key: "T3", label: "T3 แจ้ง stage" },
    { key: "T4", label: "T4 คำสั่ง LINE" },
  ];

  return (
    <SectionCard
      icon={<MessageSquare className="h-5 w-5" />}
      title="แจ้งเตือนผ่าน LINE"
      description="เปิด/ปิดแต่ละเหตุการณ์ · เลือกผู้รับ · ดูตัวอย่างการ์ด Flex ที่จะส่ง (จำลอง ไม่ยิงจริง)"
    >
      {/* สวิตช์แม่ (เปิด/ปิดการแจ้งเตือนทั้งหมด) */}
      <ToggleRow
        label="เปิดการแจ้งเตือน LINE"
        hint="สวิตช์รวม — ปิดแล้วทุกเหตุการณ์จะไม่ถูกส่ง"
        value={settings.line_alert_enabled}
        disabled={locked}
        onChange={(v) => {
          onChange({ line_alert_enabled: v });
          notify.updated(v ? "เปิดแจ้งเตือน LINE แล้ว" : "ปิดแจ้งเตือน LINE แล้ว");
        }}
        badge={
          <StatusBadge tone={settings.line_alert_enabled ? "success" : "neutral"} className="gap-1">
            {settings.line_alert_enabled ? (
              <Bell className="h-3 w-3" />
            ) : (
              <BellOff className="h-3 w-3" />
            )}
            {settings.line_alert_enabled ? "เปิดอยู่" : "ปิดอยู่"}
          </StatusBadge>
        }
      />

      <div
        className={cn(
          "space-y-5 border-t border-gray-100 pt-5",
          !settings.line_alert_enabled && "opacity-50",
        )}
      >
        {/* เหตุการณ์ย่อย */}
        <div className="space-y-4">
          <EventRow
            label="T1 · เงินค้างรับเกินกำหนด"
            hint="ทุกวัน 09:00 — ส่งเฉพาะเมื่อมีงานเกิน SLA (การ์ดสรุป + top 5 งาน)"
            cron="รายวัน 09:00"
            value={settings.line_alert_enabled}
            disabled
            onChange={() => undefined}
            note="ผูกกับสวิตช์รวม (เปิด/ปิดที่ด้านบน)"
          />
          <EventRow
            label="T2 · รายงานพอร์ตรายสัปดาห์"
            hint="สรุปมูลค่าพอร์ต/ค้างรับ/ปิดใหม่/กำไร + split 89-P2P"
            cron="จันทร์ 08:00"
            value={settings.line_weekly_enabled}
            disabled={locked || !settings.line_alert_enabled}
            onChange={(v) => {
              onChange({ line_weekly_enabled: v });
              notify.updated(v ? "เปิดรายงานรายสัปดาห์แล้ว" : "ปิดรายงานรายสัปดาห์แล้ว");
            }}
          />
          <EventRow
            label="T3 · แจ้งเมื่อรับเช็ค (paid)"
            hint="ส่งทันทีเมื่องานเปลี่ยนเป็นรับเช็คแล้ว"
            cron="ตามเหตุการณ์"
            value={settings.line_event_paid}
            disabled={locked || !settings.line_alert_enabled}
            onChange={(v) => {
              onChange({ line_event_paid: v });
              notify.updated(v ? "เปิดแจ้งรับเช็คแล้ว" : "ปิดแจ้งรับเช็คแล้ว");
            }}
          />
          <EventRow
            label="T3 · แจ้งเมื่อส่งมอบ (delivered)"
            hint="ส่งทันทีเมื่องานเปลี่ยนเป็นส่งมอบแล้ว (ค่าเริ่มต้นปิด กันแจ้งบ่อย)"
            cron="ตามเหตุการณ์"
            value={settings.line_event_delivered}
            disabled={locked || !settings.line_alert_enabled}
            onChange={(v) => {
              onChange({ line_event_delivered: v });
              notify.updated(v ? "เปิดแจ้งส่งมอบแล้ว" : "ปิดแจ้งส่งมอบแล้ว");
            }}
          />
        </div>

        {/* ผู้รับ (multi-select ด้วยชิปปุ่ม) */}
        <div className="border-t border-gray-100 pt-4">
          <Text className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Users className="h-3.5 w-3.5" /> ผู้รับการแจ้งเตือน (เลือกได้หลายบทบาท)
          </Text>
          <div className="flex flex-wrap gap-2">
            {RECIPIENT_OPTIONS.map((opt) => {
              const active = recipients.includes(opt.key);
              return (
                <Button
                  key={opt.key}
                  type="button"
                  size="sm"
                  variant={active ? "secondary" : "outline"}
                  disabled={locked || !settings.line_alert_enabled}
                  className={cn(active && "bg-primary/10 text-primary")}
                  onClick={() => toggleRecipient(opt.key)}
                >
                  {active ? <Bell className="mr-1.5 h-3.5 w-3.5" /> : null}
                  {opt.label}
                </Button>
              );
            })}
          </div>
          <Text className="mt-2 text-xs text-gray-500">
            จะส่งถึง: <span className="font-medium text-gray-700">{recipientsLabel}</span>{" "}
            (ต้องผูกบัญชี LINE ไว้แล้ว)
          </Text>
        </div>
      </div>

      {/* Flex preview — toggle sub-tab ต่อการ์ด */}
      <div className="border-t border-gray-100 pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Text className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <MessageSquare className="h-4 w-4 text-primary" /> ตัวอย่างการ์ดที่จะส่งใน LINE
          </Text>
          <StatusBadge tone="info">จำลอง — ไม่ยิง LINE จริง</StatusBadge>
        </div>
        <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LINE_TABS.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={tab === t.key ? "secondary" : "ghost"}
              className={cn("shrink-0 whitespace-nowrap", tab === t.key && "bg-gray-100 text-gray-900")}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-6 rounded-xl border border-gray-100 bg-gray-50 p-5">
          {tab === "T1" && (
            <div className="space-y-2">
              <T1OverduePreview
                overdue={live.recv.list.filter((r) => r.overdue)}
                overdueAmount={live.recv.overdueAmount}
                slaThreshold={settings.sla_threshold}
                dateLabel={TODAY_LABEL}
              />
              <Text className="max-w-[320px] text-center text-xs text-gray-500">
                อัปเดตสดตามเกณฑ์ SLA ({fmtNum(settings.sla_threshold)} วัน) — ปรับ SLA
                ด้านบนแล้วดูจำนวนงานเปลี่ยน
              </Text>
            </div>
          )}
          {tab === "T2" && (
            <div className="space-y-2">
              <T2WeeklyPreview
                weekLabel={T2_WEEKLY_FLEX_DATA.week_label}
                pipelineValue={live.pipeline}
                split89={live.split89}
                splitP2p={live.splitP2p}
                closedThisWeek={live.closedThisWeek}
                receivableTotal={live.recv.totalAmount}
                receivableCount={live.recv.list.length}
                profitRealized={live.profit.realized}
                profitPending={live.profit.pending}
                aiInsight={T2_WEEKLY_FLEX_DATA.ai_insight}
              />
              <Text className="max-w-[320px] text-center text-xs text-gray-500">
                ตัวเลขคำนวณสดจากพอร์ต — ผู้รับ: {recipientsLabel}
              </Text>
            </div>
          )}
          {tab === "T3" && (
            <>
              <div className="space-y-2">
                <T3EventPreview data={T3_PAID_PREVIEW_DATA} />
                <Text className="max-w-[320px] text-center text-xs text-gray-500">
                  รับเช็ค (paid) —{" "}
                  {settings.line_event_paid ? "เปิดอยู่ จะส่ง" : "ปิดอยู่ จะไม่ส่ง"}
                </Text>
              </div>
              <div className="space-y-2">
                <T3EventPreview data={T3_DELIVERED_PREVIEW_DATA} />
                <Text className="max-w-[320px] text-center text-xs text-gray-500">
                  ส่งมอบ (delivered) —{" "}
                  {settings.line_event_delivered ? "เปิดอยู่ จะส่ง" : "ปิดอยู่ จะไม่ส่ง"}
                </Text>
              </div>
            </>
          )}
          {tab === "T4" && (
            <div className="w-full max-w-[420px] space-y-2">
              <T4CommandPreview />
              <Text className="text-center text-xs text-gray-500">
                คำสั่งใน LINE (ทุกสมาชิกโมดูลใช้ได้) — บอทตอบด้วยการ์ดเดิม (T1/T2)
              </Text>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

/** แถวเหตุการณ์ LINE — toggle + cron badge + note */
function EventRow({
  label,
  hint,
  cron,
  value,
  onChange,
  disabled,
  note,
}: {
  label: string;
  hint: string;
  cron: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Text className="text-sm font-medium text-gray-900">{label}</Text>
          <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500">
            <CalendarClock className="h-3 w-3" /> {cron}
          </span>
        </div>
        <Text className="mt-0.5 text-xs text-gray-500">{hint}</Text>
        {note && <Text className="mt-0.5 text-[11px] text-gray-400">{note}</Text>}
      </div>
      <div className={cn("shrink-0", disabled && "pointer-events-none opacity-50")}>
        <SegmentedControl<"on" | "off">
          size="sm"
          ariaLabel={label}
          value={value ? "on" : "off"}
          onChange={(v) => onChange(v === "on")}
          options={[
            { value: "on", label: "เปิด", activeClassName: "bg-green-600" },
            { value: "off", label: "ปิด" },
          ]}
        />
      </div>
    </div>
  );
}

function roleLabel(role: ModuleRole): string {
  return RECIPIENT_OPTIONS.find((r) => r.key === role)?.label ?? role;
}

// ───────────────────────── Section 3: AI (mock config) ─────────────────────────

// เก็บ toggle AI ใน field เสริมของ settings ผ่าน key ที่ mirror production (client state เท่านั้น)
// prototype: ใช้ state ในหน้า (ไม่มีคอลัมน์ AI ใน GovProcureSettings) → local state คู่กับ session
function AiSection({ locked }: { locked: boolean }) {
  const [ai1, setAi1] = useState(true); // AI-1 Executive Brief
  const [ai2, setAi2] = useState(true); // AI-2 Anomaly / Margin Guard

  return (
    <SectionCard
      icon={<Sparkles className="h-5 w-5" />}
      title="ผู้ช่วย AI (จุดขาย Suite)"
      description="เปิด/ปิดฟีเจอร์ AI ที่ช่วยสรุปพอร์ตและจับกำไรผิดปกติ — AI เรียบเรียงจากตัวเลขจริงเท่านั้น"
    >
      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/[0.03] px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <Text className="text-xs text-gray-600">
          ทุกผลลัพธ์ AI เป็นตัวช่วยแนะนำ (rule คำนวณตัวเลข → AI เรียบเรียงเป็นภาษา) —
          โปรดตรวจสอบก่อนตัดสินใจเสมอ
        </Text>
      </div>

      <ToggleRow
        label="AI-1 · สรุปพอร์ตด้วย AI (Executive Brief)"
        hint="ปุ่ม “สรุปด้วย AI” ในแดชบอร์ด — สรุปสุขภาพพอร์ต เงินค้างรับ และงานที่ควรเร่งเป็นภาษาคน"
        value={ai1}
        disabled={locked}
        onChange={(v) => {
          setAi1(v);
          notify.updated(v ? "เปิด AI สรุปพอร์ตแล้ว" : "ปิด AI สรุปพอร์ตแล้ว");
        }}
      />
      <ToggleRow
        label="AI-2 · จับกำไรผิดปกติ (Margin Guard)"
        hint="ปุ่ม “อธิบายด้วย AI” ในงานที่กำไรต่ำ/ขาดทุน — อธิบายเหตุผลและจุดที่ควรตรวจสอบ"
        value={ai2}
        disabled={locked}
        onChange={(v) => {
          setAi2(v);
          notify.updated(v ? "เปิด AI จับกำไรผิดปกติแล้ว" : "ปิด AI จับกำไรผิดปกติแล้ว");
        }}
      />
    </SectionCard>
  );
}
