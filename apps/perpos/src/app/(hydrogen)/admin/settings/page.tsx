"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings2, Save, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AdminPage, AdminCard } from "../_components/admin-page";

// ── นิยาม setting ที่รู้จัก (typed) — ฝั่งอื่นอ่านค่าจาก app_settings ตาม key นี้ ──────
type FieldType = "bool" | "number" | "text";
type Field = {
  key: string;
  label: string;
  type: FieldType;
  group: string;
  help?: string;
  default: unknown;
};

const FIELDS: Field[] = [
  {
    key: "signups_enabled",
    label: "เปิดรับสมาชิกใหม่ (LINE)",
    type: "bool",
    group: "การเข้าถึงระบบ",
    default: true,
    help: "ปิดเพื่อหยุด auto-provision ผู้ใช้ใหม่ที่แอด LINE OA",
  },
  {
    key: "maintenance_mode_global",
    label: "โหมดปิดปรับปรุงทั้งระบบ",
    type: "bool",
    group: "การเข้าถึงระบบ",
    default: false,
    help: "แสดงหน้าปิดปรับปรุงกับผู้ใช้ทุกคน (ยกเว้น super admin)",
  },
  {
    key: "assistant_trial_seconds",
    label: "โควต้าทดลองผู้ช่วย AI (วินาที)",
    type: "number",
    group: "ผู้ช่วย AI",
    default: 18000,
    help: "โควต้าเริ่มต้นของผู้ใช้ใหม่ — 18000 = 300 นาที",
  },
  {
    key: "assistant_monthly_price_thb",
    label: "ราคาผู้ช่วย AI (บาท/เดือน)",
    type: "number",
    group: "ผู้ช่วย AI",
    default: 99,
  },
  {
    key: "stt_max_upload_mb",
    label: "ขนาดไฟล์เสียงสูงสุด (MB)",
    type: "number",
    group: "ผู้ช่วย AI",
    default: 200,
  },
  {
    key: "support_contact_url",
    label: "ลิงก์ติดต่อซัพพอร์ต",
    type: "text",
    group: "ทั่วไป",
    default: "",
  },
];

const GROUPS = Array.from(new Set(FIELDS.map((f) => f.group)));

export default function AdminSettingsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const token = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings", {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      const json = await res.json();
      const stored = json?.data?.settings ?? {};
      const next: Record<string, unknown> = {};
      for (const f of FIELDS) next[f.key] = f.key in stored ? stored[f.key].value : f.default;
      setValues(next);
      setDirty({});
    } catch {
      toast.error("โหลดการตั้งค่าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (f: Field) => {
    setSavingKey(f.key);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ key: f.key, value: values[f.key], description: f.label }),
      });
      if (!res.ok) throw new Error();
      setDirty((d) => ({ ...d, [f.key]: false }));
      toast.success(`บันทึก "${f.label}" แล้ว`);
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setSavingKey(null);
    }
  };

  const setVal = (key: string, v: unknown) => {
    setValues((s) => ({ ...s, [key]: v }));
    setDirty((d) => ({ ...d, [key]: true }));
  };

  return (
    <AdminPage
      width="narrow"
      title="System Settings"
      icon={<Settings2 className="h-6 w-6" />}
      description="ตั้งค่าระดับระบบและ feature flags — มีผลทั้งแอป"
    >
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-6">
          {GROUPS.map((group) => (
            <AdminCard key={group} title={group} bodyClassName="p-5 divide-y divide-gray-100">
              {FIELDS.filter((f) => f.group === group).map((f) => (
                <div
                  key={f.key}
                  className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800">{f.label}</div>
                    {f.help && <div className="mt-0.5 text-xs text-gray-500">{f.help}</div>}
                    <code className="mt-1 inline-block text-[11px] text-gray-400">{f.key}</code>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {f.type === "bool" ? (
                      <button
                        type="button"
                        onClick={() => setVal(f.key, !values[f.key])}
                        className={`relative h-6 w-11 rounded-full transition-colors ${values[f.key] ? "bg-primary" : "bg-gray-300"}`}
                        aria-pressed={!!values[f.key]}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${values[f.key] ? "left-[22px]" : "left-0.5"}`}
                        />
                      </button>
                    ) : (
                      <Input
                        type={f.type === "number" ? "number" : "text"}
                        value={String(values[f.key] ?? "")}
                        onChange={(e) =>
                          setVal(
                            f.key,
                            f.type === "number" ? Number(e.target.value) : e.target.value,
                          )
                        }
                        className="w-44"
                      />
                    )}
                    <Button
                      size="sm"
                      variant={dirty[f.key] ? "default" : "outline"}
                      disabled={!dirty[f.key] || savingKey === f.key}
                      onClick={() => save(f)}
                    >
                      {savingKey === f.key ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </AdminCard>
          ))}
          <p className="text-xs text-gray-400">
            * ค่าเหล่านี้เก็บใน <code>app_settings</code> — การบังคับใช้ (enforcement)
            ทยอยต่อสายในแต่ละจุดของแอป
          </p>
        </div>
      )}
    </AdminPage>
  );
}
