'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { ALL_MODULES } from '@/lib/modules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import {
  Calculator, Users, Bot, Building2, Handshake, Briefcase,
  CheckCircle2, AlertCircle, Loader2, Plus, Zap, RefreshCw,
} from 'lucide-react';
import cn from '@core/utils/class-names';

// ── Types ──────────────────────────────────────────────────────────────────────
type Org = { id: string; name: string; slug: string };

// ── Helpers ────────────────────────────────────────────────────────────────────
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^\x00-\x7F]/g, '')   // strip non-ASCII (Thai, accents, etc.)
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24) || '';
}

const MODULE_ICONS: Record<string, React.ReactNode> = {
  accounting: <Calculator className="h-5 w-5" />,
  payroll:    <Users      className="h-5 w-5" />,
  assistant:  <Bot        className="h-5 w-5" />,
  tmc:        <Building2  className="h-5 w-5" />,
  crm:        <Handshake  className="h-5 w-5" />,
  acc_firm:   <Briefcase  className="h-5 w-5" />,
};

const MODULE_DESC: Record<string, string> = {
  accounting: 'บัญชี รายรับรายจ่าย ภาษี สินค้า',
  payroll:    'เงินเดือน พนักงาน แผนก',
  assistant:  'Task Manager AI แจ้งเตือนผ่าน LINE',
  tmc:        'บริหารหมู่บ้าน/รีสอร์ท เฉพาะองค์กร',
  crm:        'ลูกค้า Sales Pipeline เฉพาะองค์กร',
  acc_firm:   'สำนักงานบัญชี บริหาร client orgs',
};

