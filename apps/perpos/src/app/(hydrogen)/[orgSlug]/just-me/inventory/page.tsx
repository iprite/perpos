'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { StatusBadge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty,
} from '@/components/ui/table';
import { OcrReceiveDialog } from './ocr-receive-dialog';
import {
  Package, Warehouse, ArrowLeftRight, History, AlertTriangle, Plus, Search,
  FileText, CheckCircle, TrendingUp, AlertCircle, Loader2, Scissors, Info,
  ScanLine,
} from 'lucide-react';
import cn from '@core/utils/class-names';

interface WarehouseData {
  id: string;
  name: string;
  type: 'central' | 'site';
  location_address: string | null;
  is_active: boolean;
  created_at: string;
}

interface InventoryItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  unit: string;
  has_serial: boolean;
  has_cable_measurement: boolean;
  conversion_rate: number;
  min_stock: number;
  created_at: string;
}

interface StockBalance {
  id: string;
  warehouse_id: string;
  item_id: string;
  quantity: number;
  updated_at: string;
}

interface ItemSerial {
  id: string;
  item_id: string;
  warehouse_id: string;
  serial_number: string;
  status: 'in_stock' | 'transferred' | 'issued' | 'returned';
  is_scrap: boolean;
  length_remaining: number | null;
  created_at: string;
}

interface StockMovement {
  id: string;
  item_id: string;
  movement_type: 'receive' | 'transfer' | 'issue' | 'return';
  source_warehouse_id: string | null;
  destination_warehouse_id: string | null;
  quantity: number;
  reference_no: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  creator: {
    id: string;
    display_name: string | null;
    email: string | null;
  } | null;
}

