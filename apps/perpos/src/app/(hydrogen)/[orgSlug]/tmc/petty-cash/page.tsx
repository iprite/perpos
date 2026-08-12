"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { FilterBar, FilterClear } from "@/components/ui/filter-bar";
import { Dropdown } from "@/components/ui/dropdown";
import { MultiSelect } from "@/components/ui/multi-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { StatusBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableLoading,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Filter,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  Pencil,
  Trash2,
  Settings,
  Tag,
  MapPin,
  Check,
  X,
  List,
  CalendarRange,
  LayoutDashboard,
  FileDown,
} from "lucide-react";
import { downloadXlsx, xlsxFilename } from "@/lib/export/xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

const TMC_ORG_ID = "1f52618c-09c4-49c5-a929-ea5060f26e7d";

// ── Types ────────────────────────────────────────────────────────────────────
type Fund = { id: string; name: string; note: string | null };
type Category = { id: string; name: string; sort_order: number; is_active: boolean };
type Property = { id: string; code: string; name: string; is_active: boolean; sort_order: number };
type Txn = {
  id: string;
  fund_id: string;
  txn_date: string;
  txn_type: "top_up" | "expense";
  amount: number;
  description: string;
  category: string | null;
  property_code: string | null;
  note: string | null;
  tmc_petty_cash_funds: { name: string } | null;
};

const EMPTY_FORM = {
  fundId: "",
  txnDate: new Date().toISOString().slice(0, 10),
  txnType: "expense" as "top_up" | "expense",
  amount: "",
  description: "",
  category: "",
  propertyCodes: [] as string[],
  note: "",
};

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

