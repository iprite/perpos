"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { ChevronDown, ChevronRight, Pencil, CreditCard } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { useRowSelection } from "@/lib/use-row-selection";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { AdminPage } from "../_components/admin-page";
import { PaymentsTabs } from "../payments/_tabs";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrgBilling {
  org_id: string;
  org_name: string;
  maintenance_mode: boolean;
  effective_limits: {
    maxUsers: number | null;
    maxApiRequestsPerDay: number | null;
    maxWebhooks: number | null;
    maxCustomFields: number | null;
  };
  is_expired: boolean;
  trial_days_remaining: number | null;
  trial_ends_at: string | null;
  plan_starts_at: string | null;
  plan_ends_at: string | null;
  monthly_price: number | null;
  currency: string;
  payment_status: string;
  notes: string | null;
  updated_at: string | null;
}

interface EditForm {
  monthlyPrice: string;
  currency: string;
  paymentStatus: string;
  planStartsAt: string;
  planEndsAt: string;
  trialEndsAt: string;
  maxUsers: string;
  maxApiRequestsPerDay: string;
  maxWebhooks: string;
  maxCustomFields: string;
  notes: string;
}

// ── Options ───────────────────────────────────────────────────────────────────

const PAYMENT_OPTIONS = [
  { value: "trial", label: "Trial" },
  { value: "active", label: "ชำระแล้ว" },
  { value: "pending", label: "รอชำระ" },
  { value: "overdue", label: "ค้างชำระ" },
  { value: "cancelled", label: "ยกเลิกแล้ว" },
];

