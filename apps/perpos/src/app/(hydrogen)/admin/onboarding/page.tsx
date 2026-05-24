'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/shared/auth-provider';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button }       from '@/components/ui/button';
import { Input }        from '@/components/ui/input';
import { Label }        from '@/components/ui/label';
import { ALL_MODULES, MODULE_MENUS, MODULE_LABELS } from '@/lib/modules';
import {
  CheckCircle2, ChevronRight, ChevronLeft,
  Building2, LayoutGrid, UserPlus, Eye,
  Loader2, Sparkles,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WizardForm {
  name:        string;
  slug:        string;
  moduleKeys:  string[];
  ownerEmail:  string;
}

type Step = 1 | 2 | 3 | 4;

const STEPS: { step: Step; label: string; icon: React.ReactNode }[] = [
  { step: 1, label: 'ข้อมูลองค์กร',    icon: <Building2 className="h-4 w-4" /> },
  { step: 2, label: 'เลือก Module',     icon: <LayoutGrid className="h-4 w-4" /> },
  { step: 3, label: 'บัญชีเจ้าของ',    icon: <UserPlus className="h-4 w-4" /> },
  { step: 4, label: 'ยืนยัน',           icon: <Eye className="h-4 w-4" /> },
];

const SHARED_MODULES = ALL_MODULES.filter((m) => !m.specific);

// ─── Slug auto-generate ───────────────────────────────────────────────────────
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepBar({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => (
        <div key={s.step} className="flex items-center">
          <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors
            ${current === s.step ? 'bg-blue-600 text-white' :
              current > s.step  ? 'bg-emerald-100 text-emerald-700' :
                                  'bg-gray-100 text-gray-400'}`}>
            {current > s.step ? <CheckCircle2 className="h-4 w-4" /> : s.icon}
            <span className="hidden font-medium sm:inline">{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-px w-6 ${current > s.step ? 'bg-emerald-300' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { role } = useAuth();
  const supabase  = useMemo(() => createSupabaseBrowserClient(), []);
  const router    = useRouter();

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? '';
  }, [supabase]);

  const [step, setStep]     = useState<Step>(1);
  const [form, setForm]     = useState<WizardForm>({
    name: '', slug: '', moduleKeys: [], ownerEmail: '',
  });
  const [slugAvail,  setSlugAvail]  = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result,     setResult]     = useState<{
    org: { id: string; name: string; slug: string };
    ownerInvited: boolean;
    modulesEnabled: string[];
  } | null>(null);
  const [error, setError] = useState('');

  // ── Access guard ─────────────────────────────────────────────────────────────
  if (role !== 'super_admin') {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        ไม่มีสิทธิ์เข้าถึงหน้านี้
      </div>
    );
  }

  // ── Slug check ───────────────────────────────────────────────────────────────
  const checkSlug = async (slug: string) => {
    if (!slug || slug.length < 3) { setSlugAvail(null); return; }
    setSlugChecking(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/onboarding?checkSlug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setSlugAvail(Boolean(d.available));
    } catch { setSlugAvail(null); }
    finally   { setSlugChecking(false); }
  };

  const handleNameChange = (name: string) => {
    const slug = toSlug(name);
    setForm((f) => ({ ...f, name, slug }));
    setSlugAvail(null);
    void checkSlug(slug);
  };

  const handleSlugChange = (slug: string) => {
    setForm((f) => ({ ...f, slug }));
    setSlugAvail(null);
    void checkSlug(slug);
  };

  const toggleModule = (key: string) =>
    setForm((f) => ({
      ...f,
      moduleKeys: f.moduleKeys.includes(key)
        ? f.moduleKeys.filter((k) => k !== key)
        : [...f.moduleKeys, key],
    }));

  // ── Submit ───────────────────────────────────────────────────────────────────
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
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'สร้างองค์กรไม่สำเร็จ');
      setResult(d);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step validation ───────────────────────────────────────────────────────────
  const step1Valid = form.name.trim().length >= 2 && form.slug.length >= 3 && slugAvail === true;
  const step3Valid = form.ownerEmail.includes('@');

  // ── Success screen ────────────────────────────────────────────────────────────
  if (result) {
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

        <div className="mt-6 rounded-xl border bg-gray-50 p-4 text-left text-sm">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Modules เปิดแล้ว</span>
              <span className="font-medium">{result.modulesEnabled.length} module</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">เจ้าของ</span>
              <span className={`font-medium ${result.ownerInvited ? 'text-blue-600' : 'text-gray-700'}`}>
                {result.ownerInvited ? '✉️ ส่ง invite แล้ว' : '✅ เพิ่มเป็น member แล้ว'}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => router.push('/admin/modules')}>
            ตั้งค่า Module
          </Button>
          <Button onClick={() => { setResult(null); setStep(1); setForm({ name: '', slug: '', moduleKeys: [], ownerEmail: '' }); }}>
            สร้างองค์กรใหม่
          </Button>
        </div>
      </div>
    );
  }

  // ── Wizard ────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Tenant Onboarding</h1>
        <p className="mt-1 text-sm text-gray-500">สร้างองค์กรใหม่พร้อม module และเจ้าของ</p>
      </div>

      {/* Step bar */}
      <StepBar current={step} />

      {/* Card */}
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
                onChange={(e) => handleNameChange(e.target.value)}
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
                  onChange={(e) => handleSlugChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
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
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold text-gray-800">เลือก Shared Modules</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Specific modules (เช่น TMC) เปิดแยกต่างหากผ่านหน้า Module Provisioning
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {SHARED_MODULES.map((mod) => {
                const selected = form.moduleKeys.includes(mod.key);
                const menuCount = MODULE_MENUS[mod.key]?.length ?? 0;
                return (
                  <button
                    key={mod.key} type="button"
                    onClick={() => toggleModule(mod.key)}
                    className={`rounded-xl border-2 p-4 text-left transition-all
                      ${selected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${selected ? 'text-blue-700' : 'text-gray-800'}`}>
                        {MODULE_LABELS[mod.key]}
                      </span>
                      {selected && <CheckCircle2 className="h-4 w-4 text-blue-500" />}
                    </div>
                    <div className="mt-1 text-xs text-gray-400">{menuCount} เมนู</div>
                    {/* Mini menu preview */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(MODULE_MENUS[mod.key] ?? []).slice(0, 4).map((m) => (
                        <span key={m.key} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                          {m.label}
                        </span>
                      ))}
                      {menuCount > 4 && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400">
                          +{menuCount - 4}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {form.moduleKeys.length === 0 && (
              <p className="text-center text-xs text-gray-400">
                ยังไม่ได้เลือก module — สามารถเพิ่มภายหลังได้จาก Module Provisioning
              </p>
            )}
          </div>
        )}

        {/* ── Step 3: Owner Account ── */}
        {step === 3 && (
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
                onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
        )}

        {/* ── Step 4: Review ── */}
        {step === 4 && (
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
              <div className="px-4 py-3">
                <span className="text-sm text-gray-500">Modules</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {form.moduleKeys.length === 0 ? (
                    <span className="text-xs text-gray-400">ไม่มี (เพิ่มภายหลัง)</span>
                  ) : (
                    form.moduleKeys.map((k) => (
                      <span key={k} className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        {MODULE_LABELS[k] ?? k}
                      </span>
                    ))
                  )}
                </div>
              </div>
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
          onClick={() => setStep((s) => Math.max(1, s - 1) as Step)}
          disabled={step === 1}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" /> ย้อนกลับ
        </Button>

        {step < 4 ? (
          <Button
            onClick={() => setStep((s) => Math.min(4, s + 1) as Step)}
            disabled={
              (step === 1 && !step1Valid) ||
              (step === 3 && !step3Valid)
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
    </div>
  );
}
