'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/shared/auth-provider';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { Button }       from '@/components/ui/button';
import { Input }        from '@/components/ui/input';
import { Label }        from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { AdminPage } from '../_components/admin-page';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Puzzle, Plus, Pencil, Trash2, Loader2, CheckCircle2,
  ToggleLeft, ToggleRight, ShieldAlert,
  Building2, Globe, Menu, ChevronDown, ChevronRight,
  User, Link2, Link2Off, Users,
} from 'lucide-react';
import cn from '@core/utils/class-names';
import { MODULE_MENUS } from '@/lib/modules';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrgRef { id: string; name: string; slug: string }

interface ModuleRec {
  id:            string;
  key:           string;
  label:         string;
  href_slug:     string;
  description:   string | null;
  is_specific:   boolean;
  is_personal:   boolean;
  is_builtin:    boolean;
  is_active:     boolean;
  sort_order:    number;
  org_id:        string | null;
  menu_labels:   Record<string, string>;
  organizations: OrgRef | null;
  created_at:    string;
}

interface Org { id: string; name: string; slug: string }

interface UserGrant {
  id:            string;
  email:         string;
  role:          string;
  is_active:     boolean;
  line_connected: boolean;
  grant:         { is_enabled: boolean; created_at: string } | null;
}

type ModuleType = 'shared' | 'tailor-made' | 'personal';

const EMPTY_FORM = {
  moduleType:  'tailor-made' as ModuleType,
  key:         '',
  label:       '',
  href_slug:   '',
  description: '',
  org_id:      '',
  menuLabels:  {} as Record<string, string>,
};
type FormState = typeof EMPTY_FORM;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toKey(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9\s_-]/g, '').trim().replace(/\s+/g, '_').slice(0, 30);
}
function toSlug(key: string) {
  return key.replace(/_/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, count, note }: {
  icon: React.ReactNode; title: string; count: number; note?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500">{count}</span>
      </div>
      {note && <p className="text-xs text-slate-400">{note}</p>}
    </div>
  );
}

// ─── ModuleRow ─────────────────────────────────────────────────────────────────

