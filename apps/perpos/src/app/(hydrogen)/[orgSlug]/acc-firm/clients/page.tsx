'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Building2, Plus, BookOpenText, Users, ArrowUpRight,
  Calculator, MoreHorizontal, UserCog, CheckCircle2,
  Circle, ShieldCheck, ShieldOff, BookOpen,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────
type ClientRow = {
  id: string;
  status: 'active' | 'inactive' | 'ended';
  modules_managed: string[];
  note: string | null;
  started_at: string | null;
  created_at: string;
  client_org: { id: string; name: string; slug: string };
};

type OrgOption = { value: string; label: string };

type FirmMember = {
  userId: string;
  firmRole: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  hasAccess: boolean;
  accessModules: string[];
};

type Engagement = {
  id: string;
  modulesManaged: string[];
  status: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'ended',    label: 'Ended' },
];

const STATUS_CLS: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  ended:    'bg-red-100 text-red-500',
};

const MODULE_OPTIONS = [
  { value: 'accounting', label: 'Accounting' },
  { value: 'payroll',    label: 'Payroll' },
];

const MODULE_ICON: Record<string, React.ReactNode> = {
  accounting: <BookOpenText className="w-3.5 h-3.5" />,
  payroll:    <Users className="w-3.5 h-3.5" />,
};

const EMPTY_FORM = {
  clientOrgId:    '',
  modulesManaged: ['accounting'] as string[],
  note:           '',
  startedAt:      '',
};

