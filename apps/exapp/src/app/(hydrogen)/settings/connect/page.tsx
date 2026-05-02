"use client";

import React, { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Switch, Textarea } from "rizzui";
import { Title, Text } from "rizzui/typography";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import AppSelect from "@core/ui/app-select";

type CustomerOption = { id: string; name: string };

type EmployerLineTemplateRow = {
  event_key: string;
  enabled: boolean;
  template_text: string;
  updated_at: string;
};

type EmployerLineLogRow = {
  id: string;
  customer_id: string;
  event_key: string;
  ref_table: string;
  ref_id: string;
  delivery_status: "SENT" | "FAILED";
  error_message: string | null;
  created_at: string;
  created_by_profile_id: string | null;
};

export default function SettingsConnectPage() {
  const { role } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const canManage = role === "admin" || role === "sale";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  const [generatedLinkUrl, setGeneratedLinkUrl] = useState<string>("");
  const [generatedExpiresAt, setGeneratedExpiresAt] = useState<string>("");

  const [templates, setTemplates] = useState<EmployerLineTemplateRow[]>([]);
  const [logs, setLogs] = useState<EmployerLineLogRow[]>([]);

  const customerOptions = useMemo(
    () => customers.map((c) => ({ label: c.name, value: c.id })),
    [customers],
  );

  const customerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) map.set(c.id, c.name);
    return map;
  }, [customers]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [custRes, tplRes, logRes] = await Promise.all([
        supabase.from("customers").select("id,name").order("updated_at", { ascending: false }).order("created_at", { ascending: false }).limit(800),
        supabase.from("employer_line_templates").select("event_key,enabled,template_text,updated_at").order("event_key", { ascending: true }),
        supabase
          .from("employer_line_message_logs")
          .select("id,customer_id,event_key,ref_table,ref_id,delivery_status,error_message,created_at,created_by_profile_id")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (custRes.error) {
        const msg = String(custRes.error.message ?? "");
        if (msg.includes("customers.updated_at") || (msg.includes("updated_at") && msg.toLowerCase().includes("does not exist"))) {
          const fallback = await supabase.from("customers").select("id,name").order("created_at", { ascending: false }).limit(800);
          if (fallback.error) throw new Error(fallback.error.message);
          setCustomers((fallback.data ?? []) as CustomerOption[]);
        } else {
          throw new Error(msg);
        }
      } else {
        setCustomers((custRes.data ?? []) as CustomerOption[]);
      }

      if (tplRes.error) throw new Error(tplRes.error.message);
      if (logRes.error) throw new Error(logRes.error.message);

      setTemplates((tplRes.data ?? []) as EmployerLineTemplateRow[]);
      setLogs((logRes.data ?? []) as EmployerLineLogRow[]);
    } catch (e: any) {
      setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
      setCustomers([]);
      setTemplates([]);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const createConnectLink = useCallback(async () => {
    if (!selectedCustomerId) throw new Error("กรุณาเลือกนายจ้าง");
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");

    const res = await fetch("/api/line/employer/connect-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ customerId: selectedCustomerId }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(data.error || "สร้างลิงก์ไม่สำเร็จ");
    setGeneratedLinkUrl(String(data.linkUrl ?? ""));
    setGeneratedExpiresAt(String(data.expiresAt ?? ""));
    toast.success("สร้างลิงก์แล้ว");
  }, [selectedCustomerId, supabase]);

  const copyLink = useCallback(async () => {
    const url = generatedLinkUrl.trim();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success("คัดลอกลิงก์แล้ว");
  }, [generatedLinkUrl]);

  const saveTemplate = useCallback(
    async (eventKey: string, next: { enabled: boolean; template_text: string }) => {
      const { error: e } = await supabase
        .from("employer_line_templates")
        .upsert(
          {
            event_key: eventKey,
            enabled: next.enabled,
            template_text: next.template_text,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "event_key" },
        );
      if (e) throw new Error(e.message);
      toast.success("บันทึกแม่แบบแล้ว");
      await refresh();
    },
    [refresh, supabase],
  );

  if (!canManage) {
    return (
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          เชื่อมต่อ
        </Title>
        <Text className="mt-1 text-sm text-gray-600">หน้านี้สำหรับ admin/sale เท่านั้น</Text>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            เชื่อมต่อ
          </Title>
          <Text className="mt-1 text-sm text-gray-600">เชื่อมต่อนายจ้างกับ LINE @exworker และจัดการการส่งอัปเดต</Text>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh} disabled={loading}>
            รีเฟรช
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
          <div className="text-sm font-semibold text-gray-900">สร้างลิงก์เชื่อมต่อให้นายจ้าง</div>
          <div className="mt-1 text-xs text-gray-600">ระบบจะสร้างลิงก์ให้ทีมงานคัดลอกส่งให้ลูกค้ากดใน LINE เพื่อเชื่อมต่อ</div>

          <div className="mt-4 grid gap-3">
            <AppSelect
              label="เลือกนายจ้าง"
              placeholder="ค้นหา/เลือกนายจ้าง"
              options={customerOptions}
              value={selectedCustomerId}
              onChange={(v: string) => setSelectedCustomerId(v)}
              getOptionValue={(o) => o.value}
              displayValue={(selected) => customerOptions.find((o) => o.value === selected)?.label ?? ""}
              inPortal={true}
              selectClassName="h-10 px-3"
              dropdownClassName="!z-[9999]"
            />

            <div className="flex flex-wrap gap-2">
              <Button onClick={async () => {
                try {
                  setLoading(true);
                  await createConnectLink();
                } catch (e: any) {
                  toast.error(e?.message ?? "สร้างลิงก์ไม่สำเร็จ");
                } finally {
                  setLoading(false);
                }
              }} disabled={loading || !selectedCustomerId}>
                สร้างลิงก์
              </Button>
              <Button variant="outline" onClick={copyLink} disabled={!generatedLinkUrl.trim()}>
                คัดลอกลิงก์
              </Button>
            </div>

            <Input label="ลิงก์ (ส่งให้ลูกค้ากดใน LINE)" value={generatedLinkUrl} readOnly />
            <div className="text-xs text-gray-600">
              {generatedExpiresAt ? `หมดอายุ: ${generatedExpiresAt}` : ""}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
          <div className="text-sm font-semibold text-gray-900">แม่แบบข้อความ (ส่งไปนายจ้าง)</div>
          <div className="mt-1 text-xs text-gray-600">ตัวแปรที่ใช้ได้: {"{employerName}"}, {"{quoteNo}"}, {"{orderNo}"}, {"{status}"}, {"{amount}"}</div>

          <div className="mt-4 grid gap-4">
            {templates.length === 0 ? (
              <div className="text-sm text-gray-600">ยังไม่มีแม่แบบ</div>
            ) : (
              templates.map((t) => (
                <div key={t.event_key} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{t.event_key}</div>
                      <div className="mt-0.5 text-xs text-gray-600">อัปเดตล่าสุด: {t.updated_at}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-gray-600">เปิดใช้งาน</div>
                      <Switch
                        checked={!!t.enabled}
                        onChange={async (e) => {
                          const checked = Boolean((e as any)?.target?.checked);
                          try {
                            setLoading(true);
                            await saveTemplate(t.event_key, { enabled: checked, template_text: t.template_text });
                          } catch (e: any) {
                            toast.error(e?.message ?? "บันทึกไม่สำเร็จ");
                          } finally {
                            setLoading(false);
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <Textarea
                      label="ข้อความ"
                      value={t.template_text}
                      onChange={(e) => {
                        const next = e.target.value;
                        setTemplates((prev) => prev.map((x) => (x.event_key === t.event_key ? { ...x, template_text: next } : x)));
                      }}
                      rows={4}
                      disabled={loading}
                    />
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          setLoading(true);
                          await saveTemplate(t.event_key, { enabled: !!t.enabled, template_text: t.template_text });
                        } catch (e: any) {
                          toast.error(e?.message ?? "บันทึกไม่สำเร็จ");
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                    >
                      บันทึก
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
        <div className="text-sm font-semibold text-gray-900">ประวัติการส่งล่าสุด</div>
        <div className="mt-1 text-xs text-gray-600">แสดง 50 รายการล่าสุด</div>

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[900px] overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr_1.2fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
              <div>เวลา</div>
              <div>นายจ้าง</div>
              <div>เหตุการณ์</div>
              <div>ผลลัพธ์</div>
              <div>ข้อความผิดพลาด</div>
            </div>
            {logs.length === 0 ? (
              <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
            ) : (
              logs.map((l) => (
                <div key={l.id} className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr_1.2fr] gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
                  <div className="text-sm text-gray-700">{l.created_at}</div>
                  <div className="text-sm font-medium text-gray-900">{customerNameById.get(l.customer_id) ?? l.customer_id}</div>
                  <div className="text-sm text-gray-700">{l.event_key}</div>
                  <div className={`text-sm font-semibold ${l.delivery_status === "SENT" ? "text-green-700" : "text-red-700"}`}>{l.delivery_status}</div>
                  <div className="text-sm text-gray-700">{l.error_message ?? "-"}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