export default function JustMeInventoryPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // UI States
  const [activeTab, setActiveTab] = useState<'overview' | 'warehouses' | 'items' | 'movement' | 'scraps' | 'history'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data States
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [serials, setSerials] = useState<ItemSerial[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  // OCR dialog
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [orgId, setOrgId] = useState('');

  // Search Filters
  const [searchItem, setSearchItem] = useState('');
  const [searchSerial, setSearchSerial] = useState('');

  // Form States
  const [formWarehouse, setFormWarehouse] = useState({ name: '', type: 'site', location_address: '' });
  const [formItem, setFormItem] = useState({
    name: '', code: '', description: '', unit: 'ชิ้น',
    has_serial: false, has_cable_measurement: false, conversion_rate: '1', min_stock: '0'
  });
  const [unitSelection, setUnitSelection] = useState('ชิ้น');
  const [customUnit, setCustomUnit] = useState('');
  const [formMovement, setFormMovement] = useState({
    movement_type: 'receive', item_id: '', source_warehouse_id: '', destination_warehouse_id: '',
    quantity: '1', reference_no: '', note: '', serialsText: '', length_remaining: ''
  });
  const [formLoading, setFormLoading] = useState(false);

  const handleUnitSelectionChange = (val: string) => {
    setUnitSelection(val);
    if (val !== 'custom') {
      setFormItem((prev) => ({ ...prev, unit: val }));
    } else {
      setFormItem((prev) => ({ ...prev, unit: customUnit }));
    }
  };

  const handleCustomUnitChange = (val: string) => {
    setCustomUnit(val);
    setFormItem((prev) => ({ ...prev, unit: val }));
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single();

      if (orgErr || !org) throw new Error('ไม่พบข้อมูลองค์กร');

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('กรุณาเข้าสู่ระบบใหม่');

      setAuthToken(token);
      setOrgId(org.id);

      const res = await fetch(`/api/just-me/inventory?orgId=${org.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
      }

      const json = await res.json();
      setWarehouses(json.warehouses || []);
      setItems(json.items || []);
      setBalances(json.balances || []);
      setSerials(json.serials || []);
      setMovements(json.movements || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, orgSlug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Form Submit Handlers
  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setFormLoading(true);
      setError(null);
      setSuccess(null);

      const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/just-me/inventory?orgId=${org?.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'create_warehouse',
          ...formWarehouse,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'สร้างคลังสินค้าไม่สำเร็จ');

      setSuccess(`เพิ่มคลังสินค้า "${formWarehouse.name}" สำเร็จ`);
      setFormWarehouse({ name: '', type: 'site', location_address: '' });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setFormLoading(true);
      setError(null);
      setSuccess(null);

      const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/just-me/inventory?orgId=${org?.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'create_item',
          ...formItem,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'เพิ่มข้อมูลวัสดุ/สินค้าไม่สำเร็จ');

      setSuccess(`เพิ่มข้อมูลวัสดุ "${formItem.name}" สำเร็จ`);
      setFormItem({
        name: '', code: '', description: '', unit: 'ชิ้น',
        has_serial: false, has_cable_measurement: false, conversion_rate: '1', min_stock: '0'
      });
      setUnitSelection('ชิ้น');
      setCustomUnit('');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handlePostMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setFormLoading(true);
      setError(null);
      setSuccess(null);

      const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      // Frontend Validations for CustomSelect
      if (!formMovement.item_id) {
        setError('กรุณาเลือกสินค้า / วัสดุ');
        return;
      }
      if (['transfer', 'issue', 'return'].includes(formMovement.movement_type) && !formMovement.source_warehouse_id) {
        setError('กรุณาเลือกคลังต้นทาง');
        return;
      }
      if (['receive', 'transfer', 'return'].includes(formMovement.movement_type) && !formMovement.destination_warehouse_id) {
        setError('กรุณาเลือกคลังปลายทาง');
        return;
      }

      // Extract serials
      const serial_numbers = formMovement.serialsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/just-me/inventory?orgId=${org?.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'movement',
          ...formMovement,
          serial_numbers,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'บันทึกรายการเคลื่อนไหวไม่สำเร็จ');

      setSuccess('บันทึกรายการเคลื่อนไหวสต็อกสำเร็จ');
      setFormMovement({
        movement_type: 'receive', item_id: '', source_warehouse_id: '', destination_warehouse_id: '',
        quantity: '1', reference_no: '', note: '', serialsText: '', length_remaining: ''
      });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  // Memoized Calculations
  const stockOverviewList = useMemo(() => {
    return items.map((item) => {
      // Find total quantities across all warehouses
      const itemBalances = balances.filter((b) => b.item_id === item.id);
      const totalQty = itemBalances.reduce((sum, b) => sum + Number(b.quantity), 0);
      const isLow = totalQty < item.min_stock;

      return {
        ...item,
        totalQty,
        isLow,
        balances: itemBalances.map((b) => {
          const wh = warehouses.find((w) => w.id === b.warehouse_id);
          return {
            warehouseName: wh ? wh.name : 'ไม่พบชื่อคลัง',
            warehouseType: wh ? wh.type : 'site',
            qty: Number(b.quantity),
          };
        }),
      };
    });
  }, [items, balances, warehouses]);

  const lowStockItems = useMemo(() => {
    return stockOverviewList.filter((item) => item.isLow);
  }, [stockOverviewList]);

  const filteredOverview = useMemo(() => {
    return stockOverviewList.filter((item) => {
      return (
        item.name.toLowerCase().includes(searchItem.toLowerCase()) ||
        item.code.toLowerCase().includes(searchItem.toLowerCase())
      );
    });
  }, [stockOverviewList, searchItem]);

  const leftoverCables = useMemo(() => {
    return serials.filter((s) => {
      const item = items.find((i) => i.id === s.item_id);
      if (!item?.has_cable_measurement) return false;
      return (
        s.serial_number.toLowerCase().includes(searchSerial.toLowerCase()) ||
        item.name.toLowerCase().includes(searchSerial.toLowerCase())
      );
    });
  }, [serials, items, searchSerial]);

  // Helpers to format movement type labels
  const getMovementLabel = (type: string) => {
    switch (type) {
      case 'receive': return 'รับเข้า (Receive)';
      case 'transfer': return 'โอนย้าย (Transfer)';
      case 'issue': return 'เบิกใช้งาน (Issue)';
      case 'return': return 'คืนสินค้า (Return)';
      default: return type;
    }
  };

  const getMovementBadgeClass = (type: string) => {
    switch (type) {
      case 'receive': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'transfer': return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
      case 'issue': return 'bg-rose-50 text-rose-700 border border-rose-200';
      case 'return': return 'bg-amber-50 text-amber-700 border border-amber-200';
      default: return 'bg-slate-50 text-slate-700';
    }
  };

  const fmtDateTime = (iso: string) => {
    return new Date(iso).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Bangkok'
    }) + ' น.';
  };

  // Find selected item in movement form
  const selectedFormItemObj = useMemo(() => {
    return items.find((i) => i.id === formMovement.item_id);
  }, [items, formMovement.item_id]);

  // Memoized Select Options
  const itemOptions = useMemo(() => {
    return items.map((i) => ({
      value: i.id,
      label: `${i.name} (${i.code})`
    }));
  }, [items]);

  const warehouseOptions = useMemo(() => {
    return warehouses.map((w) => ({
      value: w.id,
      label: `${w.name} (${w.type === 'central' ? 'คลังกลาง' : 'ไซต์งาน'})`
    }));
  }, [warehouses]);

  return (
    <PageShell
      width="full"
      icon={<Warehouse className="h-6 w-6" />}
      title="ระบบคลังสินค้า & สต๊อกวัสดุ"
      description="จัดการคลังสินค้ากลาง ไซต์งาน และสายไฟเหลือใช้"
      actions={
        <>
          <Button
            size="sm"
            onClick={() => setOcrDialogOpen(true)}
            disabled={loading || warehouses.length === 0}
            className="gap-1.5"
          >
            <ScanLine className="h-4 w-4" />
            สแกนบิลรับของ
          </Button>
        </>
      }
    >

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 leading-normal">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Tabs */}
          <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg w-fit">
            {[
              { id: 'overview',   label: 'สรุปภาพรวม',        icon: <TrendingUp className="h-4 w-4" /> },
              { id: 'warehouses', label: 'คลังสินค้า & ไซต์', icon: <Warehouse className="h-4 w-4" /> },
              { id: 'items',      label: 'วัสดุ/สินค้า',       icon: <Package className="h-4 w-4" /> },
              { id: 'movement',   label: 'เบิก/โอน',           icon: <ArrowLeftRight className="h-4 w-4" /> },
              { id: 'scraps',     label: 'เศษสายไฟ',           icon: <Scissors className="h-4 w-4" /> },
              { id: 'history',    label: 'ประวัติ',             icon: <History className="h-4 w-4" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as any); setError(null); setSuccess(null); }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {/* TAB CONTENT: Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              
              {/* Alert for Low Stock */}
              {lowStockItems.length > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">⚠️ แจ้งเตือนสินค้าต่ำกว่าจุดสั่งซื้อต่ำสุด (Safety Stock)</p>
                    <div className="text-xs text-amber-700/90 pl-1 space-y-1">
                      {lowStockItems.map((item) => (
                        <p key={item.id}>
                          • <strong>{item.name} ({item.code})</strong>: คงเหลือรวม {item.totalQty} {item.unit} (ขั้นต่ำที่ต้องมี: {item.min_stock} {item.unit})
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Grid overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border p-5 space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Package className="h-5 w-5 text-indigo-500" />
                      รายงานสต็อกคงเหลือแยกคลัง/ไซต์งาน
                    </h2>
                    
                    <div className="relative w-48">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 z-10" />
                      <Input
                        type="text"
                        placeholder="ค้นหาวัสดุ..."
                        value={searchItem}
                        onChange={(e) => setSearchItem(e.target.value)}
                        className="pl-8 text-xs bg-slate-50 border-slate-200 h-8"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 overflow-y-auto max-h-[400px] pr-1">
                    {filteredOverview.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-sm">ไม่พบวัสดุที่ต้องการ</div>
                    ) : (
                      filteredOverview.map((item) => (
                        <div key={item.id} className="p-3 border rounded-xl bg-slate-50/50 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-sm text-slate-800">{item.name}</p>
                              <code className="text-[11px] font-mono text-slate-400">{item.code}</code>
                            </div>
                            <span className={cn(
                              "text-xs px-2.5 py-0.5 rounded-full font-bold",
                              item.isLow ? "bg-red-50 text-red-600 border border-red-200" : "bg-emerald-50 text-emerald-600 border border-emerald-200"
                            )}>
                              รวม {item.totalQty} {item.unit}
                            </span>
                          </div>

                          <div className="text-xs border-t pt-2 space-y-1.5">
                            {item.balances.length === 0 ? (
                              <p className="text-slate-400 italic pl-2">ไม่มีของในคลังใดเลย</p>
                            ) : (
                              item.balances.map((bal, idx) => (
                                <div key={idx} className="flex justify-between text-slate-600 pl-2">
                                  <span>{bal.warehouseName} ({bal.warehouseType === 'central' ? 'คลังกลาง' : 'ไซต์งาน'})</span>
                                  <span className="font-semibold text-slate-800">{bal.qty} {item.unit}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-xl border p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 border-b pb-3">
                    <Info className="h-5 w-5 text-indigo-500" />
                    ข้อมูลสรุปสต็อก
                  </h2>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 border rounded-xl text-center">
                      <p className="text-2xl font-bold text-slate-800">{warehouses.length}</p>
                      <p className="text-xs text-slate-400 mt-1">คลังทั้งหมด</p>
                    </div>
                    <div className="p-4 border rounded-xl text-center">
                      <p className="text-2xl font-bold text-slate-800">{items.length}</p>
                      <p className="text-xs text-slate-400 mt-1">รายการวัสดุ</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/50 text-xs text-indigo-900 leading-relaxed space-y-2">
                    <p className="font-bold">💡 คำแนะนำสำหรับการคุมสต็อกงานระบบไฟฟ้า:</p>
                    <p>• <strong>สายไฟ (Cables)</strong>: ควรบันทึกรหัสแยกขนาด หากเบิกใช้เป็นเมตร จะถูกหักจากความยาวม้วนที่เก็บในระบบ</p>
                    <p>• <strong>Serial Number</strong>: เหมาะกับอุปกรณ์ราคาสูง เช่น ตู้ไฟ, Inverter โซลาร์เซลล์ เพื่อให้สามารถติดตามประวัติและรับประกันได้</p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB CONTENT: Warehouses */}
          {activeTab === 'warehouses' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Form Create */}
              <div className="lg:col-span-1 bg-white rounded-xl border p-5 space-y-4 h-fit">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 border-b pb-3">
                  <Plus className="h-5 w-5 text-indigo-500" />
                  เพิ่มคลังสินค้า / ไซต์งาน
                </h2>
                
                <form onSubmit={handleCreateWarehouse} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="wh-name">ชื่อคลังสินค้า / ไซต์งาน *</Label>
                    <Input
                      id="wh-name"
                      placeholder="เช่น คลังกลางสำนักงาน, ไซต์คอนโด A"
                      value={formWarehouse.name}
                      onChange={(e) => setFormWarehouse({ ...formWarehouse, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wh-type">ประเภทคลัง</Label>
                    <CustomSelect
                      value={formWarehouse.type}
                      onChange={(val) => setFormWarehouse({ ...formWarehouse, type: val as 'central' | 'site' })}
                      options={[
                        { value: 'site', label: 'ไซต์งาน (Site Storage)' },
                        { value: 'central', label: 'คลังกลาง (Central Warehouse)' },
                      ]}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wh-addr">ที่อยู่ / พิกัดสถานที่</Label>
                    <Input
                      id="wh-addr"
                      placeholder="ที่ตั้งคลัง หรือ ไซต์ก่อสร้าง"
                      value={formWarehouse.location_address}
                      onChange={(e) => setFormWarehouse({ ...formWarehouse, location_address: e.target.value })}
                    />
                  </div>

                  <Button type="submit" className="w-full font-bold" disabled={formLoading}>
                    {formLoading ? 'กำลังบันทึก…' : 'บันทึกข้อมูลคลัง'}
                  </Button>
                </form>
              </div>

              {/* List */}
              <div className="lg:col-span-2 bg-white rounded-xl border overflow-hidden">
                <div className="border-b px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-700">คลังสินค้าและไซต์งานปัจจุบัน</h2>
                </div>

                <Table wrapperClassName="rounded-none border-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead>ชื่อคลัง / ไซต์งาน</TableHead>
                      <TableHead>ประเภท</TableHead>
                      <TableHead>ที่อยู่</TableHead>
                      <TableHead>สถานะ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {warehouses.map((wh) => (
                      <TableRow key={wh.id}>
                        <TableCell className="font-bold text-slate-800">{wh.name}</TableCell>
                        <TableCell>
                          <StatusBadge tone={wh.type === 'central' ? 'success' : 'info'}>
                            {wh.type === 'central' ? 'คลังกลาง (Central)' : 'ไซต์งาน (Site)'}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="max-w-xs text-xs text-slate-500">{wh.location_address || '—'}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            ใช้งานอยู่
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

            </div>
          )}

          {/* TAB CONTENT: Items */}
          {activeTab === 'items' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Form Create */}
              <div className="lg:col-span-1 bg-white rounded-xl border p-5 space-y-4 h-fit">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 border-b pb-3">
                  <Plus className="h-5 w-5 text-indigo-500" />
                  เพิ่มวัสดุ / สินค้าคลัง
                </h2>
                
                <form onSubmit={handleCreateItem} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="item-code">รหัสสินค้า / SKU *</Label>
                    <Input
                      id="item-code"
                      placeholder="เช่น CABLE-THW-1X4, LOAD-12WAY"
                      value={formItem.code}
                      onChange={(e) => setFormItem({ ...formItem, code: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="item-name">ชื่อวัสดุ / สินค้า *</Label>
                    <Input
                      id="item-name"
                      placeholder="เช่น สายไฟ THW 1x4 ตร.มม., ตู้คอนซูมเมอร์ 12 ช่อง"
                      value={formItem.name}
                      onChange={(e) => setFormItem({ ...formItem, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="item-desc">คำอธิบาย</Label>
                    <Input
                      id="item-desc"
                      placeholder="รายละเอียด สเปกสินค้า"
                      value={formItem.description}
                      onChange={(e) => setFormItem({ ...formItem, description: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="item-unit">หน่วยนับพื้นฐาน *</Label>
                    <CustomSelect
                      value={unitSelection}
                      onChange={handleUnitSelectionChange}
                      options={[
                        { value: 'ชิ้น', label: 'ชิ้น (Pieces)' },
                        { value: 'เมตร', label: 'เมตร (Meters)' },
                        { value: 'ม้วน', label: 'ม้วน (Rolls)' },
                        { value: 'เครื่อง', label: 'เครื่อง (Machines)' },
                        { value: 'ชุด', label: 'ชุด (Sets)' },
                        { value: 'กล่อง', label: 'กล่อง (Boxes)' },
                        { value: 'custom', label: 'อื่นๆ (ระบุเอง)' }
                      ]}
                    />
                    {unitSelection === 'custom' && (
                      <div className="pt-2">
                        <Input
                          placeholder="ระบุหน่วยนับ เช่น ถุง, กิโลกรัม"
                          value={customUnit}
                          onChange={(e) => handleCustomUnitChange(e.target.value)}
                          required
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="item-min">จุดสั่งซื้อขั้นต่ำ (Safety Stock)</Label>
                    <Input
                      id="item-min"
                      type="number"
                      value={formItem.min_stock}
                      onChange={(e) => setFormItem({ ...formItem, min_stock: e.target.value })}
                    />
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl space-y-3 border text-xs">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="item-serial" className="cursor-pointer font-bold text-slate-700">ต้องการคุม Serial Number</Label>
                      <input
                        id="item-serial"
                        type="checkbox"
                        checked={formItem.has_serial}
                        onChange={(e) => setFormItem({ ...formItem, has_serial: e.target.checked })}
                        className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="item-cable" className="cursor-pointer font-bold text-slate-700">เป็นสินค้าวัดความยาว (สายไฟ)</Label>
                      <input
                        id="item-cable"
                        type="checkbox"
                        checked={formItem.has_cable_measurement}
                        onChange={(e) => setFormItem({ ...formItem, has_cable_measurement: e.target.checked })}
                        className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>

                    {formItem.has_cable_measurement && (
                      <div className="space-y-1.5 pt-2 border-t mt-2">
                        <Label htmlFor="item-conv">อัตราแปลงหน่วย (เช่น 1 ม้วน = กี่เมตร)</Label>
                        <Input
                          id="item-conv"
                          type="number"
                          value={formItem.conversion_rate}
                          onChange={(e) => setFormItem({ ...formItem, conversion_rate: e.target.value })}
                          placeholder="ปกติคือ 1"
                        />
                      </div>
                    )}
                  </div>

                  <Button type="submit" className="w-full font-bold" disabled={formLoading}>
                    {formLoading ? 'กำลังบันทึก…' : 'บันทึกข้อมูลสินค้า'}
                  </Button>
                </form>
              </div>

              {/* List */}
              <div className="lg:col-span-2 bg-white rounded-xl border overflow-hidden">
                <div className="border-b px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-700">ข้อมูลวัสดุทั้งหมด</h2>
                </div>

                <Table wrapperClassName="rounded-none border-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead>รหัสวัสดุ</TableHead>
                      <TableHead>ชื่อ</TableHead>
                      <TableHead>หน่วย</TableHead>
                      <TableHead>การติดตาม</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs font-bold text-indigo-600">{item.code}</TableCell>
                        <TableCell className="font-bold text-slate-800">
                          <p>{item.name}</p>
                          {item.description && <p className="text-[11px] font-normal text-slate-400">{item.description}</p>}
                        </TableCell>
                        <TableCell className="text-slate-600">{item.unit}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex gap-1">
                            {item.has_serial && <StatusBadge tone="success">Serial Number</StatusBadge>}
                            {item.has_cable_measurement && <StatusBadge tone="info">ตัดเมตร (เศษ {item.conversion_rate})</StatusBadge>}
                            {!item.has_serial && !item.has_cable_measurement && <span className="italic text-slate-400">นับชิ้นปกติ</span>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

            </div>
          )}

          {/* TAB CONTENT: Movement Form */}
          {activeTab === 'movement' && (
            <div className="max-w-2xl mx-auto bg-white rounded-xl border p-6 space-y-5">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 border-b pb-3">
                <ArrowLeftRight className="h-5 w-5 text-indigo-500" />
                ทำรายการรับเข้า / เบิกจ่าย / โอนย้ายสินค้า
              </h2>

              <form onSubmit={handlePostMovement} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="mov-type">ประเภทรายการ *</Label>
                    <CustomSelect
                      value={formMovement.movement_type}
                      onChange={(val) => setFormMovement({
                        ...formMovement,
                        movement_type: val,
                        source_warehouse_id: ['transfer', 'issue', 'return'].includes(val) ? formMovement.source_warehouse_id : '',
                        destination_warehouse_id: ['receive', 'transfer', 'return'].includes(val) ? formMovement.destination_warehouse_id : '',
                      })}
                      options={[
                        { value: 'receive', label: 'รับเข้าคลังกลาง (Receive from Supplier)' },
                        { value: 'transfer', label: 'โอนย้ายสต็อก (Transfer between locations)' },
                        { value: 'issue', label: 'เบิกไปใช้งานที่ไซต์ (Issue to Cost)' },
                        { value: 'return', label: 'คืนของที่ไซต์เหลือมาคลังกลาง (Return to Warehouse)' },
                      ]}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="mov-item">เลือกสินค้า / วัสดุ *</Label>
                    <CustomSelect
                      value={formMovement.item_id}
                      onChange={(val) => setFormMovement({ ...formMovement, item_id: val })}
                      options={itemOptions}
                      placeholder="— กรุณาเลือกสินค้า —"
                    />
                  </div>
                </div>

                {/* Warehouse Fields based on movement type */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Source Warehouse */}
                  {['transfer', 'issue', 'return'].includes(formMovement.movement_type) && (
                    <div className="space-y-1.5">
                      <Label htmlFor="mov-src">คลังต้นทาง *</Label>
                      <CustomSelect
                        value={formMovement.source_warehouse_id}
                        onChange={(val) => setFormMovement({ ...formMovement, source_warehouse_id: val })}
                        options={warehouseOptions}
                        placeholder="— เลือกคลังต้นทาง —"
                      />
                    </div>
                  )}

                  {/* Destination Warehouse */}
                  {['receive', 'transfer', 'return'].includes(formMovement.movement_type) && (
                    <div className="space-y-1.5">
                      <Label htmlFor="mov-dest">คลังปลายทาง *</Label>
                      <CustomSelect
                        value={formMovement.destination_warehouse_id}
                        onChange={(val) => setFormMovement({ ...formMovement, destination_warehouse_id: val })}
                        options={warehouseOptions}
                        placeholder="— เลือกคลังปลายทาง —"
                      />
                    </div>
                  )}
                </div>

                {/* Quantity and reference */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="mov-qty">จำนวนสินค้า ({selectedFormItemObj ? selectedFormItemObj.unit : 'ชิ้น'}) *</Label>
                    <Input
                      id="mov-qty"
                      type="number"
                      value={formMovement.quantity}
                      onChange={(e) => setFormMovement({ ...formMovement, quantity: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="mov-ref">เลขที่เอกสารอ้างอิง (PO / DO / จ็อบ)</Label>
                    <Input
                      id="mov-ref"
                      placeholder="เช่น PO-2026-001"
                      value={formMovement.reference_no}
                      onChange={(e) => setFormMovement({ ...formMovement, reference_no: e.target.value })}
                    />
                  </div>
                </div>

                {/* Serial and Wire length sections */}
                {selectedFormItemObj && (selectedFormItemObj.has_serial || selectedFormItemObj.has_cable_measurement) && (
                  <div className="p-4 bg-slate-50 border rounded-xl space-y-3 text-xs">
                    <p className="font-bold text-slate-800 flex items-center gap-1">
                      <Info className="h-4 w-4 text-indigo-500" />
                      สินค้าตัวนี้ต้องการข้อมูลสลาก (Serial/Cable info)
                    </p>

                    {selectedFormItemObj.has_serial && (
                      <div className="space-y-1.5">
                        <Label htmlFor="mov-serials" className="font-bold text-slate-700">Serial Numbers (บรรทัดละ 1 รหัสให้ครบตามจำนวนที่สั่ง) *</Label>
                        <textarea
                          id="mov-serials"
                          rows={4}
                          value={formMovement.serialsText}
                          onChange={(e) => setFormMovement({ ...formMovement, serialsText: e.target.value })}
                          placeholder="เช่น&#10;SN-882792837&#10;SN-882792838"
                          className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs focus:border-indigo-500 focus:ring-indigo-500"
                        />
                      </div>
                    )}

                    {selectedFormItemObj.has_cable_measurement && ['receive', 'issue'].includes(formMovement.movement_type) && (
                      <div className="space-y-1.5">
                        <Label htmlFor="mov-len" className="font-bold text-slate-700">
                          {formMovement.movement_type === 'receive' ? 'ความยาวสายไฟรับเข้า (เมตร)' : 'ความยาวสายไฟที่เหลือกลับเข้าสต็อก (เมตร)'}
                        </Label>
                        <Input
                          id="mov-len"
                          type="number"
                          value={formMovement.length_remaining}
                          onChange={(e) => setFormMovement({ ...formMovement, length_remaining: e.target.value })}
                          placeholder="ปล่อยว่างหากรับเข้าม้วนเต็ม"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="mov-note">หมายเหตุ</Label>
                  <Input
                    id="mov-note"
                    placeholder="เช่น เบิกไปงานติดตั้งชั้น 2"
                    value={formMovement.note}
                    onChange={(e) => setFormMovement({ ...formMovement, note: e.target.value })}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={formLoading}>
                  {formLoading ? 'กำลังบันทึก…' : 'ยืนยันบันทึกรายการสต็อก'}
                </Button>
              </form>
            </div>
          )}

          {/* TAB CONTENT: Leftover Cables */}
          {activeTab === 'scraps' && (
            <div className="bg-white rounded-xl border p-5 space-y-4">
              <div className="flex items-center justify-between border-b pb-3 flex-wrap gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Scissors className="h-5 w-5 text-rose-500" />
                    สต็อกสายไฟเหลือใช้ และเศษสายไฟ (Leftover & Scraps)
                  </h2>
                  <p className="text-xs text-slate-400">รายการสายไฟที่ตัดแบ่งใช้แล้ว และมีเศษความยาวที่ใช้งานเฉพาะจุดย่อยได้</p>
                </div>

                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 z-10" />
                  <Input
                    placeholder="ค้นหารหัสเศษ/สายไฟ..."
                    value={searchSerial}
                    onChange={(e) => setSearchSerial(e.target.value)}
                    className="pl-8 py-1.5 text-xs bg-slate-50 border-slate-200"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table wrapperClassName="rounded-none border-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead>รหัสสายไฟ (Tag)</TableHead>
                      <TableHead>ชนิดสินค้า</TableHead>
                      <TableHead>คลังปัจจุบัน</TableHead>
                      <TableHead align="right">ความยาวเหลือ (เมตร)</TableHead>
                      <TableHead>สถานะ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leftoverCables.length === 0 ? (
                      <TableEmpty colSpan={5}>ไม่มีข้อมูลเศษสายไฟในระบบ</TableEmpty>
                    ) : leftoverCables.map((s) => {
                      const item = items.find((i) => i.id === s.item_id);
                      const wh = warehouses.find((w) => w.id === s.warehouse_id);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs font-bold text-slate-800">{s.serial_number}</TableCell>
                          <TableCell className="font-bold text-slate-800">{item ? item.name : '—'}</TableCell>
                          <TableCell className="text-slate-600">{wh ? wh.name : 'ไม่พบชื่อคลัง'}</TableCell>
                          <TableCell align="right" tabular className="font-black text-slate-800">
                            {s.length_remaining !== null ? `${s.length_remaining} เมตร` : '—'}
                          </TableCell>
                          <TableCell>
                            {s.is_scrap
                              ? <StatusBadge tone="danger">เศษสั้น (Scrap &lt; 5m)</StatusBadge>
                              : <StatusBadge tone="success">ม้วนตัดแบ่งใช้ (In Stock)</StatusBadge>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* TAB CONTENT: History */}
          {activeTab === 'history' && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-700">ประวัติการทำรายการเดินคลังทั้งหมด</h2>
              </div>

              <Table wrapperClassName="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่ / เวลา</TableHead>
                    <TableHead>ประเภทรายการ</TableHead>
                    <TableHead>สินค้า</TableHead>
                    <TableHead align="right">จำนวน</TableHead>
                    <TableHead>จากคลัง</TableHead>
                    <TableHead>ไปยังคลัง</TableHead>
                    <TableHead>เอกสารอ้างอิง / ผู้ทำรายการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableEmpty colSpan={7}>ยังไม่มีรายการบันทึก</TableEmpty>
                  ) : movements.map((mov) => {
                    const item = items.find((i) => i.id === mov.item_id);
                    const src = warehouses.find((w) => w.id === mov.source_warehouse_id);
                    const dest = warehouses.find((w) => w.id === mov.destination_warehouse_id);
                    return (
                      <TableRow key={mov.id}>
                        <TableCell className="text-xs text-slate-500">{fmtDateTime(mov.created_at)}</TableCell>
                        <TableCell>
                          <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", getMovementBadgeClass(mov.movement_type))}>
                            {getMovementLabel(mov.movement_type)}
                          </span>
                        </TableCell>
                        <TableCell className="font-bold text-slate-800">{item ? item.name : 'ไม่พบชื่อสินค้า'}</TableCell>
                        <TableCell align="right" tabular className="font-black text-slate-800">{mov.quantity} {item ? item.unit : 'ชิ้น'}</TableCell>
                        <TableCell className="text-xs text-slate-500">{src ? src.name : '—'}</TableCell>
                        <TableCell className="text-xs text-slate-500">{dest ? dest.name : '—'}</TableCell>
                        <TableCell className="text-xs">
                          {mov.reference_no && <p className="font-bold text-slate-700">อ้างอิง: {mov.reference_no}</p>}
                          <p className="text-slate-400">โดย: {mov.creator?.display_name || 'ไม่ระบุชื่อ'}</p>
                          {mov.note && <p className="italic text-slate-500">โน้ต: {mov.note}</p>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

        </div>
      )}
      {ocrDialogOpen && (
        <OcrReceiveDialog
          open={ocrDialogOpen}
          onClose={() => setOcrDialogOpen(false)}
          onSaved={async () => {
            setOcrDialogOpen(false);
            setSuccess('บันทึกรับของเข้าคลังสำเร็จ');
            await loadData();
          }}
          orgId={orgId}
          authToken={authToken}
          existingItemNames={items.map(i => i.name)}
          warehouseOptions={warehouseOptions}
        />
      )}
    </PageShell>
  );
}