// ── Avatar placeholder ─────────────────────────────────────────────────────────
function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  if (url) return <img src={url} alt={name} className="w-8 h-8 rounded-full object-cover" />;
  return (
    <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center shrink-0">
      {initials}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AccFirmClientsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId]         = useState('');
  const [token, setToken]         = useState('');
  const [clients, setClients]     = useState<ClientRow[]>([]);
  const [allOrgs, setAllOrgs]     = useState<OrgOption[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [showAdd, setShowAdd]     = useState(false);
  const [editRow, setEditRow]     = useState<ClientRow | null>(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [filterStatus, setFilterStatus] = useState('');

  // Provision dialog state
  const [provClient, setProvClient]           = useState<ClientRow | null>(null);
  const [firmMembers, setFirmMembers]         = useState<FirmMember[]>([]);
  const [engagement, setEngagement]           = useState<Engagement | null>(null);
  const [provLoading, setProvLoading]         = useState(false);
  const [provSaving, setProvSaving]           = useState<string | null>(null); // userId being toggled

  // ── Load clients ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: org }, { data: sess }] = await Promise.all([
      supabase.from('organizations').select('id').eq('slug', orgSlug).single(),
      supabase.auth.getSession(),
    ]);
    if (!org || !sess.session) { setLoading(false); return; }
    const tok = sess.session.access_token;
    setOrgId(org.id);
    setToken(tok);

    const [clientsRes, orgsRes] = await Promise.all([
      fetch(`/api/acc-firm/clients?orgId=${org.id}`, { headers: { Authorization: `Bearer ${tok}` } }),
      supabase.from('organizations').select('id, name').order('name'),
    ]);

    if (clientsRes.ok) {
      const json = await clientsRes.json();
      setClients(json.clients ?? []);
    }
    if (orgsRes.data) {
      setAllOrgs(orgsRes.data.map(o => ({ value: o.id, label: o.name })));
    }
    setLoading(false);
  }, [supabase, orgSlug]);

  useEffect(() => { load(); }, [load]);

  // ── Load provision data when dialog opens ─────────────────────────────────
  const openProvision = useCallback(async (client: ClientRow) => {
    setProvClient(client);
    setFirmMembers([]);
    setEngagement(null);
    setProvLoading(true);
    const res = await fetch(
      `/api/acc-firm/provision?firmOrgId=${orgId}&clientOrgId=${client.client_org.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      const json = await res.json();
      setFirmMembers(json.members ?? []);
      setEngagement(json.engagement ?? null);
    }
    setProvLoading(false);
  }, [orgId, token]);

  // ── Toggle access for a firm member ──────────────────────────────────────
  const toggleAccess = useCallback(async (member: FirmMember) => {
    if (!provClient) return;
    setProvSaving(member.userId);

    if (member.hasAccess) {
      // Revoke
      await fetch('/api/acc-firm/provision', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firmOrgId:   orgId,
          clientOrgId: provClient.client_org.id,
          userId:      member.userId,
        }),
      });
    } else {
      // Provision
      await fetch('/api/acc-firm/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firmOrgId:   orgId,
          clientOrgId: provClient.client_org.id,
          userId:      member.userId,
          modules:     engagement?.modulesManaged ?? provClient.modules_managed,
        }),
      });
    }

    // Refresh members list
    await openProvision(provClient);
    setProvSaving(null);
  }, [provClient, orgId, token, engagement, openProvision]);

  // ── Available orgs (exclude already-added + self) ─────────────────────────
  const usedOrgIds = useMemo(
    () => new Set([orgId, ...clients.map(c => c.client_org.id)]),
    [orgId, clients],
  );
  const availableOrgs = useMemo(
    () => allOrgs.filter(o => !usedOrgIds.has(o.value)),
    [allOrgs, usedOrgIds],
  );

  // ── Toggle module in add/edit form ────────────────────────────────────────
  const toggleModule = (mod: string) => {
    setForm(f => ({
      ...f,
      modulesManaged: f.modulesManaged.includes(mod)
        ? f.modulesManaged.filter(m => m !== mod)
        : [...f.modulesManaged, mod],
    }));
  };

  // ── Save add ──────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.clientOrgId) return;
    setSaving(true);
    const res = await fetch('/api/acc-firm/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        firmOrgId:      orgId,
        clientOrgId:    form.clientOrgId,
        modulesManaged: form.modulesManaged,
        note:           form.note || null,
        startedAt:      form.startedAt || null,
      }),
    });
    setSaving(false);
    if (res.ok) { setShowAdd(false); load(); }
    else { const e = await res.json(); alert(e.error); }
  };

  // ── Save edit ─────────────────────────────────────────────────────────────
  const handleEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    const res = await fetch('/api/acc-firm/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id:             editRow.id,
        firmOrgId:      orgId,
        status:         editRow.status,
        modulesManaged: form.modulesManaged,
        note:           form.note || null,
      }),
    });
    setSaving(false);
    if (res.ok) { setEditRow(null); load(); }
    else { const e = await res.json(); alert(e.error); }
  };

  const openEdit = (row: ClientRow) => {
    setEditRow(row);
    setForm({ clientOrgId: row.client_org.id, modulesManaged: row.modules_managed, note: row.note ?? '', startedAt: row.started_at ?? '' });
  };

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = filterStatus ? clients.filter(c => c.status === filterStatus) : clients;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-teal-500" /> Client Orgs
          </h1>
          <p className="text-sm text-slate-500">องค์กรที่อยู่ในการกำกับดูแลของสำนักงานบัญชี</p>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setShowAdd(true); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> เพิ่ม Client Org
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 items-center">
        <Label className="text-xs text-slate-500 shrink-0">กรอง:</Label>
        <CustomSelect
          value={filterStatus}
          onChange={setFilterStatus}
          options={[{ value: '', label: 'ทั้งหมด' }, ...STATUS_OPTIONS]}
          className="w-36"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">กำลังโหลด…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-300 text-sm space-y-2">
            <Building2 className="w-8 h-8 mx-auto text-slate-200" />
            <p>{filterStatus ? 'ไม่มี client ในสถานะนี้' : 'ยังไม่มี client org'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-xs text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">องค์กร</th>
                  <th className="text-left px-4 py-2.5 font-medium">Modules</th>
                  <th className="text-left px-4 py-2.5 font-medium">เริ่มดูแล</th>
                  <th className="text-left px-4 py-2.5 font-medium">สถานะ</th>
                  <th className="text-left px-4 py-2.5 font-medium">หมายเหตุ</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{c.client_org.name}</p>
                      <p className="text-xs text-slate-400">{c.client_org.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {c.modules_managed.map(m => (
                          <span key={m} className="flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            {MODULE_ICON[m]} {m}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{c.started_at ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[c.status] ?? ''}`}>
                        {STATUS_OPTIONS.find(s => s.value === c.status)?.label ?? c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[160px] truncate">
                      {c.note ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        {c.status === 'active' && c.modules_managed.includes('accounting') && (
                          <Link href={`/${c.client_org.slug}/accounting`} target="_blank">
                            <Button size="sm" variant="ghost" className="gap-1 text-xs h-7 px-2">
                              <BookOpenText className="w-3.5 h-3.5" />
                              <ArrowUpRight className="w-3 h-3" />
                            </Button>
                          </Link>
                        )}
                        {c.status === 'active' && (
                          <Button
                            size="sm" variant="outline"
                            className="gap-1 text-xs h-7 px-2 text-teal-700 border-teal-200 hover:bg-teal-50"
                            onClick={() => openProvision(c)}
                          >
                            <UserCog className="w-3.5 h-3.5" /> Accountants
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(c)}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>เพิ่ม Client Org</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>องค์กรลูกค้า *</Label>
              <CustomSelect
                value={form.clientOrgId}
                onChange={v => setForm(f => ({ ...f, clientOrgId: v }))}
                options={[{ value: '', label: '— เลือกองค์กร —' }, ...availableOrgs]}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Modules ที่จะดูแล *</Label>
              <div className="flex gap-2 flex-wrap">
                {MODULE_OPTIONS.map(m => (
                  <button key={m.value} type="button" onClick={() => toggleModule(m.value)}
                    className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                      form.modulesManaged.includes(m.value)
                        ? 'bg-teal-50 border-teal-300 text-teal-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}>
                    {MODULE_ICON[m.value]} {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>วันที่เริ่มดูแล</Label>
              <ThaiDatePicker value={form.startedAt} onChange={v => setForm(f => ({ ...f, startedAt: v }))} placeholder="เลือกวันที่" />
            </div>
            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="เช่น รับดูแลบัญชีรายเดือน" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={saving}>ยกเลิก</Button>
            <Button onClick={handleAdd} disabled={saving || !form.clientOrgId || form.modulesManaged.length === 0}>
              {saving ? 'กำลังบันทึก…' : 'เพิ่ม'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={!!editRow} onOpenChange={v => { if (!v) setEditRow(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>แก้ไข — {editRow?.client_org.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Modules ที่ดูแล *</Label>
              <div className="flex gap-2 flex-wrap">
                {MODULE_OPTIONS.map(m => (
                  <button key={m.value} type="button" onClick={() => toggleModule(m.value)}
                    className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                      form.modulesManaged.includes(m.value)
                        ? 'bg-teal-50 border-teal-300 text-teal-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}>
                    {MODULE_ICON[m.value]} {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>สถานะ</Label>
              <CustomSelect
                value={editRow?.status ?? 'active'}
                onChange={v => setEditRow(r => r ? { ...r, status: v as ClientRow['status'] } : r)}
                options={STATUS_OPTIONS}
              />
            </div>
            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="หมายเหตุ" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setEditRow(null)} disabled={saving}>ยกเลิก</Button>
            <Button onClick={handleEdit} disabled={saving || form.modulesManaged.length === 0}>
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Provision Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!provClient} onOpenChange={v => { if (!v) setProvClient(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5 text-teal-500" />
              จัดการ Accountants — {provClient?.client_org.name}
            </DialogTitle>
          </DialogHeader>

          {/* Engagement modules info */}
          {engagement && (
            <div className="flex gap-1.5 flex-wrap">
              {engagement.modulesManaged.map(m => (
                <span key={m} className="flex items-center gap-1 text-xs bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full">
                  {MODULE_ICON[m]} {m}
                </span>
              ))}
              <span className="text-xs text-slate-400 self-center ml-1">modules ที่จะ grant</span>
            </div>
          )}

          <div className="space-y-2 py-1 max-h-[380px] overflow-y-auto">
            {provLoading ? (
              <div className="p-6 text-center text-slate-400 text-sm">กำลังโหลด…</div>
            ) : firmMembers.length === 0 ? (
              <div className="p-6 text-center text-slate-300 text-sm">ไม่พบสมาชิกใน firm org</div>
            ) : (
              firmMembers.map(m => {
                const isSaving = provSaving === m.userId;
                return (
                  <div
                    key={m.userId}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                      m.hasAccess ? 'bg-teal-50 border-teal-200' : 'bg-white border-slate-100'
                    }`}
                  >
                    <Avatar name={m.displayName} url={m.avatarUrl} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{m.displayName}</p>
                      <p className="text-xs text-slate-400 truncate">{m.email}</p>
                    </div>

                    {/* Access status */}
                    <div className="flex items-center gap-2 shrink-0">
                      {m.hasAccess ? (
                        <div className="flex gap-1">
                          {m.accessModules.map(mod => (
                            <span key={mod} className="flex items-center gap-0.5 text-xs text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded">
                              {mod === 'accounting' ? <BookOpen className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => toggleAccess(m)}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                          m.hasAccess
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : 'border-teal-300 text-teal-700 hover:bg-teal-50'
                        }`}
                      >
                        {isSaving ? (
                          <span className="animate-pulse">…</span>
                        ) : m.hasAccess ? (
                          <><ShieldOff className="w-3.5 h-3.5" /> ถอดสิทธิ์</>
                        ) : (
                          <><ShieldCheck className="w-3.5 h-3.5" /> Grant</>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProvClient(null)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
