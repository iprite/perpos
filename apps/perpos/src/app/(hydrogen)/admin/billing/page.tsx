'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button }        from '@/components/ui/button';
import { Input }         from '@/components/ui/input';
import { Label }         from '@/components/ui/label';
import { CustomSelect }  from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { RefreshCw, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PLAN_LABELS, PLAN_COLORS, type PlanTier } from '@/lib/billing';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrgBilling {
  org_id:               string;
  org_name:             string;
  maintenance_mode:     boolean;
  plan_tier:            PlanTier;
  effective_limits:     { maxUsers: number | null; maxApiRequestsPerDay: number | null; maxWebhooks: number | null; maxCustomFields: number | null };
  is_expired:           boolean;
  trial_days_remaining: number | null;
  trial_ends_at:        string | null;
  plan_starts_at:       string | null;
  plan_ends_at:         string | null;
  monthly_price:        number | null;
  currency:             string;
  payment_status:       string;
  notes:                string | null;
  updated_at:           string | null;
}

interface EditForm {
  planTier:             string;
  monthlyPrice:         string;
  currency:             string;
  paymentStatus:        string;
  planStartsAt:         string;
  planEndsAt:           string;
  trialEndsAt:          string;
  maxUsers:             string;
  maxApiRequestsPerDay: string;
  maxWebhooks:          string;
  maxCustomFields:      string;
  notes:                string;
}

// ── Options ───────────────────────────────────────────────────────────────────

