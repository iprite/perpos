'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableEmpty,
} from '@/components/ui/table';
import { Plus, Trash2, ChevronLeft, ChevronRight, Wallet } from 'lucide-react';
import { PageShell } from '@/components/ui/page-shell';
import type { PettyCashEntry } from '@/app/api/acc-firm/petty-cash/route';

const PAGE_SIZE = 50;

function fmt(n: number | null | undefined) {
  if (n == null || n === 0) return '—';
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const EMPTY_FORM = {
  entry_date: '',
  description: '',
  company: '',
  category: '',
  payee: '',
  amount_out: '',
  amount_in: '',
  collected: '',
  note: '',
};

function fmtDate(d: string) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${Number(y) + 543}`;
}

export default function PettyCashPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId]   = useState('');
  const [token, setToken]   = useState('');

  // Filter state
  const [category, setCategory] = useState('');
  const [from, setFrom]         = useState('');
  const [to, setTo]             = useState('');
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);

  // Data state
  const [entries, setEntries]       = useState<PettyCashEntry[]>([]);
  const [total, setTotal]           = useState(0);
  const [totals, setTotals]         = useState({ total_out: 0, total_in: 0, total_collected: 0 });
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading]       = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]       = useState<PettyCashEntry | null>(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [deleteId, setDeleteId]     = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  const load = useCallback(async (p = page) => {
    if (!orgId || !token) return;
    setLoading(true);
    const qs = new URLSearchParams({
      orgId,
      page: String(p),
      pageSize: String(PAGE_SIZE),
      ...(category && { category }),
      ...(from     && { from }),
      ...(to       && { to }),
      ...(search   && { search }),
    });
    const res = await fetch(`/api/acc-firm/petty-cash?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const d = await res.json();
      setEntries(d.entries);
      setTotal(d.total);
      setTotals(d.totals);
      setCategories(d.categories ?? []);
    }
    setLoading(false);
  }, [orgId, token, category, from, to, search, page]);

  useEffect(() => { setPage(1); }, [category, from, to]);
  useEffect(() => { load(page); }, [load, page]);

  function handleSearch(v: string) {
    setSearch(v);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setPage(1), 400);
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, entry_date: new Date().toISOString().slice(0, 10) });
    setDialogOpen(true);
  }

  function openEdit(e: PettyCashEntry) {
    setEditing(e);
    setForm({
      entry_date:  e.entry_date,
      description: e.description,
      company:     e.company ?? '',
      category:    e.category ?? '',
      payee:       e.payee ?? '',
      amount_out:  e.amount_out != null ? String(e.amount_out) : '',
      amount_in:   e.amount_in  != null ? String(e.amount_in)  : '',
      collected:   e.collected  != null ? String(e.collected)   : '',
      note:        e.note ?? '',
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!orgId || !form.entry_date || !form.description) return;
    setSaving(true);
    const method = editing ? 'PATCH' : 'POST';
    const body = editing ? { orgId, id: editing.id, ...form } : { orgId, ...form };
    const res = await fetch('/api/acc-firm/petty-cash', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) { setDialogOpen(false); load(page); toast.success(editing ? 'แก้ไขรายการแล้ว' : 'บันทึกรายการแล้ว'); }
    else { toast.error('บันทึกไม่สำเร็จ'); }
  }

  async function confirmDelete(id: string) {
    if (!orgId) return;
    const res = await fetch('/api/acc-firm/petty-cash', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orgId, id }),
    });
    if (res.ok) { setDeleteId(null); load(page); toast.success('ลบรายการแล้ว'); }
    else { toast.error('ลบไม่สำเร็จ'); }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const balance = totals.total_in - totals.total_out;
  const catOptions = [
    { value: '', label: 'ทุกประเภท' },
    ...categories.map(c => ({ value: c, label: c })),
  ];

  return (
    <PageShell
      width="default"
      icon={<Wallet className="h-6 w-6" />}
      title="เงินสดย่อย"
      description="บัญชีเงินสดย่อยสำนักงานบัญชี"
      actions={
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" /> เพิ่มรายการ
        </Button>
      }
    >
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="เงินออก (รวม)" value={totals.total_out} color="text-red-600" />
        <SummaryCard label="เงินเข้า (รวม)" value={totals.total_in} color="text-green-600" />
        <SummaryCard label="เก็บเงิน (รวม)" value={totals.total_collected} color="text-blue-600" />
        <SummaryCard label="คงเหลือสุทธิ" value={balance} color={balance >= 0 ? 'text-green-700' : 'text-red-700'} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end bg-gray-50 border rounded-xl p-4">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="ค้นหารายการ..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
        <CustomSelect
          value={category}
          onChange={setCategory}
          options={catOptions}
          className="w-48"
        />
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">จาก</Label>
          <ThaiDatePicker value={from} onChange={setFrom} placeholder="วันที่เริ่ม" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">ถึง</Label>
          <ThaiDatePicker value={to} onChange={setTo} placeholder="วันที่สิ้นสุด" />
        </div>
        {(category || from || to || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setCategory(''); setFrom(''); setTo(''); setSearch(''); }}>
            ล้างตัวกรอง
          </Button>
        )}
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>วันที่</TableHead>
            <TableHead>รายการ</TableHead>
            <TableHead>บริษัท</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead>ผู้รับเงิน</TableHead>
            <TableHead align="right">เงินออก</TableHead>
            <TableHead align="right">เงินเข้า</TableHead>
            <TableHead align="right">เก็บเงิน</TableHead>
            <TableHead>หมายเหตุ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableEmpty colSpan={9}>กำลังโหลด…</TableEmpty>
          ) : entries.length === 0 ? (
            <TableEmpty colSpan={9}>ไม่พบรายการ</TableEmpty>
          ) : entries.map(e => (
            <TableRow key={e.id} clickable onClick={() => openEdit(e)}>
              <TableCell className="text-gray-700">{fmtDate(e.entry_date)}</TableCell>
              <TableCell className="max-w-[200px] truncate text-gray-800" title={e.description}>{e.description}</TableCell>
              <TableCell className="text-xs text-gray-600">{e.company || '—'}</TableCell>
              <TableCell>{e.category ? <StatusBadge tone="info">{e.category}</StatusBadge> : '—'}</TableCell>
              <TableCell className="text-xs text-gray-600">{e.payee || '—'}</TableCell>
              <TableCell align="right" tabular className="text-red-600">{fmt(e.amount_out)}</TableCell>
              <TableCell align="right" tabular className="text-green-600">{fmt(e.amount_in)}</TableCell>
              <TableCell align="right" tabular className="text-blue-600">{fmt(e.collected)}</TableCell>
              <TableCell className="max-w-[140px] truncate text-xs text-gray-500" title={e.note ?? ''}>{e.note || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        {entries.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5} className="text-xs text-gray-600">รวมทั้งหมด ({total} รายการ)</TableCell>
              <TableCell align="right" tabular className="text-red-600">{fmt(totals.total_out)}</TableCell>
              <TableCell align="right" tabular className="text-green-600">{fmt(totals.total_in)}</TableCell>
              <TableCell align="right" tabular className="text-blue-600">{fmt(totals.total_collected)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        )}
      </Table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-sm text-gray-600">
            หน้า {page} / {totalPages} ({total} รายการ)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'แก้ไขรายการ' : 'เพิ่มรายการเงินสดย่อย'}</DialogTitle>
          </DialogHeader>

          <DialogBody>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>วันที่ *</Label>
              <ThaiDatePicker value={form.entry_date} onChange={v => setForm(f => ({ ...f, entry_date: v }))} />
            </div>
            <div className="col-span-2">
              <Label>รายการ *</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="ระบุรายการ" />
            </div>
            <div>
              <Label>บริษัท (ลูกค้า)</Label>
              <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="ชื่อบริษัท" />
            </div>
            <div>
              <Label>ประเภท</Label>
              <Input
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="เช่น ค่าส่งเอกสาร"
                list="cat-list"
              />
              <datalist id="cat-list">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <Label>ผู้รับเงิน</Label>
              <Input value={form.payee} onChange={e => setForm(f => ({ ...f, payee: e.target.value }))} placeholder="ชื่อผู้รับ" />
            </div>
            <div>
              <Label>เงินออก (บาท)</Label>
              <Input type="number" step="0.01" value={form.amount_out} onChange={e => setForm(f => ({ ...f, amount_out: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <Label>เงินเข้า (บาท)</Label>
              <Input type="number" step="0.01" value={form.amount_in} onChange={e => setForm(f => ({ ...f, amount_in: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <Label>เก็บเงิน (บาท)</Label>
              <Input type="number" step="0.01" value={form.collected} onChange={e => setForm(f => ({ ...f, collected: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="col-span-2">
              <Label>หมายเหตุ</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="หมายเหตุเพิ่มเติม" />
            </div>
          </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={saving || !form.entry_date || !form.description}>
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>ยืนยันลบรายการ</DialogTitle></DialogHeader>
          <DialogBody>
          <p className="text-sm text-gray-600">ต้องการลบรายการนี้หรือไม่? ไม่สามารถยกเลิกได้</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>ยกเลิก</Button>
            <Button variant="destructive" onClick={() => deleteId && confirmDelete(deleteId)}>ลบ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono ${color}`}>
        {Math.abs(value).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
}