const PAYMENT_CLS: Record<string, string> = {
  trial: "bg-blue-50 border border-blue-200 text-blue-700",
  active: "bg-green-50 border border-green-200 text-green-700",
  pending: "bg-amber-50 border border-amber-200 text-amber-700",
  overdue: "bg-red-50 border border-red-200 text-red-700",
  cancelled: "bg-gray-50 border border-gray-200 text-gray-500",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toForm(o: OrgBilling): EditForm {
  return {
    monthlyPrice: o.monthly_price !== null ? String(o.monthly_price) : "",
    currency: o.currency ?? "THB",
    paymentStatus: o.payment_status ?? "active",
    planStartsAt: o.plan_starts_at?.slice(0, 10) ?? "",
    planEndsAt: o.plan_ends_at?.slice(0, 10) ?? "",
    trialEndsAt: o.trial_ends_at?.slice(0, 10) ?? "",
    maxUsers: o.effective_limits.maxUsers !== null ? String(o.effective_limits.maxUsers) : "",
    maxApiRequestsPerDay:
      o.effective_limits.maxApiRequestsPerDay !== null
        ? String(o.effective_limits.maxApiRequestsPerDay)
        : "",
    maxWebhooks:
      o.effective_limits.maxWebhooks !== null ? String(o.effective_limits.maxWebhooks) : "",
    maxCustomFields:
      o.effective_limits.maxCustomFields !== null ? String(o.effective_limits.maxCustomFields) : "",
    notes: o.notes ?? "",
  };
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EditDialog({
  org,
  token,
  onSaved,
  onClose,
}: {
  org: OrgBilling;
  token: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<EditForm>(() => toForm(org));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [canceling, setCanceling] = useState(false);
  const [cancelInfo, setCancelInfo] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState(false);

  function set<K extends keyof EditForm>(key: K, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSave() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/billing", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orgId: org.org_id,
          monthlyPrice: form.monthlyPrice,
          currency: form.currency,
          paymentStatus: form.paymentStatus,
          planStartsAt: form.planStartsAt,
          planEndsAt: form.planEndsAt,
          trialEndsAt: form.trialEndsAt,
          maxUsers: form.maxUsers,
          maxApiRequestsPerDay: form.maxApiRequestsPerDay,
          maxWebhooks: form.maxWebhooks,
          maxCustomFields: form.maxCustomFields,
          notes: form.notes,
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        setErr(d.error ?? "Error");
        toast.error(d.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      toast.success("บันทึก Billing แล้ว");
      onSaved();
    } catch {
      setErr("Network error");
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setSaving(false);
    }
  }

  async function doCancelAtPeriodEnd() {
    if (!token) return;
    setCancelConfirm(false);
    setCanceling(true);
    setErr("");
    setCancelInfo("");
    try {
      const res = await fetch("/api/admin/billing/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId: org.org_id }),
      });
      const d = (await res.json()) as { error?: string; current_period_end?: string | null };
      if (!res.ok) {
        setErr(d.error ?? "Error");
        toast.error(d.error ?? "ยกเลิกไม่สำเร็จ");
        return;
      }
      const end = d.current_period_end ? fmtDate(d.current_period_end) : "—";
      setCancelInfo(`ตั้งค่าแล้ว: ยกเลิกเมื่อครบงวด (${end})`);
      toast.success(`ตั้งค่ายกเลิกเมื่อครบงวด (${end}) แล้ว`);
    } catch {
      setErr("Network error");
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setCanceling(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>แก้ไข Billing — {org.org_name}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className="grid gap-4">
            <div>
              <Label>สถานะการชำระ</Label>
              <CustomSelect
                value={form.paymentStatus}
                onChange={(v) => set("paymentStatus", v)}
                options={PAYMENT_OPTIONS}
                className="mt-1 w-full"
              />
            </div>

            {/* Negotiated price */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>ราคาต่อรอง/เดือน (ว่าง = ยังไม่ระบุ)</Label>
                <Input
                  type="number"
                  placeholder="เช่น 2500"
                  value={form.monthlyPrice}
                  onChange={(e) => set("monthlyPrice", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>สกุลเงิน</Label>
                <Input
                  placeholder="THB"
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>วันเริ่มต้น Plan</Label>
                <ThaiDatePicker
                  value={form.planStartsAt}
                  onChange={(v) => set("planStartsAt", v)}
                  placeholder="ไม่ระบุ"
                />
              </div>
              <div>
                <Label>วันหมดอายุ Plan</Label>
                <ThaiDatePicker
                  value={form.planEndsAt}
                  onChange={(v) => set("planEndsAt", v)}
                  placeholder="ไม่ระบุ"
                />
              </div>
            </div>
            <div>
              <Label>วันหมด Trial (ถ้ามี)</Label>
              <ThaiDatePicker
                value={form.trialEndsAt}
                onChange={(v) => set("trialEndsAt", v)}
                placeholder="ไม่ระบุ"
              />
            </div>

            {/* Custom limits */}
            <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Override ขีดจำกัด (ว่าง = ใช้ค่า default ของ tier)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Max Users</Label>
                  <Input
                    type="number"
                    placeholder="ค่า default"
                    value={form.maxUsers}
                    onChange={(e) => set("maxUsers", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Max API req/วัน</Label>
                  <Input
                    type="number"
                    placeholder="ค่า default"
                    value={form.maxApiRequestsPerDay}
                    onChange={(e) => set("maxApiRequestsPerDay", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Max Webhooks</Label>
                  <Input
                    type="number"
                    placeholder="ค่า default"
                    value={form.maxWebhooks}
                    onChange={(e) => set("maxWebhooks", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Max Custom Fields</Label>
                  <Input
                    type="number"
                    placeholder="ค่า default"
                    value={form.maxCustomFields}
                    onChange={(e) => set("maxCustomFields", e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>หมายเหตุ (internal)</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="ราคาต่อรอง, เงื่อนไขพิเศษ, ประวัติการชำระ…"
                className="mt-1"
              />
            </div>

            {err && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </div>
            )}
            {cancelInfo && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                {cancelInfo}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="destructive"
            className="mr-auto"
            onClick={() => setCancelConfirm(true)}
            disabled={canceling || saving}
          >
            {canceling ? "กำลังยกเลิก…" : "Cancel (EOP)"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving || canceling}>
            ปิด
          </Button>
          <Button onClick={handleSave} disabled={saving || canceling}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmDeleteDialog
        open={cancelConfirm}
        onOpenChange={setCancelConfirm}
        title={`ยืนยันยกเลิก Subscription`}
        description={`ยกเลิก Subscription ของ "${org.org_name}" (มีผลเมื่อครบงวด) การกระทำนี้ไม่สามารถย้อนกลับได้`}
        confirmLabel="ยืนยันยกเลิก"
        onConfirm={doCancelAtPeriodEnd}
        loading={canceling}
      />
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminBillingPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [orgs, setOrgs] = useState<OrgBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<OrgBilling | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncErr, setSyncErr] = useState<Record<string, string>>({});
  const [syncInfo, setSyncInfo] = useState<Record<string, string>>({});
  const [canceling, setCanceling] = useState<string | null>(null);
  const [cancelErr, setCancelErr] = useState<Record<string, string>>({});
  const [cancelInfo, setCancelInfo] = useState<Record<string, string>>({});

  // เลือกหลายองค์กร (bulk actions)
  const sel = useRowSelection();
  const [bulkBusy, setBulkBusy] = useState(false);

  async function bulkExtendTrial() {
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const orgId of sel.ids) {
      const org = orgs.find((o) => o.org_id === orgId);
      const base = org?.trial_ends_at ? new Date(org.trial_ends_at) : new Date();
      const start = base.getTime() > Date.now() ? base : new Date();
      const trialEndsAt = new Date(start.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
      try {
        const res = await fetch("/api/admin/billing", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orgId, trialEndsAt }),
        });
        if (res.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    sel.clear();
    await load();
    if (fail === 0) toast.success(`ต่อทดลอง +30 วัน ${ok} องค์กรแล้ว`);
    else toast.error(`สำเร็จ ${ok} · ล้มเหลว ${fail}`);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const tok = session?.access_token ?? "";
      setToken(tok);
      const res = await fetch("/api/admin/billing", {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const d = (await res.json()) as { orgs?: OrgBilling[]; error?: string };
      if (!res.ok) {
        setError(d.error ?? "Error");
        return;
      }
      setOrgs(d.orgs ?? []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function syncStripe(orgId: string, dryRun: boolean) {
    if (!token) return;
    setSyncing(orgId);
    setSyncErr((m) => {
      const next = { ...m };
      delete next[orgId];
      return next;
    });
    setSyncInfo((m) => {
      const next = { ...m };
      delete next[orgId];
      return next;
    });
    try {
      const res = await fetch("/api/admin/billing/sync-stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId, dryRun }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        setSyncErr((m) => ({ ...m, [orgId]: d.error ?? "Error" }));
        toast.error(d.error ?? "Sync Stripe ไม่สำเร็จ");
        return;
      }
      const d = (await res.json()) as {
        price_id?: string;
        previous_price_id?: string | null;
        dry_run?: boolean;
      };
      if (dryRun) {
        const prev = d.previous_price_id ? `เดิม ${d.previous_price_id}` : "เดิม —";
        const next = d.price_id ? `ใหม่ ${d.price_id}` : "ใหม่ —";
        setSyncInfo((m) => ({ ...m, [orgId]: `${prev} → ${next}` }));
        toast.success("ตรวจสอบ (dry-run) เสร็จแล้ว");
      } else {
        await load();
        toast.success("Sync Stripe แล้ว");
      }
    } catch {
      setSyncErr((m) => ({ ...m, [orgId]: "Network error" }));
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setSyncing(null);
    }
  }

  async function cancelSubscription(orgId: string) {
    if (!token) return;
    setCanceling(orgId);
    setCancelErr((m) => {
      const next = { ...m };
      delete next[orgId];
      return next;
    });
    setCancelInfo((m) => {
      const next = { ...m };
      delete next[orgId];
      return next;
    });
    try {
      const res = await fetch("/api/admin/billing/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId }),
      });
      const d = (await res.json()) as { error?: string; current_period_end?: string | null };
      if (!res.ok) {
        setCancelErr((m) => ({ ...m, [orgId]: d.error ?? "Error" }));
        toast.error(d.error ?? "ยกเลิกไม่สำเร็จ");
        return;
      }
      const end = d.current_period_end ? fmtDate(d.current_period_end) : "—";
      setCancelInfo((m) => ({ ...m, [orgId]: `ยกเลิกเมื่อครบงวด: ${end}` }));
      toast.success(`ตั้งค่ายกเลิกเมื่อครบงวด (${end}) แล้ว`);
    } catch {
      setCancelErr((m) => ({ ...m, [orgId]: "Network error" }));
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setCanceling(null);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <AdminPage
      width="wide"
      title="การเงิน & บริการ"
      icon={<CreditCard className="h-6 w-6" />}
      description="ราคา, สถานะการชำระ และ subscription ของแต่ละองค์กร (B2B)"
      tabs={<PaymentsTabs />}
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Org list */}
      {loading && !orgs.length ? (
        <div className="py-16 text-center text-sm text-gray-400">กำลังโหลด…</div>
      ) : (
        <div className="space-y-2">
          {orgs.map((o) => {
            const isOpen = expanded.has(o.org_id);
            const payCls = PAYMENT_CLS[o.payment_status] ?? "bg-gray-100 text-gray-500";
            return (
              <div
                key={o.org_id}
                className={`overflow-hidden rounded-xl border ${
                  sel.isSelected(o.org_id)
                    ? "border-primary ring-1 ring-primary"
                    : o.is_expired
                      ? "border-red-200"
                      : "border-gray-200"
                }`}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(o.org_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand(o.org_id);
                    }
                  }}
                  className="flex w-full cursor-pointer items-center gap-4 px-5 py-3.5 text-left hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={sel.isSelected(o.org_id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => sel.toggle(o.org_id)}
                    title="เลือกองค์กร"
                    className="h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-blue-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{o.org_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${payCls}`}>
                        {PAYMENT_OPTIONS.find((p) => p.value === o.payment_status)?.label ??
                          o.payment_status}
                      </span>
                      {o.is_expired && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                          หมดอายุ
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {o.monthly_price !== null
                        ? `${o.monthly_price.toLocaleString()} ${o.currency}/เดือน`
                        : "ยังไม่ระบุราคา"}
                      {o.plan_ends_at && ` · หมดอายุ ${fmtDate(o.plan_ends_at)}`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 flex-shrink-0 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(o);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  )}
                </div>

                {isOpen && (
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-t border-gray-100 bg-gray-50 px-5 py-4 text-sm">
                    <div>
                      <span className="text-gray-500">เริ่มต้น</span>{" "}
                      <span className="ml-2 font-medium text-gray-800">
                        {fmtDate(o.plan_starts_at)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">หมดอายุ</span>{" "}
                      <span
                        className={`ml-2 font-medium ${o.is_expired ? "text-red-600" : "text-gray-800"}`}
                      >
                        {fmtDate(o.plan_ends_at)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Max Users</span>{" "}
                      <span className="ml-2 font-medium text-gray-800">
                        {o.effective_limits.maxUsers ?? "∞"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Max API/วัน</span>{" "}
                      <span className="ml-2 font-medium text-gray-800">
                        {o.effective_limits.maxApiRequestsPerDay?.toLocaleString() ?? "∞"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Webhooks</span>{" "}
                      <span className="ml-2 font-medium text-gray-800">
                        {o.effective_limits.maxWebhooks ?? "∞"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Custom Fields</span>{" "}
                      <span className="ml-2 font-medium text-gray-800">
                        {o.effective_limits.maxCustomFields ?? "∞"}
                      </span>
                    </div>
                    {o.notes && (
                      <div className="col-span-2">
                        <span className="text-gray-500">หมายเหตุ</span>
                        <p className="mt-1 whitespace-pre-wrap text-gray-700">{o.notes}</p>
                      </div>
                    )}
                    <div className="col-span-2 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={syncing === o.org_id || !o.monthly_price}
                        onClick={() => void syncStripe(o.org_id, false)}
                      >
                        Sync Stripe
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={syncing === o.org_id || !o.monthly_price}
                        onClick={() => void syncStripe(o.org_id, true)}
                      >
                        Dry run
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={canceling === o.org_id}
                        onClick={() => void cancelSubscription(o.org_id)}
                      >
                        Cancel (EOP)
                      </Button>
                      {syncErr[o.org_id] && (
                        <span className="text-xs text-red-600">{syncErr[o.org_id]}</span>
                      )}
                      {syncInfo[o.org_id] && (
                        <span className="text-xs text-gray-600">{syncInfo[o.org_id]}</span>
                      )}
                      {cancelErr[o.org_id] && (
                        <span className="text-xs text-red-600">{cancelErr[o.org_id]}</span>
                      )}
                      {cancelInfo[o.org_id] && (
                        <span className="text-xs text-gray-600">{cancelInfo[o.org_id]}</span>
                      )}
                      {!o.monthly_price && (
                        <span className="text-xs text-gray-500">ยังไม่ระบุราคา</span>
                      )}
                    </div>
                    <div className="col-span-2 text-xs text-gray-400">
                      อัปเดตล่าสุด {fmtDate(o.updated_at)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditDialog
          org={editing}
          token={token}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {sel.count > 0 && (
        <BulkActionBar count={sel.count} onClear={sel.clear}>
          <Button size="sm" disabled={bulkBusy} onClick={() => void bulkExtendTrial()}>
            {bulkBusy ? "กำลังต่อ…" : "ต่อทดลอง +30 วัน"}
          </Button>
        </BulkActionBar>
      )}
    </AdminPage>
  );
}
