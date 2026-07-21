"use client";

// _settings-client.tsx — ตั้งค่า/แจ้งเตือน (spec §5 #7 · §3.2b · §5c LINE T1-T4 · §5b AI)
// draft + save: แก้ในหน้า → กด "บันทึกการตั้งค่า" → PUT /api/gov-procure/settings จริง
// owner/manager เท่านั้นเห็นปุ่มบันทึก (canManageSettings) · role อื่น = read-only (controls disabled)
// preview Flex อัปเดตสดตาม draft (SLA/ผู้รับ/toggle) — จำลอง ไม่ยิง LINE จริง
//
// self-grep: hex อยู่ใน flex-preview.tsx เท่านั้น (Flex mock exception) — ไฟล์นี้ไม่มี hex

import { useEffect, useMemo, useState } from "react";
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
import cn from "@core/utils/class-names";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import { toast } from "@/lib/toast";
import type { GovProcureOrder, GovProcureSettings, GovProcureRole } from "@/lib/gov-procure/types";
import {
  GovProcureProvider,
  useData,
  useRole,
  fmtNum,
  fmtMoney,
  fmtDateTH,
  pipelineValue,
  profitSplit,
  receivableSummary,
} from "../_components";
import {
  T1OverduePreview,
  T2WeeklyPreview,
  T3EventPreview,
  T3_PAID_PREVIEW_DATA,
  T3_DELIVERED_PREVIEW_DATA,
  T4CommandPreview,
} from "./flex-preview";

// ── writable patch (กัน dirty compare + payload PUT) ──
function settingsPatch(d: GovProcureSettings) {
  return {
    sla_threshold: d.sla_threshold,
    pct_customer_change: d.pct_customer_change,
    pct_petty: d.pct_petty,
    pct_operate: d.pct_operate,
    line_alert_enabled: d.line_alert_enabled,
    line_recipients: d.line_recipients,
    line_weekly_enabled: d.line_weekly_enabled,
    line_event_paid: d.line_event_paid,
    line_event_delivered: d.line_event_delivered,
  };
}

/** สรุปพอร์ตแยกตามบริษัท (ป้อน T2 preview สด) */
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

function currentWeekLabel(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Mon=0
  const mon = new Date(now);
  mon.setDate(now.getDate() - day);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return `${fmtDateTH(mon.toISOString().slice(0, 10))} – ${fmtDateTH(sun.toISOString().slice(0, 10))}`;
}

export function SettingsClient({
  orders,
  settings,
  orgId,
  orgSlug,
  role,
}: {
  orders: GovProcureOrder[];
  settings: GovProcureSettings;
  orgId: string;
  orgSlug: string;
  role: GovProcureRole;
}) {
  return (
    <GovProcureProvider
      orgId={orgId}
      orgSlug={orgSlug}
      role={role}
      initialOrders={orders}
      initialSettings={settings}
    >
      <SettingsBody />
    </GovProcureProvider>
  );
}

