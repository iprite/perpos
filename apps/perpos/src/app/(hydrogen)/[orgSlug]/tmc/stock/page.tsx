"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { backendUrl } from "@/lib/backend";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableLoading,
} from "@/components/ui/table";
import { StatCard } from "@/components/ui/stat-card";
import { SegmentedControl } from "@/components/ui/segmented";
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
  ArrowUp,
  ArrowDown,
  Settings,
  Tag,
  Ruler,
  Package,
  Check,
  X,
  Pencil,
  Trash2,
  ShoppingCart,
  History,
  AlertTriangle,
  Search,
  Filter,
  LayoutDashboard,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
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
import cn from "@core/utils/class-names";
import { PurchaseDialog } from "./purchase-dialog";

const TMC_ORG_ID = "1f52618c-09c4-49c5-a929-ea5060f26e7d";

// ── Types ─────────────────────────────────────────────────────────────────────
type StockItem = {
  id: string;
  name: string;
  unit: string;
  current_qty: number;
  min_quantity: number;
  category: string | null;
};
type Movement = {
  id: string;
  movement_type: string;
  quantity: number;
  property_code: string | null;
  note: string | null;
  created_at: string;
  tmc_stock_items: { name: string; unit: string } | null;
  tmc_properties: { code: string } | null;
};
type MasterItem = { id: string; name: string; sort_order: number; is_active: boolean };

