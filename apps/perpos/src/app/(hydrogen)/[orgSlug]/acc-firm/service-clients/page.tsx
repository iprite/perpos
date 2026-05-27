'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Pencil, Check } from 'lucide-react';
import type { ServiceClient } from '@/app/api/acc-firm/service-clients/route';

const SERVICE_FLAGS: { key: keyof ServiceClient; label: string }[] = [
  { key: 'svc_invoice', label: 'Inv.' },
  { key: 'svc_billing', label: 'Billing' },
  { key: 'svc_expense', label: 'Expense' },
  { key: 'svc_sso',     label: 'SSO' },
  { key: 'svc_pp30',    label: 'PP.30' },
  { key: 'svc_pnd',     label: 'PND1,3,53' },
  { key: 'svc_pnd51',   label: 'PND.51' },
  { key: 'svc_pnd50',   label: 'PND.50' },
  { key: 'svc_close_f', label: 'Close F.' },
];

const EMPTY_FORM = {
  client_code:  '',
  company_name: '',
  fee_2023:     '',
  fee_2024:     '',
  fee_2025:     '',
  fee_2026:     '',
  billing_note: '',
  svc_invoice:  false,
  svc_billing:  false,
  svc_expense:  false,
  svc_sso:      false,
  svc_pp30:     false,
  svc_pnd:      false,
  svc_pnd51:    false,
  svc_pnd50:    false,
  svc_close_f:  false,
  note:         '',
  is_active:    true,
};

type FormState = typeof EMPTY_FORM;

function fmtFee(v: number | null) {
  if (v == null || v === 0) return '—';
  return v.toLocaleString('th-TH', { minimumFractionDigits: 0 });
}

