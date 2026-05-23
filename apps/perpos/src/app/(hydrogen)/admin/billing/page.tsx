'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button }       from '@/components/ui/button';
import { Input }        from '@/components/ui/input';
import { Label }        from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Pencil, Wrench, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { PLAN_DEFAULTS, PLAN_LABELS, PLAN_COLORS, type PlanTier } from '@/lib/billing';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrgBilling {
  org_id:               string;
  org_name:             string;
  maintenance_mode:     boolean;
  maintenance_message:  string | null;
  plan_tier:            PlanTier;
  is_expired:           boolean;
  trial_days_remaining: number | null;
  trial_ends_at:        string | null;
  plan_starts_at:       string | null;
  plan_ends_at:         string | null;
  notes:                string | null;
  updated_at:           string | null;
  effective_limits: {
    maxUsers:              number | null;
    maxApiRequestsPerDay:  number | null;
    maxWebhooks:           number | null;
    maxCustomFields:       number | null;
  };
}

interface FormState {
  orgId:                 string;
  planTier:              PlanTier;
  maxUsers:              string;
  maxApiRequestsPerDay:  string;
  maxWebhooks:           string;
  maxCustomFields:       string;
  trialEndsAt:           string;
  planStartsAt:          string;
  planEndsAt:            string;
  notes:                 string;
  maintenanceMode:       boolean;
  maintenanceMessage:    string;
}

const BLANK_FORM = (orgId = ''): FormState => ({
  orgId, planTier: 'free', maxUsers: '', maxApiRequestsPerDay: '',
  maxWebhooks: '', maxCustomFields: '', trialEndsAt: '', planStartsAt: '',
  planEndsAt: '', notes: '', maintenanceMode: false, maintenanceMessage: '',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = Object.entries(localStorage).find(([k]) => k.includes('supabase') && k.includes('auth'));
    if (!raw) return '';
    return JSON.parse(raw[1])?.access_token ?? '';
  } catch { return ''; }
}

function limitStr(n: number | null) { return n === null ? '∞' : n.toLocaleString(); }

