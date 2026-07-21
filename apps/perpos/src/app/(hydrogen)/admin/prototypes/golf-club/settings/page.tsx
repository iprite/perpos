"use client";

// settings/page.tsx — ตั้งค่า/LINE (P4b Group C) — client state (ไม่ persist ข้าม reload)
// เวลาเปิด-ปิด course/range · tee_interval · มัดจำ · reminder · LINE toggles + recipients + Flex preview
// ⛔ ไม่มี overbook toggle (D4 — allow_overbooking reserved-for-future) · staff → read-only banner

import { useState, type ReactNode } from "react";
import {
  Settings as SettingsIcon,
  Clock,
  Wallet,
  Bell,
  MessageCircle,
  Eye,
  Save,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/typography";
import { SegmentedControl } from "@/components/ui/segmented";
import cn from "@core/utils/class-names";
import { notify } from "@/lib/toast";
import { GolfShell, AccessLockBanner, useGolfRole, useGolfData } from "../_components";
import { GolfFlexPreview, FLEX_CARD_LABEL, type FlexCardKey } from "../_components/flex-preview";
import type { GolfSettings } from "../_fixtures/types";

export default function GolfSettingsPage() {
  const { canWrite } = useGolfRole();
  const { settings, updateSettings } = useGolfData();
  const writable = canWrite("settings");

  const [form, setForm] = useState<GolfSettings>(settings);
  const [previewCard, setPreviewCard] = useState<FlexCardKey>("t3");

  const set = <K extends keyof GolfSettings>(key: K, value: GolfSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setRecipient = (who: "owner" | "manager", value: boolean) =>
    setForm((f) => ({ ...f, line_recipients: { ...(f.line_recipients ?? { owner: true, manager: true }), [who]: value } }));

  function save() {
    updateSettings(form);
    notify.saved("บันทึกการตั้งค่าแล้ว (จำลอง — ไม่ persist ข้าม reload)");
  }
  function reset() {
    setForm(settings);
    notify.info("คืนค่าเป็นค่าที่บันทึกไว้ล่าสุด");
  }

  return (
    <GolfShell
      title="ตั้งค่า"
      description="เวลาเปิด-ปิดสนาม · มัดจำ · การเตือน · การแจ้งเตือน LINE"
      icon={<SettingsIcon className="h-6 w-6" />}
      actions={
        writable ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              คืนค่า
            </Button>
            <Button onClick={save}>
              <Save className="mr-1.5 h-4 w-4" />
              บันทึก
            </Button>
          </div>
        ) : undefined
      }
    >
      {!writable && (
        <AccessLockBanner>
          โหมดดูอย่างเดียว — บทบาทนี้ดูการตั้งค่าได้แต่แก้ไขไม่ได้ (ต้องเป็นผู้จัดการ/เจ้าของ)
        </AccessLockBanner>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ── เวลาสนาม ── */}
        <Section icon={<Clock className="h-4 w-4" />} title="เวลาเปิด-ปิด & ช่วง tee-time">
          <div className="grid grid-cols-2 gap-3">
            <Field label="เปิดสนามกอล์ฟ">
              <Input type="time" value={form.course_open_time ?? ""} disabled={!writable} onChange={(e) => set("course_open_time", e.target.value)} />
            </Field>
            <Field label="ปิดสนามกอล์ฟ">
              <Input type="time" value={form.course_close_time ?? ""} disabled={!writable} onChange={(e) => set("course_close_time", e.target.value)} />
            </Field>
            <Field label="เปิดสนามไดร์ฟ">
              <Input type="time" value={form.range_open_time ?? ""} disabled={!writable} onChange={(e) => set("range_open_time", e.target.value)} />
            </Field>
            <Field label="ปิดสนามไดร์ฟ">
              <Input type="time" value={form.range_close_time ?? ""} disabled={!writable} onChange={(e) => set("range_close_time", e.target.value)} />
            </Field>
            <Field label="ช่วงห่าง tee-time (นาที)">
              <Input type="number" min={5} max={30} value={form.default_tee_interval_min} disabled={!writable} onChange={(e) => set("default_tee_interval_min", Number(e.target.value) || 10)} />
            </Field>
          </div>
          <Text className="mt-1 text-[11px] text-gray-400">
            เปลี่ยนช่วงห่างจะมีผลกับจำนวนช่อง tee-time ต่อวันในตารางจอง
          </Text>
        </Section>

        {/* ── มัดจำ & การเตือน ── */}
        <Section icon={<Wallet className="h-4 w-4" />} title="มัดจำ & การเตือน">
          <ToggleRow
            icon={<Wallet className="h-4 w-4" />}
            label="บังคับมัดจำตอนจอง"
            desc="จองผ่าน LINE/เว็บต้องชำระมัดจำก่อนยืนยัน"
            checked={form.require_deposit}
            disabled={!writable}
            onChange={(v) => set("require_deposit", v)}
          />
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Field label="มัดจำเริ่มต้น (฿)">
              <Input type="number" min={0} step={100} value={form.deposit_amount_default ?? 0} disabled={!writable || !form.require_deposit} onChange={(e) => set("deposit_amount_default", Number(e.target.value) || 0)} />
            </Field>
            <Field label="เตือนก่อนถึงคิว (ชม.)">
              <Input type="number" min={1} max={72} value={form.reminder_hours_before} disabled={!writable} onChange={(e) => set("reminder_hours_before", Number(e.target.value) || 12)} />
            </Field>
          </div>
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span>
              ระบบไม่อนุญาต overbook (v1) — 1 flight/ช่อง, 1 จอง/bay/ช่วงเวลา เสมอ
            </span>
          </div>
        </Section>
      </div>

      {/* ── LINE ── */}
      <Section icon={<MessageCircle className="h-4 w-4" />} title="การแจ้งเตือน LINE" full>
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
          <ToggleRow label="เปิดจองผ่าน LINE (LIFF)" desc="ลูกค้าจองสนาม/ไดร์ฟเองผ่าน LINE 24 ชม." checked={form.line_booking_enabled} disabled={!writable} onChange={(v) => set("line_booking_enabled", v)} />
          <ToggleRow label="ส่งการ์ดยืนยันการจอง (T3)" desc="เมื่อยืนยันคิว → ส่งการ์ดยืนยันเข้าแชท" checked={form.line_confirm_enabled} disabled={!writable} onChange={(v) => set("line_confirm_enabled", v)} />
          <ToggleRow label="เตือนก่อนถึงคิว (T4)" desc={`เตือนล่วงหน้า ${form.reminder_hours_before} ชม. ก่อนออกรอบ`} checked={form.line_reminder_enabled} disabled={!writable} onChange={(v) => set("line_reminder_enabled", v)} />
          <ToggleRow label="รีพอตเจ้าของรายวัน (T6)" desc="สรุปรายได้/utilization/no-show ทุกเย็น" checked={form.line_owner_report_enabled} disabled={!writable} onChange={(v) => set("line_owner_report_enabled", v)} />
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <Text className="mb-2 text-xs font-medium text-gray-600">ผู้รับรีพอตเจ้าของ (T6)</Text>
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-6">
            <ToggleRow label="เจ้าของ / GM" checked={form.line_recipients?.owner ?? false} disabled={!writable || !form.line_owner_report_enabled} onChange={(v) => setRecipient("owner", v)} compact />
            <ToggleRow label="ผู้จัดการ" checked={form.line_recipients?.manager ?? false} disabled={!writable || !form.line_owner_report_enabled} onChange={(v) => setRecipient("manager", v)} compact />
          </div>
        </div>
      </Section>

      {/* ── Flex preview ── */}
      <Section icon={<Eye className="h-4 w-4" />} title="ตัวอย่างการ์ด LINE (Flex) ที่จะส่ง" full>
        <div className="overflow-x-auto">
          <SegmentedControl
            value={previewCard}
            onChange={setPreviewCard}
            size="sm"
            ariaLabel="เลือกการ์ด Flex"
            options={(["t1", "t3", "t6"] as FlexCardKey[]).map((k) => ({ value: k, label: FLEX_CARD_LABEL[k] }))}
          />
        </div>
        <div className="mt-4 flex justify-center rounded-xl border border-gray-200 bg-gray-50 p-6">
          <GolfFlexPreview card={previewCard} />
        </div>
        <Text className="mt-2 text-center text-[11px] text-gray-400">
          ภาพจำลองการ์ดที่ลูกค้า/เจ้าของจะเห็นใน LINE — ยังไม่ส่งจริง (prototype)
        </Text>
      </Section>
    </GolfShell>
  );
}

// ── helpers ──
function Section({
  icon,
  title,
  full,
  children,
}: {
  icon: ReactNode;
  title: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border border-gray-200 bg-white p-5 shadow-sm", full && "lg:col-span-2")}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <Text className="text-sm font-semibold text-gray-900">{title}</Text>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block text-xs font-medium text-gray-500">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  desc,
  checked,
  onChange,
  disabled,
  compact,
}: {
  icon?: ReactNode;
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", compact ? "py-1" : "border-b border-gray-100 py-2.5 last:border-b-0")}>
      <div className="flex items-start gap-2">
        {icon && <span className="mt-0.5 text-gray-400">{icon}</span>}
        <div>
          <Text className="text-sm text-gray-800">{label}</Text>
          {desc && <Text className="text-xs text-gray-400">{desc}</Text>}
        </div>
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}
