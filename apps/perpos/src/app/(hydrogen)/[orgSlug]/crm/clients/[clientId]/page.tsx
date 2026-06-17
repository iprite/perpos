'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import {
  ArrowLeft, Plus, Building2, Phone, Mail, MapPin,
  Briefcase, Pencil, Trash2, Star, UserPlus, MessageSquare,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type Client = {
  id: string; name: string; contact_name: string | null; phone: string | null;
  email: string | null; address: string | null; industry: string | null;
  notes: string | null; status: string;
};

type Contact = {
  id: string; name: string; position: string | null; phone: string | null;
  email: string | null; line_id: string | null; is_primary: boolean;
};

type Solution = {
  id: string; title: string; status: string; priority: string;
  value: number | null; start_date: string | null; end_date: string | null;
  description: string | null; tags: string[];
};

// ── Config ───────────────────────────────────────────────────────────────────

const CLIENT_STATUS_OPTS = [
  { value: 'active',   label: 'Active'   },
  { value: 'prospect', label: 'Prospect' },
  { value: 'inactive', label: 'Inactive' },
];

const SOL_STATUS_OPTS = [
  { value: 'lead',        label: 'Lead'        },
  { value: 'proposal',    label: 'Proposal'    },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold',     label: 'On Hold'     },
  { value: 'completed',   label: 'Completed'   },
  { value: 'cancelled',   label: 'Cancelled'   },
];

const PRIORITY_OPTS = [
  { value: 'low',    label: 'Low'    },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High'   },
  { value: 'urgent', label: 'Urgent' },
];

const STATUS_COLOR: Record<string, string> = {
  lead: 'bg-slate-100 text-slate-600', proposal: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700', on_hold: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-600',
};

const PRIORITY_COLOR: Record<string, string> = {
  low: '#9CA3AF', medium: '#4FC1E9', high: '#FC6E51', urgent: '#D8334A',
};

