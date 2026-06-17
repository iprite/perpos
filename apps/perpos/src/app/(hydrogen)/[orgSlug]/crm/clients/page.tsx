'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { PageShell } from '@/components/ui/page-shell';
import { Plus, Search, ChevronRight, Building2, Phone, Mail, Users } from 'lucide-react';

type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  status: 'active' | 'inactive' | 'prospect';
  created_at: string;
};

const STATUS_OPTS = [
  { value: '',         label: 'ทุกสถานะ' },
  { value: 'active',   label: 'Active' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'inactive', label: 'Inactive' },
];

const STATUS_BADGE: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  prospect: 'bg-blue-100 text-blue-700',
  inactive: 'bg-slate-100 text-slate-500',
};

const EMPTY_FORM = { name: '', contact_name: '', phone: '', email: '', address: '', industry: '', notes: '', status: 'active' };

export default function CrmClientsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [orgId, setOrgId]     = useState('');
  const [token, setToken]     = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ]             = useState('');
  const [open, setOpen]       = useState(false);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [saving, setSaving]   = useState(false);
  const [editId, setEditId]   = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

  const initAuth = useCallback(async () => {
    const { data: orgs } = await supabase
      .from('organizations').select('id').eq('slug', orgSlug).single();
    const { data: sess } = await supabase.auth.getSession();
    if (orgs && sess.session) { setOrgId(orgs.id); setToken(sess.session.access_token); }
  }, [supabase, orgSlug]);

  const load = useCallback(async () => {
    if (!orgId || !token) return;
    setLoading(true);
    const params = new URLSearchParams({ orgId });
    if (statusFilter) params.set('status', statusFilter);
    if (q) params.set('q', q);
    const res = await fetch(`/api/crm/clients?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setClients(await res.json());
    setLoading(false);
  }, [orgId, token, statusFilter, q]);

  useEffect(() => { initAuth(); }, [initAuth]);
  useEffect(() => { if (orgId && token) load(); }, [load, orgId, token]);

  const openAdd = () => { setEditId(null); setForm(EMPTY_FORM); setOpen(true); };
  const openEdit = (c: Client) => {
    setEditId(c.id);
    setForm({ name: c.name, contact_name: c.contact_name ?? '', phone: c.phone ?? '', email: c.email ?? '', address: '', industry: c.industry ?? '', notes: '', status: c.status });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    const url = editId ? `/api/crm/clients/${editId}?orgId=${orgId}` : `/api/crm/clients?orgId=${orgId}`;
    const method = editId ? 'PUT' : 'POST';
    await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false);
    setOpen(false);
    load();
  };

  const doDeleteClient = async () => {
    await fetch(`/api/crm/clients/${deleteConfirm.id}?orgId=${orgId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setDeleteConfirm({ open: false, id: '' });
    load();
  };

  return (
    <PageShell
      width="wide"
      icon={<Users className="h-6 w-6" />}
      title="ลูกค้า"
      actions={
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-1" /> เพิ่มลูกค้า
        </Button>
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="ค้นหาชื่อลูกค้า…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
          />
        </div>
        <CustomSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTS} className="w-36" />
        <Button variant="outline" size="sm" onClick={load}>ค้นหา</Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-10 text-slate-400 text-sm">กำลังโหลด…</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">ยังไม่มีลูกค้า</div>
      ) : (
        <div className="bg-white rounded-xl border divide-y">
          {clients.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/${orgSlug}/crm/clients/${c.id}`}
                    className="text-sm font-semibold text-slate-800 hover:text-indigo-600 truncate"
                  >
                    {c.name}
                  </Link>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[c.status] ?? ''}`}>
                    {c.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {c.contact_name && <span className="text-xs text-slate-500">{c.contact_name}</span>}
                  {c.phone && (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Phone className="w-3 h-3" />{c.phone}
                    </span>
                  )}
                  {c.email && (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Mail className="w-3 h-3" />{c.email}
                    </span>
                  )}
                  {c.industry && <span className="text-xs text-slate-400">{c.industry}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>แก้ไข</Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm({ open: true, id: c.id })} className="text-red-500 hover:text-red-600">ลบ</Button>
                <Link href={`/${orgSlug}/crm/clients/${c.id}`}>
                  <Button variant="ghost" size="icon"><ChevronRight className="w-4 h-4" /></Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าใหม่'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="c-name">ชื่อบริษัท / ลูกค้า *</Label>
              <Input id="c-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="บริษัท ABC จำกัด" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="c-contact">ผู้ติดต่อ</Label>
                <Input id="c-contact" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="c-phone">โทรศัพท์</Label>
                <Input id="c-phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="c-email">Email</Label>
              <Input id="c-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="c-industry">อุตสาหกรรม</Label>
              <Input id="c-industry" value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="IT, Healthcare, Retail…" />
            </div>
            <div>
              <Label htmlFor="c-notes">หมายเหตุ</Label>
              <Input id="c-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div>
              <Label>สถานะ</Label>
              <CustomSelect
                value={form.status}
                onChange={v => setForm(f => ({ ...f, status: v }))}
                options={STATUS_OPTS.filter(o => o.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => setDeleteConfirm((s) => ({ ...s, open: o }))}
        title="ลบลูกค้า"
        description="การกระทำนี้ไม่สามารถย้อนกลับได้"
        onConfirm={doDeleteClient}
      />
    </PageShell>
  );
}
