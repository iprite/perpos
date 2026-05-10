"use client";

import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { upsertAccountSettingAction } from "@/lib/payroll/actions";

const SETTING_KEYS: { key: string; label: string; placeholder: string }[] = [
  { key: "salary_account",      label: "บัญชีเงินเดือนค้างจ่าย",           placeholder: "เช่น 215101 เงินเดือนค้างจ่าย" },
  { key: "ssf_employee_account", label: "บัญชีประกันสังคม (พนักงาน)",       placeholder: "เช่น 215201 ประกันสังคมค้างจ่าย" },
  { key: "ssf_employer_account", label: "บัญชีประกันสังคม (นายจ้าง)",       placeholder: "เช่น 515101 ประกันสังคม-นายจ้าง" },
  { key: "wht_account",         label: "บัญชีภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1)", placeholder: "เช่น 215301 ภ.ง.ด. 1 ค้างจ่าย" },
  { key: "salary_expense",      label: "บัญชีค่าใช้จ่ายเงินเดือน",          placeholder: "เช่น 511001 เงินเดือน-พนักงาน" },
];

export function PayrollAccountSettingsClient({
  organizationId,
  initialSettings,
}: {
  organizationId: string;
  initialSettings: Record<string, string>;
}) {
  const [values, setValues] = useState<Record<string, string>>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setErr(null);
    setSaved(false);

    for (const { key } of SETTING_KEYS) {
      const res = await upsertAccountSettingAction({
        organizationId,
        setting_key:   key,
        account_label: values[key] ?? "",
      });
      if (!res.ok) {
        setErr((res as any).error ?? "บันทึกไม่สำเร็จ");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="max-w-lg">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-5 font-semibold text-slate-800">การตั้งค่าบัญชีสำหรับการบันทึกเงินเดือน</h3>
        <div className="grid gap-5">
          {SETTING_KEYS.map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Input
                value={values[key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </Button>
          {saved && <span className="text-sm text-teal-600">บันทึกสำเร็จ</span>}
          {err && <span className="text-sm text-red-500">{err}</span>}
        </div>
      </div>
    </div>
  );
}
