"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
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
  Search,
  Plus,
  FileSpreadsheet,
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
} from "lucide-react";
import { toast } from "@/lib/toast";

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
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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
    item_code: "",
    description: "",
    location: "",
    amount_starting: 0,
    import_jaquar: 0,
    return_borrowed: 0,
  });

  const [editItemForm, setEditItemForm] = useState({
    id: "",
    item_code: "",
    description: "",
    location: "",
    amount_starting: 0,
    import_jaquar: 0,
    return_borrowed: 0,
  });

  const [adjustForm, setAdjustForm] = useState({
    itemId: "",
    qty: "",
    movement_type: "out", // 'in' | 'out'
    movement_date: new Date().toLocaleDateString("en-CA"), // YYYY-MM-DD ตาม local TZ
    reference: "",
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

  // Mutation in-flight guards (กัน double-submit)
  const [saving, setSaving] = useState(false);

  // ยืนยันลบสินค้า (Dialog แทน confirm())
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; item_code: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 1. Fetch organization ID
  useEffect(() => {
    async function loadOrg() {
      const { data, error } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", orgSlug)
        .single();
      if (error) {
        toast.error("ไม่พบข้อมูลองค์กร");
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
      if (!token) throw new Error("Session Expired");

      const offset = (page - 1) * limit;
      const url = `/api/jaquar/stock?orgId=${orgId}&search=${encodeURIComponent(search)}&location=${encodeURIComponent(locationFilter)}&status=${statusFilter}&limit=${limit}&offset=${offset}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("เกิดข้อผิดพลาดในการโหลดข้อมูล");

      const json = await res.json();
      setItems(json.items || []);
      setTotalItems(json.total || 0);
    } catch (err: any) {
      toast.error(err.message || "โหลดข้อมูลล้มเหลว");
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
    if (!orgId || saving) return;
    try {
      setSaving(true);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/jaquar/stock?orgId=${orgId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(addItemForm),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "บันทึกไม่สำเร็จ");

      toast.success("เพิ่มสินค้าสำเร็จ");
      setIsAddOpen(false);
      setAddItemForm({
        item_code: "",
        description: "",
        location: "",
        amount_starting: 0,
        import_jaquar: 0,
        return_borrowed: 0,
      });
      fetchItems();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // 4. Edit Item
  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || saving) return;
    try {
      setSaving(true);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/jaquar/stock?orgId=${orgId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editItemForm),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "แก้ไขไม่สำเร็จ");

      toast.success("แก้ไขข้อมูลสำเร็จ");
      setIsEditOpen(false);
      fetchItems();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // 5. Delete Item — เรียกจาก Dialog ยืนยัน
  const handleDeleteItem = async () => {
    if (!orgId || !deleteTarget || deleting) return;
    try {
      setDeleting(true);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/jaquar/stock?orgId=${orgId}&id=${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "ลบไม่สำเร็จ");

      toast.success("ลบสินค้าสำเร็จ");
      setDeleteTarget(null);
      fetchItems();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  // 6. Record Movement (Adjustment)
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || saving) return;
    try {
      setSaving(true);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/jaquar/stock/movement?orgId=${orgId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
      if (!res.ok) throw new Error(json.error || "บันทึกรายการเคลื่อนไหวไม่สำเร็จ");

      toast.success("บันทึกปรับปรุงสต๊อกสำเร็จ");
      setIsAdjustOpen(false);
      fetchItems();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
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
      if (!res.ok) throw new Error(json.error || "โหลดประวัติล้มเหลว");

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
          let current = "";

          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === "," && !inQuotes) {
              row.push(current.replace(/^"|"$/g, "").trim());
              current = "";
            } else {
              current += char;
            }
          }
          row.push(current.replace(/^"|"$/g, "").trim());
          parsedRows.push(row);
        }

        if (parsedRows.length < 2) {
          toast.error("ไฟล์ CSV ไม่มีข้อมูลเพียงพอ");
          return;
        }

        const headersRow = parsedRows[0];
        const dataRows = parsedRows.slice(1);

        // Date columns parse helpers
        const dateCols: { colIdx: number; name: string; date: string }[] = [];
        const cleanNum = (val: string) => {
          const valClean = val.replace(",", "").replace(" ", "").trim();
          return valClean ? parseFloat(valClean) : 0;
        };

        const parseHeaderDate = (h: string) => {
          const match = re_date.exec(h);
          if (match) {
            const [, d, m, y] = match;
            return `20${y}-${m}-${d}`;
          }
          if (h.toLowerCase().includes("dubai")) {
            return "2026-05-01";
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
                  movement_type: "out",
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

        toast.success("วิเคราะห์ไฟล์สำเร็จ");
      } catch (err: any) {
        toast.error(`เกิดข้อผิดพลาดในการวิเคราะห์ไฟล์: ${err.message}`);
      }
    };

    // Use latin1 encoding as fallback for CSV containing non-utf8 characters
    reader.readAsText(file, "latin1");
  };

  // 9. Execute CSV Import
  const handleImportCSV = async () => {
    if (!orgId || !parsedSummary) return;
    try {
      setImporting(true);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(
        `/api/jaquar/stock/import?orgId=${orgId}&overwrite=${overwriteOnImport}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            items: parsedSummary.items,
            movements: parsedSummary.movements,
          }),
        },
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "นำเข้าไม่สำเร็จ");

      toast.success(
        `นำเข้าสำเร็จ! สินค้า: ${json.itemsCount} รายการ, ประวัติ: ${json.movementsCount} รายการ`,
      );
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
          <Button
            variant="outline"
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            นำเข้า CSV
          </Button>
          <Button onClick={() => setIsAddOpen(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            เพิ่มสินค้าใหม่
          </Button>
        </>
      }
    >
      {/* Search & Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2 md:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
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
          <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
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
            { value: "", label: "ทุกสถานะสินค้า" },
            { value: "in_stock", label: "สินค้าพร้อมขาย (In Stock)" },
            { value: "low_stock", label: "สินค้าคงเหลือต่ำ (Low Stock < 5)" },
            { value: "out_of_stock", label: "สินค้าหมด (Out of Stock)" },
          ]}
        />
        <Button
          variant="secondary"
          onClick={() => {
            setSearch("");
            setLocationFilter("");
            setStatusFilter("");
            setPage(1);
          }}
          className="flex w-full items-center justify-center gap-2"
        >
          ล้างตัวกรอง
        </Button>
      </div>

      {/* Items Table */}
      {!loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-white px-6 py-16 text-center">
          <div className="mb-4 rounded-full bg-gray-100 p-4">
            <AlertCircle className="h-8 w-8 text-gray-400" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-medium text-gray-900">ยังไม่มีสินค้า</h3>
          <p className="mt-1 text-sm text-gray-500">
            เริ่มต้นด้วยการเพิ่มสินค้าทีละรายการ หรือนำเข้าทั้งหมดจากไฟล์ CSV
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button
              size="sm"
              onClick={() => setIsAddOpen(true)}
              className="flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              เพิ่มสินค้าใหม่
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsImportOpen(true)}
              className="flex items-center gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              นำเข้า CSV
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>รหัสสินค้า</TableHead>
                <TableHead>รายละเอียดสินค้า</TableHead>
                <TableHead>ตำแหน่งจัดเก็บ</TableHead>
                <TableHead align="right">สต๊อกเริ่มต้น</TableHead>
                <TableHead align="right">ยอดนำเข้า</TableHead>
                <TableHead align="right">ยอดรับคืน</TableHead>
                <TableHead align="right">ยอดคงเหลือพร้อมขาย</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={7} />
              ) : (
                items.map((item) => {
                  const qty = Number(item.total_saleable);
                  let statusBadge = (
                    <StatusBadge tone="success">{qty.toLocaleString()} พร้อมขาย</StatusBadge>
                  );
                  if (qty === 0) {
                    statusBadge = <StatusBadge tone="danger">หมดสต๊อก</StatusBadge>;
                  } else if (qty < 5) {
                    statusBadge = (
                      <StatusBadge tone="warning">{qty.toLocaleString()} ชิ้น (ต่ำ)</StatusBadge>
                    );
                  }
                  const openEdit = () => {
                    setEditItemForm({
                      id: item.id,
                      item_code: item.item_code,
                      description: item.description || "",
                      location: item.location || "",
                      amount_starting: item.amount_starting,
                      import_jaquar: item.import_jaquar,
                      return_borrowed: item.return_borrowed,
                    });
                    setSelectedItem(item);
                    setIsEditOpen(true);
                  };

                  return (
                    <TableRow key={item.id} clickable onClick={openEdit}>
                      <TableCell className="font-mono font-bold text-gray-800">
                        {item.item_code}
                      </TableCell>
                      <TableCell
                        className="max-w-sm truncate text-gray-600"
                        title={item.description}
                      >
                        {item.description || (
                          <span className="italic text-gray-300">ไม่ได้ระบุ</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.location ? (
                          <div className="flex flex-wrap gap-1">
                            {item.location.split(",").map((l: string, idx: number) => (
                              <StatusBadge key={idx} tone="neutral">
                                {l.trim()}
                              </StatusBadge>
                            ))}
                          </div>
                        ) : (
                          <span className="italic text-gray-300">-</span>
                        )}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {Number(item.amount_starting).toLocaleString()}
                      </TableCell>
                      <TableCell align="right" tabular className="text-gray-700">
                        {Number(item.import_jaquar).toLocaleString()}
                      </TableCell>
                      <TableCell align="right" tabular className="text-emerald-600">
                        {Number(item.return_borrowed).toLocaleString()}
                      </TableCell>
                      <TableCell align="right" className="font-semibold">
                        {statusBadge}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-4">
              <span className="text-sm text-gray-500">
                แสดงหน้า {page} จากทั้งหมด {totalPages} หน้า (จำนวนสินค้าทั้งหมด {totalItems}{" "}
                รายการ)
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> ก่อนหน้า
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  ถัดไป <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Add Item */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>เพิ่มสินค้าสต๊อกใหม่</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddItem} className="flex min-h-0 flex-1 flex-col">
            <DialogBody className="space-y-4">
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
                    value={addItemForm.amount_starting || ""}
                    onChange={(e) =>
                      setAddItemForm({ ...addItemForm, amount_starting: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="import">ยอดนำเข้า</Label>
                  <Input
                    id="import"
                    type="number"
                    value={addItemForm.import_jaquar || ""}
                    onChange={(e) =>
                      setAddItemForm({ ...addItemForm, import_jaquar: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="return">ยอดรับคืน</Label>
                  <Input
                    id="return"
                    type="number"
                    value={addItemForm.return_borrowed || ""}
                    onChange={(e) =>
                      setAddItemForm({ ...addItemForm, return_borrowed: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddOpen(false)}
                disabled={saving}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก…" : "เพิ่มสินค้า"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Edit Item */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูลสินค้า</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditItem} className="flex min-h-0 flex-1 flex-col">
            <DialogBody className="space-y-4">
              <div className="flex flex-wrap gap-2 border-b pb-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    if (selectedItem) {
                      setIsEditOpen(false);
                      loadHistory(selectedItem);
                    }
                  }}
                >
                  <History className="h-3.5 w-3.5" aria-hidden="true" /> ประวัติ
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-amber-200 text-xs text-amber-700 hover:bg-amber-50"
                  onClick={() => {
                    if (!selectedItem) return;
                    setAdjustForm({
                      itemId: selectedItem.id,
                      qty: "",
                      movement_type: "out",
                      movement_date: new Date().toLocaleDateString("en-CA"),
                      reference: "",
                    });
                    setIsEditOpen(false);
                    setIsAdjustOpen(true);
                  }}
                >
                  <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" /> ปรับปรุงสต๊อก
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => {
                    setIsEditOpen(false);
                    setDeleteTarget({ id: editItemForm.id, item_code: editItemForm.item_code });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> ลบ
                </Button>
              </div>
              <div>
                <Label>
                  รหัสสินค้า: <span className="font-mono font-bold">{editItemForm.item_code}</span>
                </Label>
              </div>
              <div>
                <Label htmlFor="edit_description">รายละเอียดสินค้า</Label>
                <Input
                  id="edit_description"
                  value={editItemForm.description}
                  onChange={(e) =>
                    setEditItemForm({ ...editItemForm, description: e.target.value })
                  }
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
                    onChange={(e) =>
                      setEditItemForm({ ...editItemForm, amount_starting: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="edit_import">ยอดนำเข้า</Label>
                  <Input
                    id="edit_import"
                    type="number"
                    value={editItemForm.import_jaquar}
                    onChange={(e) =>
                      setEditItemForm({ ...editItemForm, import_jaquar: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="edit_return">ยอดรับคืน</Label>
                  <Input
                    id="edit_return"
                    type="number"
                    value={editItemForm.return_borrowed}
                    onChange={(e) =>
                      setEditItemForm({ ...editItemForm, return_borrowed: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditOpen(false)}
                disabled={saving}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Adjust Stock */}
      <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>ปรับปรุงสต๊อกสินค้า</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <form onSubmit={handleAdjustStock} className="flex min-h-0 flex-1 flex-col">
              <DialogBody className="space-y-4">
                <div className="space-y-1 rounded-lg border bg-gray-50 p-3 text-sm">
                  <p>
                    สินค้า:{" "}
                    <span className="font-mono font-bold text-gray-800">
                      {selectedItem.item_code}
                    </span>
                  </p>
                  <p>
                    ชื่อ: <span className="text-gray-600">{selectedItem.description || "-"}</span>
                  </p>
                  <p>
                    ยอดปัจจุบัน:{" "}
                    <span className="font-bold text-gray-900">
                      {Number(selectedItem.total_saleable).toLocaleString()} ชิ้น
                    </span>
                  </p>
                </div>
                <div>
                  <Label>ทิศทางปรับปรุงสต๊อก</Label>
                  <div className="mt-1 flex gap-4">
                    <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border p-2.5 hover:bg-gray-50">
                      <input
                        type="radio"
                        name="movement_type"
                        value="out"
                        checked={adjustForm.movement_type === "out"}
                        onChange={() => setAdjustForm({ ...adjustForm, movement_type: "out" })}
                      />
                      <MinusCircle className="h-4 w-4 text-red-500" aria-hidden="true" />
                      <span>จ่ายออก (Stock Out)</span>
                    </label>
                    <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border p-2.5 hover:bg-gray-50">
                      <input
                        type="radio"
                        name="movement_type"
                        value="in"
                        checked={adjustForm.movement_type === "in"}
                        onChange={() => setAdjustForm({ ...adjustForm, movement_type: "in" })}
                      />
                      <PlusCircle className="h-4 w-4 text-emerald-500" aria-hidden="true" />
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
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAdjustOpen(false)}
                  disabled={saving}
                >
                  ยกเลิก
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "กำลังบันทึก…" : "ยืนยันปรับปรุงสต๊อก"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal CSV Import */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>นำเข้าข้อมูลสต๊อกผ่าน CSV</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center space-y-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 py-6 text-center">
                <FileSpreadsheet className="h-10 w-10 text-gray-400" aria-hidden="true" />
                <div className="text-xs text-gray-500">
                  <p>
                    รองรับไฟล์ CSV ตารางสต๊อกสินค้า (ITEM CODE, Item Des, Amount, Location, etc.)
                  </p>
                  <p className="mt-1 font-semibold text-gray-700">ตัวอย่าง: Stock Update.csv</p>
                </div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full cursor-pointer pt-2 text-xs text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gray-700 hover:file:bg-gray-200"
                />
              </div>

              {parsedSummary && (
                <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-xs">
                  <h4 className="flex items-center gap-1.5 font-semibold text-gray-900">
                    <PackageCheck className="h-4 w-4" aria-hidden="true" />{" "}
                    สรุปโครงสร้างการวิเคราะห์ไฟล์สำเร็จ
                  </h4>
                  <p>
                    • รายการสินค้าทั้งหมด:{" "}
                    <span className="font-bold text-gray-800">
                      {parsedSummary.itemsCount.toLocaleString()} SKU
                    </span>
                  </p>
                  <p>
                    • ประวัติการเคลื่อนไหวสต๊อก (ตรวจพบจากหัวตารางวันที่):{" "}
                    <span className="font-bold text-gray-800">
                      {parsedSummary.movementsCount.toLocaleString()} รายการ
                    </span>
                  </p>
                  <div className="mt-1 flex items-center gap-2 border-t border-gray-200 pt-1">
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
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsImportOpen(false)}
              disabled={importing}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={handleImportCSV}
              disabled={!parsedSummary || importing}
              className="flex items-center gap-1.5"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  กำลังนำเข้าข้อมูล...
                </>
              ) : (
                "เริ่มนำเข้าข้อมูลสต๊อก"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal History Ledger */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>ประวัติการเดินคลังสินค้า (Stock Ledger)</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {selectedItem && (
              <div className="space-y-4">
                <div className="space-y-1 rounded-xl border bg-gray-50 p-3.5 text-xs">
                  <p>
                    รหัสสินค้า:{" "}
                    <span className="font-mono font-bold text-gray-800">
                      {selectedItem.item_code}
                    </span>
                  </p>
                  <p>
                    รายละเอียด:{" "}
                    <span className="text-gray-600">{selectedItem.description || "-"}</span>
                  </p>
                  <p>
                    คลังเก็บ: <span className="text-gray-600">{selectedItem.location || "-"}</span>
                  </p>
                </div>

                {loadingMovements ? (
                  <div className="animate-pulse space-y-2" role="status" aria-label="กำลังโหลด">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-9 rounded bg-gray-100" />
                    ))}
                  </div>
                ) : movements.length === 0 ? (
                  <div className="flex h-36 flex-col items-center justify-center gap-1.5 text-gray-400">
                    <PackageX className="h-10 w-10" aria-hidden="true" />
                    <span className="text-xs">
                      ยังไม่มีประวัติบันทึกการเคลื่อนไหวสต๊อกสินค้าชิ้นนี้
                    </span>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
                    <Table className="text-xs">
                      <TableHeader className="bg-gray-50">
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
                          const inOut = mov.movement_type === "in";
                          return (
                            <TableRow key={mov.id}>
                              <TableCell className="py-2 font-mono">{mov.movement_date}</TableCell>
                              <TableCell className="py-2">
                                {inOut ? (
                                  <StatusBadge tone="success">รับสินค้าเข้า (IN)</StatusBadge>
                                ) : (
                                  <StatusBadge tone="danger">จ่ายออกจากคลัง (OUT)</StatusBadge>
                                )}
                              </TableCell>
                              <TableCell
                                className={`py-2 text-right font-bold ${inOut ? "text-green-700" : "text-red-700"}`}
                              >
                                {inOut ? "+" : "−"}
                                {Number(mov.qty).toLocaleString()}
                              </TableCell>
                              <TableCell className="py-2 font-medium text-gray-700">
                                {mov.reference || "-"}
                              </TableCell>
                              <TableCell className="py-2 text-[10px] text-gray-400">
                                {(mov as any).created_by_name || "-"}
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
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Modal ยืนยันลบสินค้า */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>ยืนยันการลบสินค้า</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-gray-600">
              ต้องการลบสินค้า{" "}
              <span className="font-mono font-bold text-gray-900">{deleteTarget?.item_code}</span>{" "}
              ใช่หรือไม่? ประวัติการเคลื่อนไหวสต๊อกทั้งหมดของสินค้านี้จะถูกลบไปด้วย
              และไม่สามารถกู้คืนได้
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="destructive"
              className="mr-auto"
              onClick={handleDeleteItem}
              disabled={deleting}
            >
              {deleting ? "กำลังลบ…" : "ลบสินค้า"}
            </Button>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              ยกเลิก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