const EMPTY_SOL = { title: '', description: '', status: 'lead', priority: 'medium', value: '', start_date: '', end_date: '', tags: '' };
const EMPTY_CONTACT = { name: '', position: '', phone: '', email: '', line_id: '', is_primary: false };

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const { orgSlug, clientId } = useParams<{ orgSlug: string; clientId: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [orgId, setOrgId]     = useState('');
  const [token, setToken]     = useState('');
  const [client, setClient]   = useState<Client | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(true);

  // Client edit dialog
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [clientForm, setClientForm] = useState({ name: '', contact_name: '', phone: '', email: '', address: '', industry: '', notes: '', status: 'active' });
  const [savingClient, setSavingClient] = useState(false);

  // Solution dialog
  const [solOpen, setSolOpen]   = useState(false);
  const [solForm, setSolForm]   = useState(EMPTY_SOL);
  const [savingSol, setSavingSol] = useState(false);
  const [editSolId, setEditSolId] = useState<string | null>(null);

  // Contact dialog
  const [contactOpen, setContactOpen]   = useState(false);
  const [contactForm, setContactForm]   = useState(EMPTY_CONTACT);
  const [savingContact, setSavingContact] = useState(false);
  const [editContactId, setEditContactId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type: 'solution' | 'contact' | null; id: string }>({ open: false, type: null, id: '' });

  // ── Auth & load ────────────────────────────────────────────────────────────

  const initAuth = useCallback(async () => {
    const { data: orgs } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
    const { data: sess } = await supabase.auth.getSession();
    if (orgs && sess.session) { setOrgId(orgs.id); setToken(sess.session.access_token); }
  }, [supabase, orgSlug]);

  const loadAll = useCallback(async (oid: string, tok: string) => {
    setLoading(true);
    const [clientRes, contactsRes, solutionsRes] = await Promise.all([
      fetch(`/api/crm/clients/${clientId}?orgId=${oid}`,           { headers: { Authorization: `Bearer ${tok}` } }),
      fetch(`/api/crm/clients/${clientId}/contacts?orgId=${oid}`,  { headers: { Authorization: `Bearer ${tok}` } }),
      fetch(`/api/crm/solutions?orgId=${oid}&clientId=${clientId}`,{ headers: { Authorization: `Bearer ${tok}` } }),
    ]);
    if (clientRes.ok)   { const d = await clientRes.json();   setClient(d); setClientForm({ name: d.name, contact_name: d.contact_name ?? '', phone: d.phone ?? '', email: d.email ?? '', address: d.address ?? '', industry: d.industry ?? '', notes: d.notes ?? '', status: d.status }); }
    if (contactsRes.ok) setContacts(await contactsRes.json());
    if (solutionsRes.ok) setSolutions(await solutionsRes.json());
    setLoading(false);
  }, [clientId]);

  useEffect(() => { initAuth(); }, [initAuth]);
  useEffect(() => { if (orgId && token) loadAll(orgId, token); }, [loadAll, orgId, token]);

  // ── Client edit ────────────────────────────────────────────────────────────

  const saveClient = async () => {
    setSavingClient(true);
    await fetch(`/api/crm/clients/${clientId}?orgId=${orgId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(clientForm),
    });
    setSavingClient(false);
    setEditClientOpen(false);
    loadAll(orgId, token);
  };

  // ── Solution CRUD ──────────────────────────────────────────────────────────

  const openAddSol = () => { setEditSolId(null); setSolForm(EMPTY_SOL); setSolOpen(true); };
  const openEditSol = (s: Solution) => {
    setEditSolId(s.id);
    setSolForm({ title: s.title, description: s.description ?? '', status: s.status, priority: s.priority, value: String(s.value ?? ''), start_date: s.start_date ?? '', end_date: s.end_date ?? '', tags: (s.tags ?? []).join(', ') });
    setSolOpen(true);
  };

  const saveSol = async () => {
    setSavingSol(true);
    const tagsArr = solForm.tags.split(',').map(t => t.trim()).filter(Boolean);
    const body = {
      ...solForm,
      client_id:  clientId,
      value:      solForm.value ? Number(solForm.value) : null,
      start_date: solForm.start_date || null,
      end_date:   solForm.end_date   || null,
      tags:       tagsArr,
    };
    const url    = editSolId ? `/api/crm/solutions/${editSolId}?orgId=${orgId}` : `/api/crm/solutions?orgId=${orgId}`;
    const method = editSolId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`บันทึกไม่สำเร็จ: ${err.error ?? res.status}`);
      setSavingSol(false);
      return;
    }
    setSavingSol(false);
    setSolOpen(false);
    await loadAll(orgId, token);
  };

  const doDelete = async () => {
    const { type, id } = deleteConfirm;
    if (type === 'solution') {
      await fetch(`/api/crm/solutions/${id}?orgId=${orgId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setSolutions(prev => prev.filter(s => s.id !== id));
    } else if (type === 'contact') {
      await fetch(`/api/crm/clients/${clientId}/contacts?orgId=${orgId}&contactId=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setContacts(prev => prev.filter(c => c.id !== id));
    }
    setDeleteConfirm({ open: false, type: null, id: '' });
  };

  // ── Contact CRUD ───────────────────────────────────────────────────────────

  const openAddContact = () => { setEditContactId(null); setContactForm(EMPTY_CONTACT); setContactOpen(true); };
  const openEditContact = (c: Contact) => {
    setEditContactId(c.id);
    setContactForm({ name: c.name, position: c.position ?? '', phone: c.phone ?? '', email: c.email ?? '', line_id: c.line_id ?? '', is_primary: c.is_primary });
    setContactOpen(true);
  };

  const saveContact = async () => {
    setSavingContact(true);
    const url    = editContactId
      ? `/api/crm/clients/${clientId}/contacts?orgId=${orgId}&contactId=${editContactId}`
      : `/api/crm/clients/${clientId}/contacts?orgId=${orgId}`;
    const method = editContactId ? 'PUT' : 'POST';
    await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(contactForm) });
    setSavingContact(false);
    setContactOpen(false);
    const res = await fetch(`/api/crm/clients/${clientId}/contacts?orgId=${orgId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setContacts(await res.json());
  };


  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-6 text-slate-400 text-sm text-center">กำลังโหลด…</div>;
  if (!client) return <div className="p-6 text-red-500 text-sm">ไม่พบลูกค้า</div>;

  return (
    <PageShell width="wide">
      {/* Back */}
      <Link href={`/${orgSlug}/crm/clients`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600">
        <ArrowLeft className="w-4 h-4" /> กลับรายชื่อลูกค้า
      </Link>

      {/* ── Client info card ── */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-slate-900">{client.name}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${client.status === 'active' ? 'bg-green-100 text-green-700' : client.status === 'prospect' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                  {client.status}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                {client.contact_name && <span>{client.contact_name}</span>}
                {client.phone    && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{client.phone}</span>}
                {client.email    && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{client.email}</span>}
                {client.industry && <span className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />{client.industry}</span>}
                {client.address  && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{client.address}</span>}
              </div>
              {client.notes && <p className="mt-2 text-sm text-slate-400">{client.notes}</p>}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditClientOpen(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> แก้ไขข้อมูล
          </Button>
        </div>
      </div>

      {/* ── Contacts ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-800">ผู้ติดต่อ ({contacts.length})</h2>
          <Button size="sm" variant="outline" onClick={openAddContact}>
            <UserPlus className="w-4 h-4 mr-1" /> เพิ่มผู้ติดต่อ
          </Button>
        </div>
        {contacts.length === 0 ? (
          <div className="bg-white rounded-xl border p-6 text-center text-slate-400 text-sm">
            ยังไม่มีผู้ติดต่อ
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {contacts.map(c => (
              <div key={c.id} className="bg-white rounded-xl border p-4 flex items-start gap-3 group hover:shadow-sm transition-shadow">
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-500 text-sm font-bold">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">{c.name}</span>
                    {c.is_primary && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                        <Star className="w-3 h-3" /> หลัก
                      </span>
                    )}
                  </div>
                  {c.position && <p className="text-xs text-slate-500 mt-0.5">{c.position}</p>}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {c.phone   && <span className="text-xs text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                    {c.email   && <span className="text-xs text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                    {c.line_id && <span className="text-xs text-slate-400">LINE: {c.line_id}</span>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => openEditContact(c)} className="text-slate-300 hover:text-indigo-400 p-1">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteConfirm({ open: true, type: 'contact', id: c.id })} className="text-slate-300 hover:text-red-400 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Solutions ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-800">Solutions ({solutions.length})</h2>
          <Button size="sm" onClick={openAddSol}>
            <Plus className="w-4 h-4 mr-1" /> เพิ่ม Solution
          </Button>
        </div>
        {solutions.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center text-slate-400 text-sm">
            ยังไม่มี solution
          </div>
        ) : (
          <div className="space-y-2">
            {solutions.map(s => {
              const sc = STATUS_COLOR[s.status] ?? 'bg-slate-100 text-slate-600';
              return (
                <div key={s.id} className="bg-white rounded-xl border p-4 flex items-start gap-3 hover:shadow-sm transition-shadow group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/${orgSlug}/crm/solutions/${s.id}`} className="text-sm font-semibold text-slate-800 hover:text-indigo-600">
                        {s.title}
                      </Link>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc}`}>
                        {SOL_STATUS_OPTS.find(x => x.value === s.status)?.label ?? s.status}
                      </span>
                      <span className="text-xs font-medium" style={{ color: PRIORITY_COLOR[s.priority] ?? '#9CA3AF' }}>
                        {s.priority}
                      </span>
                    </div>
                    {s.description && <p className="text-xs text-slate-400 mt-1">{s.description}</p>}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {s.value != null && <span className="text-xs text-slate-500 font-medium">฿{s.value.toLocaleString('th-TH')}</span>}
                      {s.start_date && <span className="text-xs text-slate-400">เริ่ม {s.start_date}</span>}
                      {s.end_date   && <span className="text-xs text-slate-400">สิ้นสุด {s.end_date}</span>}
                      {s.tags?.map(tag => (
                        <span key={tag} className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/${orgSlug}/crm/solutions/${s.id}`}>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEditSol(s)}>แก้ไข</Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-500 hover:bg-red-50" onClick={() => setDeleteConfirm({ open: true, type: 'solution', id: s.id })}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Client Edit Dialog ── */}
      <Dialog open={editClientOpen} onOpenChange={setEditClientOpen}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>แก้ไขข้อมูลลูกค้า</DialogTitle></DialogHeader>
          <DialogBody>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ce-name">ชื่อบริษัท *</Label>
              <Input id="ce-name" value={clientForm.name} onChange={e => setClientForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ce-contact">ผู้ติดต่อหลัก</Label>
                <Input id="ce-contact" value={clientForm.contact_name} onChange={e => setClientForm(f => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="ce-phone">โทรศัพท์</Label>
                <Input id="ce-phone" value={clientForm.phone} onChange={e => setClientForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="ce-email">Email</Label>
              <Input id="ce-email" type="email" value={clientForm.email} onChange={e => setClientForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="ce-industry">อุตสาหกรรม</Label>
              <Input id="ce-industry" value={clientForm.industry} onChange={e => setClientForm(f => ({ ...f, industry: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="ce-address">ที่อยู่</Label>
              <Input id="ce-address" value={clientForm.address} onChange={e => setClientForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="ce-notes">หมายเหตุ</Label>
              <Input id="ce-notes" value={clientForm.notes} onChange={e => setClientForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div>
              <Label>สถานะ</Label>
              <CustomSelect value={clientForm.status} onChange={v => setClientForm(f => ({ ...f, status: v }))} options={CLIENT_STATUS_OPTS} />
            </div>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditClientOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveClient} disabled={savingClient || !clientForm.name.trim()}>
              {savingClient ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Contact Dialog ── */}
      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>{editContactId ? 'แก้ไขผู้ติดต่อ' : 'เพิ่มผู้ติดต่อ'}</DialogTitle></DialogHeader>
          <DialogBody>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ct-name">ชื่อ *</Label>
              <Input id="ct-name" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="ct-pos">ตำแหน่ง</Label>
              <Input id="ct-pos" value={contactForm.position} onChange={e => setContactForm(f => ({ ...f, position: e.target.value }))} placeholder="CEO, IT Manager…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ct-phone">โทรศัพท์</Label>
                <Input id="ct-phone" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="ct-line">LINE ID</Label>
                <Input id="ct-line" value={contactForm.line_id} onChange={e => setContactForm(f => ({ ...f, line_id: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="ct-email">Email</Label>
              <Input id="ct-email" type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={contactForm.is_primary}
                onChange={e => setContactForm(f => ({ ...f, is_primary: e.target.checked }))}
                className="rounded"
              />
              ตั้งเป็นผู้ติดต่อหลัก
            </label>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveContact} disabled={savingContact || !contactForm.name.trim()}>
              {savingContact ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Solution Dialog ── */}
      <Dialog open={solOpen} onOpenChange={setSolOpen}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{editSolId ? 'แก้ไข Solution' : 'เพิ่ม Solution'}</DialogTitle></DialogHeader>
          <DialogBody>
          <div className="space-y-3">
            <div>
              <Label htmlFor="sol-title">ชื่อ *</Label>
              <Input id="sol-title" value={solForm.title} onChange={e => setSolForm(f => ({ ...f, title: e.target.value }))} placeholder="ระบบ ERP, Website…" />
            </div>
            <div>
              <Label htmlFor="sol-desc">รายละเอียด</Label>
              <Input id="sol-desc" value={solForm.description} onChange={e => setSolForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <CustomSelect value={solForm.status} onChange={v => setSolForm(f => ({ ...f, status: v }))} options={SOL_STATUS_OPTS} />
              </div>
              <div>
                <Label>Priority</Label>
                <CustomSelect value={solForm.priority} onChange={v => setSolForm(f => ({ ...f, priority: v }))} options={PRIORITY_OPTS} />
              </div>
            </div>
            <div>
              <Label htmlFor="sol-value">มูลค่า (บาท)</Label>
              <Input id="sol-value" type="number" value={solForm.value} onChange={e => setSolForm(f => ({ ...f, value: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>วันเริ่ม</Label>
                <ThaiDatePicker value={solForm.start_date} onChange={v => setSolForm(f => ({ ...f, start_date: v }))} />
              </div>
              <div>
                <Label>วันสิ้นสุด</Label>
                <ThaiDatePicker value={solForm.end_date} onChange={v => setSolForm(f => ({ ...f, end_date: v }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="sol-tags">Tags (คั่นด้วยจุลภาค)</Label>
              <Input id="sol-tags" value={solForm.tags} onChange={e => setSolForm(f => ({ ...f, tags: e.target.value }))} placeholder="ERP, Cloud, Network…" />
            </div>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSolOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveSol} disabled={savingSol || !solForm.title.trim()}>
              {savingSol ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => setDeleteConfirm((s) => ({ ...s, open: o }))}
        title={deleteConfirm.type === 'contact' ? 'ลบผู้ติดต่อ' : 'ลบ Solution'}
        description="การกระทำนี้ไม่สามารถย้อนกลับได้"
        onConfirm={doDelete}
      />
    </PageShell>
  );
}
