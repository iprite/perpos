"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Title, Text } from "rizzui/typography";
import { Plus, Pencil, Trash2, Play, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock } from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { backendUrl } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ── Types ─────────────────────────────────────────────────────────────────────

type Stats7d = { total: number; success: number; success_pct: number; last_at: string | null } | null;

type Webhook = {
  id: string;
  name: string;
  url: string;
  event_types: string[];
  is_active: boolean;
  timeout_ms: number;
  retry_count: number;
  created_at: string;
  stats_7d: Stats7d;
};

type DeliveryLog = {
  id: string;
  event_type: string;
  response_status: number | null;
  response_body: string | null;
  latency_ms: number | null;
  attempt_no: number;
  success: boolean;
  delivered_at: string;
};

type OrgItem = { id: string; name: string };

const BLANK = {
  name:          "",
  url:           "",
  eventTypes:    "",   // comma-separated
  signingSecret: "",
  timeoutMs:     "10000",
  retryCount:    "3",
  isActive:      true,
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  const { role, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgs, setOrgs]         = useState<OrgItem[]>([]);
  const [orgId, setOrgId]       = useState("");
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [message, setMessage]   = useState<string | null>(null);

  // Modal
  const [modalMode, setModalMode]   = useState<"add" | "edit" | null>(null);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState({ ...BLANK });
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);

  // Logs panel
  const [logsWebhookId, setLogsWebhookId] = useState<string | null>(null);
  const [logs, setLogs]                   = useState<DeliveryLog[]>([]);
  const [logsLoading, setLogsLoading]     = useState(false);

  // Test ping state
  const [testingId, setTestingId]   = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; status: number | null; latencyMs: number } | null>(null);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  // Load orgs on mount
  useEffect(() => {
    authHeader()
      .then(async (h) => {
        const res = await fetch(backendUrl("/admin/webhooks"), { headers: h });
        const json = await res.json().catch(() => null);
        if (json?.orgs) setOrgs(json.orgs as OrgItem[]);
      })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadWebhooks = useCallback(async () => {
    if (!orgId) { setWebhooks([]); return; }
    setLoading(true);
    setError(null);
    try {
      const h = await authHeader();
      const res = await fetch(backendUrl(`/admin/webhooks?orgId=${orgId}`), { headers: h });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError(json?.error ?? "โหลดไม่สำเร็จ"); return; }
      setWebhooks((json?.webhooks ?? []) as Webhook[]);
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [orgId, authHeader]);

  useEffect(() => { loadWebhooks(); }, [loadWebhooks]);

  const loadLogs = useCallback(async (webhookId: string) => {
    setLogsLoading(true);
    try {
      const h = await authHeader();
      const res = await fetch(backendUrl(`/admin/webhooks?webhookId=${webhookId}&logs=1`), { headers: h });
      const json = await res.json().catch(() => null);
      setLogs((json?.logs ?? []) as DeliveryLog[]);
    } catch { /* ignore */ } finally {
      setLogsLoading(false);
    }
  }, [authHeader]);

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openAdd = () => {
    setForm({ ...BLANK });
    setEditId(null);
    setFormError(null);
    setModalMode("add");
  };

  const openEdit = (w: Webhook) => {
    setForm({
      name:          w.name,
      url:           w.url,
      eventTypes:    w.event_types.join(", "),
      signingSecret: "",   // never pre-fill secret
      timeoutMs:     String(w.timeout_ms),
      retryCount:    String(w.retry_count),
      isActive:      w.is_active,
    });
    setEditId(w.id);
    setFormError(null);
    setModalMode("edit");
  };

  const handleSave = async () => {
    setFormError(null);
    if (!form.name.trim()) { setFormError("ต้องระบุชื่อ"); return; }
    if (!form.url.trim())  { setFormError("ต้องระบุ URL"); return; }
    const eventTypes = form.eventTypes.split(",").map((s) => s.trim()).filter(Boolean);
    if (eventTypes.length === 0) { setFormError("ต้องระบุ Event Types อย่างน้อย 1 รายการ"); return; }

    setSaving(true);
    try {
      const h = await authHeader();
      const payload = {
        orgId:         orgId,
        name:          form.name.trim(),
        url:           form.url.trim(),
        eventTypes,
        signingSecret: form.signingSecret.trim() || undefined,
        timeoutMs:     Number(form.timeoutMs),
        retryCount:    Number(form.retryCount),
        ...(modalMode === "edit" ? { id: editId, isActive: form.isActive } : {}),
      };
      const res = await fetch(backendUrl("/admin/webhooks"), {
        method:  modalMode === "add" ? "POST" : "PUT",
        headers: { ...h, "content-type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setFormError(json?.error ?? "บันทึกไม่สำเร็จ"); return; }
      setMessage(modalMode === "add" ? "เพิ่ม webhook แล้ว" : "อัปเดต webhook แล้ว");
      setModalMode(null);
      loadWebhooks();
    } catch (e: unknown) {
      setFormError((e as Error)?.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (w: Webhook) => {
    if (!confirm(`ลบ webhook "${w.name}"?\nlog การส่งทั้งหมดจะถูกลบด้วย`)) return;
    try {
      const h = await authHeader();
      await fetch(backendUrl(`/admin/webhooks?id=${w.id}`), { method: "DELETE", headers: h });
      setMessage(`ลบ "${w.name}" แล้ว`);
      if (logsWebhookId === w.id) setLogsWebhookId(null);
      loadWebhooks();
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "ลบไม่สำเร็จ");
    }
  };

  const handleTest = async (w: Webhook) => {
    setTestingId(w.id);
    setTestResult(null);
    try {
      const h = await authHeader();
      const res = await fetch(backendUrl("/admin/webhooks?test=1"), {
        method:  "POST",
        headers: { ...h, "content-type": "application/json" },
        body:    JSON.stringify({ id: w.id }),
      });
      const json = await res.json().catch(() => null);
      setTestResult({ id: w.id, success: json?.success ?? false, status: json?.responseStatus, latencyMs: json?.latencyMs ?? 0 });
      if (logsWebhookId === w.id) loadLogs(w.id);
    } catch { /* ignore */ } finally {
      setTestingId(null);
    }
  };

  const toggleLogs = (webhookId: string) => {
    if (logsWebhookId === webhookId) {
      setLogsWebhookId(null);
    } else {
      setLogsWebhookId(webhookId);
      loadLogs(webhookId);
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (authLoading) return <div className="p-6 text-sm text-gray-500">กำลังโหลด…</div>;
  if (role !== "super_admin") return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <Title as="h1" className="text-lg font-semibold">ไม่มีสิทธิ์เข้าถึงหน้านี้</Title>
    </div>
  );

  const orgOptions = [{ value: "", label: "— เลือก Org —" }, ...orgs.map((o) => ({ value: o.id, label: o.name }))];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">Webhook Gateway</Title>
          <Text className="mt-1 text-sm text-gray-500">
            ส่งข้อมูลไปยังระบบภายนอกเมื่อมี event เกิดขึ้น • HMAC-SHA256 signing
          </Text>
        </div>
        {orgId && (
          <Button onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />เพิ่ม Webhook
          </Button>
        )}
      </div>

      {/* Org selector */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="max-w-xs space-y-1.5">
          <Label>Organization</Label>
          <CustomSelect
            value={orgId}
            onChange={(v) => { setOrgId(v); setLogsWebhookId(null); setWebhooks([]); }}
            options={orgOptions}
          />
        </div>
      </div>

      {error   && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}

      {/* Webhook list */}
      {orgId ? (
        loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">กำลังโหลด…</div>
        ) : webhooks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
            <p className="text-sm text-gray-400">{'ยังไม่มี webhook — กด "+ เพิ่ม Webhook" เพื่อเริ่มต้น'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.map((w) => {
              const isLogsOpen   = logsWebhookId === w.id;
              const isTesting    = testingId === w.id;
              const thisTest     = testResult?.id === w.id ? testResult : null;

              return (
                <div key={w.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  {/* Webhook card */}
                  <div className="flex items-start gap-4 p-4">
                    {/* Status dot */}
                    <div className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${w.is_active ? "bg-emerald-400" : "bg-gray-300"}`} />

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">{w.name}</span>
                        {!w.is_active && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">ปิดอยู่</span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-xs text-indigo-700">{w.url}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {w.event_types.map((et) => (
                          <span key={et} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                            {et}
                          </span>
                        ))}
                      </div>
                      {/* Stats */}
                      {w.stats_7d && (
                        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                          <span>
                            7 วัน:{" "}
                            <span className={w.stats_7d.success_pct >= 95 ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
                              {w.stats_7d.success_pct}% success
                            </span>
                            {" "}({w.stats_7d.total} deliveries)
                          </span>
                          {w.stats_7d.last_at && (
                            <span>ส่งล่าสุด {new Date(w.stats_7d.last_at).toLocaleDateString("th-TH")}</span>
                          )}
                        </div>
                      )}
                      {/* Test result */}
                      {thisTest && (
                        <div className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ${
                          thisTest.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}>
                          {thisTest.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          Test ping: {thisTest.success ? "สำเร็จ" : "ล้มเหลว"}
                          {thisTest.status && <span>({thisTest.status})</span>}
                          <span className="text-xs opacity-70">{thisTest.latencyMs} ms</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => handleTest(w)}
                        disabled={isTesting}
                        title="ส่ง test ping"
                        className="rounded-full bg-indigo-50 p-1.5 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
                      >
                        {isTesting ? (
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => toggleLogs(w.id)}
                        title="ดู delivery logs"
                        className={`rounded-full p-1.5 transition-colors ${
                          isLogsOpen
                            ? "bg-gray-200 text-gray-700"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {isLogsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => openEdit(w)}
                        title="แก้ไข"
                        className="rounded-full bg-gray-100 p-1.5 text-gray-500 hover:bg-gray-200"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(w)}
                        title="ลบ"
                        className="rounded-full bg-red-50 p-1.5 text-red-500 hover:bg-red-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Delivery logs panel */}
                  {isLogsOpen && (
                    <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Delivery Logs (ล่าสุด 100 รายการ)
                      </p>
                      {logsLoading ? (
                        <div className="py-4 text-center text-sm text-gray-400">กำลังโหลด…</div>
                      ) : logs.length === 0 ? (
                        <div className="py-4 text-center text-sm text-gray-400">ยังไม่มี log</div>
                      ) : (
                        <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                          <div className="grid grid-cols-[80px_160px_60px_60px_1fr] gap-0 border-b bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                            <div>สถานะ</div>
                            <div>เวลา</div>
                            <div>HTTP</div>
                            <div>Latency</div>
                            <div>Event</div>
                          </div>
                          <div className="divide-y divide-gray-50">
                            {logs.map((log) => (
                              <div key={log.id} className="grid grid-cols-[80px_160px_60px_60px_1fr] items-center gap-0 px-3 py-2 text-xs">
                                <div>
                                  {log.success ? (
                                    <span className="flex items-center gap-1 text-emerald-600">
                                      <CheckCircle2 className="h-3.5 w-3.5" />สำเร็จ
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-red-500">
                                      <XCircle className="h-3.5 w-3.5" />ล้มเหลว
                                    </span>
                                  )}
                                </div>
                                <div className="text-gray-500">
                                  {new Date(log.delivered_at).toLocaleString("th-TH", {
                                    day: "2-digit", month: "2-digit",
                                    hour: "2-digit", minute: "2-digit", second: "2-digit",
                                  })}
                                </div>
                                <div className={log.response_status && log.response_status >= 500 ? "font-medium text-red-600" : "text-gray-600"}>
                                  {log.response_status ?? "—"}
                                </div>
                                <div className="flex items-center gap-1 text-gray-500">
                                  <Clock className="h-3 w-3" />
                                  {log.latency_ms ?? "—"} ms
                                </div>
                                <div className="truncate font-mono text-gray-600">{log.event_type}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-400">
          เลือก Organization เพื่อดูและจัดการ Webhooks
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <Dialog open={!!modalMode} onOpenChange={(o) => !o && setModalMode(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {modalMode === "add" ? "เพิ่ม Webhook ใหม่" : `แก้ไข "${form.name}"`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>ชื่อ <span className="text-red-500">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ERP สำนักงานใหญ่"
                disabled={saving}
              />
            </div>

            <div className="space-y-1.5">
              <Label>URL <span className="text-red-500">*</span></Label>
              <Input
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://erp.company.com/webhook"
                disabled={saving}
              />
              <p className="text-xs text-gray-400">ต้องเป็น HTTPS • ห้ามใช้ internal IP</p>
            </div>

            <div className="space-y-1.5">
              <Label>
                Event Types <span className="text-red-500">*</span>
                <span className="ml-1 text-xs font-normal text-gray-400">คั่นด้วย comma</span>
              </Label>
              <Input
                value={form.eventTypes}
                onChange={(e) => setForm((f) => ({ ...f, eventTypes: e.target.value }))}
                placeholder="finance.entry.created, invoice.approved"
                disabled={saving}
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Signing Secret
                <span className="ml-1 text-xs font-normal text-gray-400">
                  {modalMode === "edit" ? "เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน" : "ถ้าไม่ระบุจะไม่มี HMAC signature"}
                </span>
              </Label>
              <Input
                type="password"
                value={form.signingSecret}
                onChange={(e) => setForm((f) => ({ ...f, signingSecret: e.target.value }))}
                placeholder="my-secret-key"
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Timeout (ms)</Label>
                <Input
                  type="number"
                  value={form.timeoutMs}
                  onChange={(e) => setForm((f) => ({ ...f, timeoutMs: e.target.value }))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Retry Count</Label>
                <Input
                  type="number"
                  min="0"
                  max="5"
                  value={form.retryCount}
                  onChange={(e) => setForm((f) => ({ ...f, retryCount: e.target.value }))}
                  disabled={saving}
                />
              </div>
            </div>

            {modalMode === "edit" && (
              <div className="flex items-center gap-2">
                <input
                  id="is-active-webhook"
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  disabled={saving}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="is-active-webhook" className="text-sm text-gray-700">
                  เปิดใช้งาน webhook นี้
                </label>
              </div>
            )}

            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setModalMode(null)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "กำลังบันทึก…" : modalMode === "add" ? "เพิ่ม Webhook" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