const TIER_OPTIONS = [
  { value: 'free',       label: 'Free' },
  { value: 'starter',    label: 'Starter' },
  { value: 'pro',        label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
];

const PAYMENT_OPTIONS = [
  { value: 'active',    label: 'ชำระแล้ว' },
  { value: 'pending',   label: 'รอชำระ' },
  { value: 'overdue',   label: 'ค้างชำระ' },
  { value: 'cancelled', label: 'ยกเลิกแล้ว' },
];

const PAYMENT_CLS: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  pending:   'bg-yellow-100 text-yellow-700',
  overdue:   'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function toForm(o: OrgBilling): EditForm {
  return {
    planTier:             o.plan_tier,
    monthlyPrice:         o.monthly_price !== null ? String(o.monthly_price) : '',
    currency:             o.currency ?? 'THB',
    paymentStatus:        o.payment_status ?? 'active',
    planStartsAt:         o.plan_starts_at?.slice(0, 10) ?? '',
    planEndsAt:           o.plan_ends_at?.slice(0, 10) ?? '',
    trialEndsAt:          o.trial_ends_at?.slice(0, 10) ?? '',
    maxUsers:             o.effective_limits.maxUsers !== null ? String(o.effective_limits.maxUsers) : '',
    maxApiRequestsPerDay: o.effective_limits.maxApiRequestsPerDay !== null ? String(o.effective_limits.maxApiRequestsPerDay) : '',
    maxWebhooks:          o.effective_limits.maxWebhooks !== null ? String(o.effective_limits.maxWebhooks) : '',
    maxCustomFields:      o.effective_limits.maxCustomFields !== null ? String(o.effective_limits.maxCustomFields) : '',
    notes:                o.notes ?? '',
  };
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EditDialog({
  org, token, onSaved, onClose,
}: { org: OrgBilling; token: string; onSaved: () => void; onClose: () => void }) {
  const [form, setForm] = useState<EditForm>(() => toForm(org));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function set<K extends keyof EditForm>(key: K, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSave() {
    setSaving(true); setErr('');
    try {
      const res = await fetch('/api/admin/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orgId:                org.org_id,
          planTier:             form.planTier,
          monthlyPrice:         form.monthlyPrice,
          currency:             form.currency,
          paymentStatus:        form.paymentStatus,
          planStartsAt:         form.planStartsAt,
          planEndsAt:           form.planEndsAt,
          trialEndsAt:          form.trialEndsAt,
          maxUsers:             form.maxUsers,
          maxApiRequestsPerDay: form.maxApiRequestsPerDay,
          maxWebhooks:          form.maxWebhooks,
          maxCustomFields:      form.maxCustomFields,
          notes:                form.notes,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setErr(d.error ?? 'Error'); return;
      }
      onSaved();
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>แก้ไข Billing — {org.org_name}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Plan tier + payment status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>แพ็กเกจ</Label>
              <CustomSelect value={form.planTier} onChange={(v) => set('planTier', v)} options={TIER_OPTIONS} className="mt-1 w-full" />
            </div>
            <div>
              <Label>สถานะการชำระ</Label>
              <CustomSelect value={form.paymentStatus} onChange={(v) => set('paymentStatus', v)} options={PAYMENT_OPTIONS} className="mt-1 w-full" />
            </div>
          </div>

          {/* Negotiated price */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>ราคาต่อรอง/เดือน (ว่าง = ยังไม่ระบุ)</Label>
              <Input type="number" placeholder="เช่น 2500" value={form.monthlyPrice} onChange={(e) => set('monthlyPrice', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>สกุลเงิน</Label>
              <Input placeholder="THB" value={form.currency} onChange={(e) => set('currency', e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>วันเริ่มต้น Plan</Label>
              <ThaiDatePicker value={form.planStartsAt} onChange={(v) => set('planStartsAt', v)} placeholder="ไม่ระบุ" />
            </div>
            <div>
              <Label>วันหมดอายุ Plan</Label>
              <ThaiDatePicker value={form.planEndsAt} onChange={(v) => set('planEndsAt', v)} placeholder="ไม่ระบุ" />
            </div>
          </div>
          <div>
            <Label>วันหมด Trial (ถ้ามี)</Label>
            <ThaiDatePicker value={form.trialEndsAt} onChange={(v) => set('trialEndsAt', v)} placeholder="ไม่ระบุ" />
          </div>

          {/* Custom limits */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Override ขีดจำกัด (ว่าง = ใช้ค่า default ของ tier)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Max Users</Label>
                <Input type="number" placeholder="ค่า default" value={form.maxUsers} onChange={(e) => set('maxUsers', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Max API req/วัน</Label>
                <Input type="number" placeholder="ค่า default" value={form.maxApiRequestsPerDay} onChange={(e) => set('maxApiRequestsPerDay', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Max Webhooks</Label>
                <Input type="number" placeholder="ค่า default" value={form.maxWebhooks} onChange={(e) => set('maxWebhooks', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Max Custom Fields</Label>
                <Input type="number" placeholder="ค่า default" value={form.maxCustomFields} onChange={(e) => set('maxCustomFields', e.target.value)} className="mt-1" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>หมายเหตุ (internal)</Label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="ราคาต่อรอง, เงื่อนไขพิเศษ, ประวัติการชำระ…"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {err && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminBillingPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [orgs,     setOrgs]     = useState<OrgBilling[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [token,    setToken]    = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing,  setEditing]  = useState<OrgBilling | null>(null);
  const [syncing,  setSyncing]  = useState<string | null>(null);
  const [syncErr,  setSyncErr]  = useState<Record<string, string>>({});
  const [syncInfo, setSyncInfo] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const tok = session?.access_token ?? '';
      setToken(tok);
      const res = await fetch('/api/admin/billing', {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const d = await res.json() as { orgs?: OrgBilling[]; error?: string };
      if (!res.ok) { setError(d.error ?? 'Error'); return; }
      setOrgs(d.orgs ?? []);
    } catch { setError('Network error'); }
    finally  { setLoading(false); }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

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
      const res = await fetch('/api/admin/billing/sync-stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId, dryRun }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setSyncErr((m) => ({ ...m, [orgId]: d.error ?? 'Error' }));
        return;
      }
      const d = await res.json() as {
        price_id?: string;
        previous_price_id?: string | null;
        dry_run?: boolean;
      };
      if (dryRun) {
        const prev = d.previous_price_id ? `เดิม ${d.previous_price_id}` : 'เดิม —';
        const next = d.price_id ? `ใหม่ ${d.price_id}` : 'ใหม่ —';
        setSyncInfo((m) => ({ ...m, [orgId]: `${prev} → ${next}` }));
      } else {
        await load();
      }
    } catch {
      setSyncErr((m) => ({ ...m, [orgId]: 'Network error' }));
    } finally {
      setSyncing(null);
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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing & Plans</h1>
          <p className="text-sm text-gray-500 mt-0.5">จัดการ plan และราคาต่อรองของแต่ละ org</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          รีเฟรช
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</div>
      )}

      {/* Summary stats */}
      {!loading && orgs.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {(['free', 'starter', 'pro', 'enterprise'] as PlanTier[]).map((tier) => {
            const count = orgs.filter((o) => o.plan_tier === tier).length;
            return (
              <div key={tier} className={`rounded-xl border px-4 py-3 text-center ${PLAN_COLORS[tier]}`}>
                <div className="text-xl font-bold">{count}</div>
                <div className="text-xs font-medium">{PLAN_LABELS[tier]}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Org list */}
      {loading && !orgs.length ? (
        <div className="py-16 text-center text-gray-400 text-sm">กำลังโหลด…</div>
      ) : (
        <div className="space-y-2">
          {orgs.map((o) => {
            const isOpen = expanded.has(o.org_id);
            const planCls = PLAN_COLORS[o.plan_tier] ?? 'bg-gray-100 text-gray-600';
            const payCls  = PAYMENT_CLS[o.payment_status] ?? 'bg-gray-100 text-gray-500';
            return (
              <div key={o.org_id} className={`rounded-xl border overflow-hidden ${o.is_expired ? 'border-red-200' : 'border-gray-200'}`}>
                <button
                  onClick={() => toggleExpand(o.org_id)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{o.org_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${planCls}`}>{PLAN_LABELS[o.plan_tier]}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${payCls}`}>{PAYMENT_OPTIONS.find((p) => p.value === o.payment_status)?.label ?? o.payment_status}</span>
                      {o.is_expired && <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">หมดอายุ</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {o.monthly_price !== null
                        ? `${o.monthly_price.toLocaleString()} ${o.currency}/เดือน`
                        : 'ยังไม่ระบุราคา'}
                      {o.plan_ends_at && ` · หมดอายุ ${fmtDate(o.plan_ends_at)}`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-shrink-0 h-7 px-2"
                    onClick={(e) => { e.stopPropagation(); setEditing(o); }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                    <div><span className="text-gray-500">เริ่มต้น</span> <span className="font-medium text-gray-800 ml-2">{fmtDate(o.plan_starts_at)}</span></div>
                    <div><span className="text-gray-500">หมดอายุ</span> <span className={`font-medium ml-2 ${o.is_expired ? 'text-red-600' : 'text-gray-800'}`}>{fmtDate(o.plan_ends_at)}</span></div>
                    <div><span className="text-gray-500">Max Users</span> <span className="font-medium text-gray-800 ml-2">{o.effective_limits.maxUsers ?? '∞'}</span></div>
                    <div><span className="text-gray-500">Max API/วัน</span> <span className="font-medium text-gray-800 ml-2">{o.effective_limits.maxApiRequestsPerDay?.toLocaleString() ?? '∞'}</span></div>
                    <div><span className="text-gray-500">Webhooks</span> <span className="font-medium text-gray-800 ml-2">{o.effective_limits.maxWebhooks ?? '∞'}</span></div>
                    <div><span className="text-gray-500">Custom Fields</span> <span className="font-medium text-gray-800 ml-2">{o.effective_limits.maxCustomFields ?? '∞'}</span></div>
                    {o.notes && (
                      <div className="col-span-2">
                        <span className="text-gray-500">หมายเหตุ</span>
                        <p className="text-gray-700 mt-1 whitespace-pre-wrap">{o.notes}</p>
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
                      {syncErr[o.org_id] && (
                        <span className="text-xs text-red-600">{syncErr[o.org_id]}</span>
                      )}
                      {syncInfo[o.org_id] && (
                        <span className="text-xs text-gray-600">{syncInfo[o.org_id]}</span>
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
          onSaved={() => { setEditing(null); void load(); }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