// ── Inline editable row ───────────────────────────────────────────────────────
function EditableRow({
  label,
  placeholder,
  onSave,
  onDelete,
}: {
  label: string;
  placeholder?: string;
  onSave: (val: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(label);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!val.trim()) return;
    setBusy(true);
    await onSave(val.trim());
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
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void save()}
          disabled={busy || !val.trim()}
          className="h-7 w-7 text-green-600 hover:bg-green-50"
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setEditing(false)}
          className="h-7 w-7 text-gray-400"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-50">
      <span className="flex-1 text-sm text-gray-700">{label}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setEditing(true)}
        disabled={busy}
        className="h-7 w-7 text-gray-300 opacity-0 transition-opacity hover:text-gray-700 group-hover:opacity-100"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => void remove()}
        disabled={busy}
        className="h-7 w-7 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TmcStockPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // data
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [categories, setCategories] = useState<MasterItem[]>([]);
  const [units, setUnits] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"items" | "movements" | "dashboard">("items");

  // filter panel (ซ่อนไว้หลัง icon)
  const [showFilters, setShowFilters] = useState(false);
  // pagination (แยกหน้าให้แต่ละแท็บ)
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  // แดชบอร์ด: เลือกดูเฉพาะเดือน ("" = ทุกเดือน)
  const [dashMonth, setDashMonth] = useState("");

  // items filter (tab "รายการสินค้า")
  const [activeCategory, setActiveCategory] = useState<string>("__all__");
  const [searchTerm, setSearchTerm] = useState("");

  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);

  // dialogs
  const [showAddItem, setShowAddItem] = useState(false);
  const [showMovement, setShowMovement] = useState<"in" | "out" | "adjust" | null>(null);
  const [showMaster, setShowMaster] = useState(false);
  const [masterTab, setMasterTab] = useState<"categories" | "units">("categories");
  const [showPurchase, setShowPurchase] = useState(false);

  // forms
  const [itemForm, setItemForm] = useState({ name: "", unit: "", minQuantity: "0", category: "" });
  const [movForm, setMovForm] = useState({ itemId: "", quantity: "", propertyCode: "", note: "" });
  const [saving, setSaving] = useState(false);

  // add new master
  const [newCatName, setNewCatName] = useState("");
  const [newUnitName, setNewUnitName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [addingUnit, setAddingUnit] = useState(false);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }, [supabase]);

  // load stock data
  const load = useCallback(async () => {
    setLoading(true);
    const h = await authHeader();
    const res = await fetch(backendUrl(`/tmc/stock?orgId=${TMC_ORG_ID}`), { headers: h });
    const data = await res.json();
    setItems(data.items ?? []);
    setMovements(data.movements ?? []);
    setLoading(false);
  }, [authHeader]);

  // load master data (categories + units)
  const loadMaster = useCallback(async () => {
    const h = await authHeader();
    const [catRes, unitRes] = await Promise.all([
      fetch(`/api/tmc/stock/categories?orgId=${TMC_ORG_ID}`, { headers: h }),
      fetch(`/api/tmc/stock/units?orgId=${TMC_ORG_ID}`, { headers: h }),
    ]);
    const [cats, us] = await Promise.all([catRes.json(), unitRes.json()]);
    setCategories(Array.isArray(cats) ? cats : []);
    setUnits(Array.isArray(us) ? us : []);
  }, [authHeader]);

  const loadAccounts = useCallback(async () => {
    const h = await authHeader();
    const res = await fetch(backendUrl(`/tmc/accounts?orgId=${TMC_ORG_ID}`), { headers: h });
    const data = (await res.json()) as { id: string; name: string }[];
    setAccounts(Array.isArray(data) ? data : []);
  }, [authHeader]);

  useEffect(() => {
    load();
    loadMaster();
    loadAccounts();
  }, [load, loadMaster, loadAccounts]);

  // derived options
  const activeCategories = useMemo(() => categories.filter((c) => c.is_active), [categories]);
  const activeUnits = useMemo(() => units.filter((u) => u.is_active), [units]);

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "— ไม่ระบุ —" },
      ...activeCategories.map((c) => ({ value: c.name, label: c.name })),
    ],
    [activeCategories],
  );

  const unitOptions = useMemo(
    () => [
      { value: "", label: "— เลือกหน่วย —" },
      ...activeUnits.map((u) => ({ value: u.name, label: u.name })),
    ],
    [activeUnits],
  );

  const itemOptions = useMemo(
    () => [
      { value: "", label: "เลือกสินค้า" },
      ...items.map((i) => ({ value: i.id, label: `${i.name} (${i.current_qty} ${i.unit})` })),
    ],
    [items],
  );

  // set default unit when units load
  useEffect(() => {
    if (activeUnits.length > 0 && !itemForm.unit) {
      const defaultUnit = activeUnits.find((u) => u.name === "ชิ้น") ?? activeUnits[0];
      setItemForm((f) => ({ ...f, unit: defaultUnit.name }));
    }
  }, [activeUnits, itemForm.unit]);

  // ── Stock handlers ───────────────────────────────────────────────────────────
  async function handleAddItem() {
    if (!itemForm.name || !itemForm.unit) return;
    setSaving(true);
    try {
      const h = await authHeader();
      const res = await fetch(backendUrl("/tmc/stock"), {
        method: "POST",
        headers: h,
        body: JSON.stringify({ orgId: TMC_ORG_ID, action: "add_item", ...itemForm }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        toast.error(data.error ?? "เพิ่มสินค้าไม่สำเร็จ");
        return;
      }
      setShowAddItem(false);
      setItemForm({ name: "", unit: activeUnits[0]?.name ?? "", minQuantity: "0", category: "" });
      toast.success("เพิ่มสินค้าแล้ว");
      load();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setSaving(false);
    }
  }

  async function handleMovement() {
    if (!movForm.itemId || !movForm.quantity || !showMovement) return;
    setSaving(true);
    try {
      const h = await authHeader();
      const res = await fetch(backendUrl("/tmc/stock"), {
        method: "POST",
        headers: h,
        body: JSON.stringify({ orgId: TMC_ORG_ID, movementType: showMovement, ...movForm }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        toast.error(data.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setShowMovement(null);
      setMovForm({ itemId: "", quantity: "", propertyCode: "", note: "" });
      toast.success("บันทึกการเคลื่อนไหวสต๊อกแล้ว");
      load();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setSaving(false);
    }
  }

  // ── Category CRUD ─────────────────────────────────────────────────────────
  async function addCategory() {
    if (!newCatName.trim()) return;
    setAddingCat(true);
    const h = await authHeader();
    const res = await fetch("/api/tmc/stock/categories", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, name: newCatName }),
    });
    setNewCatName("");
    setAddingCat(false);
    res.ok ? toast.success("เพิ่มหมวดหมู่แล้ว") : toast.error("เพิ่มไม่สำเร็จ");
    loadMaster();
  }

  async function saveCategory(id: string, name: string) {
    const h = await authHeader();
    const res = await fetch("/api/tmc/stock/categories", {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, id, name }),
    });
    res.ok ? toast.success("แก้ไขหมวดหมู่แล้ว") : toast.error("แก้ไขไม่สำเร็จ");
    loadMaster();
  }

  async function deleteCategory(id: string) {
    const h = await authHeader();
    const res = await fetch(`/api/tmc/stock/categories?id=${id}&orgId=${TMC_ORG_ID}`, {
      method: "DELETE",
      headers: h,
    });
    res.ok ? toast.success("ลบหมวดหมู่แล้ว") : toast.error("ลบไม่สำเร็จ");
    loadMaster();
  }

  // ── Unit CRUD ──────────────────────────────────────────────────────────────
  async function addUnit() {
    if (!newUnitName.trim()) return;
    setAddingUnit(true);
    const h = await authHeader();
    const res = await fetch("/api/tmc/stock/units", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, name: newUnitName }),
    });
    setNewUnitName("");
    setAddingUnit(false);
    res.ok ? toast.success("เพิ่มหน่วยนับแล้ว") : toast.error("เพิ่มไม่สำเร็จ");
    loadMaster();
  }

  async function saveUnit(id: string, name: string) {
    const h = await authHeader();
    const res = await fetch("/api/tmc/stock/units", {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, id, name }),
    });
    res.ok ? toast.success("แก้ไขหน่วยนับแล้ว") : toast.error("แก้ไขไม่สำเร็จ");
    loadMaster();
  }

  async function deleteUnit(id: string) {
    const h = await authHeader();
    const res = await fetch(`/api/tmc/stock/units?id=${id}&orgId=${TMC_ORG_ID}`, {
      method: "DELETE",
      headers: h,
    });
    res.ok ? toast.success("ลบหน่วยนับแล้ว") : toast.error("ลบไม่สำเร็จ");
    loadMaster();
  }

  const accountOptions = useMemo(
    () => accounts.map((a) => ({ value: a.id, label: a.name })),
    [accounts],
  );

  const finCategoryOptions = useMemo(
    () =>
      [
        "แมคโค",
        "ค่าของใช้ทั่วไป",
        "ซักผ้า",
        "ล้างแอร์",
        "เงินสดย่อย",
        "ส่วนกลาง",
        "ค่าใช้จ่ายอื่นๆ",
      ].map((c) => ({ value: c, label: c })),
    [],
  );

  const lowStock = items.filter((i) => i.current_qty <= i.min_quantity && i.min_quantity > 0);

  // ── Items filter (category chips + search) ─────────────────────────────────
  const categoryChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) {
      const key = it.category ?? "ไม่ระบุ";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "th"))
      .map(([name, count]) => ({ name, count }));
  }, [items]);

  const categoryCount = categoryChips.length;

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return items.filter((it) => {
      const cat = it.category ?? "ไม่ระบุ";
      if (activeCategory !== "__all__" && cat !== activeCategory) return false;
      if (term && !it.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [items, activeCategory, searchTerm]);

  const hasFilter = activeCategory !== "__all__" || !!searchTerm.trim();

  // เปลี่ยนแท็บ/ตัวกรอง/ข้อมูล → กลับหน้าแรกเสมอ (กันค้างอยู่หน้าที่ไม่มีแถวแล้ว)
  useEffect(() => {
    setPage(1);
  }, [activeTab, activeCategory, searchTerm, items, movements]);

  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedMovements = movements.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalRows = activeTab === "items" ? filteredItems.length : movements.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  function fmtMonth(ym: string) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "short", year: "2-digit" });
  }

  // ── แดชบอร์ด ────────────────────────────────────────────────────────────────
  // หมายเหตุ: สินค้าแต่ละตัวคนละหน่วย (ชิ้น/กล่อง/ลิตร) → รวม "ปริมาณ" ข้ามสินค้าไม่ได้
  // ทุกกราฟที่มาจาก movements จึงนับเป็น "จำนวนครั้ง" ที่รับเข้า/เบิกออกแทน
  const dashMonths = useMemo(
    () => Array.from(new Set(movements.map((m) => m.created_at.slice(0, 7)))).sort(),
    [movements],
  );
  const dashMonthOptions = useMemo(
    () => [
      { value: "", label: "ทุกเดือน" },
      ...[...dashMonths].reverse().map((m) => ({ value: m, label: fmtMonth(m) })),
    ],
    [dashMonths],
  );
  useEffect(() => {
    if (dashMonth && !dashMonths.includes(dashMonth)) setDashMonth("");
  }, [dashMonth, dashMonths]);

  const dash = useMemo(() => {
    // การเคลื่อนไหวรายเดือน (ทุกเดือนเสมอ เพื่อให้เห็นแนวโน้ม)
    const byMonth = new Map<string, { in: number; out: number }>();
    for (const m of movements) {
      const ym = m.created_at.slice(0, 7);
      const row = byMonth.get(ym) ?? { in: 0, out: 0 };
      if (m.movement_type === "in") row.in += 1;
      else if (m.movement_type === "out") row.out += 1;
      byMonth.set(ym, row);
    }
    const monthly = Array.from(byMonth.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([ym, r]) => ({ ym, name: fmtMonth(ym), รับเข้า: r.in, เบิกออก: r.out }));

    const scoped = dashMonth
      ? movements.filter((m) => m.created_at.startsWith(dashMonth))
      : movements;

    // สินค้าที่เบิกออกบ่อยที่สุด (นับครั้ง)
    const outByItem = new Map<string, number>();
    // เบิกไปที่แปลงไหนมากที่สุด
    const outByProp = new Map<string, number>();
    for (const m of scoped) {
      if (m.movement_type !== "out") continue;
      const name = m.tmc_stock_items?.name ?? "(ไม่ทราบสินค้า)";
      outByItem.set(name, (outByItem.get(name) ?? 0) + 1);
      const prop = m.property_code ?? "ไม่ระบุ";
      outByProp.set(prop, (outByProp.get(prop) ?? 0) + 1);
    }
    const topOutAll = Array.from(outByItem.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const topOut = topOutAll.slice(0, 10);
    const byProp = Array.from(outByProp.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // จำนวนสินค้าแยกหมวด (สถานะปัจจุบัน ไม่ขึ้นกับเดือน)
    const byCat = categoryChips.map((c) => ({ name: c.name, count: c.count }));

    return {
      monthly,
      topOut,
      topOutHidden: topOutAll.length - topOut.length,
      byProp,
      byCat,
      moveIn: scoped.filter((m) => m.movement_type === "in").length,
      moveOut: scoped.filter((m) => m.movement_type === "out").length,
    };
  }, [movements, dashMonth, categoryChips]);

  const CAT_COLORS = [
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

  // ── Withdraw over-balance guard (movement dialog) ──────────────────────────
  const selectedMovItem = useMemo(
    () => items.find((i) => i.id === movForm.itemId),
    [items, movForm.itemId],
  );
  const overWithdraw =
    showMovement === "out" &&
    !!selectedMovItem &&
    Number(movForm.quantity) > selectedMovItem.current_qty;

  return (
    <PageShell
      width="full"
      icon={<Package className="h-6 w-6" />}
      title="Stock คลังสินค้า"
      description="TMC Management"
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
            title="จัดการหมวด/หน่วย"
            onClick={() => setShowMaster(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="เบิกออก"
            onClick={() => setShowMovement("out")}
            className="border-red-200 text-red-600 hover:bg-red-50"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="รับเข้า"
            onClick={() => setShowMovement("in")}
            className="border-green-200 text-green-600 hover:bg-green-50"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="ซื้อเข้าคลัง"
            onClick={() => setShowPurchase(true)}
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
          <Button onClick={() => setShowAddItem(true)}>
            <Plus className="h-4 w-4" /> เพิ่มรายการ
          </Button>
        </>
      }
    >
      {/* Filters — ซ่อนไว้หลัง icon ด้านบน (มีผลกับแท็บรายการสินค้า) */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
          <Filter className="h-4 w-4 shrink-0 text-gray-400" />
          <CustomSelect
            value={activeCategory}
            onChange={setActiveCategory}
            options={[
              { value: "__all__", label: `ทุกหมวด (${items.length})` },
              ...categoryChips.map((c) => ({ value: c.name, label: `${c.name} (${c.count})` })),
            ]}
            className="w-52"
          />
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า"
              className="pl-9"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasFilter}
            onClick={() => {
              setActiveCategory("__all__");
              setSearchTerm("");
            }}
          >
            ล้างตัวกรอง
          </Button>
        </div>
      )}

      {/* View switch */}
      <SegmentedControl
        value={activeTab}
        onChange={setActiveTab}
        size="sm"
        options={[
          { value: "items", label: "รายการสินค้า", icon: <Package className="h-4 w-4" /> },
          { value: "movements", label: "ประวัติรับ-เบิก", icon: <History className="h-4 w-4" /> },
          { value: "dashboard", label: "แดชบอร์ด", icon: <LayoutDashboard className="h-4 w-4" /> },
        ]}
      />

      {/* ── แดชบอร์ด ── */}
      {activeTab === "dashboard" &&
        (loading ? (
          <div className="animate-pulse space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-64 rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* ตัวเลือกเดือน */}
            <div className="flex flex-wrap items-center gap-2">
              <CalendarRange className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="text-sm text-gray-500">ดูการเคลื่อนไหวเดือน</span>
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

            {/* การ์ดสรุป */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<AlertTriangle className="h-4 w-4" />}
                label="ใกล้หมด — ควรสั่งเพิ่ม"
                value={String(lowStock.length)}
                sub={
                  lowStock.length > 0 ? (
                    <span className="block truncate">{lowStock.map((i) => i.name).join(", ")}</span>
                  ) : (
                    "ระดับสต๊อกปกติทุกรายการ"
                  )
                }
                tone={lowStock.length > 0 ? "warning" : "positive"}
                valueColored
              />
              <StatCard
                icon={<Package className="h-4 w-4" />}
                label="รายการทั้งหมด"
                value={String(items.length)}
                sub={`${categoryCount} หมวด`}
                tone="info"
              />
              <StatCard
                icon={<ArrowDown className="h-4 w-4" />}
                label={dashMonth ? `รับเข้า (${fmtMonth(dashMonth)})` : "รับเข้า (ทั้งหมด)"}
                value={`${dash.moveIn} ครั้ง`}
                tone="positive"
                valueColored
              />
              <StatCard
                icon={<ArrowUp className="h-4 w-4" />}
                label={dashMonth ? `เบิกออก (${fmtMonth(dashMonth)})` : "เบิกออก (ทั้งหมด)"}
                value={`${dash.moveOut} ครั้ง`}
                tone="negative"
                valueColored
              />
            </div>

            {/* Stock ใกล้หมด — สิ่งที่ต้องลงมือทำ */}
            {lowStock.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                  <AlertTriangle className="h-4 w-4" /> ต่ำกว่าขั้นต่ำ — ควรสั่งเพิ่ม
                </p>
                <div className="flex flex-wrap gap-2">
                  {lowStock.map((i) => (
                    <span
                      key={i.id}
                      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-3 py-1 text-xs text-amber-800"
                    >
                      {i.name}
                      <span className="ml-1 font-bold text-red-500">
                        {i.current_qty}/{i.min_quantity} {i.unit}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* การเคลื่อนไหวรายเดือน */}
            {dash.monthly.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-gray-900">
                  รับเข้า vs เบิกออก รายเดือน (จำนวนครั้ง)
                  <span className="ml-1.5 text-xs font-normal text-gray-400">
                    (คลิกแท่งเพื่อเลือกเดือน)
                  </span>
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dash.monthly} barCategoryGap="22%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6E9EE" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      width={36}
                    />
                    <Tooltip {...TT} cursor={{ fill: "#F5F7FA" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="รับเข้า"
                      radius={[4, 4, 0, 0]}
                      className="cursor-pointer"
                      onClick={(d: { ym?: string }) =>
                        setDashMonth((p) => (p === d.ym ? "" : (d.ym ?? "")))
                      }
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
                      dataKey="เบิกออก"
                      radius={[4, 4, 0, 0]}
                      className="cursor-pointer"
                      onClick={(d: { ym?: string }) =>
                        setDashMonth((p) => (p === d.ym ? "" : (d.ym ?? "")))
                      }
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
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {/* เบิกออกบ่อยที่สุด */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-gray-900">
                  สินค้าที่เบิกบ่อยที่สุด (จำนวนครั้ง)
                  {dashMonth && (
                    <span className="ml-1.5 text-xs font-normal text-gray-500">
                      · {fmtMonth(dashMonth)}
                    </span>
                  )}
                  {dash.topOutHidden > 0 && (
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      — แสดง 10 อันดับแรก
                    </span>
                  )}
                </p>
                {dash.topOut.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-400">
                    ยังไม่มีการเบิกออกในช่วงที่เลือก
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={32 + dash.topOut.length * 30}>
                    <BarChart
                      data={dash.topOut}
                      layout="vertical"
                      margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
                      barCategoryGap="20%"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6E9EE" horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        width={130}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip {...TT} cursor={{ fill: "#F5F7FA" }} />
                      <Bar dataKey="count" name="ครั้ง" fill="#8067B7" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* เบิกไปแปลงไหน */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-gray-900">
                  เบิกไปที่แปลงไหน (จำนวนครั้ง)
                  {dashMonth && (
                    <span className="ml-1.5 text-xs font-normal text-gray-500">
                      · {fmtMonth(dashMonth)}
                    </span>
                  )}
                </p>
                {dash.byProp.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-400">
                    ยังไม่มีการเบิกออกในช่วงที่เลือก
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={32 + dash.byProp.length * 30}>
                    <BarChart
                      data={dash.byProp}
                      layout="vertical"
                      margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
                      barCategoryGap="20%"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6E9EE" horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 12 }}
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
                      <Tooltip {...TT} cursor={{ fill: "#F5F7FA" }} />
                      <Bar dataKey="count" name="ครั้ง" radius={[0, 4, 4, 0]}>
                        {dash.byProp.map((_, i) => (
                          <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* จำนวนสินค้าแยกหมวด */}
            {dash.byCat.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-gray-900">จำนวนรายการสินค้าแยกหมวด</p>
                <ResponsiveContainer width="100%" height={32 + dash.byCat.length * 30}>
                  <BarChart
                    data={dash.byCat}
                    layout="vertical"
                    margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6E9EE" horizontal={false} />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      width={130}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip {...TT} cursor={{ fill: "#F5F7FA" }} />
                    <Bar dataKey="count" name="รายการ" radius={[0, 4, 4, 0]}>
                      {dash.byCat.map((_, i) => (
                        <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ))}

      {activeTab === "dashboard" ? null : loading ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>รายการ</TableHead>
              <TableHead>หมวด</TableHead>
              <TableHead align="right">คงเหลือ</TableHead>
              <TableHead align="right">ขั้นต่ำ</TableHead>
              <TableHead align="center">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableLoading colSpan={5} />
          </TableBody>
        </Table>
      ) : activeTab === "items" ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>รายการ</TableHead>
              <TableHead>หมวด</TableHead>
              <TableHead align="right">คงเหลือ</TableHead>
              <TableHead align="right">ขั้นต่ำ</TableHead>
              <TableHead align="center">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium text-gray-900">{item.name}</TableCell>
                <TableCell className="text-xs text-gray-500">{item.category ?? "—"}</TableCell>
                <TableCell align="right" className="font-semibold tabular-nums">
                  {item.current_qty} {item.unit}
                </TableCell>
                <TableCell align="right" className="tabular-nums text-gray-400">
                  {item.min_quantity} {item.unit}
                </TableCell>
                <TableCell align="center">
                  {item.min_quantity > 0 && item.current_qty <= item.min_quantity ? (
                    <StatusBadge tone="danger">
                      <AlertTriangle className="h-3 w-3" /> ใกล้หมด
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="success">
                      <Check className="h-3 w-3" /> ปกติ
                    </StatusBadge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filteredItems.length === 0 && (
              <TableEmpty colSpan={5}>
                {items.length === 0 ? "ยังไม่มีรายการสินค้า" : "ไม่พบสินค้าตามเงื่อนไข"}
              </TableEmpty>
            )}
          </TableBody>
        </Table>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>วันที่</TableHead>
              <TableHead>รายการ</TableHead>
              <TableHead align="center">ประเภท</TableHead>
              <TableHead align="right">จำนวน</TableHead>
              <TableHead>แปลง</TableHead>
              <TableHead>หมายเหตุ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedMovements.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-gray-500">
                  {new Date(m.created_at).toLocaleDateString("th-TH", {
                    day: "2-digit",
                    month: "short",
                  })}
                </TableCell>
                <TableCell className="font-medium">{m.tmc_stock_items?.name}</TableCell>
                <TableCell align="center">
                  {m.movement_type === "in" && <StatusBadge tone="success">รับเข้า</StatusBadge>}
                  {m.movement_type === "out" && <StatusBadge tone="danger">เบิกออก</StatusBadge>}
                  {m.movement_type === "adjust" && <StatusBadge tone="info">ปรับ</StatusBadge>}
                </TableCell>
                <TableCell align="right" className="tabular-nums">
                  {m.quantity} {m.tmc_stock_items?.unit}
                </TableCell>
                <TableCell className="text-gray-500">{m.property_code ?? "—"}</TableCell>
                <TableCell className="text-xs text-gray-400">{m.note ?? "—"}</TableCell>
              </TableRow>
            ))}
            {movements.length === 0 && (
              <TableEmpty colSpan={6}>ยังไม่มีประวัติการรับ-เบิก</TableEmpty>
            )}
          </TableBody>
        </Table>
      )}

      {/* Pagination (แท็บรายการ/ประวัติ) */}
      {activeTab !== "dashboard" && !loading && totalRows > 0 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-gray-500">
            แสดง {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)} จาก{" "}
            {totalRows} รายการ
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("ellipsis");
                acc.push(p);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "ellipsis" ? (
                  <span key={`e${idx}`} className="px-1 text-xs text-gray-400">
                    …
                  </span>
                ) : (
                  <Button
                    key={item}
                    variant={item === page ? "default" : "ghost"}
                    size="icon"
                    onClick={() => setPage(item as number)}
                    className="h-8 w-8 text-xs"
                  >
                    {item}
                  </Button>
                ),
              )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Add Item Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>เพิ่มรายการสินค้า</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>ชื่อสินค้า *</Label>
                <Input
                  value={itemForm.name}
                  onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="เช่น ผ้าขนหนู"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>หน่วย *</Label>
                  <CustomSelect
                    value={itemForm.unit}
                    onChange={(v) => setItemForm((f) => ({ ...f, unit: v }))}
                    options={unitOptions}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>ขั้นต่ำ</Label>
                  <Input
                    type="number"
                    value={itemForm.minQuantity}
                    onChange={(e) => setItemForm((f) => ({ ...f, minQuantity: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>หมวดหมู่</Label>
                <CustomSelect
                  value={itemForm.category}
                  onChange={(v) => setItemForm((f) => ({ ...f, category: v }))}
                  options={categoryOptions}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItem(false)}>
              ยกเลิก
            </Button>
            <Button onClick={handleAddItem} disabled={saving || !itemForm.name || !itemForm.unit}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Movement Dialog ─────────────────────────────────────────────────── */}
      <Dialog
        open={!!showMovement}
        onOpenChange={(v) => {
          if (!v) setShowMovement(null);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              <span className="inline-flex items-center gap-1.5">
                {showMovement === "in" ? (
                  <>
                    <ArrowDown className="h-4 w-4" /> รับสินค้าเข้า
                  </>
                ) : showMovement === "out" ? (
                  <>
                    <ArrowUp className="h-4 w-4" /> เบิกสินค้าออก
                  </>
                ) : (
                  <>
                    <Settings className="h-4 w-4" /> ปรับยอด
                  </>
                )}
              </span>
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>รายการสินค้า *</Label>
                <CustomSelect
                  value={movForm.itemId}
                  onChange={(v) => setMovForm((f) => ({ ...f, itemId: v }))}
                  options={itemOptions}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>จำนวน *</Label>
                  <Input
                    type="number"
                    value={movForm.quantity}
                    onChange={(e) => setMovForm((f) => ({ ...f, quantity: e.target.value }))}
                  />
                  {overWithdraw && (
                    <p className="text-xs text-red-600">
                      เบิกเกินยอดคงเหลือ (คงเหลือ {selectedMovItem?.current_qty}{" "}
                      {selectedMovItem?.unit})
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>แปลง</Label>
                  <CustomSelect
                    value={movForm.propertyCode}
                    onChange={(v) => setMovForm((f) => ({ ...f, propertyCode: v }))}
                    options={[
                      { value: "", label: "—" },
                      { value: "TMC1", label: "TMC1" },
                      { value: "TMC2", label: "TMC2" },
                      { value: "TMC3-4", label: "TMC3-4" },
                      { value: "TMC5", label: "TMC5" },
                      { value: "TMC6", label: "TMC6" },
                      { value: "TMC7", label: "TMC7" },
                      { value: "ส่วนกลาง", label: "ส่วนกลาง" },
                    ]}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>หมายเหตุ</Label>
                <Input
                  value={movForm.note}
                  onChange={(e) => setMovForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMovement(null)}>
              ยกเลิก
            </Button>
            <Button
              onClick={handleMovement}
              disabled={saving || !movForm.itemId || !movForm.quantity || overWithdraw}
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Purchase Dialog ─────────────────────────────────────────────────── */}
      <PurchaseDialog
        open={showPurchase}
        onClose={() => setShowPurchase(false)}
        onSaved={() => {
          setShowPurchase(false);
          load();
        }}
        authHeader={authHeader}
        stockItems={items}
        unitOptions={unitOptions}
        categoryOptions={finCategoryOptions}
        accountOptions={accountOptions}
      />

      {/* ── Master Data Dialog ──────────────────────────────────────────────── */}
      <Dialog open={showMaster} onOpenChange={setShowMaster}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>จัดการหมวดหมู่และหน่วย</DialogTitle>
          </DialogHeader>

          <DialogBody>
            {/* Tab bar */}
            <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Button
                size="sm"
                variant={masterTab === "categories" ? "secondary" : "ghost"}
                onClick={() => setMasterTab("categories")}
                className={cn(
                  "flex-1 shrink-0 whitespace-nowrap",
                  masterTab === "categories" && "bg-gray-100 text-gray-900",
                )}
              >
                <Tag className="h-3.5 w-3.5" /> หมวดหมู่
              </Button>
              <Button
                size="sm"
                variant={masterTab === "units" ? "secondary" : "ghost"}
                onClick={() => setMasterTab("units")}
                className={cn(
                  "flex-1 shrink-0 whitespace-nowrap",
                  masterTab === "units" && "bg-gray-100 text-gray-900",
                )}
              >
                <Ruler className="h-3.5 w-3.5" /> หน่วย
              </Button>
            </div>

            {/* Categories tab */}
            {masterTab === "categories" && (
              <div className="space-y-1">
                {categories.map((cat) => (
                  <EditableRow
                    key={cat.id}
                    label={cat.name}
                    placeholder="ชื่อหมวดหมู่"
                    onSave={(name) => saveCategory(cat.id, name)}
                    onDelete={() => deleteCategory(cat.id)}
                  />
                ))}
                {categories.length === 0 && (
                  <p className="py-4 text-center text-sm text-gray-400">ยังไม่มีหมวดหมู่</p>
                )}
                {/* Add new */}
                <div className="mt-2 flex items-center gap-2 border-t pt-2">
                  <Input
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void addCategory();
                    }}
                    placeholder="ชื่อหมวดหมู่ใหม่"
                    className="h-8 flex-1 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={addCategory}
                    disabled={addingCat || !newCatName.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Units tab */}
            {masterTab === "units" && (
              <div className="space-y-1">
                {units.map((unit) => (
                  <EditableRow
                    key={unit.id}
                    label={unit.name}
                    placeholder="ชื่อหน่วย"
                    onSave={(name) => saveUnit(unit.id, name)}
                    onDelete={() => deleteUnit(unit.id)}
                  />
                ))}
                {units.length === 0 && (
                  <p className="py-4 text-center text-sm text-gray-400">ยังไม่มีหน่วย</p>
                )}
                {/* Add new */}
                <div className="mt-2 flex items-center gap-2 border-t pt-2">
                  <Input
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void addUnit();
                    }}
                    placeholder="ชื่อหน่วยใหม่ เช่น ม้วน"
                    className="h-8 flex-1 text-sm"
                  />
                  <Button size="sm" onClick={addUnit} disabled={addingUnit || !newUnitName.trim()}>
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
    </PageShell>
  );
}
