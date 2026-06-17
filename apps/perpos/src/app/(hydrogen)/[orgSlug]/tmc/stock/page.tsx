'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { backendUrl } from '@/lib/backend';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus, ArrowUp, ArrowDown, Settings, Tag, Ruler, Package,
  Check, X, Pencil, Trash2, ShoppingCart,
} from 'lucide-react';
import { PurchaseDialog } from './purchase-dialog';

const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';

// ── Types ─────────────────────────────────────────────────────────────────────
type StockItem = {
  id: string; name: string; unit: string;
  current_qty: number; min_quantity: number; category: string | null;
};
type Movement = {
  id: string; movement_type: string; quantity: number; property_code: string | null;
  note: string | null; created_at: string;
  tmc_stock_items: { name: string; unit: string } | null;
  tmc_properties: { code: string } | null;
};
type MasterItem = { id: string; name: string; sort_order: number; is_active: boolean };

// ── Inline editable row ───────────────────────────────────────────────────────
function EditableRow({
  label, placeholder, onSave, onDelete,
}: {
  label: string; placeholder?: string;
  onSave: (val: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val,  setVal]  = useState(label);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!val.trim()) return;
    setBusy(true);
    await onSave(val.trim());
    setBusy(false); setEditing(false);
  }
  async function remove() { setBusy(true); await onDelete(); setBusy(false); }

  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
        <Input value={val} onChange={e => setVal(e.target.value)}
          placeholder={placeholder} className="flex-1 h-7 text-sm"
          onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus />
        <button type="button" onClick={() => void save()} disabled={busy || !val.trim()}
          className="rounded p-1 text-green-600 hover:bg-green-100 disabled:opacity-40">
          <Check className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setEditing(false)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-50 group">
      <span className="flex-1 text-sm text-slate-700">{label}</span>
      <button type="button" onClick={() => setEditing(true)} disabled={busy}
        className="rounded p-1 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-blue-600 transition-opacity">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => void remove()} disabled={busy}
        className="rounded p-1 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-opacity">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TmcStockPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // data
  const [items,      setItems]      = useState<StockItem[]>([]);
  const [movements,  setMovements]  = useState<Movement[]>([]);
  const [categories, setCategories] = useState<MasterItem[]>([]);
  const [units,      setUnits]      = useState<MasterItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState<'items' | 'movements'>('items');

  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);

  // dialogs
  const [showAddItem,  setShowAddItem]  = useState(false);
  const [showMovement, setShowMovement] = useState<'in' | 'out' | 'adjust' | null>(null);
  const [showMaster,   setShowMaster]   = useState(false);
  const [masterTab,    setMasterTab]    = useState<'categories' | 'units'>('categories');
  const [showPurchase, setShowPurchase] = useState(false);

  // forms
  const [itemForm, setItemForm] = useState({ name: '', unit: '', minQuantity: '0', category: '' });
  const [movForm,  setMovForm]  = useState({ itemId: '', quantity: '', propertyCode: '', note: '' });
  const [saving,   setSaving]   = useState(false);

  // add new master
  const [newCatName,  setNewCatName]  = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [addingCat,   setAddingCat]   = useState(false);
  const [addingUnit,  setAddingUnit]  = useState(false);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
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
      fetch(`/api/tmc/stock/units?orgId=${TMC_ORG_ID}`,      { headers: h }),
    ]);
    const [cats, us] = await Promise.all([catRes.json(), unitRes.json()]);
    setCategories(Array.isArray(cats) ? cats : []);
    setUnits(Array.isArray(us)   ? us   : []);
  }, [authHeader]);

  const loadAccounts = useCallback(async () => {
    const h = await authHeader();
    const res = await fetch(backendUrl(`/tmc/accounts?orgId=${TMC_ORG_ID}`), { headers: h });
    const data = await res.json() as { id: string; name: string }[];
    setAccounts(Array.isArray(data) ? data : []);
  }, [authHeader]);

  useEffect(() => { load(); loadMaster(); loadAccounts(); }, [load, loadMaster, loadAccounts]);

  // derived options
  const activeCategories = useMemo(() => categories.filter(c => c.is_active), [categories]);
  const activeUnits      = useMemo(() => units.filter(u => u.is_active),      [units]);

  const categoryOptions = useMemo(() => [
    { value: '', label: '— ไม่ระบุ —' },
    ...activeCategories.map(c => ({ value: c.name, label: c.name })),
  ], [activeCategories]);

  const unitOptions = useMemo(() => [
    { value: '', label: '— เลือกหน่วย —' },
    ...activeUnits.map(u => ({ value: u.name, label: u.name })),
  ], [activeUnits]);

  const itemOptions = useMemo(() => [
    { value: '', label: 'เลือกสินค้า' },
    ...items.map(i => ({ value: i.id, label: `${i.name} (${i.current_qty} ${i.unit})` })),
  ], [items]);

  // set default unit when units load
  useEffect(() => {
    if (activeUnits.length > 0 && !itemForm.unit) {
      const defaultUnit = activeUnits.find(u => u.name === 'ชิ้น') ?? activeUnits[0];
      setItemForm(f => ({ ...f, unit: defaultUnit.name }));
    }
  }, [activeUnits, itemForm.unit]);

  // ── Stock handlers ───────────────────────────────────────────────────────────
  async function handleAddItem() {
    if (!itemForm.name || !itemForm.unit) return;
    setSaving(true);
    const h = await authHeader();
    await fetch(backendUrl('/tmc/stock'), {
      method: 'POST', headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, action: 'add_item', ...itemForm }),
    });
    setSaving(false);
    setShowAddItem(false);
    setItemForm({ name: '', unit: activeUnits[0]?.name ?? '', minQuantity: '0', category: '' });
    load();
  }

  async function handleMovement() {
    if (!movForm.itemId || !movForm.quantity || !showMovement) return;
    setSaving(true);
    const h = await authHeader();
    await fetch(backendUrl('/tmc/stock'), {
      method: 'POST', headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, movementType: showMovement, ...movForm }),
    });
    setSaving(false);
    setShowMovement(null);
    setMovForm({ itemId: '', quantity: '', propertyCode: '', note: '' });
    load();
  }

  // ── Category CRUD ─────────────────────────────────────────────────────────
  async function addCategory() {
    if (!newCatName.trim()) return;
    setAddingCat(true);
    const h = await authHeader();
    await fetch('/api/tmc/stock/categories', {
      method: 'POST', headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, name: newCatName }),
    });
    setNewCatName(''); setAddingCat(false);
    loadMaster();
  }

  async function saveCategory(id: string, name: string) {
    const h = await authHeader();
    await fetch('/api/tmc/stock/categories', {
      method: 'PATCH', headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, id, name }),
    });
    loadMaster();
  }

  async function deleteCategory(id: string) {
    const h = await authHeader();
    await fetch(`/api/tmc/stock/categories?id=${id}&orgId=${TMC_ORG_ID}`, {
      method: 'DELETE', headers: h,
    });
    loadMaster();
  }

  // ── Unit CRUD ──────────────────────────────────────────────────────────────
  async function addUnit() {
    if (!newUnitName.trim()) return;
    setAddingUnit(true);
    const h = await authHeader();
    await fetch('/api/tmc/stock/units', {
      method: 'POST', headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, name: newUnitName }),
    });
    setNewUnitName(''); setAddingUnit(false);
    loadMaster();
  }

  async function saveUnit(id: string, name: string) {
    const h = await authHeader();
    await fetch('/api/tmc/stock/units', {
      method: 'PATCH', headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, id, name }),
    });
    loadMaster();
  }

  async function deleteUnit(id: string) {
    const h = await authHeader();
    await fetch(`/api/tmc/stock/units?id=${id}&orgId=${TMC_ORG_ID}`, {
      method: 'DELETE', headers: h,
    });
    loadMaster();
  }

  const accountOptions = useMemo(() => accounts.map(a => ({ value: a.id, label: a.name })), [accounts]);

  const finCategoryOptions = useMemo(() => [
    'แมคโค', 'ค่าของใช้ทั่วไป', 'ซักผ้า', 'ล้างแอร์', 'เงินสดย่อย',
    'ส่วนกลาง', 'ค่าใช้จ่ายอื่นๆ',
  ].map(c => ({ value: c, label: c })), []);

  const lowStock = items.filter(i => i.current_qty <= i.min_quantity && i.min_quantity > 0);

  return (
    <PageShell
      width="full"
      icon={<Package className="h-6 w-6" />}
      title="Stock คลังสินค้า"
      description="TMC Management"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => setShowMaster(true)}>
            <Settings className="w-4 h-4" /> จัดการหมวด/หน่วย
          </Button>
          <Button variant="outline" onClick={() => setShowMovement('out')} className="text-red-600 border-red-200 hover:bg-red-50">
            <ArrowUp className="w-4 h-4" /> เบิกออก
          </Button>
          <Button variant="outline" onClick={() => setShowMovement('in')} className="text-green-600 border-green-200 hover:bg-green-50">
            <ArrowDown className="w-4 h-4" /> รับเข้า
          </Button>
          <Button variant="outline" onClick={() => setShowPurchase(true)} className="text-blue-600 border-blue-200 hover:bg-blue-50">
            <ShoppingCart className="w-4 h-4" /> ซื้อเข้าคลัง
          </Button>
          <Button onClick={() => setShowAddItem(true)}>
            <Plus className="w-4 h-4" /> เพิ่มรายการ
          </Button>
        </>
      }
    >

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <span className="text-amber-500 text-lg">⚠️</span>
          <div>
            <p className="text-sm font-medium text-amber-800">สินค้าใกล้หมด {lowStock.length} รายการ</p>
            <p className="text-xs text-amber-600">{lowStock.map(i => i.name).join(', ')}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(['items', 'movements'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === t ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'items' ? '📦 รายการสินค้า' : '📋 ประวัติรับ-เบิก'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400">กำลังโหลด...</div>
      ) : activeTab === 'items' ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">รายการ</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">หมวด</th>
                <th className="text-right px-4 py-3 text-slate-600 font-medium">คงเหลือ</th>
                <th className="text-right px-4 py-3 text-slate-600 font-medium">ขั้นต่ำ</th>
                <th className="text-center px-4 py-3 text-slate-600 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{item.category ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold">{item.current_qty} {item.unit}</td>
                  <td className="px-4 py-3 text-right text-slate-400">{item.min_quantity} {item.unit}</td>
                  <td className="px-4 py-3 text-center">
                    {item.min_quantity > 0 && item.current_qty <= item.min_quantity ? (
                      <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">⚠️ ใกล้หมด</span>
                    ) : (
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">✓ ปกติ</span>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">ยังไม่มีรายการสินค้า</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">วันที่</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">รายการ</th>
                <th className="text-center px-4 py-3 text-slate-600 font-medium">ประเภท</th>
                <th className="text-right px-4 py-3 text-slate-600 font-medium">จำนวน</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">แปลง</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {movements.map(m => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(m.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="px-4 py-3 font-medium">{m.tmc_stock_items?.name}</td>
                  <td className="px-4 py-3 text-center">
                    {m.movement_type === 'in'     && <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">รับเข้า</span>}
                    {m.movement_type === 'out'    && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">เบิกออก</span>}
                    {m.movement_type === 'adjust' && <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">ปรับ</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{m.quantity} {m.tmc_stock_items?.unit}</td>
                  <td className="px-4 py-3 text-slate-500">{m.property_code ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{m.note ?? '—'}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">ยังไม่มีประวัติการรับ-เบิก</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Item Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มรายการสินค้า</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>ชื่อสินค้า *</Label>
              <Input value={itemForm.name}
                onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))}
                placeholder="เช่น ผ้าขนหนู" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>หน่วย *</Label>
                <CustomSelect
                  value={itemForm.unit}
                  onChange={v => setItemForm(f => ({ ...f, unit: v }))}
                  options={unitOptions}
                />
              </div>
              <div className="space-y-1.5">
                <Label>ขั้นต่ำ</Label>
                <Input type="number" value={itemForm.minQuantity}
                  onChange={e => setItemForm(f => ({ ...f, minQuantity: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>หมวดหมู่</Label>
              <CustomSelect
                value={itemForm.category}
                onChange={v => setItemForm(f => ({ ...f, category: v }))}
                options={categoryOptions}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowAddItem(false)}>ยกเลิก</Button>
            <Button onClick={handleAddItem} disabled={saving || !itemForm.name || !itemForm.unit}>
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Movement Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!showMovement} onOpenChange={v => { if (!v) setShowMovement(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showMovement === 'in' ? '📥 รับสินค้าเข้า' : showMovement === 'out' ? '📤 เบิกสินค้าออก' : '🔧 ปรับยอด'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>รายการสินค้า *</Label>
              <CustomSelect value={movForm.itemId} onChange={v => setMovForm(f => ({ ...f, itemId: v }))} options={itemOptions} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>จำนวน *</Label>
                <Input type="number" value={movForm.quantity}
                  onChange={e => setMovForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>แปลง</Label>
                <CustomSelect value={movForm.propertyCode}
                  onChange={v => setMovForm(f => ({ ...f, propertyCode: v }))}
                  options={[
                    { value: '', label: '—' },
                    { value: 'TMC1', label: 'TMC1' },
                    { value: 'TMC2', label: 'TMC2' },
                    { value: 'TMC3-4', label: 'TMC3-4' },
                    { value: 'TMC5', label: 'TMC5' },
                    { value: 'TMC6', label: 'TMC6' },
                    { value: 'TMC7', label: 'TMC7' },
                    { value: 'ส่วนกลาง', label: 'ส่วนกลาง' },
                  ]} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Input value={movForm.note} onChange={e => setMovForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowMovement(null)}>ยกเลิก</Button>
            <Button onClick={handleMovement} disabled={saving || !movForm.itemId || !movForm.quantity}>
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Purchase Dialog ─────────────────────────────────────────────────── */}
      <PurchaseDialog
        open={showPurchase}
        onClose={() => setShowPurchase(false)}
        onSaved={() => { setShowPurchase(false); load(); }}
        authHeader={authHeader}
        stockItems={items}
        unitOptions={unitOptions}
        categoryOptions={finCategoryOptions}
        accountOptions={accountOptions}
      />

      {/* ── Master Data Dialog ──────────────────────────────────────────────── */}
      <Dialog open={showMaster} onOpenChange={setShowMaster}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>จัดการหมวดหมู่และหน่วย</DialogTitle>
          </DialogHeader>

          {/* Tab bar */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button onClick={() => setMasterTab('categories')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors
                ${masterTab === 'categories' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              <Tag className="h-3.5 w-3.5" /> หมวดหมู่
            </button>
            <button onClick={() => setMasterTab('units')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors
                ${masterTab === 'units' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              <Ruler className="h-3.5 w-3.5" /> หน่วย
            </button>
          </div>

          {/* Categories tab */}
          {masterTab === 'categories' && (
            <div className="space-y-1">
              {categories.map(cat => (
                <EditableRow
                  key={cat.id}
                  label={cat.name}
                  placeholder="ชื่อหมวดหมู่"
                  onSave={name => saveCategory(cat.id, name)}
                  onDelete={() => deleteCategory(cat.id)}
                />
              ))}
              {categories.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีหมวดหมู่</p>
              )}
              {/* Add new */}
              <div className="flex items-center gap-2 pt-2 border-t mt-2">
                <Input
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void addCategory(); }}
                  placeholder="ชื่อหมวดหมู่ใหม่"
                  className="flex-1 h-8 text-sm"
                />
                <Button size="sm" onClick={addCategory} disabled={addingCat || !newCatName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Units tab */}
          {masterTab === 'units' && (
            <div className="space-y-1">
              {units.map(unit => (
                <EditableRow
                  key={unit.id}
                  label={unit.name}
                  placeholder="ชื่อหน่วย"
                  onSave={name => saveUnit(unit.id, name)}
                  onDelete={() => deleteUnit(unit.id)}
                />
              ))}
              {units.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีหน่วย</p>
              )}
              {/* Add new */}
              <div className="flex items-center gap-2 pt-2 border-t mt-2">
                <Input
                  value={newUnitName}
                  onChange={e => setNewUnitName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void addUnit(); }}
                  placeholder="ชื่อหน่วยใหม่ เช่น ม้วน"
                  className="flex-1 h-8 text-sm"
                />
                <Button size="sm" onClick={addUnit} disabled={addingUnit || !newUnitName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMaster(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </PageShell>
  );
}
