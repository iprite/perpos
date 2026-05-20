'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { backendUrl } from '@/lib/backend';
import { Button } from 'rizzui';
import { Plus, ArrowUp, ArrowDown } from 'lucide-react';

const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';
const PROPERTY_CODES = ['TMC1', 'TMC2', 'TMC3-4', 'TMC5', 'TMC6', 'TMC7', 'ส่วนกลาง'];
const STOCK_CATEGORIES = ['ผ้า', 'ของใช้ห้องน้ำ', 'อาหาร/เครื่องดื่ม', 'อุปกรณ์', 'ทำความสะอาด', 'อื่นๆ'];

type StockItem = { id: string; name: string; unit: string; current_qty: number; min_quantity: number; category: string | null };
type Movement = {
  id: string; movement_type: string; quantity: number; property_code: string | null;
  note: string | null; created_at: string;
  tmc_stock_items: { name: string; unit: string } | null;
  tmc_properties: { code: string } | null;
};

export default function TmcStockPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'items' | 'movements'>('items');

  // Add item form
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemForm, setItemForm] = useState({ name: '', unit: 'ชิ้น', minQuantity: '0', category: '' });

  // Movement form
  const [showMovement, setShowMovement] = useState<'in' | 'out' | 'adjust' | null>(null);
  const [movForm, setMovForm] = useState({ itemId: '', quantity: '', propertyCode: '', note: '' });
  const [saving, setSaving] = useState(false);

  const headers = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    };
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    const h = await headers();
    const res = await fetch(backendUrl(`/tmc/stock?orgId=${TMC_ORG_ID}`), { headers: h });
    const data = await res.json();
    setItems(data.items ?? []);
    setMovements(data.movements ?? []);
    setLoading(false);
  }, [headers]);

  useEffect(() => { load(); }, [load]);

  async function handleAddItem() {
    setSaving(true);
    const h = await headers();
    await fetch(backendUrl('/tmc/stock'), {
      method: 'POST', headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, action: 'add_item', ...itemForm }),
    });
    setSaving(false);
    setShowAddItem(false);
    setItemForm({ name: '', unit: 'ชิ้น', minQuantity: '0', category: '' });
    load();
  }

  async function handleMovement() {
    if (!movForm.itemId || !movForm.quantity || !showMovement) return;
    setSaving(true);
    const h = await headers();
    await fetch(backendUrl('/tmc/stock'), {
      method: 'POST', headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, movementType: showMovement, ...movForm }),
    });
    setSaving(false);
    setShowMovement(null);
    setMovForm({ itemId: '', quantity: '', propertyCode: '', note: '' });
    load();
  }

  const lowStock = items.filter(i => i.current_qty <= i.min_quantity && i.min_quantity > 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Stock คลังสินค้า</h1>
          <p className="text-sm text-gray-500">TMC Management</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowMovement('out')} className="gap-1 text-red-600 border-red-200">
            <ArrowUp className="w-4 h-4" /> เบิกออก
          </Button>
          <Button variant="outline" onClick={() => setShowMovement('in')} className="gap-1 text-green-600 border-green-200">
            <ArrowDown className="w-4 h-4" /> รับเข้า
          </Button>
          <Button onClick={() => setShowAddItem(true)} className="gap-1">
            <Plus className="w-4 h-4" /> เพิ่มรายการ
          </Button>
        </div>
      </div>

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
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['items', 'movements'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'items' ? '📦 รายการสินค้า' : '📋 ประวัติรับ-เบิก'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
      ) : activeTab === 'items' ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">รายการ</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">หมวด</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">คงเหลือ</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">ขั้นต่ำ</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{item.category ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {item.current_qty} {item.unit}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">{item.min_quantity} {item.unit}</td>
                  <td className="px-4 py-3 text-center">
                    {item.min_quantity > 0 && item.current_qty <= item.min_quantity ? (
                      <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">⚠️ ใกล้หมด</span>
                    ) : (
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">✓ ปกติ</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">วันที่</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">รายการ</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">ประเภท</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">จำนวน</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">แปลง</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {movements.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(m.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="px-4 py-3 font-medium">{m.tmc_stock_items?.name}</td>
                  <td className="px-4 py-3 text-center">
                    {m.movement_type === 'in' && <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">รับเข้า</span>}
                    {m.movement_type === 'out' && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">เบิกออก</span>}
                    {m.movement_type === 'adjust' && <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">ปรับ</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{m.quantity} {m.tmc_stock_items?.unit}</td>
                  <td className="px-4 py-3 text-gray-500">{m.property_code ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{m.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold">เพิ่มรายการสินค้า</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ชื่อสินค้า *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">หน่วย</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">ขั้นต่ำ</label>
                  <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={itemForm.minQuantity} onChange={e => setItemForm(f => ({ ...f, minQuantity: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">หมวดหมู่</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={itemForm.category} onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="">—</option>
                  {STOCK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleAddItem} isLoading={saving} disabled={!itemForm.name}>บันทึก</Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowAddItem(false)}>ยกเลิก</Button>
            </div>
          </div>
        </div>
      )}

      {/* Movement Modal */}
      {showMovement && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold">
              {showMovement === 'in' ? '📥 รับสินค้าเข้า' : showMovement === 'out' ? '📤 เบิกสินค้าออก' : '🔧 ปรับยอด'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">รายการสินค้า *</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={movForm.itemId} onChange={e => setMovForm(f => ({ ...f, itemId: e.target.value }))}>
                  <option value="">เลือกสินค้า</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.current_qty} {i.unit})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">จำนวน *</label>
                  <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={movForm.quantity} onChange={e => setMovForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">แปลง</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={movForm.propertyCode} onChange={e => setMovForm(f => ({ ...f, propertyCode: e.target.value }))}>
                    <option value="">—</option>
                    {PROPERTY_CODES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={movForm.note} onChange={e => setMovForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleMovement} isLoading={saving}
                disabled={!movForm.itemId || !movForm.quantity}>บันทึก</Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowMovement(null)}>ยกเลิก</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