// ── Inline editable row ───────────────────────────────────────────────────────
function EditableRow({
  label,
  value,
  placeholder,
  onSave,
  onDelete,
  extraField,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onSave: (val: string, extra?: string) => Promise<void>;
  onDelete: () => Promise<void>;
  extraField?: { label: string; value: string; placeholder?: string };
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [ext, setExt] = useState(extraField?.value ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!val.trim()) return;
    setBusy(true);
    await onSave(val.trim(), ext.trim() || undefined);
    setBusy(false);
    setEditing(false);
  }
  async function remove() {
    setBusy(true);
    await onDelete();
    setBusy(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
        {extraField && (
          <Input
            value={ext}
            onChange={(e) => setExt(e.target.value)}
            placeholder={extraField.placeholder}
            className="h-7 w-24 text-sm"
          />
        )}
        <Input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={placeholder}
          className="h-7 flex-1 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !val.trim()}
          className="rounded p-1 text-green-600 hover:bg-green-100 disabled:opacity-40"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setVal(value);
            setExt(extraField?.value ?? "");
          }}
          className="rounded p-1 text-slate-400 hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2.5 hover:border-slate-200">
      <span className="flex items-center gap-2 text-sm text-slate-700">
        {extraField && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-600">
            {extraField.value}
          </span>
        )}
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function TmcPettyCashPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [funds, setFunds] = useState<Fund[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [totalTopUp, setTotalTopUp] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [loading, setLoading] = useState(true);

  // view mode
  const [view, setView] = useState<"list" | "summary" | "dashboard">("list");

  // filter panel (ซ่อนไว้หลัง icon)
  const [showFilters, setShowFilters] = useState(false);

  // แดชบอร์ด: เลือกดูเฉพาะเดือน ("" = ทุกเดือน)
  const [dashMonth, setDashMonth] = useState("");

  // filters
  const [filterFund, setFilterFund] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterProp, setFilterProp] = useState<string[]>([]);
  const [filterCat, setFilterCat] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // txn form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  // fund management
  const [showFunds, setShowFunds] = useState(false);
  const [newFundName, setNewFundName] = useState("");
  const [newFundNote, setNewFundNote] = useState("");
  const [fundSaving, setFundSaving] = useState(false);

  // master data management
  const [showMaster, setShowMaster] = useState(false);
  const [masterTab, setMasterTab] = useState<"category" | "property">("category");
  const [newCatName, setNewCatName] = useState("");
  const [newPropCode, setNewPropCode] = useState("");
  const [newPropName, setNewPropName] = useState("");
  const [masterSaving, setMasterSaving] = useState(false);

  // delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
  }, [supabase]);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadMaster = useCallback(async () => {
    const h = await authHeader();
    const [fRes, cRes, pRes] = await Promise.all([
      fetch(`/api/tmc/petty-cash/funds?orgId=${TMC_ORG_ID}`, { headers: h }),
      fetch(`/api/tmc/petty-cash/categories?orgId=${TMC_ORG_ID}`, { headers: h }),
      fetch(`/api/tmc/properties?orgId=${TMC_ORG_ID}&all=1`, { headers: h }),
    ]);
    const [fData, cData, pData] = await Promise.all([fRes.json(), cRes.json(), pRes.json()]);
    setFunds(Array.isArray(fData) ? fData : []);
    setCategories(Array.isArray(cData) ? cData : []);
    setProperties(Array.isArray(pData) ? pData : []);
  }, [authHeader]);

  const load = useCallback(async () => {
    setLoading(true);
    const h = await authHeader();
    const p = new URLSearchParams({ orgId: TMC_ORG_ID });
    if (filterFund) p.set("fundId", filterFund);
    if (filterType) p.set("txnType", filterType);
    if (filterProp.length > 0) p.set("propertyCodes", filterProp.join(","));
    if (filterCat.length > 0) p.set("categories", filterCat.join(","));
    if (from) p.set("from", from);
    if (to) p.set("to", to);

    const res = await fetch(`/api/tmc/petty-cash?${p}`, { headers: h });
    const data = await res.json();
    setTxns(data.txns ?? []);
    setTotalTopUp(data.totalTopUp ?? 0);
    setTotalExpense(data.totalExpense ?? 0);
    setLoading(false);
  }, [authHeader, filterFund, filterType, filterProp.join(","), filterCat.join(","), from, to]);

  useEffect(() => {
    void loadMaster();
  }, [loadMaster]);
  useEffect(() => {
    void load();
  }, [load]);

  // ── Save txn ───────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.fundId || !form.description || !form.amount) {
      setFormErr("กรุณากรอกข้อมูลที่จำเป็น");
      return;
    }
    setSaving(true);
    setFormErr("");
    const h = await authHeader();
    const body = {
      orgId: TMC_ORG_ID,
      fundId: form.fundId,
      txnDate: form.txnDate,
      txnType: form.txnType,
      amount: form.amount,
      description: form.description,
      category: form.category || undefined,
      propertyCode: form.propertyCodes.length > 0 ? form.propertyCodes.join(",") : undefined,
      note: form.note || undefined,
    };
    const res = editId
      ? await fetch("/api/tmc/petty-cash", {
          method: "PUT",
          headers: { ...h, "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, id: editId }),
        })
      : await fetch("/api/tmc/petty-cash", {
          method: "POST",
          headers: { ...h, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      const m = e.error ?? "บันทึกไม่สำเร็จ";
      setFormErr(m);
      toast.error(m);
    } else {
      setShowForm(false);
      setEditId(null);
      setForm({ ...EMPTY_FORM });
      toast.success(editId ? "แก้ไขรายการแล้ว" : "บันทึกรายการแล้ว");
      void load();
    }
    setSaving(false);
  }

  function openEdit(t: Txn) {
    setForm({
      fundId: t.fund_id,
      txnDate: t.txn_date,
      txnType: t.txn_type,
      amount: String(t.amount),
      description: t.description,
      category: t.category ?? "",
      propertyCodes: t.property_code ? t.property_code.split(",").filter(Boolean) : [],
      note: t.note ?? "",
    });
    setEditId(t.id);
    setFormErr("");
    setShowForm(true);
  }

  // ── Delete txn ─────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return;
    const h = await authHeader();
    const res = await fetch(`/api/tmc/petty-cash?id=${deleteId}&orgId=${TMC_ORG_ID}`, {
      method: "DELETE",
      headers: h,
    });
    setDeleteId(null);
    res.ok ? toast.success("ลบรายการแล้ว") : toast.error("ลบไม่สำเร็จ");
    void load();
  }

  // ── Fund ───────────────────────────────────────────────────────────────────
  async function handleCreateFund() {
    if (!newFundName.trim()) return;
    setFundSaving(true);
    const h = await authHeader();
    const res = await fetch("/api/tmc/petty-cash/funds", {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: TMC_ORG_ID, name: newFundName, note: newFundNote }),
    });
    setNewFundName("");
    setNewFundNote("");
    setFundSaving(false);
    res.ok ? toast.success("เพิ่มกระเป๋าเงินแล้ว") : toast.error("เพิ่มไม่สำเร็จ");
    void loadMaster();
  }

  // ── Category CRUD ──────────────────────────────────────────────────────────
  async function createCategory() {
    if (!newCatName.trim()) return;
    setMasterSaving(true);
    const h = await authHeader();
    const res = await fetch("/api/tmc/petty-cash/categories", {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: TMC_ORG_ID, name: newCatName }),
    });
    setNewCatName("");
    setMasterSaving(false);
    res.ok ? toast.success("เพิ่มหมวดหมู่แล้ว") : toast.error("เพิ่มไม่สำเร็จ");
    void loadMaster();
  }

  async function updateCategory(id: string, name: string) {
    const h = await authHeader();
    const res = await fetch("/api/tmc/petty-cash/categories", {
      method: "PATCH",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: TMC_ORG_ID, id, name }),
    });
    res.ok ? toast.success("แก้ไขหมวดหมู่แล้ว") : toast.error("แก้ไขไม่สำเร็จ");
    void loadMaster();
  }

  async function deleteCategory(id: string) {
    const h = await authHeader();
    const res = await fetch(`/api/tmc/petty-cash/categories?id=${id}&orgId=${TMC_ORG_ID}`, {
      method: "DELETE",
      headers: h,
    });
    res.ok ? toast.success("ลบหมวดหมู่แล้ว") : toast.error("ลบไม่สำเร็จ");
    void loadMaster();
  }

  // ── Property CRUD ──────────────────────────────────────────────────────────
  async function createProperty() {
    if (!newPropCode.trim() || !newPropName.trim()) return;
    setMasterSaving(true);
    const h = await authHeader();
    const res = await fetch("/api/tmc/properties", {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: TMC_ORG_ID, code: newPropCode, name: newPropName }),
    });
    setNewPropCode("");
    setNewPropName("");
    setMasterSaving(false);
    res.ok ? toast.success("เพิ่มแปลง/ทรัพย์สินแล้ว") : toast.error("เพิ่มไม่สำเร็จ");
    void loadMaster();
  }

  async function updateProperty(id: string, name: string, code?: string) {
    const h = await authHeader();
    const res = await fetch("/api/tmc/properties", {
      method: "PATCH",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: TMC_ORG_ID, id, name, ...(code ? { code } : {}) }),
    });
    res.ok ? toast.success("แก้ไขแปลง/ทรัพย์สินแล้ว") : toast.error("แก้ไขไม่สำเร็จ");
    void loadMaster();
  }

  async function deleteProperty(id: string) {
    const h = await authHeader();
    const res = await fetch(`/api/tmc/properties?id=${id}&orgId=${TMC_ORG_ID}`, {
      method: "DELETE",
      headers: h,
    });
    res.ok ? toast.success("ลบแปลง/ทรัพย์สินแล้ว") : toast.error("ลบไม่สำเร็จ");
    void loadMaster();
  }

  // ── Options ────────────────────────────────────────────────────────────────
  const activeCategories = useMemo(() => categories.filter((c) => c.is_active), [categories]);
  const activeProperties = useMemo(() => properties.filter((p) => p.is_active), [properties]);

  const fundOptions = useMemo(
    () => [
      { value: "", label: "ทุกกระเป๋า" },
      ...funds.map((f) => ({ value: f.id, label: f.name })),
    ],
    [funds],
  );
  const fundFormOpts = useMemo(
    () => [
      { value: "", label: "เลือกกระเป๋า" },
      ...funds.map((f) => ({ value: f.id, label: f.name })),
    ],
    [funds],
  );
  const typeOptions = [
    { value: "", label: "ทุกประเภท" },
    { value: "top_up", label: "เติมเงิน" },
    { value: "expense", label: "ใช้เงิน" },
  ];
  const typeFormOpts = [
    { value: "top_up", label: "⬆ เติมเงิน" },
    { value: "expense", label: "⬇ ใช้เงิน" },
  ];
  const propFilterOpts = useMemo(
    () => [
      { value: "", label: "ทุกแปลง" },
      ...activeProperties.map((p) => ({ value: p.code, label: p.code })),
    ],
    [activeProperties],
  );
  const propFormOpts = useMemo(
    () => [
      { value: "", label: "—" },
      ...activeProperties.map((p) => ({ value: p.code, label: `${p.code} ${p.name}` })),
    ],
    [activeProperties],
  );
  const catFormOpts = useMemo(
    () => [
      { value: "", label: "— ไม่ระบุ —" },
      ...activeCategories.map((c) => ({ value: c.name, label: c.name })),
    ],
    [activeCategories],
  );

  const hasFilter =
    !!filterFund || !!filterType || filterProp.length > 0 || filterCat.length > 0 || !!from || !!to;
  const balance = totalTopUp - totalExpense;

  const pager = usePagination(txns);

  // ── ส่งออก Excel — ทุกแถวที่ผ่านตัวกรอง (ไม่ใช่แค่หน้าที่เห็น) ───────────
  function exportXlsx() {
    if (txns.length === 0) return;
    downloadXlsx(xlsxFilename("เงินสดย่อย"), [
      {
        name: "เงินสดย่อย",
        rows: txns,
        columns: [
          { header: "วันที่", type: "date", width: 12, value: (t: Txn) => t.txn_date },
          { header: "รายการ", width: 40, value: (t: Txn) => t.description },
          { header: "กระเป๋า", width: 20, value: (t: Txn) => t.tmc_petty_cash_funds?.name ?? "" },
          { header: "หมวด", width: 18, value: (t: Txn) => t.category ?? "" },
          { header: "แปลง", width: 14, value: (t: Txn) => t.property_code ?? "" },
          {
            header: "เติมเงิน",
            type: "number",
            width: 14,
            value: (t: Txn) => (t.txn_type === "top_up" ? Number(t.amount) : null),
          },
          {
            header: "ใช้เงิน",
            type: "number",
            width: 14,
            value: (t: Txn) => (t.txn_type === "expense" ? Number(t.amount) : null),
          },
          { header: "หมายเหตุ", width: 30, value: (t: Txn) => t.note ?? "" },
        ],
        totals: { 0: "รวม", 5: totalTopUp, 6: totalExpense },
      },
    ]);
  }

  // ── สรุปรายจ่ายแยกตามหมวด × เดือน (pivot) ────────────────────────────────
  const summary = useMemo(() => {
    const expenses = txns.filter((t) => t.txn_type === "expense");
    const months = Array.from(new Set(expenses.map((t) => t.txn_date.slice(0, 7)))).sort();
    const byCat = new Map<string, { total: number; months: Record<string, number> }>();
    for (const t of expenses) {
      const key = t.category || "ไม่ระบุหมวด";
      const m = t.txn_date.slice(0, 7);
      const row = byCat.get(key) ?? { total: 0, months: {} };
      row.total += Number(t.amount);
      row.months[m] = (row.months[m] ?? 0) + Number(t.amount);
      byCat.set(key, row);
    }
    const rows = Array.from(byCat.entries())
      .map(([category, r]) => ({ category, ...r }))
      .sort((a, b) => b.total - a.total);
    const monthTotals = Object.fromEntries(
      months.map((m) => [m, rows.reduce((s, r) => s + (r.months[m] ?? 0), 0)]),
    ) as Record<string, number>;
    return { months, rows, monthTotals, grandTotal: rows.reduce((s, r) => s + r.total, 0) };
  }, [txns]);

  function fmtMonth(ym: string) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "short", year: "2-digit" });
  }

  // ── แดชบอร์ด (คำนวณจาก txns ที่ผ่านตัวกรองแล้ว) ─────────────────────────
  // เดือนทั้งหมดที่มีข้อมูล (สำหรับตัวเลือก "ดูรายเดือน")
  const dashMonths = useMemo(
    () => Array.from(new Set(txns.map((t) => t.txn_date.slice(0, 7)))).sort(),
    [txns],
  );
  const dashMonthOptions = useMemo(
    () => [
      { value: "", label: "ทุกเดือน" },
      ...[...dashMonths].reverse().map((m) => ({ value: m, label: fmtMonth(m) })),
    ],
    [dashMonths],
  );
  // ถ้าเดือนที่เลือกหลุดจากช่วงข้อมูล (เปลี่ยนตัวกรองอื่น) → กลับไป "ทุกเดือน"
  useEffect(() => {
    if (dashMonth && !dashMonths.includes(dashMonth)) setDashMonth("");
  }, [dashMonth, dashMonths]);

  const dash = useMemo(() => {
    // รายเดือน: เติมเงิน vs ใช้เงิน + คงเหลือสะสม (ใช้ทุกเดือนเสมอ เพื่อให้เห็นแนวโน้ม)
    const byMonth = new Map<string, { top_up: number; expense: number }>();
    for (const t of txns) {
      const m = t.txn_date.slice(0, 7);
      const row = byMonth.get(m) ?? { top_up: 0, expense: 0 };
      row[t.txn_type] += Number(t.amount);
      byMonth.set(m, row);
    }
    let running = 0;
    const monthly = Array.from(byMonth.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([ym, r]) => {
        running += r.top_up - r.expense;
        return {
          ym,
          name: fmtMonth(ym),
          เติมเงิน: r.top_up,
          ใช้เงิน: r.expense,
          คงเหลือสะสม: running,
        };
      });

    // ส่วนที่เหลือคิดเฉพาะเดือนที่เลือก (ถ้าเลือก)
    const scoped = dashMonth ? txns.filter((t) => t.txn_date.startsWith(dashMonth)) : txns;
    const topUp = scoped
      .filter((t) => t.txn_type === "top_up")
      .reduce((s, t) => s + Number(t.amount), 0);
    const expense = scoped
      .filter((t) => t.txn_type === "expense")
      .reduce((s, t) => s + Number(t.amount), 0);

    // รายจ่ายแยกหมวด (top 8)
    const byCat = new Map<string, number>();
    // รายจ่ายแยกแปลง (หารเฉลี่ยเมื่อรายการผูกหลายแปลง — กันนับซ้ำ)
    const byProp = new Map<string, number>();
    for (const t of scoped) {
      if (t.txn_type !== "expense") continue;
      const amt = Number(t.amount);
      const cat = t.category || "ไม่ระบุหมวด";
      byCat.set(cat, (byCat.get(cat) ?? 0) + amt);
      const codes = (t.property_code ?? "").split(",").filter(Boolean);
      if (codes.length === 0) {
        byProp.set("ไม่ระบุ", (byProp.get("ไม่ระบุ") ?? 0) + amt);
      } else {
        for (const c of codes) byProp.set(c, (byProp.get(c) ?? 0) + amt / codes.length);
      }
    }
    const catRows = Array.from(byCat.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
    const topCats = catRows.slice(0, 8);
    const restCat = catRows.slice(8).reduce((s, r) => s + r.total, 0);
    if (restCat > 0) topCats.push({ name: "อื่น ๆ", total: restCat });
    const propRows = Array.from(byProp.entries())
      .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);

    return { monthly, topCats, propRows, topUp, expense, balance: topUp - expense };
  }, [txns, dashMonth]);

  const PROP_COLORS = [
    "#5D9CEC",
    "#8067B7",
    "#EC87C0",
    "#FFCE54",
    "#48CFAD",
    "#FC6E51",
    "#A0CECB",
    "#A0D468",
    "#CCD1D9",
  ];
  const TT = { contentStyle: { fontSize: 12, borderRadius: 8, border: "1px solid #E6E9EE" } };
  const fmtK = (n: number) =>
    n >= 1_000_000
      ? (n / 1_000_000).toFixed(1) + "M"
      : n >= 1_000
        ? (n / 1_000).toFixed(0) + "K"
        : String(n);

  return (
    <PageShell
      width="full"
      icon={<Wallet className="h-6 w-6" />}
      title="เงินสดย่อย"
      description="กระเป๋าเงินสดแยกจากบัญชีหลัก"
      actions={
        <>
          <Button
            variant={showFilters || hasFilter ? "secondary" : "outline"}
            size="icon"
            title="ตัวกรอง"
            className="relative"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-4 w-4" />
            {hasFilter && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="ส่งออก Excel"
            disabled={loading || txns.length === 0}
            onClick={exportXlsx}
          >
            <FileDown className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="จัดการหมวด/แปลง"
            onClick={() => {
              setMasterTab("category");
              setShowMaster(true);
            }}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Dropdown
            label={funds.find((f) => f.id === filterFund)?.name ?? ""}
            leadingIcon={<Wallet className="h-4 w-4" />}
            placement="bottom-end"
            className={filterFund ? "" : "px-2"}
            minWidth={220}
            selectedKey={filterFund || "all"}
            items={[
              {
                key: "all",
                label: "ทุกกระเป๋า",
                onClick: () => setFilterFund(""),
              },
              ...funds.map((f) => ({
                key: f.id,
                label: f.name,
                icon: <Wallet className="h-4 w-4" />,
                onClick: () => setFilterFund((p) => (p === f.id ? "" : f.id)),
              })),
              {
                key: "manage",
                label: "จัดการกระเป๋า",
                icon: <Settings className="h-4 w-4" />,
                onClick: () => setShowFunds(true),
              },
            ]}
          />
          <Button
            onClick={() => {
              setEditId(null);
              setForm({ ...EMPTY_FORM });
              setFormErr("");
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4" /> เพิ่มรายการ
          </Button>
        </>
      }
    >
      {/* Filters — ซ่อนไว้หลัง icon ด้านบน */}
      {showFilters && (
        <FilterBar>
          <CustomSelect
            value={filterFund}
            onChange={setFilterFund}
            options={fundOptions}
            className="w-44"
          />
          <CustomSelect
            value={filterType}
            onChange={setFilterType}
            options={typeOptions}
            className="w-28"
          />
          <MultiSelect
            value={filterProp}
            onChange={setFilterProp}
            options={activeProperties.map((p) => ({ value: p.code, label: p.code }))}
            placeholder="ทุกแปลง"
            className="w-36"
          />
          <MultiSelect
            value={filterCat}
            onChange={setFilterCat}
            options={activeCategories.map((c) => ({ value: c.name, label: c.name }))}
            placeholder="ทุกหมวด"
            className="w-40"
          />
          <ThaiDatePicker value={from} onChange={setFrom} placeholder="ตั้งแต่" className="w-32" />
          <ThaiDatePicker value={to} onChange={setTo} placeholder="ถึง" className="w-32" />
          <FilterClear
            disabled={!hasFilter}
            onClick={() => {
              setFilterFund("");
              setFilterType("");
              setFilterProp([]);
              setFilterCat([]);
              setFrom("");
              setTo("");
            }}
          />
        </FilterBar>
      )}

      {/* ── จัดการหมวด/แปลง — popup ── */}
      <Dialog open={showMaster} onOpenChange={setShowMaster}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>จัดการหมวดและแปลง</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {/* Tabs */}
            <div className="mb-3 flex overflow-hidden rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setMasterTab("category")}
                className={`flex flex-1 items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
                  masterTab === "category"
                    ? "bg-primary text-primary-foreground"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Tag className="h-4 w-4" /> หมวดหมู่
              </button>
              <button
                type="button"
                onClick={() => setMasterTab("property")}
                className={`flex flex-1 items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
                  masterTab === "property"
                    ? "bg-primary text-primary-foreground"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                <MapPin className="h-4 w-4" /> แปลง
              </button>
            </div>

            {/* Categories Tab */}
            {masterTab === "category" && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">คลิก ✏️ เพื่อแก้ไขชื่อ | 🗑️ เพื่อลบ</p>
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {categories.map((cat) => (
                    <EditableRow
                      key={cat.id}
                      label={cat.name}
                      value={cat.name}
                      placeholder="ชื่อหมวด"
                      onSave={async (name) => {
                        await updateCategory(cat.id, name);
                      }}
                      onDelete={async () => {
                        await deleteCategory(cat.id);
                      }}
                    />
                  ))}
                  {categories.length === 0 && (
                    <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีหมวด</p>
                  )}
                </div>

                {/* Add new */}
                <div className="flex gap-2 rounded-xl border border-dashed border-slate-300 p-3">
                  <Input
                    placeholder="ชื่อหมวดใหม่ เช่น ค่าซ่อมแซม"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void createCategory();
                    }}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={createCategory}
                    disabled={masterSaving || !newCatName.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Properties Tab */}
            {masterTab === "property" && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">คลิก ✏️ เพื่อแก้ไขชื่อและรหัส | 🗑️ เพื่อลบ</p>
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {properties.map((prop) => (
                    <EditableRow
                      key={prop.id}
                      label={prop.name}
                      value={prop.name}
                      placeholder="ชื่อแปลง"
                      extraField={{ label: "รหัส", value: prop.code, placeholder: "รหัส" }}
                      onSave={async (name, code) => {
                        await updateProperty(prop.id, name, code);
                      }}
                      onDelete={async () => {
                        await deleteProperty(prop.id);
                      }}
                    />
                  ))}
                  {properties.length === 0 && (
                    <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีแปลง</p>
                  )}
                </div>

                {/* Add new */}
                <div className="flex gap-2 rounded-xl border border-dashed border-slate-300 p-3">
                  <Input
                    placeholder="รหัส เช่น TMC8"
                    value={newPropCode}
                    onChange={(e) => setNewPropCode(e.target.value)}
                    className="w-24"
                  />
                  <Input
                    placeholder="ชื่อแปลง เช่น บ้านสวน"
                    value={newPropName}
                    onChange={(e) => setNewPropName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void createProperty();
                    }}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={createProperty}
                    disabled={masterSaving || !newPropCode.trim() || !newPropName.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMaster(false)}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View switch */}
      <SegmentedControl
        value={view}
        onChange={setView}
        size="sm"
        options={[
          { value: "list", label: "รายการ", icon: <List className="h-4 w-4" /> },
          {
            value: "summary",
            label: "สรุปตามหมวด/เดือน",
            icon: <CalendarRange className="h-4 w-4" />,
          },
          {
            value: "dashboard",
            label: "แดชบอร์ด",
            icon: <LayoutDashboard className="h-4 w-4" />,
          },
        ]}
      />

      {/* ── สรุปตามหมวด × เดือน ── */}
      {view === "summary" &&
        (loading ? (
          <Table>
            <TableBody>
              <TableLoading colSpan={3} />
            </TableBody>
          </Table>
        ) : summary.rows.length === 0 ? (
          <Table>
            <TableBody>
              <TableEmpty colSpan={3}>ยังไม่มีรายการใช้เงินในช่วงที่เลือก</TableEmpty>
            </TableBody>
          </Table>
        ) : (
          <Table stickyHeader fillViewport className="shadow-sm">
            <TableHeader sticky>
              <TableRow>
                <TableHead>หมวด</TableHead>
                {summary.months.map((m) => (
                  <TableHead key={m} align="right">
                    {fmtMonth(m)}
                  </TableHead>
                ))}
                <TableHead align="right">รวม</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.rows.map((r) => (
                <TableRow key={r.category}>
                  <TableCell className="font-medium text-slate-800">{r.category}</TableCell>
                  {summary.months.map((m) => (
                    <TableCell key={m} align="right" tabular className="text-slate-600">
                      {r.months[m] ? fmt(r.months[m]) : <span className="text-slate-300">—</span>}
                    </TableCell>
                  ))}
                  <TableCell align="right" tabular className="font-semibold text-red-600">
                    {fmt(r.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">รวมทุกหมวด</TableCell>
                {summary.months.map((m) => (
                  <TableCell key={m} align="right" tabular className="font-semibold">
                    {fmt(summary.monthTotals[m])}
                  </TableCell>
                ))}
                <TableCell align="right" tabular className="font-semibold text-red-600">
                  {fmt(summary.grandTotal)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        ))}

      {/* ── แดชบอร์ด ── */}
      {view === "dashboard" &&
        (loading ? (
          <div className="animate-pulse space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-64 rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : txns.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
            <div className="mb-4 rounded-full bg-gray-100 p-4">
              <LayoutDashboard className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-900">ยังไม่มีข้อมูลในช่วงที่เลือก</h3>
            <p className="mt-1 text-sm text-gray-500">เพิ่มรายการหรือปรับตัวกรองเพื่อดูแดชบอร์ด</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ตัวเลือกเดือน */}
            <div className="flex flex-wrap items-center gap-2">
              <CalendarRange className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="text-sm text-slate-500">ดูข้อมูลเดือน</span>
              <CustomSelect
                value={dashMonth}
                onChange={setDashMonth}
                options={dashMonthOptions}
                className="w-40"
              />
              {dashMonth && (
                <Button variant="ghost" size="sm" onClick={() => setDashMonth("")}>
                  ดูทุกเดือน
                </Button>
              )}
            </div>

            {/* การ์ดสรุปยอดเงิน */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                icon={<ArrowDownCircle className="h-4 w-4" />}
                label={dashMonth ? `เติมเงิน (${fmtMonth(dashMonth)})` : "เติมเงินรวม"}
                value={fmt(dash.topUp)}
                tone="positive"
                valueColored
              />
              <StatCard
                icon={<ArrowUpCircle className="h-4 w-4" />}
                label={dashMonth ? `ใช้เงิน (${fmtMonth(dashMonth)})` : "ใช้เงินรวม"}
                value={fmt(dash.expense)}
                tone="negative"
                valueColored
              />
              <StatCard
                icon={<Wallet className="h-4 w-4" />}
                label={dashMonth ? "คงเหลือของเดือน" : "คงเหลือ"}
                value={fmt(dash.balance)}
                sub={dashMonth ? `คงเหลือสะสมทั้งหมด ${fmt(balance)}` : undefined}
                tone={dash.balance >= 0 ? "info" : "negative"}
                valueColored
              />
            </div>

            {/* เติมเงิน vs ใช้เงิน รายเดือน */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-gray-900">
                เติมเงิน vs ใช้เงิน รายเดือน
                <span className="ml-1.5 text-xs font-normal text-slate-400">
                  (คลิกแท่งเพื่อเลือกเดือน)
                </span>
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dash.monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6E9EE" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={fmtK}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                  />
                  <Tooltip {...TT} formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="เติมเงิน"
                    radius={[4, 4, 0, 0]}
                    onClick={(d: { ym?: string }) =>
                      setDashMonth((p) => (p === d.ym ? "" : (d.ym ?? "")))
                    }
                    className="cursor-pointer"
                  >
                    {dash.monthly.map((r) => (
                      <Cell
                        key={r.ym}
                        fill="#48CFAD"
                        fillOpacity={!dashMonth || dashMonth === r.ym ? 1 : 0.3}
                      />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="ใช้เงิน"
                    radius={[4, 4, 0, 0]}
                    onClick={(d: { ym?: string }) =>
                      setDashMonth((p) => (p === d.ym ? "" : (d.ym ?? "")))
                    }
                    className="cursor-pointer"
                  >
                    {dash.monthly.map((r) => (
                      <Cell
                        key={r.ym}
                        fill="#ED5565"
                        fillOpacity={!dashMonth || dashMonth === r.ym ? 1 : 0.3}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* รายจ่ายแยกหมวด */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-gray-900">
                  รายจ่ายแยกตามหมวด
                  {dashMonth && (
                    <span className="ml-1.5 text-xs font-normal text-slate-500">
                      · {fmtMonth(dashMonth)}
                    </span>
                  )}
                </p>
                <ResponsiveContainer width="100%" height={Math.max(220, dash.topCats.length * 36)}>
                  <BarChart data={dash.topCats} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6E9EE" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 12 }}
                      tickFormatter={fmtK}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      width={92}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip {...TT} formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="total" name="รายจ่าย" fill="#8067B7" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* รายจ่ายแยกแปลง */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-gray-900">
                  รายจ่ายแยกตามแปลง
                  {dashMonth && (
                    <span className="ml-1.5 text-xs font-normal text-slate-500">
                      · {fmtMonth(dashMonth)}
                    </span>
                  )}
                </p>
                <ResponsiveContainer width="100%" height={Math.max(220, dash.propRows.length * 36)}>
                  <BarChart data={dash.propRows} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6E9EE" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 12 }}
                      tickFormatter={fmtK}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      width={92}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip {...TT} formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="total" name="รายจ่าย" radius={[0, 4, 4, 0]}>
                      {dash.propRows.map((_, i) => (
                        <Cell key={i} fill={PROP_COLORS[i % PROP_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ))}

      {/* Table */}
      {view === "list" && (
        <>
          <Table stickyHeader fillViewport>
            <TableHeader sticky>
              <TableRow>
                <TableHead>วันที่</TableHead>
                <TableHead>รายการ</TableHead>
                <TableHead>กระเป๋า</TableHead>
                <TableHead>หมวด</TableHead>
                <TableHead>แปลง</TableHead>
                <TableHead align="right">เติมเงิน</TableHead>
                <TableHead align="right">ใช้เงิน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={7} />
              ) : txns.length === 0 ? (
                <TableEmpty colSpan={7}>ยังไม่มีรายการเงินสดย่อย</TableEmpty>
              ) : (
                pager.rows.map((t) => (
                  <TableRow key={t.id} clickable onClick={() => openEdit(t)}>
                    <TableCell className="text-slate-500">{fmtDate(t.txn_date)}</TableCell>
                    <TableCell className="text-slate-800">
                      {t.description}
                      {t.note && <span className="ml-1 text-xs text-slate-400">({t.note})</span>}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {t.tmc_petty_cash_funds?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {t.category && <StatusBadge tone="neutral">{t.category}</StatusBadge>}
                    </TableCell>
                    <TableCell>
                      {t.property_code && <StatusBadge tone="info">{t.property_code}</StatusBadge>}
                    </TableCell>
                    <TableCell align="right" tabular className="font-medium text-green-600">
                      {t.txn_type === "top_up" ? fmt(t.amount) : ""}
                    </TableCell>
                    <TableCell align="right" tabular className="font-medium text-red-600">
                      {t.txn_type === "expense" ? fmt(t.amount) : ""}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {!loading && <TablePager pager={pager} />}
        </>
      )}

      {/* ── Add/Edit Txn Dialog ── */}
      <Dialog
        open={showForm}
        onOpenChange={(v) => {
          setShowForm(v);
          if (!v) {
            setEditId(null);
            setForm({ ...EMPTY_FORM });
          }
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editId ? "แก้ไขรายการ" : "เพิ่มรายการเงินสดย่อย"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="grid grid-cols-2 gap-3">
              {/* Type toggle */}
              <div className="col-span-2 space-y-1.5">
                <Label>ประเภท *</Label>
                <div className="flex overflow-hidden rounded-lg border border-slate-200">
                  {typeFormOpts.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, txnType: opt.value as "top_up" | "expense" }))
                      }
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${
                        form.txnType === opt.value
                          ? opt.value === "top_up"
                            ? "bg-green-500 text-white"
                            : "bg-red-500 text-white"
                          : "bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>กระเป๋าเงินสดย่อย *</Label>
                <CustomSelect
                  value={form.fundId}
                  onChange={(v) => setForm((f) => ({ ...f, fundId: v }))}
                  options={fundFormOpts}
                />
              </div>
              <div className="space-y-1.5">
                <Label>วันที่ *</Label>
                <ThaiDatePicker
                  value={form.txnDate}
                  onChange={(v) => setForm((f) => ({ ...f, txnDate: v }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>จำนวนเงิน (บาท) *</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>รายการ *</Label>
                <Input
                  placeholder={
                    form.txnType === "top_up"
                      ? "เช่น เติมเงินสดย่อยรอบสัปดาห์"
                      : "เช่น ซื้อของใช้ทั่วไป"
                  }
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              {form.txnType === "expense" && (
                <div className="space-y-1.5">
                  <Label>หมวด</Label>
                  <CustomSelect
                    value={form.category}
                    onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                    options={catFormOpts}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>แปลง</Label>
                <MultiSelect
                  value={form.propertyCodes}
                  onChange={(v) => setForm((f) => ({ ...f, propertyCodes: v }))}
                  options={activeProperties.map((p) => ({
                    value: p.code,
                    label: `${p.code} ${p.name}`,
                  }))}
                  placeholder="— ไม่ระบุ —"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>หมายเหตุ</Label>
                <Input
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>
            {formErr && <p className="mt-3 text-sm text-red-600">{formErr}</p>}
          </DialogBody>
          <DialogFooter>
            {editId && (
              <Button
                variant="ghost"
                className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => {
                  const id = editId;
                  setShowForm(false);
                  setDeleteId(id);
                }}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> ลบ
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowForm(false)}>
              ยกเลิก
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.fundId || !form.description || !form.amount}
            >
              {saving ? "กำลังบันทึก…" : editId ? "บันทึกการแก้ไข" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog
        open={!!deleteId}
        onOpenChange={(v) => {
          if (!v) setDeleteId(null);
        }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>ยืนยันการลบ</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-slate-600">
              ต้องการลบรายการนี้ใช่หรือไม่? ไม่สามารถกู้คืนได้
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              ยกเลิก
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              ลบ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manage Funds Dialog ── */}
      <Dialog open={showFunds} onOpenChange={setShowFunds}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>จัดการกระเป๋าเงินสดย่อย</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {funds.length > 0 && (
              <div className="mb-4 space-y-2">
                {funds.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{f.name}</p>
                      {f.note && <p className="text-xs text-slate-400">{f.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-3 rounded-xl border border-dashed border-slate-300 p-4">
              <p className="text-sm font-medium text-slate-700">สร้างกระเป๋าใหม่</p>
              <div className="space-y-1.5">
                <Label>ชื่อกระเป๋า *</Label>
                <Input
                  placeholder="เช่น กระเป๋าเงินสดย่อยหน้าบ้าน"
                  value={newFundName}
                  onChange={(e) => setNewFundName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>หมายเหตุ</Label>
                <Input
                  placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                  value={newFundNote}
                  onChange={(e) => setNewFundNote(e.target.value)}
                />
              </div>
              <Button
                onClick={handleCreateFund}
                disabled={fundSaving || !newFundName.trim()}
                size="sm"
              >
                {fundSaving ? "กำลังสร้าง…" : "สร้างกระเป๋า"}
              </Button>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFunds(false)}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