const TIER_OPTIONS = (['free', 'starter', 'pro', 'enterprise'] as PlanTier[]).map(
  (t) => ({ value: t, label: PLAN_LABELS[t] }),
);

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [orgs,    setOrgs]    = useState<OrgBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState<OrgBilling | null>(null);
  const [form,      setForm]      = useState<FormState>(BLANK_FORM());
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/billing', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await res.json() as { orgs?: OrgBilling[]; error?: string };
      if (!res.ok) { setError(d.error ?? 'Error'); return; }
      setOrgs(d.orgs ?? []);
    } catch { setError('Network error'); }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openEdit(o: OrgBilling) {
    setEditing(o);
    setForm({
      orgId:               o.org_id,
      planTier:            o.plan_tier,
      maxUsers:            o.effective_limits.maxUsers !== null && PLAN_DEFAULTS[o.plan_tier].maxUsers !== o.effective_limits.maxUsers ? String(o.effective_limits.maxUsers) : '',
      maxApiRequestsPerDay: o.effective_limits.maxApiRequestsPerDay !== null && PLAN_DEFAULTS[o.plan_tier].maxApiRequestsPerDay !== o.effective_limits.maxApiRequestsPerDay ? String(o.effective_limits.maxApiRequestsPerDay) : '',
      maxWebhooks:         o.effective_limits.maxWebhooks !== null && PLAN_DEFAULTS[o.plan_tier].maxWebhooks !== o.effective_limits.maxWebhooks ? String(o.effective_limits.maxWebhooks) : '',
      maxCustomFields:     o.effective_limits.maxCustomFields !== null && PLAN_DEFAULTS[o.plan_tier].maxCustomFields !== o.effective_limits.maxCustomFields ? String(o.effective_limits.maxCustomFields) : '',
      trialEndsAt:         o.trial_ends_at   ? o.trial_ends_at.slice(0, 10)   : '',
      planStartsAt:        o.plan_starts_at  ? o.plan_starts_at.slice(0, 10)  : '',
      planEndsAt:          o.plan_ends_at    ? o.plan_ends_at.slice(0, 10)    : '',
      notes:               o.notes ?? '',
      maintenanceMode:     o.maintenance_mode,
      maintenanceMessage:  o.maintenance_message ?? '',
    });
    setSaveError('');
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true); setSaveError('');
    try {
      const res = await fetch('/api/admin/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          orgId:                form.orgId,
          planTier:             form.planTier,
          maxUsers:             form.maxUsers,
          maxApiRequestsPerDay: form.maxApiRequestsPerDay,
          maxWebhooks:          form.maxWebhooks,
          maxCustomFields:      form.maxCustomFields,
          trialEndsAt:          form.trialEndsAt,
          planStartsAt:         form.planStartsAt,
          planEndsAt:           form.planEndsAt,
          notes:                form.notes,
          maintenanceMode:      form.maintenanceMode,
          maintenanceMessage:   form.maintenanceMessage,
        }),
      });
      const d = await res.json() as { error?: string };
      if (!res.ok) { setSaveError(d.error ?? 'Error'); return; }
      setModalOpen(false);
      void load();
    } catch { setSaveError('Network error'); }
    finally  { setSaving(false); }
  }

  const filtered = orgs.filter((o) =>
    o.org_name.toLowerCase().includes(search.toLowerCase()),
  );

  const expiredCount    = orgs.filter((o) => o.is_expired).length;
  const maintenanceCount = orgs.filter((o) => o.maintenance_mode).length;
  const trialEndingSoon  = orgs.filter((o) => o.trial_days_remaining !== null && o.trial_days_remaining >= 0 && o.trial_days_remaining <= 7).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing & Plans</h1>
        <p className="text-sm text-gray-500 mt-0.5">จัดการแผนการใช้งานและ limits ต่อ org</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Orgs ทั้งหมด',     value: orgs.length,       color: 'text-gray-900', bg: 'bg-gray-50' },
          { label: 'Plan หมดอายุ',     value: expiredCount,       color: 'text-red-600',  bg: 'bg-red-50' },
          { label: 'Trial หมดเร็วๆ นี้', value: trialEndingSoon,  color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Maintenance',       value: maintenanceCount,  color: 'text-blue-600',  bg: 'bg-blue-50' },
        ].map((c) => (
          <div key={c.label} className={`rounded-xl border border-gray-200 ${c.bg} p-4`}>
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <Input
        placeholder="ค้นหา org..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-gray-400 text-sm">กำลังโหลด…</div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Organization', 'Plan', 'Users', 'API/day', 'Webhooks', 'สถานะ', 'Trial / หมดอายุ', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((o) => (
                <tr key={o.org_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{o.org_name}</div>
                    {o.maintenance_mode && (
                      <span className="inline-flex items-center gap-1 text-xs text-orange-600 mt-0.5">
                        <Wrench className="w-3 h-3" />Maintenance
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PLAN_COLORS[o.plan_tier]}`}>
                      {PLAN_LABELS[o.plan_tier]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{limitStr(o.effective_limits.maxUsers)}</td>
                  <td className="px-4 py-3 text-gray-600">{limitStr(o.effective_limits.maxApiRequestsPerDay)}</td>
                  <td className="px-4 py-3 text-gray-600">{limitStr(o.effective_limits.maxWebhooks)}</td>
                  <td className="px-4 py-3">
                    {o.is_expired ? (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                        <AlertTriangle className="w-3 h-3" />หมดอายุ
                      </span>
                    ) : o.trial_days_remaining !== null ? (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                        o.trial_days_remaining <= 3 ? 'text-red-600' :
                        o.trial_days_remaining <= 7 ? 'text-amber-600' : 'text-blue-600'
                      }`}>
                        <Clock className="w-3 h-3" />Trial
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="w-3 h-3" />ปกติ
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {o.trial_days_remaining !== null
                      ? `Trial เหลือ ${o.trial_days_remaining} วัน (${fmtDate(o.trial_ends_at)})`
                      : fmtDate(o.plan_ends_at)}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(o)} className="text-gray-400 hover:text-blue-600">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              แก้ไข Billing — {editing?.org_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Plan tier */}
            <div>
              <Label>Plan Tier</Label>
              <CustomSelect
                value={form.planTier}
                onChange={(v) => setForm((f) => ({ ...f, planTier: v as PlanTier }))}
                options={TIER_OPTIONS}
                className="mt-1"
              />
              {/* Show defaults for selected tier */}
              <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500 grid grid-cols-2 gap-1">
                {([
                  ['ค่าเริ่มต้น Users',    limitStr(PLAN_DEFAULTS[form.planTier].maxUsers)],
                  ['API/day',              limitStr(PLAN_DEFAULTS[form.planTier].maxApiRequestsPerDay)],
                  ['Webhooks',             limitStr(PLAN_DEFAULTS[form.planTier].maxWebhooks)],
                  ['Custom Fields',        limitStr(PLAN_DEFAULTS[form.planTier].maxCustomFields)],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k}><span className="font-medium">{k}:</span> {v}</div>
                ))}
              </div>
            </div>

            {/* Limit overrides */}
            <div>
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Override Limits (ปล่อยว่าง = ใช้ค่า plan)</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {([
                  ['maxUsers',             'Max Users',     'ว่าง = ใช้ plan default'],
                  ['maxApiRequestsPerDay', 'API req/day',   ''],
                  ['maxWebhooks',          'Max Webhooks',  ''],
                  ['maxCustomFields',      'Custom Fields', ''],
                ] as [keyof FormState, string, string][]).map(([key, label, hint]) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder={hint || 'ค่า default'}
                      value={form[key] as string}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-3 gap-3">
              {([
                ['trialEndsAt',  'Trial สิ้นสุด'],
                ['planStartsAt', 'Plan เริ่มต้น'],
                ['planEndsAt',   'Plan สิ้นสุด'],
              ] as [keyof FormState, string][]).map(([key, label]) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <Input
                    type="date"
                    value={form[key] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              ))}
            </div>

            {/* Notes */}
            <div>
              <Label>หมายเหตุ (admin เท่านั้น)</Label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Maintenance mode */}
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-orange-800 flex items-center gap-1.5">
                    <Wrench className="w-4 h-4" /> Maintenance Mode
                  </div>
                  <div className="text-xs text-orange-600 mt-0.5">
                    เปิด maintenance จะบล็อก users ของ org นี้จากการใช้งาน
                  </div>
                </div>
                <button
                  onClick={() => setForm((f) => ({ ...f, maintenanceMode: !f.maintenanceMode }))}
                  className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                    form.maintenanceMode ? 'bg-orange-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                    form.maintenanceMode ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              {form.maintenanceMode && (
                <div>
                  <Label>ข้อความแจ้ง (ไม่บังคับ)</Label>
                  <Input
                    value={form.maintenanceMessage}
                    onChange={(e) => setForm((f) => ({ ...f, maintenanceMessage: e.target.value }))}
                    placeholder="ระบบอยู่ระหว่างการบำรุงรักษา กรุณากลับมาใหม่ภายหลัง"
                    className="mt-1"
                  />
                </div>
              )}
            </div>

            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