function ModuleRow({ mod, onEdit, onDelete, onToggle, showOrg }: {
  mod:      ModuleRec;
  onEdit:   () => void;
  onDelete?: () => void;
  onToggle: () => void;
  showOrg?: boolean;
}) {
  return (
    <div className={cn(
      'flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50',
      !mod.is_active && 'opacity-50',
    )}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', mod.is_active ? 'bg-emerald-400' : 'bg-slate-300')} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-800">{mod.label}</span>
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-500">{mod.key}</code>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
          <span><code className="text-slate-500">/{'{orgSlug}'}/{mod.href_slug}/...</code></span>
          {mod.description && <span className="truncate max-w-xs">{mod.description}</span>}
          {showOrg && mod.organizations && (
            <span className="flex items-center gap-1 font-medium text-amber-600">
              <Building2 className="h-3 w-3" />
              {mod.organizations.name}
              <code className="text-amber-500">({mod.organizations.slug})</code>
            </span>
          )}
          {showOrg && !mod.organizations && !mod.is_builtin && (
            <span className="text-rose-400">ยังไม่ได้ผูก org</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={onToggle}
          title={mod.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 transition-colors">
          {mod.is_active
            ? <ToggleRight className="h-5 w-5 text-emerald-500" />
            : <ToggleLeft  className="h-5 w-5" />}
        </button>
        <button type="button" onClick={onEdit} title="แก้ไข"
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 transition-colors">
          <Pencil className="h-4 w-4" />
        </button>
        {onDelete && !mod.is_builtin && (
          <button type="button" onClick={onDelete} title="ลบ"
            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ModuleRegistryPage() {
  const { role } = useAuth();
  const supabase  = useMemo(() => createSupabaseBrowserClient(), []);

  const getHeaders = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    };
  }, [supabase]);

  const [modules,   setModules]   = useState<ModuleRec[]>([]);
  const [orgs,      setOrgs]      = useState<Org[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [dialog,    setDialog]    = useState<'create' | 'edit' | 'delete' | null>(null);
  const [selected,  setSelected]  = useState<ModuleRec | null>(null);
  const [form,      setForm]      = useState<FormState>(EMPTY_FORM);
  const [saving,        setSaving]        = useState(false);
  const [keyEdited,     setKeyEdited]     = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [grantsUsers,   setGrantsUsers]   = useState<UserGrant[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantSearch,   setGrantSearch]   = useState('');
  const [createdCommand, setCreatedCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (role !== 'super_admin') {
    return <div className="flex h-64 items-center justify-center text-gray-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    void (async () => {
      const h = await getHeaders();
      const [modRes, orgRes] = await Promise.all([
        fetch('/api/admin/module-registry', { headers: h }),
        fetch('/api/admin/modules', { headers: h }),
      ]);
      const modData = await modRes.json() as { modules?: ModuleRec[] };
      const orgData = await orgRes.json() as { orgs?: Org[] };
      setModules(modData.modules ?? []);
      setOrgs(orgData.orgs ?? []);
      setLoading(false);
    })();
  }, [getHeaders]);

  function showToast(ok: boolean, msg: string) {
    if (ok) toast.success(msg);
    else toast.error(msg);
  }

  // ── Grouped data ──────────────────────────────────────────────────────────────
  const sharedMods   = modules.filter(m => !m.is_specific && !m.is_personal);
  const tailoredMods = modules.filter(m =>  m.is_specific && !m.is_personal);
  const personalMods = modules.filter(m =>  m.is_personal);

  // ── Dialog helpers ────────────────────────────────────────────────────────────
  function openCreate() {
    setForm(EMPTY_FORM);
    setKeyEdited(false);
    setSelected(null);
    setDialog('create');
  }

  function openEdit(mod: ModuleRec) {
    setSelected(mod);
    setForm({
      moduleType:  mod.is_personal ? 'personal' : mod.is_specific ? 'tailor-made' : 'shared',
      key:         mod.key,
      label:       mod.label,
      href_slug:   mod.href_slug,
      description: mod.description ?? '',
      org_id:      mod.org_id ?? '',
      menuLabels:  mod.menu_labels ?? {},
    });
    setKeyEdited(true);
    setGrantsUsers([]);
    setGrantSearch('');
    if (mod.is_personal) void loadGrants(mod.key);
    setDialog('edit');
  }

  async function loadGrants(moduleKey: string) {
    setGrantsLoading(true);
    const h = await getHeaders();
    const res = await fetch(`/api/admin/module-registry/grants?module_key=${moduleKey}`, { headers: h });
    const data = await res.json() as { ok?: boolean; users?: UserGrant[] };
    setGrantsUsers(data.users ?? []);
    setGrantsLoading(false);
  }

  async function toggleGrant(moduleKey: string, userId: string, currentEnabled: boolean | null) {
    const h = await getHeaders();
    let res: Response;
    let okMsg: string;
    if (currentEnabled === null) {
      // Grant doesn't exist yet — create enabled
      res = await fetch('/api/admin/module-registry/grants', {
        method: 'POST', headers: h,
        body: JSON.stringify({ module_key: moduleKey, user_id: userId, is_enabled: true }),
      });
      okMsg = 'เปิดสิทธิ์ให้ผู้ใช้แล้ว';
    } else if (currentEnabled) {
      // Disable
      res = await fetch('/api/admin/module-registry/grants', {
        method: 'POST', headers: h,
        body: JSON.stringify({ module_key: moduleKey, user_id: userId, is_enabled: false }),
      });
      okMsg = 'ปิดสิทธิ์ผู้ใช้แล้ว';
    } else {
      // Remove grant entirely
      res = await fetch('/api/admin/module-registry/grants', {
        method: 'DELETE', headers: h,
        body: JSON.stringify({ module_key: moduleKey, user_id: userId }),
      });
      okMsg = 'นำสิทธิ์ผู้ใช้ออกแล้ว';
    }
    showToast(res.ok, res.ok ? okMsg : 'ปรับสิทธิ์ไม่สำเร็จ');
    void loadGrants(moduleKey);
  }

  function openDelete(mod: ModuleRec) {
    setSelected(mod);
    setDialog('delete');
  }

  function handleLabelChange(label: string) {
    const next = { ...form, label };
    if (!keyEdited) {
      const k = toKey(label);
      next.key      = k;
      next.href_slug = toSlug(k);
    }
    setForm(next);
  }

  function handleKeyChange(raw: string) {
    const k = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setForm(f => ({ ...f, key: k, href_slug: toSlug(k) }));
    setKeyEdited(true);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────────
  async function handleCreate() {
    setSaving(true);
    const h = await getHeaders();
    const res = await fetch('/api/admin/module-registry', {
      method: 'POST', headers: h,
      body: JSON.stringify({
        key:         form.key,
        label:       form.label,
        href_slug:   form.href_slug,
        description: form.description || null,
        is_personal: form.moduleType === 'personal',
        is_specific: form.moduleType === 'tailor-made',
        org_id:      form.moduleType === 'tailor-made' ? (form.org_id || null) : null,
      }),
    });
    const data = await res.json() as { ok?: boolean; error?: string; module?: ModuleRec };
    setSaving(false);
    if (res.ok && data.ok && data.module) {
      setModules(prev => [...prev, data.module!].sort((a, b) => a.sort_order - b.sort_order));
      setDialog(null);
      const isPersonal = form.moduleType === 'personal';
      const cmd = `pnpm gen-module ${form.key} "${form.label}" ${form.href_slug} ${!isPersonal}`;
      setCreatedCommand(cmd);
      showToast(true, `สร้าง module "${data.module.label}" สำเร็จ`);
    } else {
      showToast(false, data.error ?? 'เกิดข้อผิดพลาด');
    }
  }

  async function handleUpdate() {
    if (!selected) return;
    setSaving(true);
    const h = await getHeaders();
    const patch: Record<string, unknown> = {
      key:          selected.key,
      label:        form.label,
      description:  form.description || null,
      menu_labels:  form.menuLabels,
    };
    // Allow binding org for specific modules not yet bound (builtin or custom)
    if (selected.is_specific && !selected.org_id) {
      patch.org_id = form.org_id || null;
    }
    const res = await fetch('/api/admin/module-registry', {
      method: 'PATCH', headers: h, body: JSON.stringify(patch),
    });
    const data = await res.json() as { ok?: boolean; error?: string; module?: ModuleRec };
    setSaving(false);
    if (res.ok && data.ok && data.module) {
      setModules(prev => prev.map(m => m.key === selected.key ? data.module! : m));
      setDialog(null);
      showToast(true, `อัปเดต module "${data.module.label}" สำเร็จ`);
    } else {
      showToast(false, data.error ?? 'เกิดข้อผิดพลาด');
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setSaving(true);
    const h = await getHeaders();
    const res = await fetch('/api/admin/module-registry', {
      method: 'DELETE', headers: h, body: JSON.stringify({ key: selected.key }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    setSaving(false);
    if (res.ok && data.ok) {
      setModules(prev => prev.filter(m => m.key !== selected.key));
      setDialog(null);
      showToast(true, `ลบ module "${selected.label}" สำเร็จ`);
    } else {
      showToast(false, data.error ?? 'เกิดข้อผิดพลาด');
    }
  }

  async function toggleActive(mod: ModuleRec) {
    const h = await getHeaders();
    const res = await fetch('/api/admin/module-registry', {
      method: 'PATCH', headers: h,
      body: JSON.stringify({ key: mod.key, is_active: !mod.is_active }),
    });
    const data = await res.json() as { ok?: boolean; module?: ModuleRec };
    if (res.ok && data.ok && data.module) {
      setModules(prev => prev.map(m => m.key === mod.key ? data.module! : m));
    }
  }

  const isTailored = form.moduleType === 'tailor-made';
  const isPersonal = form.moduleType === 'personal';
  const canSave    = form.label.trim().length >= 2
    && form.key.length >= 2
    && form.href_slug.length >= 1
    && (dialog === 'edit' || !isTailored || !!form.org_id);   // tailor-made create requires org

  const orgOptions = [
    { value: '', label: '— เลือก Org —' },
    ...orgs.map(o => ({ value: o.id, label: `${o.name}  (${o.slug})` })),
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <AdminPage
      title="Module Registry"
      icon={<Puzzle className="h-6 w-6" />}
      description="จัดการ module ทั้งหมดในระบบ"
      actions={
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> สร้าง Module ใหม่
        </Button>
      }
    >

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : (
        <div className="space-y-6">

          {/* ── Shared Modules ── */}
          <div className="rounded-2xl border bg-white overflow-hidden">
            <SectionHeader
              icon={<Globe className="h-4 w-4 text-slate-400" />}
              title="Shared Modules"
              count={sharedMods.length}
              note="ใช้ได้กับทุก org"
            />
            <div className="divide-y">
              {sharedMods.map(mod => (
                <ModuleRow key={mod.key} mod={mod}
                  onEdit={() => openEdit(mod)}
                  onToggle={() => void toggleActive(mod)}
                />
              ))}
            </div>
          </div>

          {/* ── Tailor-made Modules ── */}
          <div className="rounded-2xl border bg-white overflow-hidden">
            <SectionHeader
              icon={<Building2 className="h-4 w-4 text-slate-400" />}
              title="Tailor-made Modules"
              count={tailoredMods.length}
              note="ผูกกับองค์กรเฉพาะ"
            />
            <div className="divide-y">
              {tailoredMods.map(mod => (
                <ModuleRow key={mod.key} mod={mod}
                  onEdit={() => openEdit(mod)}
                  onDelete={() => openDelete(mod)}
                  onToggle={() => void toggleActive(mod)}
                  showOrg
                />
              ))}
              {tailoredMods.length === 0 && (
                <div className="py-8 text-center text-sm text-slate-400">ยังไม่มี tailor-made module</div>
              )}
            </div>
          </div>

          {/* ── Personal Modules ── */}
          <div className="rounded-2xl border bg-white overflow-hidden">
            <SectionHeader
              icon={<User className="h-4 w-4 text-slate-400" />}
              title="Personal Modules"
              count={personalMods.length}
              note="ตัวช่วยส่วนตัว — ต้องเชื่อมต่อ LINE"
            />
            <div className="divide-y">
              {personalMods.map(mod => (
                <ModuleRow key={mod.key} mod={mod}
                  onEdit={() => openEdit(mod)}
                  onDelete={!mod.is_builtin ? () => openDelete(mod) : undefined}
                  onToggle={() => void toggleActive(mod)}
                />
              ))}
              {personalMods.length === 0 && (
                <div className="py-8 text-center text-sm text-slate-400">ยังไม่มี personal module</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialog === 'create' || dialog === 'edit'} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {dialog === 'create' ? 'สร้าง Module ใหม่' : `แก้ไข Module — ${selected?.label}`}
            </DialogTitle>
          </DialogHeader>

          <DialogBody>
          <div className="space-y-4">

            {/* Module type picker (create only) */}
            {dialog === 'create' && (
              <div className="space-y-1.5">
                <Label>ประเภท Module *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { type: 'shared'      as ModuleType, icon: <Globe     className="h-5 w-5" />, label: 'Shared',      desc: 'ทุก org',          color: 'blue'   },
                    { type: 'tailor-made' as ModuleType, icon: <Building2 className="h-5 w-5" />, label: 'Tailor-made', desc: 'org เดียว',        color: 'amber'  },
                    { type: 'personal'    as ModuleType, icon: <User      className="h-5 w-5" />, label: 'Personal',    desc: 'ผู้ใช้ + LINE',    color: 'violet' },
                  ]).map(opt => {
                    const active = form.moduleType === opt.type;
                    const colorMap = {
                      blue:   { border: 'border-blue-500',   bg: 'bg-blue-50',   icon: 'bg-blue-500',   text: 'text-blue-700'   },
                      amber:  { border: 'border-amber-500',  bg: 'bg-amber-50',  icon: 'bg-amber-500',  text: 'text-amber-700'  },
                      violet: { border: 'border-violet-500', bg: 'bg-violet-50', icon: 'bg-violet-500', text: 'text-violet-700' },
                    };
                    const c = colorMap[opt.color as keyof typeof colorMap];
                    return (
                      <button
                        key={opt.type} type="button"
                        onClick={() => setForm(f => ({ ...f, moduleType: opt.type, org_id: '' }))}
                        className={cn(
                          'flex flex-col items-start gap-1.5 rounded-xl border-2 p-3 text-left transition-all',
                          active ? `${c.border} ${c.bg}` : 'border-slate-200 hover:border-slate-300',
                        )}
                      >
                        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', active ? `${c.icon} text-white` : 'bg-slate-100 text-slate-400')}>
                          {opt.icon}
                        </span>
                        <span className={cn('text-sm font-semibold', active ? c.text : 'text-slate-700')}>{opt.label}</span>
                        <span className="text-xs text-slate-400">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Label */}
            <div className="space-y-1.5">
              <Label>ชื่อ Module *</Label>
              <Input
                placeholder="เช่น Property Management"
                value={form.label}
                onChange={e => handleLabelChange(e.target.value)}
              />
            </div>

            {/* Key */}
            <div className="space-y-1.5">
              <Label>Module Key * <span className="text-xs text-slate-400">(unique ID)</span></Label>
              <Input
                placeholder="เช่น property_mgmt"
                value={form.key}
                onChange={e => handleKeyChange(e.target.value)}
                disabled={dialog === 'edit'}
                className="font-mono text-sm"
              />
              {dialog === 'edit' && (
                <p className="text-xs text-slate-400">ไม่สามารถเปลี่ยน key หลังสร้างแล้ว</p>
              )}
            </div>

            {/* URL slug */}
            <div className="space-y-1.5">
              <Label>URL Slug * <span className="text-xs text-slate-400">(path segment)</span></Label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-slate-400">/{'{orgSlug}'}/</span>
                <Input
                  placeholder="property-mgmt"
                  value={form.href_slug}
                  onChange={e => setForm(f => ({ ...f, href_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                  disabled={dialog === 'edit'}
                  className="font-mono text-sm"
                />
                <span className="shrink-0 text-sm text-slate-400">/...</span>
              </div>
              {dialog === 'edit' && (
                <p className="text-xs text-slate-400">ไม่สามารถเปลี่ยน URL slug หลังสร้างแล้ว เพราะจะทำให้ routing พัง</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>คำอธิบาย</Label>
              <Input
                placeholder="อธิบายหน้าที่ของ module นี้"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Menu labels — edit only, show when module has known menus */}
            {dialog === 'edit' && selected && (MODULE_MENUS[selected.key]?.length ?? 0) > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                {/* Section header */}
                <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
                  <Menu className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">ชื่อ Menu</span>
                  <span className="text-xs text-slate-400">(เว้นว่างเพื่อใช้ชื่อเริ่มต้น)</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {MODULE_MENUS[selected.key].map(menu => {
                    const hasItems   = (menu.items?.length ?? 0) > 0;
                    const isExpanded = expandedMenus.has(menu.key);
                    const subLabelKey = (itemKey: string) => `${menu.key}.${itemKey}`;

                    return (
                      <div key={menu.key}>
                        {/* Top-level menu row */}
                        <div className="flex items-center gap-2 px-4 py-2">
                          {/* Expand/collapse toggle */}
                          {hasItems ? (
                            <button
                              type="button"
                              onClick={() => setExpandedMenus(prev => {
                                const next = new Set(prev);
                                next.has(menu.key) ? next.delete(menu.key) : next.add(menu.key);
                                return next;
                              })}
                              className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          ) : (
                            <span className="h-3.5 w-3.5 shrink-0" />
                          )}

                          {/* Default label */}
                          <span className="w-36 shrink-0 truncate text-xs text-slate-500">
                            {menu.label}
                            {hasItems && (
                              <span className="ml-1 text-slate-300">({menu.items!.length})</span>
                            )}
                          </span>

                          {/* Custom label input */}
                          <Input
                            placeholder={menu.label}
                            value={form.menuLabels[menu.key] ?? ''}
                            onChange={e => setForm(f => ({
                              ...f,
                              menuLabels: { ...f.menuLabels, [menu.key]: e.target.value },
                            }))}
                            className="h-7 flex-1 text-sm"
                          />
                        </div>

                        {/* Sub-items (dropdown items) */}
                        {hasItems && isExpanded && (
                          <div className="border-t border-slate-100 bg-white divide-y divide-slate-50">
                            {menu.items!.map(item => (
                              <div key={item.key} className="flex items-center gap-2 py-1.5 pl-10 pr-4">
                                <span className="w-36 shrink-0 truncate text-xs text-slate-400">
                                  {item.label}
                                </span>
                                <Input
                                  placeholder={item.label}
                                  value={form.menuLabels[subLabelKey(item.key)] ?? ''}
                                  onChange={e => setForm(f => ({
                                    ...f,
                                    menuLabels: { ...f.menuLabels, [subLabelKey(item.key)]: e.target.value },
                                  }))}
                                  className="h-7 flex-1 text-sm"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Personal grants — edit only */}
            {dialog === 'edit' && selected?.is_personal && (
              <div className="rounded-xl border border-violet-200 bg-violet-50 overflow-hidden">
                <div className="flex items-center gap-2 border-b border-violet-200 bg-white px-4 py-2.5">
                  <Users className="h-4 w-4 text-violet-400" />
                  <span className="text-sm font-medium text-slate-700">ผู้ใช้ที่ได้รับสิทธิ์</span>
                  <span className="text-xs text-slate-400">— ต้องเชื่อมต่อ LINE ก่อนใช้งาน</span>
                </div>

                {/* Search */}
                <div className="px-3 py-2 bg-white border-b border-violet-100">
                  <Input
                    placeholder="ค้นหา email…"
                    value={grantSearch}
                    onChange={e => setGrantSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-violet-50 bg-white">
                  {grantsLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                    </div>
                  ) : grantsUsers
                      .filter(u => !grantSearch || u.email.toLowerCase().includes(grantSearch.toLowerCase()))
                      .map(u => {
                        const granted   = u.grant !== null;
                        const enabled   = u.grant?.is_enabled ?? false;
                        const canToggle = u.line_connected;
                        return (
                          <div key={u.id} className={cn('flex items-center gap-3 px-4 py-2.5', !u.is_active && 'opacity-50')}>
                            {/* Avatar */}
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 text-xs font-medium">
                              {u.email.charAt(0).toUpperCase()}
                            </span>

                            {/* Email */}
                            <span className="flex-1 truncate text-sm text-slate-700">{u.email}</span>

                            {/* LINE badge */}
                            {u.line_connected
                              ? <span className="flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 text-xs text-green-700">
                                  <Link2 className="h-3 w-3" /> LINE
                                </span>
                              : <span className="flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-0.5 text-xs text-slate-500">
                                  <Link2Off className="h-3 w-3" /> ยังไม่เชื่อม
                                </span>
                            }

                            {/* Toggle */}
                            <button
                              type="button"
                              disabled={!canToggle}
                              title={!canToggle ? 'ผู้ใช้ต้องเชื่อมต่อ LINE ก่อน' : granted && enabled ? 'ปิดสิทธิ์' : 'เปิดสิทธิ์'}
                              onClick={() => void toggleGrant(selected.key, u.id, granted ? enabled : null)}
                              className="shrink-0 disabled:opacity-30"
                            >
                              {granted && enabled
                                ? <ToggleRight className="h-6 w-6 text-violet-500" />
                                : <ToggleLeft  className="h-6 w-6 text-slate-300" />}
                            </button>
                          </div>
                        );
                      })
                  }
                  {!grantsLoading && grantsUsers.filter(u => !grantSearch || u.email.toLowerCase().includes(grantSearch.toLowerCase())).length === 0 && (
                    <div className="py-6 text-center text-sm text-slate-400">ไม่พบผู้ใช้</div>
                  )}
                </div>

                <div className="px-4 py-2 text-xs text-violet-600 bg-violet-50 border-t border-violet-100">
                  ผู้ใช้ที่เปิด + เชื่อมต่อ LINE แล้วจะเห็น module นี้ใน sidebar ของตัวเอง
                </div>
              </div>
            )}

            {/* Org selector — tailor-made only */}
            {(dialog === 'create' ? isTailored : selected?.is_specific) && (
              <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <Label>องค์กรที่ใช้ Module นี้{dialog === 'create' && ' *'}</Label>

                {/* Edit + already bound → read-only display */}
                {dialog === 'edit' && selected?.org_id ? (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2.5">
                    <Building2 className="h-4 w-4 shrink-0 text-amber-500" />
                    <span className="text-sm font-medium text-slate-700">
                      {selected.organizations?.name ?? selected.org_id}
                    </span>
                    {selected.organizations?.slug && (
                      <code className="text-xs text-slate-400">({selected.organizations.slug})</code>
                    )}
                    <span className="ml-auto text-xs text-slate-400">ผูกแล้ว — แก้ไขไม่ได้</span>
                  </div>
                ) : (
                  <CustomSelect
                    value={form.org_id}
                    onChange={v => setForm(f => ({ ...f, org_id: v }))}
                    options={orgOptions}
                  />
                )}
                <p className="text-xs text-amber-700">ผูกได้ 1 org เท่านั้น — module จะปรากฏเฉพาะ org นั้น</p>
              </div>
            )}
          </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>ยกเลิก</Button>
            <Button
              onClick={() => void (dialog === 'create' ? handleCreate() : handleUpdate())}
              disabled={saving || !canSave}
            >
              {saving
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังบันทึก…</>
                : dialog === 'create' ? 'สร้าง Module' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ── */}
      <Dialog open={dialog === 'delete'} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="h-5 w-5" /> ลบ Module
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
          <p className="text-sm text-slate-600">
            ยืนยันลบ <strong>{selected?.label}</strong>{' '}
            (<code className="font-mono text-xs">{selected?.key}</code>)?
          </p>
          {selected?.organizations && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              Module นี้ผูกกับ <strong>{selected.organizations.name}</strong>
            </div>
          )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>ยกเลิก</Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ลบ Module'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Success CLI Command Dialog ── */}
      <Dialog open={!!createdCommand} onOpenChange={o => { if (!o) { setCreatedCommand(null); setCopied(false); } }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" /> ลงทะเบียนสำเร็จ
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
          <div className="space-y-4 text-sm text-slate-600">
            <p>
              โมดูลได้ถูกบันทึกลงฐานข้อมูลเรียบร้อยแล้ว! เพื่อสร้างไฟล์โค้ดของโมดูลในโปรเจกต์ของคุณ กรุณารันคำสั่งนี้ใน **Terminal ของเครื่องโลคอล (Local Development)**:
            </p>
            <div className="relative rounded-lg bg-slate-900 px-4 py-3 text-xs font-mono text-slate-100 flex items-center justify-between gap-4">
              <span className="break-all select-all">{createdCommand}</span>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-slate-400 hover:text-white hover:bg-slate-800"
                onClick={() => {
                  if (createdCommand) {
                    navigator.clipboard.writeText(createdCommand);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
              >
                {copied ? 'คัดลอกแล้ว!' : 'คัดลอก'}
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              💡 สคริปต์นี้จะสร้างโฟลเดอร์สำหรับหน้าจอ, API, Helper และไฟล์ SQL Migration พื้นฐานให้โดยอัตโนมัติ
            </p>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => { setCreatedCommand(null); setCopied(false); }}>ปิดหน้าต่าง</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AdminPage>
  );
}
