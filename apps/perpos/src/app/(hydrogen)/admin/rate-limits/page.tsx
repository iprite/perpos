'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button }       from '@/components/ui/button';
import { Input }        from '@/components/ui/input';
import { Label }        from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { StatusBadge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty, TableLoading,
} from '@/components/ui/table';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Plus, Trash2, ShieldAlert, ShieldCheck, ToggleLeft, ToggleRight, ShieldBan } from 'lucide-react';
import { AdminPage } from '../_components/admin-page';

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

async function authToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
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
    void (async () => {
      try {
        const res = await fetch('/api/admin/users/list', { headers: { Authorization: `Bearer ${await authToken()}` } });
        const d = await res.json() as { allOrgs?: { id: string; name: string }[] };
        setOrgs((d.allOrgs ?? []).map((o) => ({ id: o.id, name: o.name })).sort((a, b) => a.name.localeCompare(b.name)));
      } catch { /* ignore */ }
    })();
  }, []);

  const loadLimits = useCallback(async (oid: string) => {
    if (!oid) { setLimits([]); setViolations({}); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/rate-limits?orgId=${oid}&includeViolations=1`, {
        headers: { Authorization: `Bearer ${await authToken()}` },
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authToken()}` },
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
      headers: { Authorization: `Bearer ${await authToken()}` },
    });
    setDeleteConfirm({ open: false, id: '' });
    void loadLimits(orgId);
  }

  async function toggleActive(l: RateLimit) {
    await fetch('/api/admin/rate-limits', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authToken()}` },
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
    <AdminPage
      title="Rate Limits"
      icon={<ShieldBan className="h-6 w-6" />}
      description="กำหนด API request limits ต่อ org"
      actions={
        <Button onClick={openAdd} disabled={!orgId}>
          <Plus className="w-4 h-4 mr-1.5" /> เพิ่ม Limit
        </Button>
      }
    >
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
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route Pattern</TableHead>
              <TableHead>Window</TableHead>
              <TableHead align="right">Max Requests</TableHead>
              <TableHead>Violations (24h)</TableHead>
              <TableHead align="center">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoading colSpan={5} />
            ) : limits.length === 0 ? (
              <TableEmpty colSpan={5}>ยังไม่มี rate limit — กด &quot;เพิ่ม Limit&quot; เพื่อเริ่ม</TableEmpty>
            ) : limits.map((l) => {
              const vCount = (violations[l.route_pattern] ?? []).length;
              return (
                <TableRow key={l.id} clickable onClick={() => openEdit(l)}>
                  <TableCell className="font-mono text-xs text-gray-800">{l.route_pattern}</TableCell>
                  <TableCell className="text-gray-600">{fmtWindow(l.window_seconds)}</TableCell>
                  <TableCell align="right" tabular className="font-medium text-gray-900">{l.max_requests.toLocaleString()}</TableCell>
                  <TableCell>
                    {vCount > 0 ? (
                      <StatusBadge tone="danger"><ShieldAlert className="mr-1 h-3 w-3" />{vCount}</StatusBadge>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <ShieldCheck className="h-3 w-3" />ไม่มี
                      </span>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <StatusBadge tone={l.is_active ? 'success' : 'neutral'}>{l.is_active ? 'เปิด' : 'ปิด'}</StatusBadge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editing ? 'แก้ไข Rate Limit' : 'เพิ่ม Rate Limit'}</DialogTitle>
          </DialogHeader>
          <DialogBody>
          <div className="space-y-4">
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
            {editing && (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <span className="text-sm text-gray-600">สถานะการใช้งาน</span>
                <button
                  onClick={() => { void toggleActive(editing); setModalOpen(false); }}
                  className={`inline-flex items-center gap-1 text-xs font-medium ${editing.is_active ? 'text-green-600' : 'text-gray-400'}`}
                >
                  {editing.is_active
                    ? <><ToggleRight className="h-4 w-4" />เปิด (กดเพื่อปิด)</>
                    : <><ToggleLeft className="h-4 w-4" />ปิด (กดเพื่อเปิด)</>}
                </button>
              </div>
            )}
            {saveError && (
              <p className="text-sm text-red-600">{saveError}</p>
            )}
          </div>
          </DialogBody>
          <DialogFooter>
            {editing && (
              <Button
                variant="ghost"
                className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => { setModalOpen(false); setDeleteConfirm({ open: true, id: editing.id }); }}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> ลบ
              </Button>
            )}
            <Button variant="outline" onClick={() => setModalOpen(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}
