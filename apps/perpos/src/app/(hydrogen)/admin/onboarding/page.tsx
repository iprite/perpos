'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/shared/auth-provider';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { MODULE_MENUS, MODULE_LABELS, ALL_MODULES } from '@/lib/modules';
import {
  CheckCircle2, ChevronRight, ChevronLeft,
  Building2, LayoutGrid, Settings2, UserPlus, Eye,
  Loader2, Sparkles, AlertCircle, Lock,
} from 'lucide-react';
import cn from '@core/utils/class-names';
import { AdminPage } from '../_components/admin-page';

// ─── Registry module type ───────────────────────────────────────────────────────
interface RegistryModule {
  id:          string;
  key:         string;
  label:       string;
  href_slug:   string;
  description: string | null;
  is_specific: boolean;
  is_builtin:  boolean;
  is_active:   boolean;
  sort_order:  number;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SpecificModuleConfig {
  key:        string;
  moduleSlug: string;
}

interface WizardForm {
  name:            string;
  slug:            string;
  moduleKeys:      string[];   // shared module keys
  specificModules: SpecificModuleConfig[];
  ownerEmail:      string;
}

// Steps: 1=Org, 2=Modules, 3=SpecificConfig (skipped if none), 4=Owner, 5=Review
type Step = 1 | 2 | 3 | 4 | 5;

const STEPS: { step: Step; label: string; icon: React.ReactNode }[] = [
  { step: 1, label: 'ข้อมูลองค์กร',    icon: <Building2 className="h-4 w-4" /> },
  { step: 2, label: 'เลือก Module',    icon: <LayoutGrid className="h-4 w-4" /> },
  { step: 3, label: 'ตั้งค่า Module',  icon: <Settings2 className="h-4 w-4" /> },
  { step: 4, label: 'บัญชีเจ้าของ',   icon: <UserPlus className="h-4 w-4" /> },
  { step: 5, label: 'ยืนยัน',          icon: <Eye className="h-4 w-4" /> },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

function defaultModuleSlug(moduleKey: string, orgSlug: string): string {
  // Default module slug = orgSlug, admin can override
  return orgSlug || moduleKey;
}

// ─── Step indicator ────────────────────────────────────────────────────────────

function StepBar({ current, hasSpecific }: { current: Step; hasSpecific: boolean }) {
  const visibleSteps = hasSpecific ? STEPS : STEPS.filter(s => s.step !== 3);
  // Remap display step numbers when step 3 is hidden
  const displayStep = (s: Step): Step => {
    if (!hasSpecific && s >= 3) return (s - 1) as Step;
    return s;
  };
  const effectiveCurrent = hasSpecific ? current : displayStep(current);

  return (
    <div className="flex items-center gap-0 flex-wrap">
      {visibleSteps.map((s, i) => {
        const ds = hasSpecific ? s.step : displayStep(s.step);
        const done = effectiveCurrent > ds;
        const active = effectiveCurrent === ds;
        return (
          <div key={s.step} className="flex items-center">
            <div className={cn(
              'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors',
              active ? 'bg-blue-600 text-white'
                : done ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-gray-100 text-gray-400',
            )}>
              {done ? <CheckCircle2 className="h-4 w-4" /> : s.icon}
              <span className="hidden font-medium sm:inline">{s.label}</span>
            </div>
            {i < visibleSteps.length - 1 && (
              <div className={cn('h-px w-6', done ? 'bg-emerald-300' : 'bg-gray-200')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { role } = useAuth();
  const supabase  = useMemo(() => createSupabaseBrowserClient(), []);
  const router    = useRouter();

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? '';
  }, [supabase]);

  // Module registry from DB
  const [registryMods, setRegistryMods] = useState<RegistryModule[]>([]);
  const [registryLoading, setRegistryLoading] = useState(true);

  const personalKeys = ALL_MODULES.filter(m => m.personal).map(m => m.key);
  const sharedMods   = registryMods.filter(m => !m.is_specific && m.is_active && !personalKeys.includes(m.key));
  const specificMods: RegistryModule[] = []; // Cut out taylormade modules completely

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const res = await fetch('/api/admin/module-registry', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json() as { modules?: RegistryModule[] };
      setRegistryMods(d.modules ?? []);
      setRegistryLoading(false);
    })();
  }, [getToken]);

  const [step, setStep]   = useState<Step>(1);
  const [form, setForm]   = useState<WizardForm>({
    name: '', slug: '', moduleKeys: [], specificModules: [], ownerEmail: '',
  });
  const [slugAvail,    setSlugAvail]    = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [result,       setResult]       = useState<{
    org: { id: string; name: string; slug: string };
    ownerInvited: boolean;
    modulesEnabled: string[];
    seededSummary: Record<string, Record<string, number>>;
  } | null>(null);
  const [error, setError] = useState('');

  const hasSpecific = form.specificModules.length > 0;

  // ── Access guard ──────────────────────────────────────────────────────────────
  if (role !== 'super_admin') {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        ไม่มีสิทธิ์เข้าถึงหน้านี้
      </div>
    );
  }

  // ── Slug check ────────────────────────────────────────────────────────────────
  const checkSlug = async (slug: string) => {
    if (!slug || slug.length < 3) { setSlugAvail(null); return; }
    setSlugChecking(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/onboarding?checkSlug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json() as { available?: boolean };
      setSlugAvail(Boolean(d.available));
    } catch { setSlugAvail(null); }
    finally   { setSlugChecking(false); }
  };

  const handleNameChange = (name: string) => {
    const newSlug = toSlug(name);
    setForm(f => ({
      ...f,
      name,
      slug: newSlug,
      specificModules: f.specificModules.map(sm => ({
        ...sm,
        moduleSlug: sm.moduleSlug === defaultModuleSlug(sm.key, f.slug)
          ? defaultModuleSlug(sm.key, newSlug)
          : sm.moduleSlug,
      })),
    }));
    setSlugAvail(null);
    void checkSlug(newSlug);
  };

  const handleSlugChange = (slug: string) => {
    setForm(f => ({
      ...f,
      slug,
      specificModules: f.specificModules.map(sm => ({
        ...sm,
        moduleSlug: sm.moduleSlug === defaultModuleSlug(sm.key, f.slug)
          ? defaultModuleSlug(sm.key, slug)
          : sm.moduleSlug,
      })),
    }));
    setSlugAvail(null);
    void checkSlug(slug);
  };

  // ── Module toggles ────────────────────────────────────────────────────────────

  const toggleSharedModule = (key: string) =>
    setForm(f => ({
      ...f,
      moduleKeys: f.moduleKeys.includes(key)
        ? f.moduleKeys.filter(k => k !== key)
        : [...f.moduleKeys, key],
    }));

  const toggleSpecificModule = (key: string) => {
    setForm(f => {
      const exists = f.specificModules.some(s => s.key === key);
      return {
        ...f,
        specificModules: exists
          ? f.specificModules.filter(s => s.key !== key)
          : [...f.specificModules, { key, moduleSlug: defaultModuleSlug(key, f.slug) }],
      };
    });
  };

  const updateModuleSlug = (key: string, moduleSlug: string) =>
    setForm(f => ({
      ...f,
      specificModules: f.specificModules.map(s => s.key === key ? { ...s, moduleSlug } : s),
    }));

  // ── Navigation ────────────────────────────────────────────────────────────────

  const nextStep = () => {
    setStep(s => {
      const next = s + 1;
      // Skip step 3 if no specific modules
      if (next === 3 && !hasSpecific) return 4;
      return next as Step;
    });
  };

  const prevStep = () => {
    setStep(s => {
      const prev = s - 1;
      if (prev === 3 && !hasSpecific) return 2;
      return prev as Step;
    });
  };

  // ── Submit ────────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/onboarding', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const d = await res.json() as {
        ok?: boolean; error?: string;
        org?: { id: string; name: string; slug: string };
        ownerInvited?: boolean;
        modulesEnabled?: string[];
        seededSummary?: Record<string, Record<string, number>>;
      };
      if (!res.ok) throw new Error(d.error ?? 'สร้างองค์กรไม่สำเร็จ');
      setResult({
        org:            d.org!,
        ownerInvited:   d.ownerInvited ?? false,
        modulesEnabled: d.modulesEnabled ?? [],
        seededSummary:  d.seededSummary ?? {},
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step validation ───────────────────────────────────────────────────────────
  const step1Valid = form.name.trim().length >= 2 && form.slug.length >= 3 && slugAvail === true;
  const step3Valid = form.specificModules.every(s => s.moduleSlug.length >= 2);
  const step4Valid = form.ownerEmail.includes('@');

  // ── Success screen ────────────────────────────────────────────────────────────
  if (result) {
    const seededLabels: Record<string, string> = {
      finance_categories:    'หมวดบัญชี',
      petty_cash_categories: 'หมวดเงินสดย่อย',
      petty_cash_funds:      'กองทุน',
      accounts:              'บัญชีเงิน',
      stock_units:           'หน่วยนับ',
      stock_categories:      'หมวดสินค้า',
    };

    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-emerald-100 p-4">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
        </div>
        <h2 className="mt-4 text-xl font-semibold text-gray-900">สร้างองค์กรสำเร็จ!</h2>
        <p className="mt-2 text-sm text-gray-500">
          <span className="font-medium text-gray-700">{result.org.name}</span>
          {' '}พร้อมใช้งานแล้วที่{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">/{result.org.slug}</code>
        </p>

        <div className="mt-6 rounded-xl border bg-gray-50 p-4 text-left text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500">Modules เปิดแล้ว</span>
            <span className="font-medium">{result.modulesEnabled.length} module</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">เจ้าของ</span>
            <span className={cn('font-medium', result.ownerInvited ? 'text-blue-600' : 'text-gray-700')}>
              {result.ownerInvited ? '✉️ ส่ง invite แล้ว' : '✅ เพิ่มเป็น member แล้ว'}
            </span>
          </div>
          {Object.entries(result.seededSummary).map(([modKey, counts]) => (
            <div key={modKey} className="pt-2 border-t">
              <p className="text-xs font-semibold text-gray-600 mb-1">
                {registryMods.find(m => m.key === modKey)?.label ?? MODULE_LABELS[modKey] ?? modKey} — ข้อมูลเริ่มต้น
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => (
                  <span key={k} className="text-xs text-gray-500">
                    {seededLabels[k] ?? k}: <span className="font-medium text-gray-700">{v}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => router.push('/admin/modules')}>
            ตั้งค่า Module
          </Button>
          <Button onClick={() => {
            setResult(null);
            setStep(1);
            setForm({ name: '', slug: '', moduleKeys: [], specificModules: [], ownerEmail: '' });
          }}>
            สร้างองค์กรใหม่
          </Button>
        </div>
      </div>
    );
  }

  // ── Wizard ────────────────────────────────────────────────────────────────────
  return (
    <AdminPage
      width="narrow"
      title="Tenant Onboarding"
      icon={<UserPlus className="h-6 w-6" />}
      description="สร้างองค์กรใหม่พร้อม module และเจ้าของ"
    >
      <StepBar current={step} hasSpecific={hasSpecific} />

      <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">

        {/* ── Step 1: Org Info ── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-semibold text-gray-800">ข้อมูลองค์กร</h2>
              <p className="mt-0.5 text-sm text-gray-500">ชื่อและ URL slug สำหรับองค์กรนี้</p>
            </div>

            <div>
              <Label htmlFor="org-name">ชื่อบริษัท / องค์กร *</Label>
              <Input
                id="org-name"
                placeholder="เช่น บริษัท ตัวอย่าง จำกัด"
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="org-slug">URL Slug *</Label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-gray-400">perpos.io/</span>
                <Input
                  id="org-slug"
                  placeholder="my-company"
                  value={form.slug}
                  onChange={e => handleSlugChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="flex-1"
                />
                {slugChecking && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                {!slugChecking && slugAvail === true  && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {!slugChecking && slugAvail === false && <span className="text-xs text-red-500">ถูกใช้แล้ว</span>}
              </div>
              <p className="mt-1 text-xs text-gray-400">ตัวพิมพ์เล็ก a-z, 0-9 และ - เท่านั้น ความยาว 3-50 ตัวอักษร</p>
            </div>
          </div>
        )}

        {/* ── Step 2: Module Selection ── */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-semibold text-gray-800">เลือก Modules</h2>
              <p className="mt-0.5 text-sm text-gray-500">เลือก shared modules และ specific modules ที่ต้องการเปิดให้องค์กรนี้</p>
            </div>

            {registryLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                {/* Shared modules */}
                {sharedMods.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Shared Modules</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {sharedMods.map(mod => {
                        const selected  = form.moduleKeys.includes(mod.key);
                        const menuCount = MODULE_MENUS[mod.key]?.length ?? 0;
                        return (
                          <button
                            key={mod.key} type="button"
                            onClick={() => toggleSharedModule(mod.key)}
                            className={cn(
                              'rounded-xl border-2 p-4 text-left transition-all',
                              selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300',
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className={cn('font-medium', selected ? 'text-blue-700' : 'text-gray-800')}>
                                {mod.label}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {!mod.is_builtin && (
                                  <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-600">Custom</span>
                                )}
                                {selected && <CheckCircle2 className="h-4 w-4 text-blue-500" />}
                              </div>
                            </div>
                            <div className="mt-1 text-xs text-gray-400">
                              {menuCount > 0 ? `${menuCount} เมนู` : mod.href_slug}
                              {mod.description && <span className="ml-2">{mod.description}</span>}
                            </div>
                            {menuCount > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {(MODULE_MENUS[mod.key] ?? []).slice(0, 4).map(m => (
                                  <span key={m.key} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                                    {m.label}
                                  </span>
                                ))}
                                {menuCount > 4 && (
                                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400">+{menuCount - 4}</span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Specific modules */}
                {specificMods.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                      Specific Modules <span className="normal-case text-gray-400">(เฉพาะองค์กรที่ได้รับสิทธิ์)</span>
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {specificMods.map(mod => {
                        const selected  = form.specificModules.some(s => s.key === mod.key);
                        const menuCount = MODULE_MENUS[mod.key]?.length ?? 0;
                        return (
                          <button
                            key={mod.key} type="button"
                            onClick={() => toggleSpecificModule(mod.key)}
                            className={cn(
                              'rounded-xl border-2 p-4 text-left transition-all',
                              selected ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300',
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className={cn('font-medium', selected ? 'text-amber-700' : 'text-gray-800')}>
                                {mod.label}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {mod.is_builtin
                                  ? <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 flex items-center gap-0.5"><Lock className="h-2.5 w-2.5" />Builtin</span>
                                  : <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-600">Custom</span>}
                                {selected
                                  ? <CheckCircle2 className="h-4 w-4 text-amber-500" />
                                  : <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Specific</span>}
                              </div>
                            </div>
                            <div className="mt-1 text-xs text-gray-400">
                              {menuCount > 0 ? `${menuCount} เมนู` : `/${mod.href_slug}/...`} · ต้องตั้งค่า slug
                            </div>
                            {menuCount > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {(MODULE_MENUS[mod.key] ?? []).slice(0, 4).map(m => (
                                  <span key={m.key} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                                    {m.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {form.moduleKeys.length === 0 && form.specificModules.length === 0 && (
                  <p className="text-center text-xs text-gray-400">
                    ยังไม่ได้เลือก module — สามารถเพิ่มภายหลังได้
                  </p>
                )}
                {form.specificModules.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    เลือก specific module แล้ว — ขั้นตอนถัดไปจะให้กำหนด URL slug ของแต่ละ module
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Step 3: Specific Module Config ── */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-semibold text-gray-800">ตั้งค่า URL Slug ของ Specific Modules</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                แต่ละ specific module มี slug เฉพาะตัวสำหรับระบุ instance นี้
              </p>
            </div>

            {form.specificModules.map(sm => {
              const regMod    = registryMods.find(m => m.key === sm.key);
              const menuCount = MODULE_MENUS[sm.key]?.length ?? 0;
              const label     = regMod?.label ?? MODULE_LABELS[sm.key] ?? sm.key;
              return (
                <div key={sm.key} className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-amber-800">{label}</p>
                      <p className="text-xs text-amber-600">
                        {menuCount > 0 ? `${menuCount} เมนู` : `default slug: ${regMod?.href_slug ?? sm.key}`}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Specific
                    </span>
                  </div>

                  <div>
                    <Label htmlFor={`slug-${sm.key}`}>URL Slug ของ Module *</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-sm text-gray-400">perpos.io/{form.slug}/</span>
                      <Input
                        id={`slug-${sm.key}`}
                        placeholder={regMod?.href_slug ?? sm.key}
                        value={sm.moduleSlug}
                        onChange={e => updateModuleSlug(sm.key, e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        className="flex-1 max-w-xs"
                      />
                      <span className="text-sm text-gray-400">/...</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      URL เต็ม:{' '}
                      <code className="rounded bg-white px-1 py-0.5 text-xs border">
                        perpos.io/{form.slug}/{sm.moduleSlug || '(กรุณาใส่ slug)'}
                      </code>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Step 4: Owner Account ── */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-semibold text-gray-800">บัญชีเจ้าของ (Owner)</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                ถ้ายังไม่มี account จะส่ง invite email ให้อัตโนมัติ
              </p>
            </div>

            <div>
              <Label htmlFor="owner-email">อีเมลเจ้าของ *</Label>
              <Input
                id="owner-email"
                type="email"
                placeholder="owner@company.com"
                value={form.ownerEmail}
                onChange={e => setForm(f => ({ ...f, ownerEmail: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
        )}

        {/* ── Step 5: Review ── */}
        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-semibold text-gray-800">ยืนยันข้อมูล</h2>
              <p className="mt-0.5 text-sm text-gray-500">ตรวจสอบก่อนกด สร้างองค์กร</p>
            </div>

            <div className="divide-y rounded-xl border bg-gray-50">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-500">ชื่อองค์กร</span>
                <span className="font-medium text-gray-800">{form.name}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-500">URL Slug</span>
                <code className="rounded bg-white px-2 py-0.5 text-sm font-mono text-gray-700 shadow-sm">
                  /{form.slug}
                </code>
              </div>

              {/* Shared modules */}
              {form.moduleKeys.length > 0 && (
                <div className="px-4 py-3">
                  <span className="text-sm text-gray-500">Shared Modules</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {form.moduleKeys.map(k => (
                      <span key={k} className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        {MODULE_LABELS[k] ?? k}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Specific modules */}
              {form.specificModules.length > 0 && (
                <div className="px-4 py-3">
                  <span className="text-sm text-gray-500">Specific Modules</span>
                  <div className="mt-2 space-y-1.5">
                    {form.specificModules.map(sm => (
                      <div key={sm.key} className="flex items-center justify-between">
                        <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          {MODULE_LABELS[sm.key] ?? sm.key}
                        </span>
                        <code className="text-xs text-gray-500">
                          /{form.slug}/{sm.moduleSlug}/...
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {form.moduleKeys.length === 0 && form.specificModules.length === 0 && (
                <div className="px-4 py-3">
                  <span className="text-sm text-gray-500">Modules</span>
                  <span className="ml-4 text-xs text-gray-400">ไม่มี (เพิ่มภายหลัง)</span>
                </div>
              )}

              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-500">Owner</span>
                <span className="font-medium text-gray-800">{form.ownerEmail}</span>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="mt-5 flex justify-between">
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={step === 1}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" /> ย้อนกลับ
        </Button>

        {step < 5 ? (
          <Button
            onClick={nextStep}
            disabled={
              (step === 1 && !step1Valid) ||
              (step === 3 && !step3Valid) ||
              (step === 4 && !step4Valid)
            }
            className="gap-1"
          >
            ถัดไป <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="gap-1"
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> กำลังสร้าง…</>
              : <><Sparkles className="h-4 w-4" /> สร้างองค์กร</>
            }
          </Button>
        )}
      </div>
    </AdminPage>
  );
}