function SettingsBody() {
  const { orders, settings, updateSettings } = useData();
  const { canManageSettings } = useRole();
  const locked = !canManageSettings;

  const [draft, setDraft] = useState<GovProcureSettings>(settings);
  const [saving, setSaving] = useState(false);

  // re-seed draft เมื่อ settings ถูกบันทึก (provider อัปเดต) — reset dirty
  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const dirty = useMemo(
    () => JSON.stringify(settingsPatch(draft)) !== JSON.stringify(settingsPatch(settings)),
    [draft, settings],
  );

  const update = (patch: Partial<GovProcureSettings>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  async function save() {
    setSaving(true);
    try {
      await updateSettings(settingsPatch(draft));
      toast.success("บันทึกการตั้งค่าแล้ว");
    } catch (e) {
      toast.error((e as Error).message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      width="full"
      icon={<Settings className="h-6 w-6" />}
      title="ตั้งค่า/แจ้งเตือน"
      description="ปรับเกณฑ์ SLA · % ค่าเริ่มต้น · การแจ้งเตือนผ่าน LINE และผู้ช่วย AI ให้ตรงกับธุรกิจ"
      actions={
        canManageSettings ? (
          <Button disabled={!dirty || saving} onClick={save}>
            {saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {locked && (
          <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              โหมดดูอย่างเดียว — การแก้ตั้งค่าสงวนไว้สำหรับเจ้าของกิจการและผู้จัดการงานเท่านั้น
            </span>
          </div>
        )}

        <SlaAndPercentSection settings={draft} onChange={update} locked={locked} />
        <LineNotifySection orders={orders} settings={draft} onChange={update} locked={locked} />
        <AiSection locked={locked} />
      </div>
    </PageShell>
  );
}

// ───────────────────────── SectionCard ─────────────────────────
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

/** แถว toggle เปิด/ปิด (SegmentedControl มาตรฐาน) */
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

// ───────────────────────── Section 1: SLA & % ─────────────────────────
function SlaAndPercentSection({
  settings,
  onChange,
  locked,
}: {
  settings: GovProcureSettings;
  onChange: (patch: Partial<GovProcureSettings>) => void;
  locked: boolean;
}) {
  const setNum = (key: keyof GovProcureSettings, raw: string) => {
    const n = raw === "" ? null : Number(raw);
    if (n != null && (Number.isNaN(n) || n < 0)) return;
    onChange({ [key]: n } as Partial<GovProcureSettings>);
  };

  return (
    <SectionCard
      icon={<SlidersHorizontal className="h-5 w-5" />}
      title="เกณฑ์ SLA และเปอร์เซ็นต์ค่าเริ่มต้น"
      description="เกณฑ์วันเงินค้างรับ (มีผลกับหน้าเงินค้างรับ/แดชบอร์ด) และ % ช่วยกรอกตอนคำนวณการเงิน"
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
            onChange={(e) => setNum("sla_threshold", e.target.value)}
          />
          <Text className="mt-1 text-xs text-gray-500">
            งานที่ส่งของแล้วเกิน {fmtNum(settings.sla_threshold)} วันโดยยังไม่รับเช็ค = เกินกำหนด
            (แดง)
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
            onCommit={(raw) => setNum("pct_customer_change", raw)}
          />
          <PercentField
            id="pct-petty"
            label="Petty cash"
            value={settings.pct_petty}
            disabled={locked}
            onCommit={(raw) => setNum("pct_petty", raw)}
          />
          <PercentField
            id="pct-operate"
            label="ค่าดำเนินการ 89"
            value={settings.pct_operate}
            disabled={locked}
            onCommit={(raw) => setNum("pct_operate", raw)}
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

// ───────────────────────── Section 2: LINE ─────────────────────────
const RECIPIENT_OPTIONS: { key: GovProcureRole; label: string }[] = [
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

  const toggleRecipient = (roleKey: GovProcureRole) => {
    const has = recipients.includes(roleKey);
    const next = has ? recipients.filter((r) => r !== roleKey) : [...recipients, roleKey];
    onChange({ line_recipients: next });
  };

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

  const weekLabel = useMemo(() => currentWeekLabel(), []);
  const aiInsight =
    live.recv.overdueCount > 0
      ? `เงินค้างรับ ${fmtMoney(live.recv.totalAmount)} — มี ${fmtNum(live.recv.overdueCount)} งานเกิน SLA ควรเร่งทวงก่อนสัปดาห์หน้า`
      : `เงินค้างรับ ${fmtMoney(live.recv.totalAmount)} · ปิดงานสะสม ${fmtNum(live.closedThisWeek)} งาน — cashflow อยู่ในเกณฑ์ดี`;

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
      <ToggleRow
        label="เปิดการแจ้งเตือน LINE"
        hint="สวิตช์รวม — ปิดแล้วทุกเหตุการณ์จะไม่ถูกส่ง"
        value={settings.line_alert_enabled}
        disabled={locked}
        onChange={(v) => onChange({ line_alert_enabled: v })}
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
            onChange={(v) => onChange({ line_weekly_enabled: v })}
          />
          <EventRow
            label="T3 · แจ้งเมื่อรับเช็ค (paid)"
            hint="ส่งทันทีเมื่องานเปลี่ยนเป็นรับเช็คแล้ว"
            cron="ตามเหตุการณ์"
            value={settings.line_event_paid}
            disabled={locked || !settings.line_alert_enabled}
            onChange={(v) => onChange({ line_event_paid: v })}
          />
          <EventRow
            label="T3 · แจ้งเมื่อส่งมอบ (delivered)"
            hint="ส่งทันทีเมื่องานเปลี่ยนเป็นส่งมอบแล้ว (ค่าเริ่มต้นปิด กันแจ้งบ่อย)"
            cron="ตามเหตุการณ์"
            value={settings.line_event_delivered}
            disabled={locked || !settings.line_alert_enabled}
            onChange={(v) => onChange({ line_event_delivered: v })}
          />
        </div>

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

      {/* Flex preview */}
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
              className={cn(
                "shrink-0 whitespace-nowrap",
                tab === t.key && "bg-gray-100 text-gray-900",
              )}
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
                dateLabel={fmtDateTH(new Date().toISOString().slice(0, 10))}
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
                weekLabel={weekLabel}
                pipelineValue={live.pipeline}
                split89={live.split89}
                splitP2p={live.splitP2p}
                closedThisWeek={live.closedThisWeek}
                receivableTotal={live.recv.totalAmount}
                receivableCount={live.recv.list.length}
                profitRealized={live.profit.realized}
                profitPending={live.profit.pending}
                aiInsight={aiInsight}
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

function roleLabel(role: GovProcureRole): string {
  return RECIPIENT_OPTIONS.find((r) => r.key === role)?.label ?? role;
}

// ───────────────────────── Section 3: AI ─────────────────────────
function AiSection({ locked }: { locked: boolean }) {
  const [ai1, setAi1] = useState(true);
  const [ai2, setAi2] = useState(true);

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
        onChange={setAi1}
      />
      <ToggleRow
        label="AI-2 · จับกำไรผิดปกติ (Margin Guard)"
        hint="ปุ่ม “อธิบายด้วย AI” ในงานที่กำไรต่ำ/ขาดทุน — อธิบายเหตุผลและจุดที่ควรตรวจสอบ"
        value={ai2}
        disabled={locked}
        onChange={setAi2}
      />
    </SectionCard>
  );
}