// ── Module Card ────────────────────────────────────────────────────────────────
function ModuleCard({
  moduleKey, selected, onToggle, disabled,
}: {
  moduleKey: string;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const mod = ALL_MODULES.find(m => m.key === moduleKey);
  if (!mod) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-all',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        selected
          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      {mod.specific && (
        <span className="absolute right-2 top-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
          Specific
        </span>
      )}
      <div className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg',
        selected ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500',
      )}>
        {MODULE_ICONS[moduleKey]}
      </div>
      <div>
        <p className={cn('text-sm font-semibold', selected ? 'text-blue-700' : 'text-slate-800')}>
          {mod.label}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
          {MODULE_DESC[moduleKey] ?? ''}
        </p>
      </div>
      {selected && (
        <CheckCircle2 className="absolute bottom-3 right-3 h-4 w-4 text-blue-500" />
      )}
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ProvisioningPage() {
  const supabase = createSupabaseBrowserClient();
  const [tab, setTab] = useState<'create' | 'enable'>('create');

  // ── Shared state ─────────────────────────────────────────────────────────────
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    };
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      const h = await authHeader();
      const res = await fetch('/api/admin/modules', { headers: h });
      const data = await res.json() as { orgs?: Org[] };
      setOrgs(data.orgs ?? []);
      setLoadingOrgs(false);
    })();
  }, [authHeader]);

  // ── Tab 1: Create Org ─────────────────────────────────────────────────────────
  const [orgName,       setOrgName]       = useState('');
  const [orgSlug,       setOrgSlug]       = useState('');
  const [slugEdited,    setSlugEdited]    = useState(false);
  const [slugStatus,    setSlugStatus]    = useState<'idle'|'checking'|'ok'|'taken'>('idle');
  const [ownerEmail,    setOwnerEmail]    = useState('');
  const [selectedMods,  setSelectedMods]  = useState<Set<string>>(new Set());
  const [creating,      setCreating]      = useState(false);
  const [createResult,  setCreateResult]  = useState<{ok:boolean; msg:string}|null>(null);
  const slugTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  // Auto-generate slug from name
  useEffect(() => {
    if (slugEdited) return;
    const gen = toSlug(orgName);
    setOrgSlug(gen);
    setSlugStatus('idle');
  }, [orgName, slugEdited]);

  // Debounced slug availability check
  useEffect(() => {
    if (!orgSlug || orgSlug.length < 3) { setSlugStatus('idle'); return; }
    setSlugStatus('checking');
    if (slugTimer.current) clearTimeout(slugTimer.current);
    slugTimer.current = setTimeout(async () => {
      const h = await authHeader();
      const res = await fetch(`/api/admin/onboarding?checkSlug=${encodeURIComponent(orgSlug)}`, { headers: h });
      const data = await res.json() as { available?: boolean };
      setSlugStatus(data.available ? 'ok' : 'taken');
    }, 500);
  }, [orgSlug, authHeader]);

  function toggleMod(key: string) {
    setSelectedMods(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleCreate() {
    setCreating(true);
    setCreateResult(null);
    const h = await authHeader();
    const res = await fetch('/api/admin/onboarding', {
      method: 'POST', headers: h,
      body: JSON.stringify({
        name: orgName.trim(),
        slug: orgSlug.trim(),
        ownerEmail: ownerEmail.trim(),
        moduleKeys: Array.from(selectedMods),
      }),
    });
    const data = await res.json() as { ok?: boolean; error?: string; org?: Org; modulesEnabled?: string[]; ownerInvited?: boolean };
    setCreating(false);
    if (res.ok && data.ok) {
      const mod = (org: Org) => org;
      void mod;
      setOrgs(prev => [...prev, data.org!].sort((a, b) => a.name.localeCompare(b.name, 'th')));
      setCreateResult({ ok: true, msg: `✓ สร้าง "${(data.org as Org).name}" สำเร็จ — เปิด module: ${(data.modulesEnabled ?? []).join(', ') || 'ไม่มี'} ${data.ownerInvited ? '· ส่งอีเมลเชิญแล้ว' : '· เพิ่ม owner แล้ว'}` });
      setOrgName(''); setOrgSlug(''); setOwnerEmail(''); setSelectedMods(new Set()); setSlugEdited(false);
    } else {
      setCreateResult({ ok: false, msg: data.error ?? 'เกิดข้อผิดพลาด' });
    }
  }

  const canCreate = orgName.trim().length >= 2 && orgSlug.length >= 3 && slugStatus === 'ok' && ownerEmail.includes('@') && !creating;

  // ── Tab 2: Enable Module ──────────────────────────────────────────────────────
  const [targetOrgId,  setTargetOrgId]  = useState('');
  const [targetMod,    setTargetMod]    = useState('');
  const [enabling,     setEnabling]     = useState(false);
  const [enableResult, setEnableResult] = useState<{ok:boolean; msg:string}|null>(null);

  async function handleEnable() {
    setEnabling(true);
    setEnableResult(null);
    const h = await authHeader();
    const res = await fetch('/api/admin/provisioning', {
      method: 'POST', headers: h,
      body: JSON.stringify({ orgId: targetOrgId, moduleKey: targetMod }),
    });
    const data = await res.json() as { ok?: boolean; error?: string; org?: Org; module_key?: string };
    setEnabling(false);
    if (res.ok && data.ok) {
      const orgName = (data.org as Org)?.name ?? targetOrgId;
      const modLabel = ALL_MODULES.find(m => m.key === data.module_key)?.label ?? data.module_key;
      setEnableResult({ ok: true, msg: `✓ เปิดใช้งาน "${modLabel}" ให้ "${orgName}" สำเร็จ` });
      setTargetMod('');
    } else {
      setEnableResult({ ok: false, msg: (data as Record<string,string>).error ?? 'เกิดข้อผิดพลาด' });
    }
  }

  const orgOptions = [
    { value: '', label: 'เลือก Org…' },
    ...orgs.map(o => ({ value: o.id, label: `${o.name}  (${o.slug})` })),
  ];

  const canEnable = !!targetOrgId && !!targetMod && !enabling;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Module Provisioning</h1>
          <p className="text-sm text-slate-500">สร้าง Org ใหม่ หรือเพิ่ม Module ให้ Org ที่มีอยู่</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 w-fit">
        {([
          { key: 'create', label: 'สร้าง Org ใหม่',          icon: <Plus className="h-3.5 w-3.5" /> },
          { key: 'enable', label: 'เพิ่ม Module ให้ Org',    icon: <RefreshCw className="h-3.5 w-3.5" /> },
        ] as const).map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Create Org ── */}
      {tab === 'create' && (
        <div className="space-y-6">

          {/* Org info */}
          <div className="rounded-2xl border bg-white p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">1 · ข้อมูลองค์กร</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>ชื่อองค์กร *</Label>
                <Input
                  placeholder="เช่น Thai Mountain Club"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Slug (URL) *</Label>
                <div className="relative">
                  <Input
                    placeholder="เช่น thai-mountain-club"
                    value={orgSlug}
                    onChange={e => { setOrgSlug(e.target.value); setSlugEdited(true); setSlugStatus('idle'); }}
                    className={cn(
                      'pr-8',
                      slugStatus === 'ok'    && 'border-green-400 focus:ring-green-300',
                      slugStatus === 'taken' && 'border-red-400   focus:ring-red-300',
                    )}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs">
                    {slugStatus === 'checking' && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                    {slugStatus === 'ok'       && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                    {slugStatus === 'taken'    && <AlertCircle  className="h-3.5 w-3.5 text-red-500"   />}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {slugStatus === 'ok'    && <span className="text-green-600">✓ slug นี้ใช้ได้</span>}
                  {slugStatus === 'taken' && <span className="text-red-600">✗ slug นี้ถูกใช้แล้ว</span>}
                  {slugStatus === 'idle'  && 'ใช้ใน URL: perpos.io/{slug}/...'}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>อีเมลเจ้าของระบบ (Owner) *</Label>
              <Input
                type="email"
                placeholder="owner@company.com"
                value={ownerEmail}
                onChange={e => setOwnerEmail(e.target.value)}
              />
              <p className="text-xs text-slate-400">ระบบจะส่งอีเมลเชิญหากยังไม่มีบัญชี</p>
            </div>
          </div>

          {/* Module selection */}
          <div className="rounded-2xl border bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">2 · เลือก Modules ที่ต้องการเปิด</h2>
              <span className="text-xs text-slate-400">เลือกได้หลายรายการ</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ALL_MODULES.map(m => (
                <ModuleCard
                  key={m.key}
                  moduleKey={m.key}
                  selected={selectedMods.has(m.key)}
                  onToggle={() => toggleMod(m.key)}
                />
              ))}
            </div>
            {selectedMods.size === 0 && (
              <p className="text-xs text-slate-400">ไม่เลือกก็ได้ — สามารถเพิ่มภายหลังได้จากแท็บ &ldquo;เพิ่ม Module&rdquo;</p>
            )}
          </div>

          {/* Result */}
          {createResult && (
            <div className={cn(
              'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
              createResult.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700',
            )}>
              {createResult.ok
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                : <AlertCircle  className="mt-0.5 h-4 w-4 shrink-0 text-red-500"   />}
              {createResult.msg}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => void handleCreate()} disabled={!canCreate} size="lg">
              {creating
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังสร้าง…</>
                : <><Plus className="mr-2 h-4 w-4" />สร้าง Org และ Provision</>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Tab 2: Enable Module ── */}
      {tab === 'enable' && (
        <div className="space-y-6">
          <div className="rounded-2xl border bg-white p-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-700">1 · เลือกองค์กร</h2>
            {loadingOrgs
              ? <p className="text-sm text-slate-400">กำลังโหลด...</p>
              : (
                <CustomSelect
                  value={targetOrgId}
                  onChange={v => { setTargetOrgId(v); setTargetMod(''); setEnableResult(null); }}
                  options={orgOptions}
                  className="max-w-md"
                />
              )}

            {targetOrgId && (
              <>
                <div className="border-t pt-4">
                  <h2 className="text-sm font-semibold text-slate-700 mb-3">2 · เลือก Module ที่ต้องการเปิด</h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {ALL_MODULES.map(m => (
                      <ModuleCard
                        key={m.key}
                        moduleKey={m.key}
                        selected={targetMod === m.key}
                        onToggle={() => setTargetMod(prev => prev === m.key ? '' : m.key)}
                      />
                    ))}
                  </div>
                </div>

                {targetMod && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    จะเปิดใช้งาน <strong>{ALL_MODULES.find(m => m.key === targetMod)?.label}</strong> ให้กับ{' '}
                    <strong>{orgs.find(o => o.id === targetOrgId)?.name}</strong>
                    {' '}(slug: <code className="font-mono text-xs">{orgs.find(o => o.id === targetOrgId)?.slug}</code>)
                  </div>
                )}
              </>
            )}
          </div>

          {enableResult && (
            <div className={cn(
              'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
              enableResult.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700',
            )}>
              {enableResult.ok
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                : <AlertCircle  className="mt-0.5 h-4 w-4 shrink-0 text-red-500"   />}
              {enableResult.msg}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => void handleEnable()} disabled={!canEnable} size="lg">
              {enabling
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังเปิดใช้งาน…</>
                : <><Zap className="mr-2 h-4 w-4" />เปิดใช้งาน Module</>}
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
