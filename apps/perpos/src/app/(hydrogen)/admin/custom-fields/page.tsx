"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Title, Text } from "rizzui/typography";
import { Plus, Pencil, Trash2, GripVertical, ChevronDown } from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { backendUrl } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ── Types ────────────────────────────────────────────────────────────────────

type FieldType = "text" | "number" | "date" | "select" | "boolean";

type CustomField = {
  id: string;
  module_key: string;
  entity_type: string;
  field_key: string;
  label_th: string;
  label_en: string | null;
  field_type: FieldType;
  select_options: { value: string; label: string }[] | null;
  is_required: boolean;
  sort_order: number;
  created_at: string;
};

type OrgItem = { id: string; name: string };

type SelectOption = { value: string; label: string };

// ── Constants ────────────────────────────────────────────────────────────────

const FIELD_TYPE_OPTIONS: SelectOption[] = [
  { value: "text",    label: "ข้อความ (Text)" },
  { value: "number",  label: "ตัวเลข (Number)" },
  { value: "date",    label: "วันที่ (Date)" },
  { value: "select",  label: "ตัวเลือก (Select)" },
  { value: "boolean", label: "ใช่/ไม่ใช่ (Boolean)" },
];

const ENTITY_TYPE_OPTIONS: SelectOption[] = [
  { value: "finance_entry", label: "รายการเงิน (Finance Entry)" },
  { value: "customer",      label: "ลูกค้า (Customer)" },
  { value: "order",         label: "ออเดอร์ (Order)" },
  { value: "sales_quote",   label: "ใบเสนอราคา (Sales Quote)" },
  { value: "sales_invoice", label: "ใบแจ้งหนี้ (Sales Invoice)" },
];

const MODULE_OPTIONS: SelectOption[] = [
  { value: "tmc",        label: "TMC Management" },
  { value: "accounting", label: "Accounting" },
  { value: "payroll",    label: "Payroll" },
  { value: "assistant",  label: "Assistant" },
];

const FIELD_TYPE_LABELS: Record<string, string> = {
  text:    "ข้อความ",
  number:  "ตัวเลข",
  date:    "วันที่",
  select:  "ตัวเลือก",
  boolean: "ใช่/ไม่ใช่",
};

// ── Blank form ────────────────────────────────────────────────────────────────