export default function ServiceClientsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId] = useState('');
  const [token, setToken] = useState('');
  const [clients, setClients]   = useState<ServiceClient[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]       = useState<ServiceClient | null>(null);
  const [form, setForm]             = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  // Init: resolve org
  useEffect(() => {
    (async () => {
      const [{ data: org }, { data: sess }] = await Promise.all([
        supabase.from('organizations').select('id').eq('slug', orgSlug).single(),
        supabase.auth.getSession(),
      ]);
      if (org) setOrgId(org.id);
      if (sess?.session) setToken(sess.session.access_token);
    })();
  }, [supabase, orgSlug]);

  const load = useCallback(async () => {
    if (!orgId || !token) return;
    setLoading(true);
    const res = await fetch(`/api/acc-firm/service-clients?orgId=${orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setClients(await res.json());
    setLoading(false);
  }, [orgId, token]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(c: ServiceClient) {
    setEditing(c);
    setForm({
      client_code:  c.client_code,
      company_name: c.company_name,
      fee_2023:     c.fee_2023  != null ? String(c.fee_2023)  : '',
      fee_2024:     c.fee_2024  != null ? String(c.fee_2024)  : '',
      fee_2025:     c.fee_2025  != null ? String(c.fee_2025)  : '',
      fee_2026:     c.fee_2026  != null ? String(c.fee_2026)  : '',
      billing_note: c.billing_note ?? '',
      svc_invoice:  c.svc_invoice,
      svc_billing:  c.svc_billing,
      svc_expense:  c.svc_expense,
      svc_sso:      c.svc_sso,
      svc_pp30:     c.svc_pp30,
      svc_pnd:      c.svc_pnd,
      svc_pnd51:    c.svc_pnd51,
      svc_pnd50:    c.svc_pnd50,
      svc_close_f:  c.svc_close_f,
      note:         c.note ?? '',
      is_active:    c.is_active,
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!orgId || !form.client_code || !form.company_name) return;
    setSaving(true);

    const body = editing
      ? { orgId, id: editing.id, ...form }
      : { orgId, ...form };

    const res = await fetch('/api/acc-firm/service-clients', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) { setDialogOpen(false); load(); }
  }

  function toggleFlag(key: keyof FormState) {
    setForm(f => ({ ...f, [key]: !f[key as keyof typeof f] }));
  }

  const filtered = clients.filter(c => {
    if (!showInactive && !c.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.company_name.toLowerCase().includes(q) || c.client_code.toLowerCase().includes(q);
    }
    return true;
  });

  // Current CE year → map to fee column
  const year = new Date().getFullYear();
  const feeKey = `fee_${year}` as keyof ServiceClient;
  const totalRevenue = filtered.reduce((s, c) => s + Number(c[feeKey] ?? 0), 0);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ลูกค้าบริการ</h1>
          <p className="text-sm text-gray-500 mt-0.5">รายชื่อลูกค้าที่ใช้บริการสำนักงานบัญชี</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" /> เพิ่มลูกค้า
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="ลูกค้าทั้งหมด" value={filtered.length} unit="ราย" />
        <StatCard label={`ค่าบริการปี ${year + 543}`} value={totalRevenue} unit="บาท/เดือน" isMoney />
        <StatCard label="ลูกค้าใช้งาน" value={filtered.filter(c => c.is_active).length} unit="ราย" />
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <Input
          placeholder="ค้นหาชื่อบริษัท / รหัส..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded"
          />
          แสดงที่ยกเลิกแล้ว
        </label>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-left text-gray-600">
                <th className="px-4 py-3 font-medium">รหัส</th>
                <th className="px-4 py-3 font-medium">บริษัท</th>
                <th className="px-4 py-3 font-medium text-right">2566</th>
                <th className="px-4 py-3 font-medium text-right">2567</th>
                <th className="px-4 py-3 font-medium text-right">2568</th>
                <th className="px-4 py-3 font-medium text-right">2569</th>
                <th className="px-4 py-3 font-medium">บริการ</th>
                <th className="px-4 py-3 font-medium">หมายเหตุ</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-10 text-gray-400">กำลังโหลด…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-10 text-gray-400">ไม่พบรายการ</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className={`border-b hover:bg-gray-50 transition-colors ${!c.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{c.client_code}</span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[240px]">
                    <div className="truncate" title={c.company_name}>{c.company_name}</div>
                    {c.billing_note && (
                      <div className="text-xs text-gray-400 truncate">{c.billing_note}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-500 text-xs">{fmtFee(c.fee_2023)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-500 text-xs">{fmtFee(c.fee_2024)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-700 text-xs font-medium">{fmtFee(c.fee_2025)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-blue-700 text-xs font-semibold">{fmtFee(c.fee_2026)}</td>
                  <td className="px-4 py-2.5">
                    <ServiceFlags client={c} />
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[160px] truncate" title={c.note ?? ''}>{c.note || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {c.is_active ? 'ใช้งาน' : 'ยกเลิก'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => openEdit(c)} className="p-1 hover:bg-gray-100 rounded text-gray-500">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าบริการ'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>รหัสลูกค้า *</Label>
                <Input value={form.client_code} onChange={e => setForm(f => ({ ...f, client_code: e.target.value }))} placeholder="เช่น IN01, C01" />
              </div>
              <div className="col-span-2">
                <Label>ชื่อบริษัท *</Label>
                <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="บริษัท ... จำกัด" />
              </div>
            </div>

            {/* Fees */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">ค่าบริการรายเดือน (บาท)</p>
              <div className="grid grid-cols-4 gap-3">
                {([2023, 2024, 2025, 2026] as const).map(y => (
                  <div key={y}>
                    <Label className="text-xs">ปี {y + 543}</Label>
                    <Input
                      type="number"
                      value={(form as Record<string, unknown>)[`fee_${y}`] as string}
                      onChange={e => setForm(f => ({ ...f, [`fee_${y}`]: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>หมายเหตุค่าบริการ</Label>
              <Input value={form.billing_note} onChange={e => setForm(f => ({ ...f, billing_note: e.target.value }))} placeholder="เช่น รายปี 15000" />
            </div>

            {/* Service flags */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">บริการที่ให้</p>
              <div className="flex flex-wrap gap-2">
                {SERVICE_FLAGS.map(({ key, label }) => {
                  const on = form[key as keyof FormState] as boolean;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleFlag(key as keyof FormState)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        on
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>หมายเหตุ</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="หมายเหตุเพิ่มเติม" />
            </div>

            {editing && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">ใช้งาน (Active)</span>
              </label>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={saving || !form.client_code || !form.company_name}>
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ServiceFlags({ client }: { client: ServiceClient }) {
  const active = SERVICE_FLAGS.filter(({ key }) => client[key] as boolean);
  if (active.length === 0) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {active.map(({ key, label }) => (
        <span key={key} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-xs">
          <Check className="h-2.5 w-2.5" /> {label}
        </span>
      ))}
    </div>
  );
}

function StatCard({ label, value, unit, isMoney }: { label: string; value: number; unit: string; isMoney?: boolean }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">
        {isMoney ? value.toLocaleString('th-TH') : value}
        <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>
      </p>
    </div>
  );
}
