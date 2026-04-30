"use client";

import React, { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "rizzui";
import { Title, Text } from "rizzui/typography";
import { useRouter } from "next/navigation";

import { useAuth } from "@/app/shared/auth-provider";
import { NotificationSettingsRecipientsCard, type RecipientRow } from "@/components/notifications/notification-settings-recipients";
import { NotificationSettingsRulesCard, type RuleRow } from "@/components/notifications/notification-settings-rules";
import { NotificationSettingsTemplatesCard, type TemplateRow } from "@/components/notifications/notification-settings-templates";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type DocType = "passport" | "visa" | "wp";
type Audience = "employer" | "sale";
type CustomerOption = { id: string; name: string };

export default function NotificationSettingsPage() {
  const router = useRouter();
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const canManage = role === "admin" || role === "sale" || role === "operation";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rules, setRules] = useState<RuleRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);

  const runWithLoading = useCallback(
    async (fn: () => Promise<void>) => {
      setLoading(true);
      setError(null);
      try {
        await fn();
      } catch (e: any) {
        setError(e?.message ?? "ทำงานไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ruleRes, tplRes, custRes, recRes] = await Promise.all([
        supabase
          .from("document_expiry_notification_rules")
          .select("id,customer_id,doc_type,lead_days,enabled,notify_employer,notify_sale,notify_in_app,notify_email")
          .order("doc_type", { ascending: true }),
        supabase
          .from("document_expiry_notification_templates")
          .select("id,customer_id,doc_type,audience,channel,subject_template,body_template,enabled")
          .order("doc_type", { ascending: true }),
        supabase.from("customers").select("id,name").order("updated_at", { ascending: false }).order("created_at", { ascending: false }).limit(500),
        supabase
          .from("document_expiry_notification_recipients")
          .select("id,customer_id,audience,channel,destination_email,enabled,note")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (custRes.error) {
        const msg = String(custRes.error.message ?? "");
        if (msg.includes("customers.updated_at") || (msg.includes("updated_at") && msg.toLowerCase().includes("does not exist"))) {
          const fallback = await supabase.from("customers").select("id,name").order("created_at", { ascending: false }).limit(500);
          if (!fallback.error) setCustomers(((fallback.data ?? []) as CustomerOption[]) ?? []);
        }
      }
      const firstErr = ruleRes.error ?? tplRes.error ?? recRes.error;
      if (firstErr) throw new Error(firstErr.message);
      setRules(((ruleRes.data ?? []) as RuleRow[]) ?? []);
      setTemplates(((tplRes.data ?? []) as TemplateRow[]) ?? []);
      if (!custRes.error) setCustomers(((custRes.data ?? []) as CustomerOption[]) ?? []);
      setRecipients(((recRes.data ?? []) as RecipientRow[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
      setRules([]);
      setTemplates([]);
      setCustomers([]);
      setRecipients([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const upsertGlobalRule = useCallback(
    async (docType: DocType, next: Partial<RuleRow> & { lead_days?: number[] }) => {
      const existing = rules.find((r) => r.customer_id === null && r.doc_type === docType) ?? null;
      const payload = {
        customer_id: null,
        doc_type: docType,
        lead_days: next.lead_days ?? existing?.lead_days ?? [90, 60, 30, 14, 7, 0],
        enabled: typeof next.enabled === "boolean" ? next.enabled : existing?.enabled ?? true,
        notify_employer: typeof next.notify_employer === "boolean" ? next.notify_employer : existing?.notify_employer ?? true,
        notify_sale: typeof next.notify_sale === "boolean" ? next.notify_sale : existing?.notify_sale ?? true,
        notify_in_app: typeof next.notify_in_app === "boolean" ? next.notify_in_app : existing?.notify_in_app ?? true,
        notify_email: typeof next.notify_email === "boolean" ? next.notify_email : existing?.notify_email ?? true,
        created_by_profile_id: userId,
        updated_at: new Date().toISOString(),
      };
      if (existing?.id) {
        const { error: e } = await supabase.from("document_expiry_notification_rules").update(payload).eq("id", existing.id);
        if (e) throw new Error(e.message);
        return;
      }
      const { error: e } = await supabase.from("document_expiry_notification_rules").insert(payload);
      if (e) throw new Error(e.message);
    },
    [rules, supabase, userId],
  );

  const saveTemplate = useCallback(
    async (id: string, next: Pick<TemplateRow, "subject_template" | "body_template" | "enabled">) => {
      const { error: e } = await supabase
        .from("document_expiry_notification_templates")
        .update({
          subject_template: next.subject_template,
          body_template: next.body_template,
          enabled: next.enabled,
          created_by_profile_id: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (e) throw new Error(e.message);
      toast.success("บันทึกแม่แบบแล้ว");
      await refresh();
    },
    [refresh, supabase, userId],
  );

  const sendTest = useCallback(
    async (docType: DocType, audience: Audience, toEmail: string) => {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
      const res = await fetch("/api/notifications/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: toEmail, doc_type: docType, audience }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(data.error || "ส่งไม่สำเร็จ");
      toast.success("ส่งทดสอบแล้ว");
    },
    [supabase],
  );

  const addRecipient = useCallback(
    async (input: { customerId: string; audience: Audience; email: string; note: string }) => {
      if (!input.customerId) throw new Error("กรุณาเลือกนายจ้าง");
      const email = input.email.trim();
      if (!email) throw new Error("กรุณากรอกอีเมล");
      const payload = {
        customer_id: input.customerId,
        audience: input.audience,
        channel: "email",
        destination_email: email,
        enabled: true,
        note: input.note.trim() || null,
        created_by_profile_id: userId,
        updated_at: new Date().toISOString(),
      };
      const { error: e } = await supabase.from("document_expiry_notification_recipients").insert(payload);
      if (e) throw new Error(e.message);
      toast.success("เพิ่มผู้รับแล้ว");
      await refresh();
    },
    [refresh, supabase, userId],
  );

  const toggleRecipient = useCallback(
    async (id: string, enabled: boolean) => {
      const { error: e } = await supabase
        .from("document_expiry_notification_recipients")
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (e) throw new Error(e.message);
      await refresh();
    },
    [refresh, supabase],
  );

  const runNow = useCallback(
    async (mode: "scan_only" | "scan_and_send") => {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
      const res = await fetch("/api/notifications/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(data.error || "ทำงานไม่สำเร็จ");
      toast.success(`สแกนแล้ว: ${Number(data.queuedCount ?? 0).toLocaleString()} • ส่งแล้ว: ${Number(data.sentCount ?? 0).toLocaleString()}`);
    },
    [supabase],
  );

  const visibleRecipients = useMemo(() => recipients as RecipientRow[], [recipients]);

  if (!userId) {
    return (
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">ตั้งค่าแจ้งเตือน</Title>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">กรุณาเข้าสู่ระบบ</div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">ตั้งค่าแจ้งเตือน</Title>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">บทบาทนี้ไม่มีสิทธิ์ตั้งค่า</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">ตั้งค่าแจ้งเตือนเอกสาร</Title>
          <Text className="mt-1 text-sm text-gray-600">กำหนดกติกา ผู้รับ แม่แบบ และทดสอบส่ง</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => (typeof window !== "undefined" && window.history.length > 1 ? router.back() : router.push("/"))}
            disabled={loading}
          >
            ปิด
          </Button>
          <Button variant="outline" onClick={() => runWithLoading(() => refresh())} disabled={loading}>รีเฟรช</Button>
          <Button variant="outline" onClick={() => runWithLoading(() => runNow("scan_only"))} disabled={loading}>สแกนอย่างเดียว</Button>
          <Button onClick={() => runWithLoading(() => runNow("scan_and_send"))} disabled={loading}>สแกนและส่ง</Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <NotificationSettingsRulesCard
          loading={loading}
          userId={userId}
          rules={rules}
          onUpsertGlobalRule={(doc, next) => runWithLoading(() => upsertGlobalRule(doc, next))}
          onRefresh={() => runWithLoading(() => refresh())}
        />
        <NotificationSettingsTemplatesCard
          loading={loading}
          templates={templates}
          onSaveTemplate={(id, next) => runWithLoading(() => saveTemplate(id, next))}
          onSendTest={(doc, audience, to) => runWithLoading(() => sendTest(doc, audience, to))}
        />
      </div>

      <div className="mt-5">
        <NotificationSettingsRecipientsCard
          loading={loading}
          customers={customers}
          recipients={visibleRecipients}
          onAdd={(input) => runWithLoading(() => addRecipient(input))}
          onToggle={(id, enabled) => runWithLoading(() => toggleRecipient(id, enabled))}
        />
      </div>
    </div>
  );
}
