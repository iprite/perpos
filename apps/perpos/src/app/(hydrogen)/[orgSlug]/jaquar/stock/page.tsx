'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { Input } from '@/components/ui/input';
import { CustomSelect } from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Search,
  Plus,
  RefreshCw,
  FileSpreadsheet,
  Edit2,
  Trash2,
  PlusCircle,
  MinusCircle,
  History,
  MapPin,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  PackageX,
  Loader2,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export default function JaquarStockPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // Org ID
  const [orgId, setOrgId] = useState<string | null>(null);

  // Lists and stats
  const [items, setItems] = useState<any[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;

  // Selected item details (for ledger/history)
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Form states
  const [addItemForm, setAddItemForm] = useState({
    item_code: '',
    description: '',
    location: '',
    amount_starting: 0,
    import_jaquar: 0,
    return_borrowed: 0,
  });

  const [editItemForm, setEditItemForm] = useState({
    id: '',
    item_code: '',
    description: '',
    location: '',
    amount_starting: 0,
    import_jaquar: 0,
    return_borrowed: 0,
  });

  const [adjustForm, setAdjustForm] = useState({
    itemId: '',
    qty: '',
    movement_type: 'out', // 'in' | 'out'
    movement_date: new Date().toISOString().split('T')[0],
    reference: '',
  });

  // CSV Import States
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [overwriteOnImport, setOverwriteOnImport] = useState(false);
  const [parsedSummary, setParsedSummary] = useState<{
    itemsCount: number;
    movementsCount: number;
    items: any[];
    movements: any[];
  } | null>(null);
  const [importing, setImporting] = useState(false);

  // 1. Fetch organization ID
  useEffect(() => {
    async function loadOrg() {
      const { data, error } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single();
      if (error) {
        toast.error('ไม่พบข้อมูลองค์กร');
      } else {
        setOrgId(data.id);
      }
    }
    loadOrg();
  }, [supabase, orgSlug]);

  // 2. Fetch stock items
  const fetchItems = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Session Expired');

      const offset = (page - 1) * limit;
      const url = `/api/jaquar/stock?orgId=${orgId}&search=${encodeURIComponent(search)}&location=${encodeURIComponent(locationFilter)}&status=${statusFilter}&limit=${limit}&offset=${offset}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('เกิดข้อผิดพลาดในการโหลดข้อมูล');

      const json = await res.json();
      setItems(json.items || []);
      setTotalItems(json.total || 0);
    } catch (err: any) {
      toast.error(err.message || 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  }, [orgId, search, locationFilter, statusFilter, page, supabase]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // 3. Add Item
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/jaquar/stock?orgId=${orgId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(addItemForm),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'บันทึกไม่สำเร็จ');

      toast.success('เพิ่มสินค้าสำเร็จ');
      setIsAddOpen(false);
      setAddItemForm({
        item_code: '',
        description: '',
        location: '',
        amount_starting: 0,
        import_jaquar: 0,
        return_borrowed: 0,
      });
      fetchItems();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // 4. Edit Item
  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/jaquar/stock?orgId=${orgId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editItemForm),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'แก้ไขไม่สำเร็จ');

      toast.success('แก้ไขข้อมูลสำเร็จ');
      setIsEditOpen(false);
      fetchItems();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // 5. Delete Item
  const handleDeleteItem = async (itemId: string) => {
    if (!orgId) return;
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบรายการสินค้านี้? ข้อมูลประวัติการเคลื่อนไหวจะถูกลบทั้งหมด')) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/jaquar/stock?orgId=${orgId}&id=${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'ลบไม่สำเร็จ');

      toast.success('ลบสินค้าสำเร็จ');
      fetchItems();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // 6. Record Movement (Adjustment)
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/jaquar/stock/movement?orgId=${orgId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          item_id: adjustForm.itemId,
          qty: Number(adjustForm.qty),
          movement_type: adjustForm.movement_type,
          movement_date: adjustForm.movement_date,
          reference: adjustForm.reference,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'บันทึกรายการเคลื่อนไหวไม่สำเร็จ');

      toast.success('บันทึกปรับปรุงสต๊อกสำเร็จ');
      setIsAdjustOpen(false);
      fetchItems();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // 7. Load Ledger/History
  const loadHistory = async (item: any) => {
    setSelectedItem(item);
    setIsHistoryOpen(true);
    if (!orgId) return;
    try {
      setLoadingMovements(true);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/jaquar/stock/movement?orgId=${orgId}&itemId=${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'โหลดประวัติล้มเหลว');

      setMovements(json.movements || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingMovements(false);
    }
  };

  // 8. Custom CSV parsing logic
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        // Simple CSV parser supporting quotes
        const lines = text.split(/\r?\n/);
        const parsedRows: string[][] = [];

        for (const line of lines) {
          if (!line.trim()) continue;
          const row: string[] = [];
          let inQuotes = false;
          let current = '';

          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              row.push(current.replace(/^"|"$/g, '').trim());
              current = '';
            } else {
              current += char;
            }
          }
          row.push(current.replace(/^"|"$/g, '').trim());
          parsedRows.push(row);
        }

        if (parsedRows.length < 2) {
          toast.error('ไฟล์ CSV ไม่มีข้อมูลเพียงพอ');
          return;
        }

        const headersRow = parsedRows[0];
        const dataRows = parsedRows.slice(1);

        // Date columns parse helpers
        const dateCols: { colIdx: number; name: string; date: string }[] = [];
        const cleanNum = (val: string) => {
          const valClean = val.replace(',', '').replace(' ', '').trim();
          return valClean ? parseFloat(valClean) : 0;
        };

        const parseHeaderDate = (h: string) => {
          const match = re_date.exec(h);
          if (match) {
            const [, d, m, y] = match;
            return `20${y}-${m}-${d}`;
          }
          if (h.toLowerCase().includes('dubai')) {
            return '2026-05-01';
          }
          return null;
        };

        const re_date = /(\d{2})\.(\d{2})\.(\d{2})/;

        headersRow.forEach((h, idx) => {
          const parsed = parseHeaderDate(h);
          if (parsed && idx >= 8) {
            dateCols.push({ colIdx: idx, name: h.trim(), date: parsed });
          }
        });

        // Parse items and movements
        const itemsList: any[] = [];
        const movementsList: any[] = [];

        dataRows.forEach((row) => {
          if (row.length < 8) return;
          const item_code = row[0].trim();
          if (!item_code) return;

          const description = row[1].trim() || null;
          const amount_starting = cleanNum(row[2]);
          const location = row[4].trim() || null;
          const import_jaquar = cleanNum(row[5]);
          const return_borrowed = cleanNum(row[6]);
          const total_saleable = cleanNum(row[7]);

          itemsList.push({
            item_code,
            description,
            location,
            amount_starting,
            import_jaquar,
            return_borrowed,
            total_saleable,
          });

          // Check date movements
          dateCols.forEach((col) => {
            if (col.colIdx < row.length) {
              const qty = cleanNum(row[col.colIdx]);
              if (qty > 0) {
                movementsList.push({
                  item_code,
                  qty,
                  movement_type: 'out',
                  movement_date: col.date,
                  reference: col.name,
                });
              }
            }
          });
        });

        setParsedSummary({
          itemsCount: itemsList.length,
          movementsCount: movementsList.length,
          items: itemsList,
          movements: movementsList,
        });

        toast.success('วิเคราะห์ไฟล์สำเร็จ');
      } catch (err: any) {
        toast.error(`เกิดข้อผิดพลาดในการวิเคราะห์ไฟล์: ${err.message}`);
      }
    };

    // Use latin1 encoding as fallback for CSV containing non-utf8 characters
    reader.readAsText(file, 'latin1');
  };

  // 9. Execute CSV Import
  const handleImportCSV = async () => {
    if (!orgId || !parsedSummary) return;
    try {
      setImporting(true);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/jaquar/stock/import?orgId=${orgId}&overwrite=${overwriteOnImport}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: parsedSummary.items,
          movements: parsedSummary.movements,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'นำเข้าไม่สำเร็จ');

      toast.success(`นำเข้าสำเร็จ! สินค้า: ${json.itemsCount} รายการ, ประวัติ: ${json.movementsCount} รายการ`);
      setIsImportOpen(false);
      setCsvFile(null);
      setParsedSummary(null);
      setPage(1);
      fetchItems();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  const totalPages = Math.ceil(totalItems / limit);

  return (
    <PageShell
      width="wide"
      icon={<PackageCheck className="h-6 w-6" />}
      title="ระบบคลังสินค้า Jaquar"
      description="จัดการข้อมูลรายการสินค้า และบันทึกประวัติการเคลื่อนไหวสต๊อกสินค้า"
      actions={
        <>
          <Button variant="outline" onClick={() => setIsImportOpen(true)} className="flex items-center gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
            <FileSpreadsheet className="w-4 h-4" />
            นำเข้า CSV
          </Button>
          <Button onClick={() => setIsAddOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4" />
            เพิ่มสินค้าใหม่
          </Button>
        </>
      }
    >
      <Toaster position="top-right" />

      {/* Search & Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            placeholder="ค้นหา รหัสสินค้า/ชื่อสินค้า..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="relative">
          <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            placeholder="ตำแหน่งจัดเก็บ..."
            className="pl-9"
            value={locationFilter}
            onChange={(e) => {
              setLocationFilter(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <CustomSelect
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={[
            { value: '', label: 'ทุกสถานะสินค้า' },
            { value: 'in_stock', label: 'สินค้าพร้อมขาย (In Stock)' },
            { value: 'low_stock', label: 'สินค้าคงเหลือต่ำ (Low Stock < 5)' },
            { value: 'out_of_stock', label: 'สินค้าหมด (Out of Stock)' },
          ]}
        />
        <Button variant="secondary" onClick={() => {
          setSearch('');
          setLocationFilter('');
          setStatusFilter('');
          setPage(1);
        }} className="w-full flex items-center justify-center gap-2">
          ล้างตัวกรอง
        </Button>
      </div>

      {/* Items Table */}
      {loading ? (
        <div className="flex h-64 items-center justify-center bg-white border rounded-xl">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <span className="text-sm text-slate-500">กำลังโหลดรายการสินค้า...</span>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center bg-white border rounded-xl text-center p-6 space-y-3">
          <AlertCircle className="w-12 h-12 text-slate-300" />
          <div>
            <h3 className="font-semibold text-slate-800">ไม่พบสินค้า</h3>
            <p className="text-sm text-slate-500">ลองล้างตัวกรองหรืออัปโหลด CSV เริ่มต้นระบบ</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto bg-white border rounded-xl shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">รหัสสินค้า</TableHead>
                  <TableHead>รายละเอียดสินค้า</TableHead>
                  <TableHead className="w-36">ตำแหน่งจัดเก็บ</TableHead>
                  <TableHead className="text-right w-24">สต๊อกเริ่มต้น</TableHead>
                  <TableHead className="text-right w-20">ยอดนำเข้า</TableHead>
                  <TableHead className="text-right w-20">ยอดรับคืน</TableHead>
                  <TableHead className="text-right w-32">ยอดคงเหลือพร้อมขาย</TableHead>
                  <TableHead className="text-center w-36">การกระทำ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const qty = Number(item.total_saleable);
                  let statusBadge = (
                    <Badge variant="success" className="bg-emerald-50 text-emerald-700">
                      {qty.toLocaleString()} พร้อมขาย
                    </Badge>
                  );
                  if (qty === 0) {
                    statusBadge = (
                      <Badge variant="danger" className="bg-red-50 text-red-700 font-semibold">
                        หมดสต๊อก
                      </Badge>
                    );
                  } else if (qty < 5) {
                    statusBadge = (
                      <Badge variant="secondary" className="bg-amber-50 text-amber-700 font-medium">
                        {qty.toLocaleString()} ชิ้น (ต่ำ)
                      </Badge>
                    );
                  }

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono font-bold text-slate-800">{item.item_code}</TableCell>
                      <TableCell className="text-slate-600 max-w-sm truncate" title={item.description}>
                        {item.description || <span className="text-slate-300 italic">ไม่ได้ระบุ</span>}
                      </TableCell>
                      <TableCell>
                        {item.location ? (
                          <div className="flex flex-wrap gap-1">
                            {item.location.split(',').map((l: string, idx: number) => (
                              <Badge key={idx} className="bg-slate-100 text-slate-700 rounded text-[10px]">
                                {l.trim()}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-300 italic">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{Number(item.amount_starting).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-indigo-600">{Number(item.import_jaquar).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-emerald-600">{Number(item.return_borrowed).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">{statusBadge}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="ประวัติประมวลผลสต๊อก"
                            onClick={() => loadHistory(item)}
                            className="text-slate-600 hover:text-indigo-600"
                          >
                            <History className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="ปรับปรุงสต๊อก"
                            onClick={() => {
                              setAdjustForm({
                                itemId: item.id,
                                qty: '',
                                movement_type: 'out',
                                movement_date: new Date().toISOString().split('T')[0],
                                reference: '',
                              });
                              setSelectedItem(item);
                              setIsAdjustOpen(true);
                            }}
                            className="text-slate-600 hover:text-amber-600"
                          >
                            <PlusCircle className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="แก้ไขสินค้า"
                            onClick={() => {
                              setEditItemForm({
                                id: item.id,
                                item_code: item.item_code,
                                description: item.description || '',
                                location: item.location || '',
                                amount_starting: item.amount_starting,
                                import_jaquar: item.import_jaquar,
                                return_borrowed: item.return_borrowed,
                              });
                              setIsEditOpen(true);
                            }}
                            className="text-slate-600 hover:text-blue-600"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="ลบ"
                            onClick={() => handleDeleteItem(item.id)}
                            className="text-slate-600 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-4">
              <span className="text-sm text-slate-500">
                แสดงหน้า {page} จากทั้งหมด {totalPages} หน้า (จำนวนสินค้าทั้งหมด {totalItems} รายการ)
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Add Item */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>เพิ่มสินค้าสต๊อกใหม่</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddItem} className="space-y-4">
            <div>
              <Label htmlFor="item_code">รหัสสินค้า (Item Code) *</Label>
              <Input
                id="item_code"
                required
                value={addItemForm.item_code}
                onChange={(e) => setAddItemForm({ ...addItemForm, item_code: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="description">รายละเอียดสินค้า</Label>
              <Input
                id="description"
                value={addItemForm.description}
                onChange={(e) => setAddItemForm({ ...addItemForm, description: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="location">ตำแหน่งจัดเก็บ (ใช้จุลภาคกั้นหากอยู่หลายตำแหน่ง)</Label>
              <Input
                id="location"
                placeholder="เช่น A101, B202"
                value={addItemForm.location}
                onChange={(e) => setAddItemForm({ ...addItemForm, location: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="starting">สต๊อกตั้งต้น</Label>
                <Input
                  id="starting"
                  type="number"
                  value={addItemForm.amount_starting || ''}
                  onChange={(e) => setAddItemForm({ ...addItemForm, amount_starting: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="import">ยอดนำเข้า</Label>
                <Input
                  id="import"
                  type="number"
                  value={addItemForm.import_jaquar || ''}
                  onChange={(e) => setAddItemForm({ ...addItemForm, import_jaquar: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="return">ยอดรับคืน</Label>
                <Input
                  id="return"
                  type="number"
                  value={addItemForm.return_borrowed || ''}
                  onChange={(e) => setAddItemForm({ ...addItemForm, return_borrowed: Number(e.target.value) })}
                />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
                เพิ่มสินค้า
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Edit Item */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูลสินค้า</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditItem} className="space-y-4">
            <div>
              <Label>รหัสสินค้า: <span className="font-bold font-mono">{editItemForm.item_code}</span></Label>
            </div>
            <div>
              <Label htmlFor="edit_description">รายละเอียดสินค้า</Label>
              <Input
                id="edit_description"
                value={editItemForm.description}
                onChange={(e) => setEditItemForm({ ...editItemForm, description: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit_location">ตำแหน่งจัดเก็บ (ใช้จุลภาคกั้น)</Label>
              <Input
                id="edit_location"
                value={editItemForm.location}
                onChange={(e) => setEditItemForm({ ...editItemForm, location: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="edit_starting">สต๊อกตั้งต้น</Label>
                <Input
                  id="edit_starting"
                  type="number"
                  value={editItemForm.amount_starting}
                  onChange={(e) => setEditItemForm({ ...editItemForm, amount_starting: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="edit_import">ยอดนำเข้า</Label>
                <Input
                  id="edit_import"
                  type="number"
                  value={editItemForm.import_jaquar}
                  onChange={(e) => setEditItemForm({ ...editItemForm, import_jaquar: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="edit_return">ยอดรับคืน</Label>
                <Input
                  id="edit_return"
                  type="number"
                  value={editItemForm.return_borrowed}
                  onChange={(e) => setEditItemForm({ ...editItemForm, return_borrowed: Number(e.target.value) })}
                />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
                บันทึกการแก้ไข
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Adjust Stock */}
      <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ปรับปรุงสต๊อกสินค้า</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <form onSubmit={handleAdjustStock} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border text-sm space-y-1">
                <p>สินค้า: <span className="font-mono font-bold text-slate-800">{selectedItem.item_code}</span></p>
                <p>ชื่อ: <span className="text-slate-600">{selectedItem.description || '-'}</span></p>
                <p>ยอดปัจจุบัน: <span className="font-bold text-indigo-700">{Number(selectedItem.total_saleable).toLocaleString()} ชิ้น</span></p>
              </div>
              <div>
                <Label>ทิศทางปรับปรุงสต๊อก</Label>
                <div className="flex gap-4 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer border p-2.5 rounded-lg flex-1 hover:bg-slate-50 justify-center">
                    <input
                      type="radio"
                      name="movement_type"
                      value="out"
                      checked={adjustForm.movement_type === 'out'}
                      onChange={() => setAdjustForm({ ...adjustForm, movement_type: 'out' })}
                    />
                    <MinusCircle className="w-4 h-4 text-red-500" />
                    <span>จ่ายออก (Stock Out)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer border p-2.5 rounded-lg flex-1 hover:bg-slate-50 justify-center">
                    <input
                      type="radio"
                      name="movement_type"
                      value="in"
                      checked={adjustForm.movement_type === 'in'}
                      onChange={() => setAdjustForm({ ...adjustForm, movement_type: 'in' })}
                    />
                    <PlusCircle className="w-4 h-4 text-emerald-500" />
                    <span>รับเข้า (Stock In)</span>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="adjust_qty">จำนวนสต๊อก *</Label>
                  <Input
                    id="adjust_qty"
                    type="number"
                    min="1"
                    required
                    placeholder="เช่น 10"
                    value={adjustForm.qty}
                    onChange={(e) => setAdjustForm({ ...adjustForm, qty: e.target.value })}
                  />
                </div>
                <div>
                  <Label>วันที่ทำรายการ *</Label>
                  <ThaiDatePicker
                    value={adjustForm.movement_date}
                    onChange={(iso) => setAdjustForm({ ...adjustForm, movement_date: iso })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="adjust_ref">เอกสารอ้างอิง / โน้ต (Reference) *</Label>
                <Input
                  id="adjust_ref"
                  required
                  placeholder="เช่น Dubai, Order #10023, ปรับสต๊อกปลายปี"
                  value={adjustForm.reference}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reference: e.target.value })}
                />
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setIsAdjustOpen(false)}>
                  ยกเลิก
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
                  ยืนยันปรับปรุงสต๊อก
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal CSV Import */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>นำเข้าข้อมูลสต๊อกผ่าน CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 border border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center justify-center py-6 text-center space-y-2">
              <FileSpreadsheet className="w-10 h-10 text-slate-400" />
              <div className="text-xs text-slate-500">
                <p>รองรับไฟล์ CSV ตารางสต๊อกสินค้า (ITEM CODE, Item Des, Amount, Location, etc.)</p>
                <p className="mt-1 font-semibold text-indigo-600">ตัวอย่าง: Stock Update.csv</p>
              </div>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer pt-2"
              />
            </div>

            {parsedSummary && (
              <div className="p-3.5 bg-indigo-50 rounded-xl border border-indigo-100 text-xs space-y-2">
                <h4 className="font-semibold text-indigo-900 flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4" /> สรุปโครงสร้างการวิเคราะห์ไฟล์สำเร็จ
                </h4>
                <p>• รายการสินค้าทั้งหมด: <span className="font-bold text-slate-800">{parsedSummary.itemsCount.toLocaleString()} SKU</span></p>
                <p>• ประวัติการเคลื่อนไหวสต๊อก (ตรวจพบจากหัวตารางวันที่): <span className="font-bold text-slate-800">{parsedSummary.movementsCount.toLocaleString()} รายการ</span></p>
                <div className="flex items-center gap-2 pt-1 mt-1 border-t border-indigo-100">
                  <input
                    type="checkbox"
                    id="overwrite"
                    className="cursor-pointer"
                    checked={overwriteOnImport}
                    onChange={(e) => setOverwriteOnImport(e.target.checked)}
                  />
                  <label htmlFor="overwrite" className="cursor-pointer font-medium text-red-700">
                    ล้างข้อมูลสต๊อกและประวัติเดิมทั้งหมดก่อนนำเข้า (Overwrite Mode)
                  </label>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsImportOpen(false)} disabled={importing}>
                ยกเลิก
              </Button>
              <Button
                type="button"
                onClick={handleImportCSV}
                disabled={!parsedSummary || importing}
                className="bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    กำลังนำเข้าข้อมูล...
                  </>
                ) : (
                  'เริ่มนำเข้าข้อมูลสต๊อก'
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal History Ledger */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ประวัติการเดินคลังสินค้า (Stock Ledger)</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3.5 border rounded-xl text-xs space-y-1">
                <p>รหัสสินค้า: <span className="font-mono font-bold text-slate-800">{selectedItem.item_code}</span></p>
                <p>รายละเอียด: <span className="text-slate-600">{selectedItem.description || '-'}</span></p>
                <p>คลังเก็บ: <span className="text-slate-600">{selectedItem.location || '-'}</span></p>
              </div>

              {loadingMovements ? (
                <div className="flex h-48 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                </div>
              ) : movements.length === 0 ? (
                <div className="flex h-36 flex-col items-center justify-center text-slate-400 gap-1.5">
                  <PackageX className="w-10 h-10" />
                  <span className="text-xs">ยังไม่มีประวัติบันทึกการเคลื่อนไหวสต๊อกสินค้าชิ้นนี้</span>
                </div>
              ) : (
                <div className="overflow-x-auto bg-white border rounded-lg shadow-sm">
                  <Table className="text-xs">
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="py-2.5">วันที่ทำรายการ</TableHead>
                        <TableHead className="py-2.5">ประเภทธุรกรรม</TableHead>
                        <TableHead className="py-2.5 text-right">จำนวน</TableHead>
                        <TableHead className="py-2.5">โน้ต / เอกสารอ้างอิง</TableHead>
                        <TableHead className="py-2.5">ผู้ทำรายการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((mov) => {
                        const inOut = mov.movement_type === 'in';
                        return (
                          <TableRow key={mov.id}>
                            <TableCell className="py-2 font-mono">{mov.movement_date}</TableCell>
                            <TableCell className="py-2">
                              {inOut ? (
                                <Badge variant="success" className="bg-emerald-50 text-emerald-700 text-[10px] py-0">
                                  รับสินค้าเข้า (IN)
                                </Badge>
                              ) : (
                                <Badge variant="danger" className="bg-red-50 text-red-700 text-[10px] py-0">
                                  จ่ายออกจากคลัง (OUT)
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className={`py-2 text-right font-bold ${inOut ? 'text-emerald-700' : 'text-red-700'}`}>
                              {inOut ? '+' : '-'}{Number(mov.qty).toLocaleString()}
                            </TableCell>
                            <TableCell className="py-2 text-slate-700 font-medium">{mov.reference || '-'}</TableCell>
                            <TableCell className="py-2 text-slate-400 text-[10px]">System Admin</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
