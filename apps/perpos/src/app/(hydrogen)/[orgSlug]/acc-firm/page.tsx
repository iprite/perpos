'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, Calculator, ArrowRight,
  Building2, BookOpenText, Users, CheckCircle2, Clock,
} from 'lucide-react';

type ClientRow = {
  id: string;
  status: 'active' | 'inactive' | 'ended';
  modules_managed: string[];
  note: string | null;
  started_at: string | null;
  client_org: { id: string; name: string; slug: string };
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active:   { label: 'Active',    cls: 'bg-green-100 text-green-700' },
  inactive: { label: 'Inactive',  cls: 'bg-gray-100 text-gray-500'  },
  ended:    { label: 'Ended',     cls: 'bg-red-100 text-red-500'    },
};

const MODULE_ICON: Record<string, React.ReactNode> = {
  accounting: <BookOpenText className="w-3.5 h-3.5" />,
  payroll:    <Users className="w-3.5 h-3.5" />,
};

export default function AccFirmDashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId]       = useState('');
  const [clients, setClients]   = useState<ClientRow[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: org }, { data: sess }] = await Promise.all([
      supabase.from('organizations').select('id').eq('slug', orgSlug).single(),
      supabase.auth.getSession(),
    ]);
    if (!org || !sess.session) { setLoading(false); return; }
    setOrgId(org.id);

    const res = await fetch(`/api/acc-firm/clients?orgId=${org.id}`, {
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setClients(json.clients ?? []);
    }
    setLoading(false);
  }, [supabase, orgSlug]);

  useEffect(() => { load(); }, [load]);

  const active   = clients.filter(c => c.status === 'active');
  const inactive = clients.filter(c => c.status !== 'active');

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-teal-500" /> Dashboard
          </h1>
          <p className="text-sm text-slate-500">สำนักงานบัญชี — ภาพรวม client orgs ทั้งหมด</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? 'กำลังโหลด…' : 'รีเฟรช'}
          </Button>
          <Link href={`/${orgSlug}/acc-firm/clients`}>
            <Button size="sm">จัดการ Client Orgs</Button>
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-teal-50 border-teal-100 p-4 flex gap-3 items-start">
          <Building2 className="w-5 h-5 text-teal-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-slate-500 font-medium">Client ทั้งหมด</p>
            <p className="text-2xl font-bold text-slate-800">{loading ? '…' : clients.length}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-green-50 border-green-100 p-4 flex gap-3 items-start">
          <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-slate-500 font-medium">Active</p>
            <p className="text-2xl font-bold text-slate-800">{loading ? '…' : active.length}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-gray-50 border-gray-100 p-4 flex gap-3 items-start">
          <Clock className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-slate-500 font-medium">Inactive / Ended</p>
            <p className="text-2xl font-bold text-slate-800">{loading ? '…' : inactive.length}</p>
          </div>
        </div>
      </div>

      {/* Client list */}
      <div className="bg-white rounded-xl border">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Calculator className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Client Orgs ที่ดูแลอยู่</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">กำลังโหลด…</div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center text-slate-300 text-sm space-y-2">
            <Calculator className="w-8 h-8 mx-auto text-slate-200" />
            <p>ยังไม่มี client org</p>
            <Link href={`/${orgSlug}/acc-firm/clients`}>
              <Button size="sm" variant="outline" className="mt-2">เพิ่ม Client Org</Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y">
            {clients.map(c => {
              const st = STATUS_LABEL[c.status] ?? STATUS_LABEL.inactive;
              return (
                <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 group">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-teal-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800 truncate">{c.client_org.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-400">{c.client_org.slug}</span>
                      {c.modules_managed.map(m => (
                        <span key={m} className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {MODULE_ICON[m]} {m}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Quick links */}
                  {c.status === 'active' && (
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {c.modules_managed.includes('accounting') && (
                        <Link href={`/${c.client_org.slug}/accounting`}>
                          <Button size="sm" variant="outline" className="text-xs gap-1">
                            <BookOpenText className="w-3.5 h-3.5" /> Accounting
                          </Button>
                        </Link>
                      )}
                      {c.modules_managed.includes('payroll') && (
                        <Link href={`/${c.client_org.slug}/payroll`}>
                          <Button size="sm" variant="outline" className="text-xs gap-1">
                            <Users className="w-3.5 h-3.5" /> Payroll
                          </Button>
                        </Link>
                      )}
                    </div>
                  )}
                  <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick link */}
      <Link
        href={`/${orgSlug}/acc-firm/clients`}
        className="bg-white rounded-xl border p-4 flex items-center justify-between hover:border-teal-300 hover:shadow-sm transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center">
            <Calculator className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">จัดการ Client Orgs</p>
            <p className="text-xs text-slate-400">เพิ่ม / แก้ไข / ดูรายละเอียด engagement</p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-teal-400 transition-colors" />
      </Link>
    </div>
  );
}