const BLANK_FORM = {
  fieldKey:      "",
  labelTh:       "",
  labelEn:       "",
  fieldType:     "text" as FieldType,
  isRequired:    false,
  sortOrder:     0,
  selectOptions: "" as string, // JSON string for select type
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CustomFieldsPage() {
  const { role, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgs, setOrgs]               = useState<OrgItem[]>([]);
  const [orgId, setOrgId]             = useState("");
  const [moduleKey, setModuleKey]     = useState("");
  const [entityType, setEntityType]   = useState("");
  const [fields, setFields]           = useState<CustomField[]>([]);

  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [message, setMessage]         = useState<string | null>(null);

  // Modal state
  const [modalMode, setModalMode]     = useState<"add" | "edit" | null>(null);
  const [editId, setEditId]           = useState<string | null>(null);
  const [form, setForm]               = useState({ ...BLANK_FORM });
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  // Load orgs on mount
  useEffect(() => {
    authHeader()
      .then(async (h) => {
        const res = await fetch(backendUrl("/admin/custom-fields"), { headers: h });
        const json = await res.json().catch(() => null);
        if (json?.orgs) setOrgs(json.orgs as OrgItem[]);
      })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load fields when orgId/moduleKey/entityType change
  const loadFields = useCallback(async () => {
    if (!orgId) { setFields([]); return; }
    setLoading(true);
    setError(null);
    try {
      const h = await authHeader();
      const params = new URLSearchParams({ orgId });
      if (moduleKey)  params.set("moduleKey", moduleKey);
      if (entityType) params.set("entityType", entityType);
      const res = await fetch(backendUrl(`/admin/custom-fields?${params}`), { headers: h });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError(json?.error ?? "โหลดข้อมูลไม่สำเร็จ"); }
      else          setFields((json?.fields ?? []) as CustomField[]);
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [orgId, moduleKey, entityType, authHeader]);

  useEffect(() => { loadFields(); }, [loadFields]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openAdd = () => {
    setForm({ ...BLANK_FORM });
    setEditId(null);
    setFormError(null);
    setModalMode("add");
  };

  const openEdit = (f: CustomField) => {
    setForm({
      fieldKey:      f.field_key,
      labelTh:       f.label_th,
      labelEn:       f.label_en ?? "",
      fieldType:     f.field_type,
      isRequired:    f.is_required,
      sortOrder:     f.sort_order,
      selectOptions: f.select_options ? JSON.stringify(f.select_options, null, 2) : "",
    });
    setEditId(f.id);
    setFormError(null);
    setModalMode("edit");
  };

  const handleSave = async () => {
    setFormError(null);
    if (!form.labelTh.trim()) { setFormError("ต้องระบุชื่อภาษาไทย"); return; }
    if (modalMode === "add" && !form.fieldKey.trim()) { setFormError("ต้องระบุ field key"); return; }
    if (!moduleKey)  { setFormError("เลือก module ก่อน"); return; }
    if (!entityType) { setFormError("เลือก entity type ก่อน"); return; }

    // Parse select options if needed
    let selectOptions: unknown = null;
    if (form.fieldType === "select") {
      try {
        selectOptions = JSON.parse(form.selectOptions || "[]");
        if (!Array.isArray(selectOptions)) throw new Error();
      } catch {
        setFormError('selectOptions ต้องเป็น JSON array เช่น [{"value":"a","label":"A"}]');
        return;
      }
    }

    setSaving(true);
    try {
      const h = await authHeader();
      if (modalMode === "add") {
        const res = await fetch(backendUrl("/admin/custom-fields"), {
          method: "POST",
          headers: { ...h, "content-type": "application/json" },
          body: JSON.stringify({
            orgId,
            moduleKey,
            entityType,
            fieldKey:      form.fieldKey.trim(),
            labelTh:       form.labelTh.trim(),
            labelEn:       form.labelEn.trim() || null,
            fieldType:     form.fieldType,
            selectOptions,
            isRequired:    form.isRequired,
            sortOrder:     form.sortOrder,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) { setFormError(json?.error ?? "บันทึกไม่สำเร็จ"); return; }
        setMessage("เพิ่มฟิลด์แล้ว");
      } else {
        const res = await fetch(backendUrl("/admin/custom-fields"), {
          method: "PUT",
          headers: { ...h, "content-type": "application/json" },
          body: JSON.stringify({
            id:            editId,
            labelTh:       form.labelTh.trim(),
            labelEn:       form.labelEn.trim() || null,
            fieldType:     form.fieldType,
            selectOptions,
            isRequired:    form.isRequired,
            sortOrder:     form.sortOrder,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) { setFormError(json?.error ?? "บันทึกไม่สำเร็จ"); return; }
        setMessage("อัปเดตฟิลด์แล้ว");
      }
      setModalMode(null);
      loadFields();
    } catch (e: unknown) {
      setFormError((e as Error)?.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (f: CustomField) => {
    if (!confirm(`ลบฟิลด์ "${f.label_th}" (${f.field_key})?\nข้อมูลที่บันทึกไว้ใน custom_properties จะยังอยู่แต่ฟิลด์นี้จะหายไปจาก UI`)) return;
    try {
      const h = await authHeader();
      const res = await fetch(backendUrl(`/admin/custom-fields?id=${f.id}`), {
        method: "DELETE",
        headers: h,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError(json?.error ?? "ลบไม่สำเร็จ"); return; }
      setMessage(`ลบฟิลด์ "${f.label_th}" แล้ว`);
      loadFields();
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "ลบไม่สำเร็จ");
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (authLoading) return <div className="p-6 text-sm text-gray-500">กำลังโหลด…</div>;
  if (role !== "super_admin") return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <Title as="h1" className="text-lg font-semibold">ไม่มีสิทธิ์เข้าถึงหน้านี้</Title>
    </div>
  );

  const orgOptions  = [{ value: "", label: "— เลือก Org —" }, ...orgs.map((o) => ({ value: o.id, label: o.name }))];
  const canAddField = !!orgId && !!moduleKey && !!entityType;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">Custom Fields</Title>
          <Text className="mt-1 text-sm text-gray-500">
            เพิ่มฟิลด์พิเศษต่อ Org • เก็บค่าใน <code className="rounded bg-gray-100 px-1 text-xs">custom_properties</code>
          </Text>
        </div>
        {canAddField && (
          <Button onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />เพิ่มฟิลด์
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Organization</Label>
          <CustomSelect
            value={orgId}
            onChange={(v) => { setOrgId(v); setModuleKey(""); setEntityType(""); setFields([]); }}
            options={orgOptions}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Module</Label>
          <CustomSelect
            value={moduleKey}
            onChange={setModuleKey}
            options={[{ value: "", label: "— ทุก Module —" }, ...MODULE_OPTIONS]}
            disabled={!orgId}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Entity Type</Label>
          <CustomSelect
            value={entityType}
            onChange={setEntityType}
            options={[{ value: "", label: "— ทุก Entity —" }, ...ENTITY_TYPE_OPTIONS]}
            disabled={!orgId}
          />
        </div>
      </div>

      {/* Feedback */}
      {error   && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}

      {/* Fields table */}
      {orgId ? (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {/* Header */}
          <div className="grid grid-cols-[1fr_100px_90px_80px_100px] gap-0 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <div>ชื่อฟิลด์</div>
            <div>Field Key</div>
            <div>ประเภท</div>
            <div>จำเป็น</div>
            <div>การจัดการ</div>
          </div>

          {loading ? (
            <div className="px-4 py-6 text-sm text-gray-500">กำลังโหลด…</div>
          ) : fields.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              {canAddField ? 'ยังไม่มีฟิลด์ — กด "+ เพิ่มฟิลด์" เพื่อเริ่มต้น' : 'เลือก Module และ Entity Type เพื่อดูฟิลด์'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {fields.map((f) => (
                <div
                  key={f.id}
                  className="grid grid-cols-[1fr_100px_90px_80px_100px] items-center gap-0 px-4 py-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-gray-900">{f.label_th}</div>
                    {f.label_en && <div className="text-xs text-gray-400">{f.label_en}</div>}
                    <div className="mt-0.5 text-xs text-gray-400">
                      {f.module_key} › {f.entity_type}
                    </div>
                  </div>
                  <div className="font-mono text-xs text-indigo-700">{f.field_key}</div>
                  <div>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {FIELD_TYPE_LABELS[f.field_type] ?? f.field_type}
                    </span>
                  </div>
                  <div>
                    {f.is_required ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">บังคับ</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => openEdit(f)}
                      className="rounded-full bg-indigo-50 p-1.5 text-indigo-600 hover:bg-indigo-100"
                      title="แก้ไข"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(f)}
                      className="rounded-full bg-red-50 p-1.5 text-red-500 hover:bg-red-100"
                      title="ลบ"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-400">
          เลือก Organization เพื���อดูและจัดการ Custom Fields
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <Dialog open={!!modalMode} onOpenChange={(o) => !o && setModalMode(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {modalMode === "add" ? "เพิ่มฟิลด��ใหม่" : `แก้ไข "${form.labelTh}"`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Field key (add only — immutable after creation) */}
            {modalMode === "add" && (
              <div className="space-y-1.5">
                <Label>
                  Field Key <span className="text-red-500">*</span>
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">snake_case เท่านั้น เช่น license_plate</span>
                </Label>
                <Input
                  value={form.fieldKey}
                  onChange={(e) => setForm((f) => ({ ...f, fieldKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                  placeholder="license_plate"
                  disabled={saving}
                />
              </div>
            )}
            {modalMode === "edit" && (
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">Field Key: </span>
                <code className="font-mono font-semibold text-indigo-700">{form.fieldKey}</code>
                <span className="ml-2 text-xs text-gray-400">(ไม่สามารถเปลี่ยนได้)</span>
              </div>
            )}

            {/* Labels */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>ชื่อภาษาไทย <span className="text-red-500">*</span></Label>
                <Input
                  value={form.labelTh}
                  onChange={(e) => setForm((f) => ({ ...f, labelTh: e.target.value }))}
                  placeholder="ทะเบียนรถ"
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label>ชื่อภาษาอังกฤษ</Label>
                <Input
                  value={form.labelEn}
                  onChange={(e) => setForm((f) => ({ ...f, labelEn: e.target.value }))}
                  placeholder="License Plate"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Field type + required */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>ประเภทฟิลด์</Label>
                <CustomSelect
                  value={form.fieldType}
                  onChange={(v) => setForm((f) => ({ ...f, fieldType: v as FieldType }))}
                  options={FIELD_TYPE_OPTIONS}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label>ลำดับ (Sort Order)</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                  disabled={saving}
                />
              </div>
            </div>

            {/* Required toggle */}
            <div className="flex items-center gap-2">
              <input
                id="is-required"
                type="checkbox"
                checked={form.isRequired}
                onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))}
                disabled={saving}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="is-required" className="text-sm text-gray-700">
                ฟิลด์บังคับ (required)
              </label>
            </div>

            {/* Select options (only for select type) */}
            {form.fieldType === "select" && (
              <div className="space-y-1.5">
                <Label>
                  Select Options <span className="text-red-500">*</span>
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">JSON array</span>
                </Label>
                <textarea
                  value={form.selectOptions}
                  onChange={(e) => setForm((f) => ({ ...f, selectOptions: e.target.value }))}
                  placeholder={`[\n  {"value": "a", "label": "ตัวเลือก A"},\n  {"value": "b", "label": "ตัวเลือก B"}\n]`}
                  rows={5}
                  disabled={saving}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
                />
              </div>
            )}

            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setModalMode(null)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "กำลังบันทึก…" : modalMode === "add" ? "เพิ่มฟิลด์" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
