'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button }       from '@/components/ui/button';
import { Input }        from '@/components/ui/input';
import { Label }        from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { Plus, Pencil, Trash2, ShieldAlert, ShieldCheck, ToggleLeft, ToggleRight } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Org { id: string; name: string }
interface RateLimit {
  id:             string;
  org_id:         string;
  route_pattern:  string;
  window_seconds: number;
  max_requests:   number;
  is_active:      boolean;
  created_at:     string;
}
interface Violation {
  route:         string;
  window_start:  string;
  request_count: number;
  limit_value:   number;
  logged_at:     string;
}

type FormState = {
  orgId:         string;
  routePattern:  string;
  windowSeconds: string;
  maxRequests:   string;
};

const BLANK_FORM: FormState = {
  orgId: '', routePattern: '*', windowSeconds: '60', maxRequests: '1000',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtWindow(s: number): string {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${s / 60}m`;
  if (s < 86400) return `${s / 3600}h`;
  return `${s / 86400}d`;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = Object.entries(localStorage).find(([k]) => k.includes('supabase') && k.includes('auth'));
    if (!raw) return '';
    return JSON.parse(raw[1])?.access_token ?? '';
  } catch { return ''; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RateLimitsPage() {
  const [orgs,       setOrgs]       = useState<Org[]>([]);
  const [orgId,      setOrgId]      = useState('');
  const [limits,     setLimits]     = useState<RateLimit[]>([]);
  const [violations, setViolations] = useState<Record<string, Violation[]>>({});
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const [modalOpen,   setModalOpen]  = useState(false);
  const [editing,     setEditing]    = useState<RateLimit | null>(null);
  const [form,        setForm]       = useState<FormState>(BLANK_FORM);
  const [saving,      setSaving]     = useState(false);
  const [saveError,   setSaveError]  = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

  // Load orgs
  useEffect(() => {
    fetch('/api/admin/users/list', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.json())
      .then((d) => {
        const seen = new Map<string, string>();
        for (const u of d.users ?? []) {
          if (u.org_id && u.org_name) seen.set(u.org_id, u.org_name);
        }
        setOrgs(Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {});
  }, []);

  const loadLimits = useCallback(async (oid: string) => {
    if (!oid) { setLimits([]); setViolations({}); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/rate-limits?orgId=${oid}&includeViolations=1`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await res.json() as { limits?: RateLimit[]; violations?: Record<string, Violation[]>; error?: string };
      if (!res.ok) { setError(d.error ?? 'Error'); return; }
      setLimits(d.limits ?? []);
      setViolations(d.violations ?? {});
    } catch { setError('Network error'); }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => { void loadLimits(orgId); }, [orgId, loadLimits]);

  function openAdd() {
    setEditing(null);
    setForm({ ...BLANK_FORM, orgId });
    setSaveError('');
    setModalOpen(true);
  }

  function openEdit(l: RateLimit) {
    setEditing(l);
    setForm({
      orgId:         l.org_id,
      routePattern:  l.route_pattern,
      windowSeconds: String(l.window_seconds),
      maxRequests:   String(l.max_requests),
    });
    setSaveError('');
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true); setSaveError('');
    try {
      const url    = '/api/admin/rate-limits';
      const method = editing ? 'PUT' : 'POST';
      const body   = editing
        ? { id: editing.id, routePattern: form.routePattern, windowSeconds: Number(form.windowSeconds), maxRequests: Number(form.maxRequests) }
        : { orgId: form.orgId, routePattern: form.routePattern, windowSeconds: Number(form.windowSeconds), maxRequests: Number(form.maxRequests) };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      const d = await res.json() as { error?: string };
      if (!res.ok) { setSaveError(d.error ?? 'Error'); return; }
      setModalOpen(false);
      void loadLimits(orgId);
    } catch { setSaveError('Network error'); }
    finally  { setSaving(false); }
  }

  async function doDelete() {
    await fetch(`/api/admin/rate-limits?id=${deleteConfirm.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setDeleteConfirm({ open: false, id: '' });
    void loadLimits(orgId);
  }

  async function toggleActive(l: RateLimit) {
    await fetch('/api/admin/rate-limits', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ id: l.id, isActive: !l.is_active }),
    });
    void loadLimits(orgId);
  }

  const orgOptions = [
    { value: '', label: '— เลือก Org —' },
    ...orgs.map((o) => ({ value: o.id, label: o.name })),
  ];

  // Count total violations (last 24h)
  const totalViolations = Object.values(violations).reduce((s, arr) => s + arr.length, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rate Limits</h1>
          <p className="text-sm text-gray-500 mt-0.5">กำหนด API request limits ต่อ org</p>
        </div>
        <Button onClick={openAdd} disabled={!orgId}>
          <Plus className="w-4 h-4 mr-1.5" /> เพิ่ม Limit
        </Button>
      </div>

      {/* Org selector */}
      <div className="flex items-center gap-3">
        <Label className="shrink-0">Organization</Label>
        <CustomSelect
          value={orgId}
          onChange={(v) => setOrgId(v)}
          options={orgOptions}
          className="w-72"
        />
      </div>

      {/* Violations banner */}
      {totalViolations > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>พบ <strong>{totalViolations}</strong> การละเมิด limit ใน 24 ชั่วโมงที่ผ่านมา</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</div>
      )}

      {/* Table */}
      {!orgId ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-gray-400 text-sm">
          เลือก Organization เพื่อดู rate limits
        </div>
      ) : loading ? (
        <div className="py-16 text-center text-gray-400 text-sm">กำลังโหลด…</div>
      ) : limits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-gray-400 text-sm">
          ยังไม่มี rate limit — กด &quot;เพิ่ม Limit&quot; เพื่อเริ่ม
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Route Pattern', 'Window', 'Max Requests', 'Violations (24h)', 'สถานะ', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {limits.map((l) => {
                const vCount = (violations[l.route_pattern] ?? []).length;
                return (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-800">{l.route_pattern}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtWindow(l.window_seconds)}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{l.max_requests.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {vCount > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-medium text-red-700">
                          <ShieldAlert className="w-3 h-3" />{vCount}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                          <ShieldCheck className="w-3 h-3" />ไม่มี
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(l)}
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          l.is_active ? 'text-green-600' : 'text-gray-400'
                        }`}
                      >
                        {l.is_active
                          ? <><ToggleRight className="w-4 h-4" />เปิด</>
                          : <><ToggleLeft  className="w-4 h-4" />ปิด</>}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(l)} className="text-gray-400 hover:text-blue-600">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteConfirm({ open: true, id: l.id })} className="text-gray-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => setDeleteConfirm((s) => ({ ...s, open: o }))}
        title="ลบ Rate Limit"
        description="การกระทำนี้ไม่สามารถย้อนกลับได้"
        onConfirm={doDelete}
      />

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'แก้ไข Rate Limit' : 'เพิ่ม Rate Limit'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Route Pattern</Label>
              <Input
                value={form.routePattern}
                onChange={(e) => setForm((f) => ({ ...f, routePattern: e.target.value }))}
                placeholder="* หรือ /api/tmc/*"
                className="mt-1 font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">ใช้ * สำหรับทุก route หรือ /api/xxx/* สำหรับ prefix</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Window (วินาที)</Label>
                <Input
                  type="number"
                  min={1}
                  max={86400}
                  value={form.windowSeconds}
                  onChange={(e) => setForm((f) => ({ ...f, windowSeconds: e.target.value }))}
                  className="mt-1"
                />
                <p className="text-xs text-gray-400 mt-1">60 = 1 นาที, 3600 = 1 ชั่วโมง</p>
              </div>
              <div>
                <Label>Max Requests</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.maxRequests}
                  onChange={(e) => setForm((f) => ({ ...f, maxRequests: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            {saveError && (
              <p className="text-sm text-red-600">{saveError}</p>
            )}
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
