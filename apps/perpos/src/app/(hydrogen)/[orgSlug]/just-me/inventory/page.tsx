"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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
} from "@/components/ui/table";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { OcrReceiveDialog } from "./ocr-receive-dialog";
import { movementWarehouseRule, type JustMeMovementType } from "@/lib/just-me/stock-movements";
import { CABLE_SCRAP_THRESHOLD_M } from "@/lib/just-me/cable";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Package,
  Warehouse,
  ArrowLeftRight,
  History,
  AlertTriangle,
  Plus,
  Search,
  FileText,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Loader2,
  Scissors,
  Info,
  ScanLine,
  MapPin,
  Coins,
  Wallet,
  Users,
  ClipboardCheck,
} from "lucide-react";
import { StockCountTab } from "./stock-count-tab";
import cn from "@core/utils/class-names";

interface WarehouseData {
  id: string;
  name: string;
  type: "central" | "site";
  location_address: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_name: string | null;
  contact_phone: string | null;
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
  /** ปิดใช้งาน = ยังอยู่ในประวัติ แต่ไม่ให้เลือกตอนเบิก-รับอีก */
  is_active?: boolean;
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
  status: "in_stock" | "transferred" | "issued" | "returned";
  is_scrap: boolean;
  length_remaining: number | null;
  created_at: string;
}

interface StockMovement {
  id: string;
  item_id: string;
  movement_type: "receive" | "transfer" | "issue" | "return";
  source_warehouse_id: string | null;
  destination_warehouse_id: string | null;
  quantity: number;
  reference_no: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  requested_by: string | null;
  requester_name: string | null;
  project_id: string | null;
  unit_cost: number | null;
  total_cost: number | null;
  creator: Person | null;
  requester: Person | null;
  /** ≠ null = รายการนี้เกิดจากการปรับยอดตามใบตรวจนับ (ไม่ใช่การรับ/เบิกปกติ) */
  stock_count_id: string | null;
  adjustment_reason: string | null;
  /** ≠ null = แถวนี้คือ "รายการกลับรายการ" ของ movement ที่อ้างถึง */
  reversal_of_id: string | null;
}

interface Person {
  id: string;
  display_name: string | null;
  email: string | null;
}

interface ItemCost {
  item_id: string;
  avg_cost: number;
  last_cost: number | null;
  last_purchase_at: string | null;
  qty_on_hand: number;
  value_on_hand: number;
}

interface CostMonthly {
  item_id: string;
  month: string;
  qty_received: number;
  value_received: number;
  avg_purchase_cost: number | null;
  qty_issued: number;
  value_issued: number;
}

const fmtMoney = (v: number, decimals = 2) =>
  new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);

const fmtQty = (v: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(v);

/** uuid ของการกดบันทึกหนึ่งครั้ง (idempotency key ที่ส่งไปกับทุกการเขียนคลัง) */
const newToken = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** ดึงพิกัดจากข้อความที่วาง — รับได้ทั้ง "13.6684, 100.6069" และลิงก์ Google Maps */
function parseLatLng(text: string): { lat: string; lng: string } | null {
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // .../maps/@13.66,100.60,17z
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // ...!3d13.66!4d100.60
    /[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // ...?q=13.66,100.60
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/, // 13.66, 100.60
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return { lat: m[1], lng: m[2] };
  }
  return null;
}

export default function JustMeInventoryPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // UI States
  const [activeTab, setActiveTab] = useState<
    "overview" | "warehouses" | "items" | "movement" | "stockcount" | "scraps" | "cost" | "history"
  >("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data States
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const whPager = usePagination(warehouses);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const itemPager = usePagination(items);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [serials, setSerials] = useState<ItemSerial[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const movePager = usePagination(movements);
  const [costs, setCosts] = useState<ItemCost[]>([]);
  // สิทธิ์จาก API — หน้าเดิมไม่เคยอ่าน ทำให้ viewer เห็นต้นทุนเป็น 0 เต็มหน้า
  // และคนที่เขียนไม่ได้กรอกฟอร์มจนจบแล้วเพิ่งโดนปฏิเสธ
  const [canSeeCost, setCanSeeCost] = useState(true);
  const [canWrite, setCanWrite] = useState(true);
  const [movementsTotal, setMovementsTotal] = useState<number | null>(null);
  const [movementsTruncated, setMovementsTruncated] = useState(false);
  /** ทะเบียน/ยอดคงเหลือดึงไม่ครบ (ชนเพดานฝั่ง API) — ตัวเลขบนหน้าเชื่อไม่ได้ */
  const [listsTruncated, setListsTruncated] = useState(false);
  const [costMonthly, setCostMonthly] = useState<CostMonthly[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [projects, setProjects] = useState<{ id: string; project_code: string; name: string }[]>(
    [],
  );
  const [costItemId, setCostItemId] = useState("");

  // OCR dialog
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [orgId, setOrgId] = useState("");

  // Search Filters
  const [searchItem, setSearchItem] = useState("");
  const [searchSerial, setSearchSerial] = useState("");

  // หยิบเศษสายไฟมาใช้ (ตัดความยาวออกจากเส้นที่เลือก)
  const [scrapUse, setScrapUse] = useState<{ serial: ItemSerial; lengthUsed: string } | null>(null);
  const [scrapSaving, setScrapSaving] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<StockMovement | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseSaving, setReverseSaving] = useState(false);

  // แก้ไข/ลบทะเบียน (คลัง + วัสดุ) — เดิมสร้างได้อย่างเดียว พิมพ์ผิดหรือ OCR สร้างชื่อเพี้ยนแล้วค้างถาวร
  const [editWh, setEditWh] = useState<WarehouseData | null>(null);
  const [editWhForm, setEditWhForm] = useState({
    name: "",
    type: "site",
    location_address: "",
    latitude: "",
    longitude: "",
    contact_name: "",
    contact_phone: "",
    is_active: true,
  });
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editItemForm, setEditItemForm] = useState({
    name: "",
    code: "",
    description: "",
    unit: "ชิ้น",
    has_serial: false,
    has_cable_measurement: false,
    conversion_rate: "1",
    min_stock: "0",
    is_active: true,
  });
  const [editSaving, setEditSaving] = useState(false);

  // Form States
  const [formWarehouse, setFormWarehouse] = useState({
    name: "",
    type: "site",
    location_address: "",
    latitude: "",
    longitude: "",
    contact_name: "",
    contact_phone: "",
  });
  const [formItem, setFormItem] = useState({
    name: "",
    code: "",
    description: "",
    unit: "ชิ้น",
    has_serial: false,
    has_cable_measurement: false,
    conversion_rate: "1",
    min_stock: "0",
  });
  const [unitSelection, setUnitSelection] = useState("ชิ้น");
  const [customUnit, setCustomUnit] = useState("");
  const [formMovement, setFormMovement] = useState({
    movement_type: "receive",
    item_id: "",
    source_warehouse_id: "",
    destination_warehouse_id: "",
    quantity: "1",
    reference_no: "",
    note: "",
    serialsText: "",
    length_remaining: "",
    requested_by: "",
    requester_name: "",
    unit_cost: "",
    project_id: "",
  });
  const [formLoading, setFormLoading] = useState(false);
  // token ของ "การกดบันทึกครั้งนี้" — ออกใหม่ทุกครั้งที่บันทึกสำเร็จ (กันกดซ้ำได้ของสองรอบ)
  const [movementToken, setMovementToken] = useState(() => newToken());

  const handleUnitSelectionChange = (val: string) => {
    setUnitSelection(val);
    if (val !== "custom") {
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
        .from("organizations")
        .select("id")
        .eq("slug", orgSlug)
        .single();

      if (orgErr || !org) throw new Error("ไม่พบข้อมูลองค์กร");

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");

      setAuthToken(token);
      setOrgId(org.id);

      const res = await fetch(`/api/just-me/inventory?orgId=${org.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
      }

      const json = await res.json();
      setWarehouses(json.warehouses || []);
      setItems(json.items || []);
      setBalances(json.balances || []);
      setSerials(json.serials || []);
      setMovements(json.movements || []);
      setCosts(json.costs || []);
      setCanSeeCost(json.canSeeCost !== false);
      setCanWrite(json.canWrite !== false);
      setMovementsTotal(typeof json.movementsTotal === "number" ? json.movementsTotal : null);
      setMovementsTruncated(!!json.movementsTruncated);
      setListsTruncated(!!json.listsTruncated);
      // โครงการสำหรับผูกการเบิกใช้ (ต้นทุนจริงต่อโครงการ) — อ่านผ่าน RLS ปกติ
      const { data: projRows } = await supabase
        .from("just_me_projects")
        .select("id, project_code, name, status")
        .eq("org_id", org.id)
        .not("status", "in", '("closed","cancelled","lost")')
        .order("project_code", { ascending: false });
      setProjects((projRows ?? []) as { id: string; project_code: string; name: string }[]);
      setCostMonthly(json.costMonthly || []);
      setMembers(json.members || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, orgSlug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** ยิง action ของ API คลัง (ใช้ token/org ที่ loadData เก็บไว้แล้ว) */
  const postAction = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch(`/api/just-me/inventory?orgId=${orgId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "บันทึกไม่สำเร็จ");
      return json;
    },
    [orgId, authToken],
  );

  const openEditWarehouse = (wh: WarehouseData) => {
    if (!canWrite) return;
    setEditWh(wh);
    setEditWhForm({
      name: wh.name,
      type: wh.type,
      location_address: wh.location_address ?? "",
      latitude: wh.latitude === null ? "" : String(wh.latitude),
      longitude: wh.longitude === null ? "" : String(wh.longitude),
      contact_name: wh.contact_name ?? "",
      contact_phone: wh.contact_phone ?? "",
      is_active: wh.is_active !== false,
    });
  };

  const handleUpdateWarehouse = async () => {
    if (!editWh) return;
    try {
      setEditSaving(true);
      await postAction({ action: "update_warehouse", id: editWh.id, ...editWhForm });
      toast.success(`บันทึกคลัง "${editWhForm.name}" แล้ว`);
      setEditWh(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "บันทึกคลังไม่สำเร็จ");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteWarehouse = async () => {
    if (!editWh) return;
    try {
      setEditSaving(true);
      await postAction({ action: "delete_warehouse", id: editWh.id });
      toast.success(`ลบคลัง "${editWh.name}" แล้ว`);
      setEditWh(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "ลบคลังไม่สำเร็จ");
    } finally {
      setEditSaving(false);
    }
  };

  const openEditItem = (item: InventoryItem) => {
    if (!canWrite) return;
    setEditItem(item);
    setEditItemForm({
      name: item.name,
      code: item.code,
      description: item.description ?? "",
      unit: item.unit,
      has_serial: item.has_serial,
      has_cable_measurement: item.has_cable_measurement,
      conversion_rate: String(item.conversion_rate ?? 1),
      min_stock: String(item.min_stock ?? 0),
      is_active: item.is_active !== false,
    });
  };

  const handleUpdateItem = async () => {
    if (!editItem) return;
    try {
      setEditSaving(true);
      await postAction({ action: "update_item", id: editItem.id, ...editItemForm });
      toast.success(`บันทึกวัสดุ "${editItemForm.name}" แล้ว`);
      setEditItem(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "บันทึกวัสดุไม่สำเร็จ");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!editItem) return;
    try {
      setEditSaving(true);
      await postAction({ action: "delete_item", id: editItem.id });
      toast.success(`ลบวัสดุ "${editItem.name}" แล้ว`);
      setEditItem(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "ลบวัสดุไม่สำเร็จ");
    } finally {
      setEditSaving(false);
    }
  };

  // Form Submit Handlers
  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setFormLoading(true);
      setError(null);
      setSuccess(null);

      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", orgSlug)
        .single();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/just-me/inventory?orgId=${org?.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "create_warehouse",
          ...formWarehouse,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "สร้างคลังสินค้าไม่สำเร็จ");

      setSuccess(`เพิ่มคลังสินค้า "${formWarehouse.name}" สำเร็จ`);
      toast.success(`เพิ่มคลังสินค้า "${formWarehouse.name}" แล้ว`);
      setFormWarehouse({
        name: "",
        type: "site",
        location_address: "",
        latitude: "",
        longitude: "",
        contact_name: "",
        contact_phone: "",
      });
      await loadData();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message || "สร้างคลังสินค้าไม่สำเร็จ");
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

      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", orgSlug)
        .single();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      const res = await fetch(`/api/just-me/inventory?orgId=${org?.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "create_item",
          ...formItem,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "เพิ่มข้อมูลวัสดุ/สินค้าไม่สำเร็จ");

      setSuccess(`เพิ่มข้อมูลวัสดุ "${formItem.name}" สำเร็จ`);
      toast.success(`เพิ่มวัสดุ/สินค้า "${formItem.name}" แล้ว`);
      setFormItem({
        name: "",
        code: "",
        description: "",
        unit: "ชิ้น",
        has_serial: false,
        has_cable_measurement: false,
        conversion_rate: "1",
        min_stock: "0",
      });
      setUnitSelection("ชิ้น");
      setCustomUnit("");
      await loadData();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message || "เพิ่มข้อมูลไม่สำเร็จ");
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

      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", orgSlug)
        .single();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      // Frontend Validations for CustomSelect
      if (!formMovement.item_id) {
        setError("กรุณาเลือกสินค้า / วัสดุ");
        return;
      }
      const whRule = movementWarehouseRule(formMovement.movement_type as JustMeMovementType);
      if (whRule.source && !formMovement.source_warehouse_id) {
        setError("กรุณาเลือกคลังต้นทาง");
        return;
      }
      if (whRule.destination && !formMovement.destination_warehouse_id) {
        setError("กรุณาเลือกคลังปลายทาง");
        return;
      }

      if (
        formMovement.movement_type === "issue" &&
        !formMovement.requested_by &&
        !formMovement.requester_name.trim()
      ) {
        setError("กรุณาระบุผู้เบิก (เลือกสมาชิก หรือกรอกชื่อช่าง/ทีม)");
        return;
      }

      // Extract serials
      const serial_numbers = formMovement.serialsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/just-me/inventory?orgId=${org?.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "movement",
          ...formMovement,
          serial_numbers,
          // กันกดซ้ำ/เน็ตหลุดแล้วยิงใหม่ — token เดิม = ได้รายการเดิม ยอดไม่เดินสองรอบ
          clientToken: movementToken,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "บันทึกรายการเคลื่อนไหวไม่สำเร็จ");

      setSuccess("บันทึกรายการเคลื่อนไหวสต็อกสำเร็จ");
      toast.success("บันทึกรายการเคลื่อนไหวสต็อกแล้ว");
      if (json.warning) toast.error(json.warning);
      setMovementToken(newToken());
      setFormMovement({
        movement_type: "receive",
        item_id: "",
        source_warehouse_id: "",
        destination_warehouse_id: "",
        quantity: "1",
        reference_no: "",
        note: "",
        serialsText: "",
        length_remaining: "",
        requested_by: "",
        requester_name: "",
        unit_cost: "",
        project_id: "",
      });
      await loadData();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message || "บันทึกไม่สำเร็จ");
    } finally {
      setFormLoading(false);
    }
  };

  /** ตัดความยาวออกจากเส้นเศษที่เลือก — ใช้หมดแล้วเส้นนั้นถูกปิด (ไม่มีรายการคลังใหม่) */
  const handleUseScrap = async () => {
    if (!scrapUse) return;
    try {
      setScrapSaving(true);
      const res = await fetch(`/api/just-me/inventory?orgId=${orgId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          action: "use_scrap",
          serial_id: scrapUse.serial.id,
          length_used: scrapUse.lengthUsed,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "บันทึกการใช้เศษไม่สำเร็จ");
      toast.success("ตัดความยาวจากเส้นนี้แล้ว");
      setScrapUse(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "บันทึกการใช้เศษไม่สำเร็จ");
    } finally {
      setScrapSaving(false);
    }
  };

  /**
   * กลับรายการที่บันทึกผิด — รายการเดินคลังแก้/ลบไม่ได้ (ล็อกที่ DB) นี่คือทางออกเดียว
   * ระบบออกรายการชนิดตรงข้ามให้ ถอนด้วยราคาของต้นฉบับ ⇒ ต้นทุนเฉลี่ยกลับที่เดิม
   */
  const handleReverseMovement = async () => {
    if (!reverseTarget) return;
    const reason = reverseReason.trim();
    if (!reason) {
      toast.error("กรุณาระบุเหตุผลที่กลับรายการ");
      return;
    }
    try {
      setReverseSaving(true);
      const res = await fetch(`/api/just-me/inventory?orgId=${orgId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          action: "reverse_movement",
          movement_id: reverseTarget.id,
          reason,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "กลับรายการไม่สำเร็จ");
      toast.success("กลับรายการแล้ว — ยอดคลังและต้นทุนถูกถอนกลับ");
      setReverseTarget(null);
      setReverseReason("");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "กลับรายการไม่สำเร็จ");
    } finally {
      setReverseSaving(false);
    }
  };

  /** id ของรายการที่ถูกกลับรายการไปแล้ว — กลับซ้ำไม่ได้ (DB ก็กันอีกชั้น) */
  const reversedIds = useMemo(
    () => new Set(movements.map((m) => m.reversal_of_id).filter(Boolean) as string[]),
    [movements],
  );

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
            warehouseName: wh ? wh.name : "ไม่พบชื่อคลัง",
            warehouseType: wh ? wh.type : "site",
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
  const cablePager = usePagination(leftoverCables);

  // Helpers to format movement type labels
  const getMovementLabel = (type: string) => {
    switch (type) {
      case "receive":
        return "รับเข้า (Receive)";
      case "transfer":
        return "โอนย้าย (Transfer)";
      case "issue":
        return "เบิกใช้งาน (Issue)";
      case "return":
        return "คืนสินค้า (Return)";
      default:
        return type;
    }
  };

  const getMovementBadgeClass = (type: string) => {
    switch (type) {
      case "receive":
        return "bg-emerald-50 text-emerald-700 border border-emerald-200";
      case "transfer":
        return "bg-indigo-50 text-indigo-700 border border-indigo-200";
      case "issue":
        return "bg-rose-50 text-rose-700 border border-rose-200";
      case "return":
        return "bg-amber-50 text-amber-700 border border-amber-200";
      default:
        return "bg-slate-50 text-slate-700";
    }
  };

  const fmtDateTime = (iso: string) => {
    return (
      new Date(iso).toLocaleString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Bangkok",
      }) + " น."
    );
  };

  // Find selected item in movement form
  const selectedFormItemObj = useMemo(() => {
    return items.find((i) => i.id === formMovement.item_id);
  }, [items, formMovement.item_id]);

  // Memoized Select Options
  const itemOptions = useMemo(() => {
    // วัสดุที่ปิดใช้งานยังอยู่ในประวัติ แต่ห้ามหยิบมาทำรายการใหม่
    return items
      .filter((i) => i.is_active !== false)
      .map((i) => ({
        value: i.id,
        label: `${i.name} (${i.code})`,
      }));
  }, [items]);

  // ───────── ต้นทุน (Cost) ─────────
  const costMap = useMemo(() => new Map(costs.map((c) => [c.item_id, c])), [costs]);

  /** ราคาซื้อเฉลี่ยรายเดือน (เฉพาะเดือนที่มีการซื้อ) ต่อวัสดุ — ใช้หาแนวโน้ม */
  const purchaseSeries = useMemo(() => {
    const map = new Map<string, { month: string; cost: number }[]>();
    for (const row of costMonthly) {
      if (row.avg_purchase_cost === null || Number(row.qty_received) <= 0) continue;
      const arr = map.get(row.item_id) ?? [];
      arr.push({ month: row.month, cost: Number(row.avg_purchase_cost) });
      map.set(row.item_id, arr);
    }
    map.forEach((arr) => arr.sort((a, b) => a.month.localeCompare(b.month)));
    return map;
  }, [costMonthly]);

  const costRows = useMemo(() => {
    return items
      .map((item) => {
        const c = costMap.get(item.id);
        const series = purchaseSeries.get(item.id) ?? [];
        const first = series[0]?.cost ?? null;
        const last = series[series.length - 1]?.cost ?? null;
        const trendPct =
          first && last && series.length > 1 && first > 0 ? ((last - first) / first) * 100 : null;
        return {
          item,
          avgCost: Number(c?.avg_cost ?? 0),
          lastCost:
            c?.last_cost === null || c?.last_cost === undefined ? null : Number(c.last_cost),
          lastPurchaseAt: c?.last_purchase_at ?? null,
          qtyOnHand: Number(c?.qty_on_hand ?? 0),
          valueOnHand: Number(c?.value_on_hand ?? 0),
          trendPct,
          batches: series.length,
        };
      })
      .sort((a, b) => b.valueOnHand - a.valueOnHand);
  }, [items, costMap, purchaseSeries]);
  const costPager = usePagination(costRows);

  const costSummary = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400_000;
    let bought = 0;
    let issued = 0;
    for (const m of movements) {
      if (new Date(m.created_at).getTime() < cutoff) continue;
      const val = Number(m.total_cost ?? 0);
      if (m.movement_type === "receive") bought += val;
      if (m.movement_type === "issue") issued += val;
    }
    return {
      stockValue: costRows.reduce((s, r) => s + r.valueOnHand, 0),
      bought30: bought,
      issued30: issued,
      up: costRows.filter((r) => (r.trendPct ?? 0) > 1).length,
      down: costRows.filter((r) => (r.trendPct ?? 0) < -1).length,
    };
  }, [movements, costRows]);

  /** วัสดุที่แสดงกราฟแนวโน้ม — default = ตัวที่มีประวัติซื้อมากที่สุด */
  const trendItemId = useMemo(() => {
    if (costItemId && purchaseSeries.has(costItemId)) return costItemId;
    // เลือกตัวที่มีประวัติซื้อหลายครั้งและราคาขยับมากที่สุด (เห็นแนวโน้มชัดสุด)
    let best = "";
    let bestScore = -1;
    purchaseSeries.forEach((arr, id) => {
      if (arr.length < 2) return;
      const first = arr[0].cost;
      const last = arr[arr.length - 1].cost;
      const swing = first > 0 ? Math.abs((last - first) / first) : 0;
      const score = arr.length + swing * 10;
      if (score > bestScore) {
        best = id;
        bestScore = score;
      }
    });
    if (best) return best;
    const firstWithData = Array.from(purchaseSeries.keys())[0];
    return firstWithData ?? "";
  }, [costItemId, purchaseSeries]);

  const trendChartData = useMemo(() => {
    const arr = purchaseSeries.get(trendItemId) ?? [];
    return arr.map((p) => ({
      month: new Date(p.month).toLocaleDateString("th-TH", { month: "short", year: "2-digit" }),
      cost: Number(p.cost.toFixed(2)),
    }));
  }, [purchaseSeries, trendItemId]);

  const usageChartData = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const row of costMonthly) {
      byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + Number(row.value_issued ?? 0));
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, value]) => ({
        month: new Date(month).toLocaleDateString("th-TH", { month: "short", year: "2-digit" }),
        value: Math.round(value),
      }));
  }, [costMonthly]);

  /** สรุปผู้เบิก — ใครเบิกอะไรไปเท่าไร (นับจากรายการเบิกใช้งาน) */
  const requesterSummary = useMemo(() => {
    const map = new Map<string, { name: string; times: number; value: number; lastAt: string }>();
    for (const m of movements) {
      if (m.movement_type !== "issue") continue;
      const name = m.requester?.display_name || m.requester_name || "ไม่ระบุผู้เบิก";
      const cur = map.get(name) ?? { name, times: 0, value: 0, lastAt: m.created_at };
      cur.times += 1;
      cur.value += Number(m.total_cost ?? 0);
      if (m.created_at > cur.lastAt) cur.lastAt = m.created_at;
      map.set(name, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [movements]);

  const memberOptions = useMemo(
    () => [
      { value: "", label: "— ไม่ใช่สมาชิกในระบบ (กรอกชื่อด้านขวา) —" },
      ...members.map((m) => ({ value: m.id, label: m.display_name || m.email || m.id })),
    ],
    [members],
  );

  const warehouseOptions = useMemo(() => {
    return warehouses
      .filter((w) => w.is_active !== false)
      .map((w) => ({
        value: w.id,
        label: `${w.name} (${w.type === "central" ? "คลังกลาง" : "ไซต์งาน"})`,
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
          {canWrite && (
            <Button
              size="sm"
              onClick={() => setOcrDialogOpen(true)}
              disabled={loading || warehouses.length === 0}
              className="gap-1.5"
            >
              <ScanLine className="h-4 w-4" />
              สแกนบิลรับของ
            </Button>
          )}
        </>
      }
    >
      {!canWrite && (
        <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          <Info className="h-4 w-4 shrink-0 text-gray-400" />
          <span>
            บัญชีนี้ดูข้อมูลได้อย่างเดียว — การรับเข้า/เบิก/โอน และตรวจนับสต๊อก
            สงวนไว้สำหรับเจ้าของและผู้จัดการ
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-normal text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
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
          <SegmentedControl
            value={activeTab}
            onChange={(val) => {
              setActiveTab(val as typeof activeTab);
              setError(null);
              setSuccess(null);
            }}
            ariaLabel="หมวดของระบบคลังสินค้า"
            options={[
              { value: "overview", label: "สรุปภาพรวม", icon: <TrendingUp className="h-4 w-4" /> },
              {
                value: "warehouses",
                label: "คลังสินค้า & ไซต์",
                icon: <Warehouse className="h-4 w-4" />,
              },
              { value: "items", label: "วัสดุ/สินค้า", icon: <Package className="h-4 w-4" /> },
              ...(canWrite
                ? [
                    {
                      value: "movement",
                      label: "เบิก/โอน",
                      icon: <ArrowLeftRight className="h-4 w-4" />,
                    },
                  ]
                : []),
              ...(canWrite && canSeeCost
                ? [
                    {
                      value: "stockcount",
                      label: "ตรวจนับสต๊อก",
                      icon: <ClipboardCheck className="h-4 w-4" />,
                    },
                  ]
                : []),
              { value: "scraps", label: "เศษสายไฟ", icon: <Scissors className="h-4 w-4" /> },
              ...(canSeeCost
                ? [{ value: "cost", label: "ต้นทุน", icon: <Coins className="h-4 w-4" /> }]
                : []),
              { value: "history", label: "ประวัติ", icon: <History className="h-4 w-4" /> },
            ]}
          />

          {listsTruncated && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <span>
                ข้อมูลทะเบียนวัสดุ/ยอดคงเหลือมีมากเกินกว่าที่ระบบดึงมาแสดงได้ในครั้งเดียว —
                ยอดคงเหลือและมูลค่าคลังบนหน้านี้<b>ต่ำกว่ายอดจริง</b> กรุณาแจ้งผู้ดูแลระบบ
              </span>
            </div>
          )}

          {movementsTruncated && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                แสดงความเคลื่อนไหวล่าสุด {movements.length.toLocaleString("th-TH")} รายการ
                {movementsTotal !== null && (
                  <> จากทั้งหมด {movementsTotal.toLocaleString("th-TH")} รายการ</>
                )}{" "}
                — ตัวเลขสรุปในแท็บ &quot;ต้นทุน&quot; และตารางผู้เบิก คิดจากชุดที่แสดงนี้เท่านั้น
                จึงอาจต่ำกว่ายอดจริง
              </span>
            </div>
          )}

          {/* TAB CONTENT: Overview */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Alert for Low Stock */}
              {lowStockItems.length > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div className="space-y-1">
                    <p className="font-bold">
                      ⚠️ แจ้งเตือนสินค้าต่ำกว่าจุดสั่งซื้อต่ำสุด (Safety Stock)
                    </p>
                    <div className="space-y-1 pl-1 text-xs text-amber-700/90">
                      {lowStockItems.map((item) => (
                        <p key={item.id}>
                          •{" "}
                          <strong>
                            {item.name} ({item.code})
                          </strong>
                          : คงเหลือรวม {item.totalQty} {item.unit} (ขั้นต่ำที่ต้องมี:{" "}
                          {item.min_stock} {item.unit})
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Grid overview */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4 rounded-xl border bg-white p-5">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Package className="h-5 w-5 text-indigo-500" />
                      รายงานสต็อกคงเหลือแยกคลัง/ไซต์งาน
                    </h2>

                    <div className="relative w-48">
                      <Search className="absolute left-2.5 top-2.5 z-10 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        type="text"
                        placeholder="ค้นหาวัสดุ..."
                        value={searchItem}
                        onChange={(e) => setSearchItem(e.target.value)}
                        className="h-8 border-slate-200 bg-slate-50 pl-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="max-h-[400px] space-y-4 overflow-y-auto pr-1">
                    {filteredOverview.length === 0 ? (
                      <div className="py-8 text-center text-sm text-slate-400">
                        ไม่พบวัสดุที่ต้องการ
                      </div>
                    ) : (
                      filteredOverview.map((item) => (
                        <div
                          key={item.id}
                          className="space-y-2 rounded-xl border bg-slate-50/50 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-slate-800">{item.name}</p>
                              <code className="font-mono text-[11px] text-slate-400">
                                {item.code}
                              </code>
                            </div>
                            <span
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-xs font-bold",
                                item.isLow
                                  ? "border border-red-200 bg-red-50 text-red-600"
                                  : "border border-emerald-200 bg-emerald-50 text-emerald-600",
                              )}
                            >
                              รวม {item.totalQty} {item.unit}
                            </span>
                          </div>

                          <div className="space-y-1.5 border-t pt-2 text-xs">
                            {item.balances.length === 0 ? (
                              <p className="pl-2 italic text-slate-400">ไม่มีของในคลังใดเลย</p>
                            ) : (
                              item.balances.map((bal, idx) => (
                                <div key={idx} className="flex justify-between pl-2 text-slate-600">
                                  <span>
                                    {bal.warehouseName} (
                                    {bal.warehouseType === "central" ? "คลังกลาง" : "ไซต์งาน"})
                                  </span>
                                  <span className="font-semibold text-slate-800">
                                    {bal.qty} {item.unit}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border bg-white p-5">
                  <h2 className="flex items-center gap-2 border-b pb-3 text-sm font-semibold text-slate-700">
                    <Info className="h-5 w-5 text-indigo-500" />
                    ข้อมูลสรุปสต็อก
                  </h2>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border p-4 text-center">
                      <p className="text-2xl font-bold text-slate-800">{warehouses.length}</p>
                      <p className="mt-1 text-xs text-slate-400">คลังทั้งหมด</p>
                    </div>
                    <div className="rounded-xl border p-4 text-center">
                      <p className="text-2xl font-bold text-slate-800">{items.length}</p>
                      <p className="mt-1 text-xs text-slate-400">รายการวัสดุ</p>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs leading-relaxed text-indigo-900">
                    <p className="font-bold">💡 คำแนะนำสำหรับการคุมสต็อกงานระบบไฟฟ้า:</p>
                    <p>
                      • <strong>สายไฟ (Cables)</strong>: ควรบันทึกรหัสแยกขนาด หากเบิกใช้เป็นเมตร
                      จะถูกหักจากความยาวม้วนที่เก็บในระบบ
                    </p>
                    <p>
                      • <strong>Serial Number</strong>: เหมาะกับอุปกรณ์ราคาสูง เช่น ตู้ไฟ, Inverter
                      โซลาร์เซลล์ เพื่อให้สามารถติดตามประวัติและรับประกันได้
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: Warehouses */}
          {activeTab === "warehouses" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Form Create */}
              <div className="h-fit space-y-4 rounded-xl border bg-white p-5 lg:col-span-1">
                <h2 className="flex items-center gap-1.5 border-b pb-3 text-sm font-semibold text-slate-700">
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
                      onChange={(val) =>
                        setFormWarehouse({ ...formWarehouse, type: val as "central" | "site" })
                      }
                      options={[
                        { value: "site", label: "ไซต์งาน (Site Storage)" },
                        { value: "central", label: "คลังกลาง (Central Warehouse)" },
                      ]}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wh-addr">ที่อยู่สถานที่</Label>
                    <Input
                      id="wh-addr"
                      placeholder="ที่ตั้งคลัง หรือ ไซต์ก่อสร้าง"
                      value={formWarehouse.location_address}
                      onChange={(e) =>
                        setFormWarehouse({ ...formWarehouse, location_address: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wh-pin">พิกัดที่ตั้ง (วางลิงก์ Google Maps ได้เลย)</Label>
                    <Input
                      id="wh-pin"
                      placeholder="วางลิงก์แผนที่ หรือ 13.6684, 100.6069"
                      onChange={(e) => {
                        const parsed = parseLatLng(e.target.value);
                        if (parsed)
                          setFormWarehouse((prev) => ({
                            ...prev,
                            latitude: parsed.lat,
                            longitude: parsed.lng,
                          }));
                      }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        step="any"
                        placeholder="ละติจูด"
                        value={formWarehouse.latitude}
                        onChange={(e) =>
                          setFormWarehouse({ ...formWarehouse, latitude: e.target.value })
                        }
                      />
                      <Input
                        type="number"
                        step="any"
                        placeholder="ลองจิจูด"
                        value={formWarehouse.longitude}
                        onChange={(e) =>
                          setFormWarehouse({ ...formWarehouse, longitude: e.target.value })
                        }
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      ใส่พิกัดแล้วจะมีปุ่มเปิดแผนที่ให้ในตารางด้านขวา
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="wh-contact">ผู้ดูแลหน้างาน</Label>
                      <Input
                        id="wh-contact"
                        placeholder="เช่น ช่างสมชาย (โฟร์แมน)"
                        value={formWarehouse.contact_name}
                        onChange={(e) =>
                          setFormWarehouse({ ...formWarehouse, contact_name: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="wh-phone">เบอร์ติดต่อ</Label>
                      <Input
                        id="wh-phone"
                        placeholder="08x-xxx-xxxx"
                        value={formWarehouse.contact_phone}
                        onChange={(e) =>
                          setFormWarehouse({ ...formWarehouse, contact_phone: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full font-bold" disabled={formLoading}>
                    {formLoading ? "กำลังบันทึก…" : "บันทึกข้อมูลคลัง"}
                  </Button>
                </form>
              </div>

              {/* List */}
              <div className="overflow-hidden rounded-xl border bg-white lg:col-span-2">
                <div className="border-b px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-700">
                    คลังสินค้าและไซต์งานปัจจุบัน
                  </h2>
                  {canWrite && (
                    <p className="mt-0.5 text-xs text-gray-500">
                      คลิกที่แถวเพื่อแก้ไขหรือปิดใช้งาน
                    </p>
                  )}
                </div>

                <Table wrapperClassName="rounded-none border-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead>ชื่อคลัง / ไซต์งาน</TableHead>
                      <TableHead>ประเภท</TableHead>
                      <TableHead>ที่ตั้ง / พิกัด</TableHead>
                      <TableHead>ผู้ดูแลหน้างาน</TableHead>
                      <TableHead>สถานะ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {whPager.rows.map((wh) => (
                      <TableRow
                        key={wh.id}
                        clickable={canWrite}
                        onClick={canWrite ? () => openEditWarehouse(wh) : undefined}
                      >
                        <TableCell className="font-bold text-slate-800">{wh.name}</TableCell>
                        <TableCell>
                          <StatusBadge tone={wh.type === "central" ? "success" : "info"}>
                            {wh.type === "central" ? "คลังกลาง (Central)" : "ไซต์งาน (Site)"}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="max-w-xs text-xs text-slate-500">
                          <p className="truncate">{wh.location_address || "—"}</p>
                          {wh.latitude !== null && wh.longitude !== null && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${wh.latitude},${wh.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-0.5 inline-flex items-center gap-1 font-medium text-primary hover:underline"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                              <span className="tabular-nums">
                                {Number(wh.latitude).toFixed(4)}, {Number(wh.longitude).toFixed(4)}
                              </span>
                            </a>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {wh.contact_name || "—"}
                          {wh.contact_phone && (
                            <a
                              href={`tel:${wh.contact_phone.replace(/[^+\d]/g, "")}`}
                              className="block text-slate-400 hover:underline"
                            >
                              {wh.contact_phone}
                            </a>
                          )}
                        </TableCell>
                        <TableCell>
                          {wh.is_active === false ? (
                            <StatusBadge tone="neutral">ปิดใช้งาน</StatusBadge>
                          ) : (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              ใช้งานอยู่
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePager pager={whPager} unit="คลัง" />
              </div>
            </div>
          )}

          {/* TAB CONTENT: Items */}
          {activeTab === "items" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Form Create */}
              <div className="h-fit space-y-4 rounded-xl border bg-white p-5 lg:col-span-1">
                <h2 className="flex items-center gap-1.5 border-b pb-3 text-sm font-semibold text-slate-700">
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
                        { value: "ชิ้น", label: "ชิ้น (Pieces)" },
                        { value: "เมตร", label: "เมตร (Meters)" },
                        { value: "ม้วน", label: "ม้วน (Rolls)" },
                        { value: "เครื่อง", label: "เครื่อง (Machines)" },
                        { value: "ชุด", label: "ชุด (Sets)" },
                        { value: "กล่อง", label: "กล่อง (Boxes)" },
                        { value: "custom", label: "อื่นๆ (ระบุเอง)" },
                      ]}
                    />
                    {unitSelection === "custom" && (
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

                  <div className="space-y-3 rounded-xl border bg-slate-50 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="item-serial"
                        className="cursor-pointer font-bold text-slate-700"
                      >
                        ต้องการคุม Serial Number
                      </Label>
                      <input
                        id="item-serial"
                        type="checkbox"
                        checked={formItem.has_serial}
                        onChange={(e) => setFormItem({ ...formItem, has_serial: e.target.checked })}
                        className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="item-cable"
                        className="cursor-pointer font-bold text-slate-700"
                      >
                        เป็นสินค้าวัดความยาว (สายไฟ)
                      </Label>
                      <input
                        id="item-cable"
                        type="checkbox"
                        checked={formItem.has_cable_measurement}
                        onChange={(e) =>
                          setFormItem({ ...formItem, has_cable_measurement: e.target.checked })
                        }
                        className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>

                    {formItem.has_cable_measurement && (
                      <div className="mt-2 space-y-1.5 border-t pt-2">
                        <Label htmlFor="item-conv">อัตราแปลงหน่วย (เช่น 1 ม้วน = กี่เมตร)</Label>
                        <Input
                          id="item-conv"
                          type="number"
                          value={formItem.conversion_rate}
                          onChange={(e) =>
                            setFormItem({ ...formItem, conversion_rate: e.target.value })
                          }
                          placeholder="ปกติคือ 1"
                        />
                      </div>
                    )}
                  </div>

                  <Button type="submit" className="w-full font-bold" disabled={formLoading}>
                    {formLoading ? "กำลังบันทึก…" : "บันทึกข้อมูลสินค้า"}
                  </Button>
                </form>
              </div>

              {/* List */}
              <div className="overflow-hidden rounded-xl border bg-white lg:col-span-2">
                <div className="border-b px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-700">ข้อมูลวัสดุทั้งหมด</h2>
                  {canWrite && (
                    <p className="mt-0.5 text-xs text-gray-500">
                      คลิกที่แถวเพื่อแก้ไขหรือปิดใช้งาน
                    </p>
                  )}
                </div>

                <Table wrapperClassName="rounded-none border-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead>รหัสวัสดุ</TableHead>
                      <TableHead>ชื่อ</TableHead>
                      <TableHead>หน่วย</TableHead>
                      <TableHead>การติดตาม</TableHead>
                      <TableHead>สถานะ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemPager.rows.map((item) => (
                      <TableRow
                        key={item.id}
                        clickable={canWrite}
                        onClick={canWrite ? () => openEditItem(item) : undefined}
                      >
                        <TableCell className="font-mono text-xs font-bold text-indigo-600">
                          {item.code}
                        </TableCell>
                        <TableCell className="font-bold text-slate-800">
                          <p>{item.name}</p>
                          {item.description && (
                            <p className="text-[11px] font-normal text-slate-400">
                              {item.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-600">{item.unit}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex gap-1">
                            {item.has_serial && (
                              <StatusBadge tone="success">Serial Number</StatusBadge>
                            )}
                            {item.has_cable_measurement && (
                              <StatusBadge tone="info">
                                ตัดเมตร (เศษ {item.conversion_rate})
                              </StatusBadge>
                            )}
                            {!item.has_serial && !item.has_cable_measurement && (
                              <span className="italic text-slate-400">นับชิ้นปกติ</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.is_active === false ? (
                            <StatusBadge tone="neutral">ปิดใช้งาน</StatusBadge>
                          ) : (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              ใช้งานอยู่
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePager pager={itemPager} unit="รายการ" />
              </div>
            </div>
          )}

          {/* TAB CONTENT: Movement Form */}
          {activeTab === "movement" && (
            <div className="mx-auto max-w-2xl space-y-5 rounded-xl border bg-white p-6">
              <h2 className="flex items-center gap-2 border-b pb-3 text-sm font-semibold text-slate-700">
                <ArrowLeftRight className="h-5 w-5 text-indigo-500" />
                ทำรายการรับเข้า / เบิกจ่าย / โอนย้ายสินค้า
              </h2>

              <form onSubmit={handlePostMovement} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="mov-type">ประเภทรายการ *</Label>
                    <CustomSelect
                      value={formMovement.movement_type}
                      onChange={(val) =>
                        setFormMovement({
                          ...formMovement,
                          movement_type: val,
                          source_warehouse_id: movementWarehouseRule(val as JustMeMovementType)
                            .source
                            ? formMovement.source_warehouse_id
                            : "",
                          destination_warehouse_id: movementWarehouseRule(val as JustMeMovementType)
                            .destination
                            ? formMovement.destination_warehouse_id
                            : "",
                        })
                      }
                      options={[
                        { value: "receive", label: "รับเข้าคลังกลาง (Receive from Supplier)" },
                        { value: "transfer", label: "โอนย้ายสต็อก (Transfer between locations)" },
                        { value: "issue", label: "เบิกไปใช้งานที่ไซต์ (Issue to Cost)" },
                        {
                          value: "return",
                          label: "คืนของที่ไซต์เหลือมาคลังกลาง (Return to Warehouse)",
                        },
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
                  {/* Source Warehouse — คืนของไม่มีคลังต้นทาง (ของมาจากหน้างาน) */}
                  {movementWarehouseRule(formMovement.movement_type as JustMeMovementType)
                    .source && (
                    <div className="space-y-1.5">
                      <Label htmlFor="mov-src">คลังต้นทาง *</Label>
                      <CustomSelect
                        value={formMovement.source_warehouse_id}
                        onChange={(val) =>
                          setFormMovement({ ...formMovement, source_warehouse_id: val })
                        }
                        options={warehouseOptions}
                        placeholder="— เลือกคลังต้นทาง —"
                      />
                    </div>
                  )}

                  {/* Destination Warehouse */}
                  {movementWarehouseRule(formMovement.movement_type as JustMeMovementType)
                    .destination && (
                    <div className="space-y-1.5">
                      <Label htmlFor="mov-dest">
                        {formMovement.movement_type === "return"
                          ? "คลังที่รับของคืน *"
                          : "คลังปลายทาง *"}
                      </Label>
                      <CustomSelect
                        value={formMovement.destination_warehouse_id}
                        onChange={(val) =>
                          setFormMovement({ ...formMovement, destination_warehouse_id: val })
                        }
                        options={warehouseOptions}
                        placeholder="— เลือกคลังปลายทาง —"
                      />
                    </div>
                  )}
                </div>

                {formMovement.movement_type === "return" && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    คืนของ = ของที่เบิกไปหน้างานแล้วใช้ไม่หมด เอากลับเข้าคลัง —
                    ไม่ต้องเลือกคลังต้นทาง (ของถูกหักออกจากคลังไปแล้วตอนเบิก)
                    ยอดของคลังที่รับคืนจะเพิ่มขึ้นอย่างเดียว
                  </p>
                )}

                {/* Quantity and reference */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="mov-qty">
                      จำนวนสินค้า ({selectedFormItemObj ? selectedFormItemObj.unit : "ชิ้น"}) *
                    </Label>
                    <Input
                      id="mov-qty"
                      type="number"
                      value={formMovement.quantity}
                      onChange={(e) =>
                        setFormMovement({ ...formMovement, quantity: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="mov-ref">เลขที่เอกสารอ้างอิง (PO / DO / จ็อบ)</Label>
                    <Input
                      id="mov-ref"
                      placeholder="เช่น PO-2026-001"
                      value={formMovement.reference_no}
                      onChange={(e) =>
                        setFormMovement({ ...formMovement, reference_no: e.target.value })
                      }
                    />
                  </div>
                </div>

                {/* ต้นทุนซื้อ — เฉพาะรายการรับเข้า */}
                {formMovement.movement_type === "receive" && (
                  <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <Label htmlFor="mov-cost">
                      ต้นทุนต่อหน่วย (บาท /{" "}
                      {selectedFormItemObj ? selectedFormItemObj.unit : "หน่วย"})
                    </Label>
                    <Input
                      id="mov-cost"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="ราคาซื้อจากผู้ขาย — ปล่อยว่างจะใช้ต้นทุนเฉลี่ยเดิม"
                      value={formMovement.unit_cost}
                      onChange={(e) =>
                        setFormMovement({ ...formMovement, unit_cost: e.target.value })
                      }
                    />
                    <p className="text-xs text-emerald-800/80">
                      ระบบจะคิดต้นทุนเฉลี่ยถ่วงน้ำหนัก (moving average) ให้อัตโนมัติ
                      {formMovement.unit_cost &&
                        formMovement.quantity &&
                        ` · มูลค่ารับเข้า ${fmtMoney(
                          Number(formMovement.unit_cost) * Number(formMovement.quantity),
                        )} ฿`}
                    </p>
                  </div>
                )}

                {/* ผู้เบิก / ผู้รับของ */}
                <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Users className="h-4 w-4 text-primary" />
                    {formMovement.movement_type === "issue"
                      ? "ผู้เบิก (จำเป็น) — ใครนำของไปใช้"
                      : "ผู้เบิก / ผู้รับของ (ถ้ามี)"}
                  </p>
                  {["issue", "return"].includes(formMovement.movement_type) && (
                    <div className="space-y-1.5">
                      <Label htmlFor="mov-project">โครงการที่เบิกไปใช้</Label>
                      <CustomSelect
                        value={formMovement.project_id}
                        onChange={(val) => setFormMovement({ ...formMovement, project_id: val })}
                        options={[
                          { value: "", label: "— ไม่ผูกโครงการ (ใช้ในงานทั่วไป) —" },
                          ...projects.map((p) => ({
                            value: p.id,
                            label: `${p.project_code} · ${p.name}`,
                          })),
                        ]}
                      />
                      <p className="text-xs text-gray-500">
                        ผูกโครงการแล้วมูลค่าที่เบิกจะถูกนับเป็นต้นทุนจริงของโครงการนั้นทันที
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="mov-requester-member">สมาชิกในระบบ</Label>
                      <CustomSelect
                        value={formMovement.requested_by}
                        onChange={(val) => setFormMovement({ ...formMovement, requested_by: val })}
                        options={memberOptions}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="mov-requester-name">ชื่อช่าง / ทีม (ไม่มีบัญชีในระบบ)</Label>
                      <Input
                        id="mov-requester-name"
                        placeholder="เช่น ช่างสมชาย ผลดี (ทีมไฟฟ้า A)"
                        value={formMovement.requester_name}
                        onChange={(e) =>
                          setFormMovement({ ...formMovement, requester_name: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Serial and Wire length sections */}
                {selectedFormItemObj &&
                  (selectedFormItemObj.has_serial || selectedFormItemObj.has_cable_measurement) && (
                    <div className="space-y-3 rounded-xl border bg-slate-50 p-4 text-xs">
                      <p className="flex items-center gap-1 font-bold text-slate-800">
                        <Info className="h-4 w-4 text-indigo-500" />
                        สินค้าตัวนี้ต้องการข้อมูลสลาก (Serial/Cable info)
                      </p>

                      {selectedFormItemObj.has_serial && (
                        <div className="space-y-1.5">
                          <Label htmlFor="mov-serials" className="font-bold text-slate-700">
                            Serial Numbers (บรรทัดละ 1 รหัสให้ครบตามจำนวนที่สั่ง) *
                          </Label>
                          <textarea
                            id="mov-serials"
                            rows={4}
                            value={formMovement.serialsText}
                            onChange={(e) =>
                              setFormMovement({ ...formMovement, serialsText: e.target.value })
                            }
                            placeholder="เช่น&#10;SN-882792837&#10;SN-882792838"
                            className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs focus:border-indigo-500 focus:ring-indigo-500"
                          />
                        </div>
                      )}

                      {/* ช่องความยาวโผล่เฉพาะที่ระบบทำอะไรกับมันจริง ๆ:
                          เบิก = ลงทะเบียนเศษที่เหลือ · รับเข้า = ความยาวของเส้นที่มี Serial */}
                      {selectedFormItemObj.has_cable_measurement &&
                        (formMovement.movement_type === "issue" ||
                          (formMovement.movement_type === "receive" &&
                            selectedFormItemObj.has_serial)) && (
                          <div className="space-y-1.5">
                            <Label htmlFor="mov-len" className="font-bold text-slate-700">
                              {formMovement.movement_type === "receive"
                                ? "ความยาวของเส้นที่รับเข้า (เมตร)"
                                : "ความยาวที่เหลือติดหน้างาน (เมตร)"}
                            </Label>
                            <Input
                              id="mov-len"
                              type="number"
                              value={formMovement.length_remaining}
                              onChange={(e) =>
                                setFormMovement({
                                  ...formMovement,
                                  length_remaining: e.target.value,
                                })
                              }
                              placeholder="ปล่อยว่างหากรับเข้าม้วนเต็ม"
                              min="0"
                              step="0.01"
                            />
                            <p className="text-slate-500">
                              {formMovement.movement_type === "issue"
                                ? "กรอกแล้วระบบออกรหัสเศษให้เอง (SCR-…) ไปอยู่ในแท็บ “เศษสายไฟ” ให้หยิบมาใช้ต่อได้ · ปล่อยว่าง = ใช้หมด ไม่มีเศษ · เศษไม่คืนยอด/ต้นทุน (ถ้าของกลับเข้าคลังจริงให้ใช้รายการ “คืนของ”)"
                                : "ความยาวจริงของเส้นนี้ ปล่อยว่างได้ถ้าเป็นม้วนเต็ม"}
                            </p>
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
                  {formLoading ? "กำลังบันทึก…" : "ยืนยันบันทึกรายการสต็อก"}
                </Button>
              </form>
            </div>
          )}

          {/* TAB CONTENT: Leftover Cables */}
          {activeTab === "scraps" && (
            <div className="space-y-4 rounded-xl border bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Scissors className="h-5 w-5 text-rose-500" />
                    สต็อกสายไฟเหลือใช้ และเศษสายไฟ (Leftover & Scraps)
                  </h2>
                  <p className="text-xs text-slate-400">
                    รายการสายไฟที่ตัดแบ่งใช้แล้ว และมีเศษความยาวที่ใช้งานเฉพาะจุดย่อยได้
                    {canWrite && " · คลิกที่แถวเพื่อหยิบเศษมาใช้"}
                  </p>
                </div>

                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 z-10 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="ค้นหารหัสเศษ/สายไฟ..."
                    value={searchSerial}
                    onChange={(e) => setSearchSerial(e.target.value)}
                    className="border-slate-200 bg-slate-50 py-1.5 pl-8 text-xs"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table stickyHeader fillViewport wrapperClassName="rounded-none border-0">
                  <TableHeader sticky>
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
                    ) : (
                      cablePager.rows.map((s) => {
                        const item = items.find((i) => i.id === s.item_id);
                        const wh = warehouses.find((w) => w.id === s.warehouse_id);
                        const usable =
                          s.status === "in_stock" && (s.length_remaining ?? 0) > 0 && canWrite;
                        return (
                          <TableRow
                            key={s.id}
                            clickable={usable}
                            onClick={
                              usable ? () => setScrapUse({ serial: s, lengthUsed: "" }) : undefined
                            }
                          >
                            <TableCell className="font-mono text-xs font-bold text-slate-800">
                              {s.serial_number}
                            </TableCell>
                            <TableCell className="font-bold text-slate-800">
                              {item ? item.name : "—"}
                            </TableCell>
                            <TableCell className="text-slate-600">
                              {wh ? wh.name : "ไม่พบชื่อคลัง"}
                            </TableCell>
                            <TableCell align="right" tabular className="font-black text-slate-800">
                              {s.length_remaining !== null ? `${s.length_remaining} เมตร` : "—"}
                            </TableCell>
                            <TableCell>
                              {s.status !== "in_stock" || (s.length_remaining ?? 0) <= 0 ? (
                                <StatusBadge tone="neutral">ใช้หมดแล้ว</StatusBadge>
                              ) : s.is_scrap ? (
                                <StatusBadge tone="danger">
                                  เศษสั้น (&lt; {CABLE_SCRAP_THRESHOLD_M} ม.)
                                </StatusBadge>
                              ) : (
                                <StatusBadge tone="success">ม้วนตัดแบ่งใช้ (In Stock)</StatusBadge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                <TablePager pager={cablePager} unit="เส้น" />
              </div>
            </div>
          )}

          {/* TAB CONTENT: Cost */}
          {activeTab === "cost" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  icon={<Wallet className="h-4 w-4" />}
                  label="มูลค่าสต๊อกคงเหลือ"
                  value={`${fmtMoney(costSummary.stockValue)} ฿`}
                  sub="ตีด้วยต้นทุนเฉลี่ยถ่วงน้ำหนัก"
                  tone="info"
                  valueColored
                />
                <StatCard
                  icon={<Package className="h-4 w-4" />}
                  label="ต้นทุนซื้อเข้า 30 วัน"
                  value={`${fmtMoney(costSummary.bought30)} ฿`}
                  tone="positive"
                  valueColored
                />
                <StatCard
                  icon={<ArrowLeftRight className="h-4 w-4" />}
                  label="มูลค่าเบิกใช้ 30 วัน"
                  value={`${fmtMoney(costSummary.issued30)} ฿`}
                  sub="ต้นทุนวัสดุที่ลงหน้างานจริง"
                  tone="negative"
                  valueColored
                />
                <StatCard
                  icon={<TrendingUp className="h-4 w-4" />}
                  label="แนวโน้มราคาซื้อ"
                  value={`↑ ${costSummary.up} / ↓ ${costSummary.down}`}
                  sub="จำนวนวัสดุที่ราคาขึ้น / ลง"
                  tone="warning"
                />
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <div className="min-w-0 space-y-3 rounded-xl border bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      แนวโน้มราคาซื้อรายเดือน
                    </h2>
                    <CustomSelect
                      className="w-56"
                      value={trendItemId}
                      onChange={setCostItemId}
                      options={items
                        .filter((i) => purchaseSeries.has(i.id))
                        .map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))}
                    />
                  </div>
                  {trendChartData.length === 0 ? (
                    <div className="py-16 text-center text-sm text-gray-400">
                      ยังไม่มีประวัติราคาซื้อ
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={trendChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ee" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} width={64} domain={["auto", "auto"]} />
                        <Tooltip
                          formatter={(v: any) => [`${fmtMoney(Number(v))} ฿`, "ราคาซื้อเฉลี่ย"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="cost"
                          stroke="#3C3B3D"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="min-w-0 space-y-3 rounded-xl border bg-white p-5 shadow-sm">
                  <h2 className="flex items-center gap-2 border-b pb-3 text-sm font-semibold text-gray-900">
                    <Coins className="h-5 w-5 text-primary" />
                    มูลค่าวัสดุที่เบิกใช้รายเดือน (ทุกวัสดุ)
                  </h2>
                  {usageChartData.length === 0 ? (
                    <div className="py-16 text-center text-sm text-gray-400">
                      ยังไม่มีรายการเบิกใช้
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={usageChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ee" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} width={72} />
                        <Tooltip
                          formatter={(v: any) => [`${fmtMoney(Number(v), 0)} ฿`, "มูลค่าเบิกใช้"]}
                        />
                        <Bar dataKey="value" fill="#5D9CEC" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="px-1 text-sm font-semibold text-gray-900">
                  ต้นทุนรายวัสดุ (moving average)
                </div>
                <Table className="shadow-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>วัสดุ</TableHead>
                      <TableHead align="right">ต้นทุนเฉลี่ย/หน่วย</TableHead>
                      <TableHead align="right">ราคาซื้อล่าสุด</TableHead>
                      <TableHead align="right">คงเหลือ</TableHead>
                      <TableHead align="right">มูลค่าคงเหลือ (฿)</TableHead>
                      <TableHead align="center">แนวโน้มราคา</TableHead>
                      <TableHead>ซื้อล่าสุด</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costRows.length === 0 ? (
                      <TableEmpty colSpan={7}>ยังไม่มีข้อมูลต้นทุน</TableEmpty>
                    ) : (
                      costPager.rows.map((r) => (
                        <TableRow key={r.item.id}>
                          <TableCell className="font-bold text-slate-800">
                            <p>{r.item.name}</p>
                            <code className="font-mono text-[11px] font-normal text-slate-400">
                              {r.item.code}
                            </code>
                          </TableCell>
                          <TableCell align="right" tabular>
                            {fmtMoney(r.avgCost)}
                          </TableCell>
                          <TableCell align="right" tabular className="text-slate-500">
                            {r.lastCost === null ? "—" : fmtMoney(r.lastCost)}
                          </TableCell>
                          <TableCell align="right" className="tabular-nums text-slate-600">
                            {fmtQty(r.qtyOnHand)} {r.item.unit}
                          </TableCell>
                          <TableCell align="right" tabular className="font-bold text-slate-800">
                            {fmtMoney(r.valueOnHand)}
                          </TableCell>
                          <TableCell align="center">
                            {r.trendPct === null ? (
                              <span className="text-xs text-slate-400">
                                {r.batches <= 1 ? "ซื้อครั้งเดียว" : "—"}
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold tabular-nums",
                                  r.trendPct > 0 ? "text-red-600" : "text-green-600",
                                )}
                              >
                                {r.trendPct > 0 ? (
                                  <TrendingUp className="h-3.5 w-3.5" />
                                ) : (
                                  <TrendingDown className="h-3.5 w-3.5" />
                                )}
                                {r.trendPct > 0 ? "+" : "−"}
                                {fmtMoney(Math.abs(r.trendPct), 1)}%
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {r.lastPurchaseAt
                              ? new Date(r.lastPurchaseAt).toLocaleDateString("th-TH", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  timeZone: "Asia/Bangkok",
                                })
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <TablePager pager={costPager} unit="รายการ" />
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1 text-sm font-semibold text-gray-900">
                  <Users className="h-4 w-4 text-primary" />
                  ใครเบิกของไปเท่าไร (จากรายการเบิกใช้งาน)
                </div>
                <Table className="shadow-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>ผู้เบิก</TableHead>
                      <TableHead align="right">จำนวนครั้ง</TableHead>
                      <TableHead align="right">มูลค่าที่เบิก (฿)</TableHead>
                      <TableHead>เบิกล่าสุด</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requesterSummary.length === 0 ? (
                      <TableEmpty colSpan={4}>ยังไม่มีรายการเบิกใช้งาน</TableEmpty>
                    ) : (
                      requesterSummary.map((r) => (
                        <TableRow key={r.name}>
                          <TableCell className="font-bold text-slate-800">{r.name}</TableCell>
                          <TableCell align="right" tabular className="text-slate-600">
                            {r.times}
                          </TableCell>
                          <TableCell align="right" tabular className="font-bold text-slate-800">
                            {fmtMoney(r.value)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {fmtDateTime(r.lastAt)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* TAB CONTENT: History */}
          {activeTab === "stockcount" && (
            <StockCountTab
              orgId={orgId}
              authToken={authToken}
              warehouses={warehouses}
              items={items}
              onStockChanged={loadData}
            />
          )}

          {activeTab === "history" && (
            <div className="overflow-hidden rounded-xl border bg-white">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-700">
                  ประวัติการทำรายการเดินคลังทั้งหมด
                </h2>
              </div>

              <Table stickyHeader fillViewport wrapperClassName="rounded-none border-0">
                <TableHeader sticky>
                  <TableRow>
                    <TableHead>วันที่ / เวลา</TableHead>
                    <TableHead>ประเภทรายการ</TableHead>
                    <TableHead>สินค้า</TableHead>
                    <TableHead align="right">จำนวน</TableHead>
                    <TableHead align="right">มูลค่า (฿)</TableHead>
                    <TableHead>ผู้เบิก / ผู้รับของ</TableHead>
                    <TableHead>โครงการ</TableHead>
                    <TableHead>จากคลัง</TableHead>
                    <TableHead>ไปยังคลัง</TableHead>
                    <TableHead>เอกสารอ้างอิง / ผู้ทำรายการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableEmpty colSpan={10}>ยังไม่มีรายการบันทึก</TableEmpty>
                  ) : (
                    movePager.rows.map((mov) => {
                      const item = items.find((i) => i.id === mov.item_id);
                      const src = warehouses.find((w) => w.id === mov.source_warehouse_id);
                      const dest = warehouses.find((w) => w.id === mov.destination_warehouse_id);
                      // กลับรายการได้เมื่อ: แก้ข้อมูลได้ · ไม่ใช่ตัวกลับรายการเอง · ยังไม่เคยถูกกลับ
                      const canReverse =
                        canWrite && !mov.reversal_of_id && !reversedIds.has(mov.id);
                      return (
                        <TableRow
                          key={mov.id}
                          clickable={canReverse}
                          onClick={
                            canReverse
                              ? () => {
                                  setReverseTarget(mov);
                                  setReverseReason("");
                                }
                              : undefined
                          }
                        >
                          <TableCell className="text-xs text-slate-500">
                            {fmtDateTime(mov.created_at)}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold",
                                getMovementBadgeClass(mov.movement_type),
                              )}
                            >
                              {getMovementLabel(mov.movement_type)}
                            </span>
                            {mov.stock_count_id && (
                              <StatusBadge tone="warning" className="ml-1.5">
                                ปรับยอดจากการตรวจนับ
                              </StatusBadge>
                            )}
                          </TableCell>
                          <TableCell className="font-bold text-slate-800">
                            {item ? item.name : "ไม่พบชื่อสินค้า"}
                          </TableCell>
                          <TableCell align="right" tabular className="font-black text-slate-800">
                            {mov.quantity} {item ? item.unit : "ชิ้น"}
                          </TableCell>
                          <TableCell align="right" tabular className="text-slate-700">
                            {mov.total_cost === null || mov.total_cost === undefined
                              ? "—"
                              : fmtMoney(Number(mov.total_cost))}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {mov.requester?.display_name || mov.requester_name || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {projects.find((p) => p.id === mov.project_id)?.project_code ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {src ? src.name : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {dest ? dest.name : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {mov.reference_no && (
                              <p className="font-bold text-slate-700">
                                อ้างอิง: {mov.reference_no}
                              </p>
                            )}
                            <p className="text-slate-400">
                              โดย: {mov.creator?.display_name || "ไม่ระบุชื่อ"}
                            </p>
                            {mov.note && <p className="italic text-slate-500">โน้ต: {mov.note}</p>}
                            {mov.adjustment_reason && (
                              <p className="text-amber-700">เหตุผล: {mov.adjustment_reason}</p>
                            )}
                            {mov.reversal_of_id && (
                              <StatusBadge tone="danger">รายการกลับรายการ</StatusBadge>
                            )}
                            {reversedIds.has(mov.id) && (
                              <StatusBadge tone="neutral">ถูกกลับรายการแล้ว</StatusBadge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              <TablePager pager={movePager} unit="รายการ" />
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
            setSuccess("บันทึกรับของเข้าคลังสำเร็จ");
            await loadData();
          }}
          orgId={orgId}
          authToken={authToken}
          existingItemNames={items.map((i) => i.name)}
          warehouseOptions={warehouseOptions}
        />
      )}

      {/* หยิบเศษสายไฟมาใช้ — ตัดความยาวออกจากเส้นที่เลือก */}
      <Dialog open={!!scrapUse} onOpenChange={(o) => !o && setScrapUse(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>หยิบเศษสายไฟมาใช้</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {scrapUse && (
              <div className="space-y-4">
                <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                  <p className="font-mono font-bold text-gray-900">
                    {scrapUse.serial.serial_number}
                  </p>
                  <p>
                    {items.find((i) => i.id === scrapUse.serial.item_id)?.name ?? "—"} · เหลืออยู่{" "}
                    <span className="font-semibold tabular-nums">
                      {scrapUse.serial.length_remaining ?? 0}
                    </span>{" "}
                    เมตร
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="scrap-used">ความยาวที่ใช้ (เมตร) *</Label>
                  <Input
                    id="scrap-used"
                    type="number"
                    min="0"
                    step="0.01"
                    value={scrapUse.lengthUsed}
                    onChange={(e) => setScrapUse({ ...scrapUse, lengthUsed: e.target.value })}
                    placeholder={`ไม่เกิน ${scrapUse.serial.length_remaining ?? 0} เมตร`}
                  />
                  <p className="text-xs text-gray-500">
                    เศษถูกตัดออกจากยอดคลังและต้นทุนไปแล้วตอนเบิก — การใช้เศษจึงลดแค่ความยาวที่เหลือ
                    ไม่เกิดรายการคลังใหม่
                  </p>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScrapUse(null)}>
              ยกเลิก
            </Button>
            <Button onClick={handleUseScrap} disabled={scrapSaving || !scrapUse?.lengthUsed}>
              {scrapSaving ? "กำลังบันทึก…" : "บันทึกการใช้"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* กลับรายการ — รายการเดินคลังแก้/ลบไม่ได้ ทางแก้ของที่บันทึกผิดคือออกรายการตรงข้าม */}
      <Dialog
        open={!!reverseTarget}
        onOpenChange={(o) => {
          if (!o) {
            setReverseTarget(null);
            setReverseReason("");
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>กลับรายการที่บันทึกผิด</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {reverseTarget && (
              <div className="space-y-4">
                <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                  <p className="font-semibold text-gray-900">
                    {getMovementLabel(reverseTarget.movement_type)} ·{" "}
                    {items.find((i) => i.id === reverseTarget.item_id)?.name ?? "ไม่พบชื่อสินค้า"}
                  </p>
                  <p className="mt-1">
                    จำนวน {reverseTarget.quantity}{" "}
                    {items.find((i) => i.id === reverseTarget.item_id)?.unit ?? "ชิ้น"} ·{" "}
                    {fmtDateTime(reverseTarget.created_at)}
                  </p>
                  {canSeeCost && reverseTarget.total_cost !== null && (
                    <p className="mt-1">มูลค่า {fmtMoney(Number(reverseTarget.total_cost))} ฿</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reverse-reason">เหตุผลที่กลับรายการ *</Label>
                  <Input
                    id="reverse-reason"
                    value={reverseReason}
                    onChange={(e) => setReverseReason(e.target.value)}
                    placeholder="เช่น กรอกจำนวนผิด / เลือกคลังผิด"
                  />
                  <p className="text-xs text-gray-500">
                    ระบบจะออก<b>รายการใหม่ชนิดตรงข้าม</b> ถอนด้วยราคาของรายการเดิม ⇒
                    ยอดคลังและต้นทุนเฉลี่ยกลับที่เดิม · รายการเดิมยังอยู่ในประวัติ (ลบไม่ได้)
                    และกลับรายการซ้ำไม่ได้
                  </p>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReverseTarget(null);
                setReverseReason("");
              }}
            >
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              onClick={handleReverseMovement}
              disabled={reverseSaving || !reverseReason.trim()}
            >
              {reverseSaving ? "กำลังกลับรายการ…" : "กลับรายการ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* แก้ไขคลัง / ไซต์งาน */}
      <Dialog open={!!editWh} onOpenChange={(o) => !o && setEditWh(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>แก้ไขคลัง / ไซต์งาน</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-wh-name">ชื่อคลัง / ไซต์งาน *</Label>
                <Input
                  id="edit-wh-name"
                  value={editWhForm.name}
                  onChange={(e) => setEditWhForm({ ...editWhForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>ประเภท</Label>
                <SegmentedControl
                  value={editWhForm.type}
                  onChange={(v) => setEditWhForm({ ...editWhForm, type: v })}
                  size="md"
                  options={[
                    { value: "central", label: "คลังกลาง" },
                    { value: "site", label: "ไซต์งาน" },
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-wh-addr">ที่ตั้ง</Label>
                <Input
                  id="edit-wh-addr"
                  value={editWhForm.location_address}
                  onChange={(e) =>
                    setEditWhForm({ ...editWhForm, location_address: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-wh-lat">ละติจูด</Label>
                  <Input
                    id="edit-wh-lat"
                    type="number"
                    step="any"
                    value={editWhForm.latitude}
                    onChange={(e) => setEditWhForm({ ...editWhForm, latitude: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-wh-lng">ลองจิจูด</Label>
                  <Input
                    id="edit-wh-lng"
                    type="number"
                    step="any"
                    value={editWhForm.longitude}
                    onChange={(e) => setEditWhForm({ ...editWhForm, longitude: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-wh-contact">ผู้ดูแลหน้างาน</Label>
                  <Input
                    id="edit-wh-contact"
                    value={editWhForm.contact_name}
                    onChange={(e) => setEditWhForm({ ...editWhForm, contact_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-wh-phone">เบอร์ติดต่อ</Label>
                  <Input
                    id="edit-wh-phone"
                    value={editWhForm.contact_phone}
                    onChange={(e) =>
                      setEditWhForm({ ...editWhForm, contact_phone: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>สถานะการใช้งาน</Label>
                <SegmentedControl
                  value={editWhForm.is_active ? "active" : "inactive"}
                  onChange={(v) => setEditWhForm({ ...editWhForm, is_active: v === "active" })}
                  size="md"
                  options={[
                    { value: "active", label: "ใช้งานอยู่" },
                    { value: "inactive", label: "ปิดใช้งาน" },
                  ]}
                />
                <p className="text-xs text-gray-500">
                  ปิดใช้งาน = ไม่ให้เลือกคลังนี้ตอนทำรายการใหม่ แต่ประวัติและยอดเดิมยังอยู่ครบ
                </p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="destructive"
              className="mr-auto"
              onClick={handleDeleteWarehouse}
              disabled={editSaving}
            >
              ลบ
            </Button>
            <Button variant="outline" onClick={() => setEditWh(null)}>
              ยกเลิก
            </Button>
            <Button
              onClick={handleUpdateWarehouse}
              disabled={editSaving || !editWhForm.name.trim()}
            >
              {editSaving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* แก้ไขวัสดุ / สินค้า */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>แก้ไขวัสดุ / สินค้า</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-item-code">รหัสวัสดุ *</Label>
                  <Input
                    id="edit-item-code"
                    value={editItemForm.code}
                    onChange={(e) => setEditItemForm({ ...editItemForm, code: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-item-unit">หน่วยนับ</Label>
                  <Input
                    id="edit-item-unit"
                    value={editItemForm.unit}
                    onChange={(e) => setEditItemForm({ ...editItemForm, unit: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-item-name">ชื่อวัสดุ *</Label>
                <Input
                  id="edit-item-name"
                  value={editItemForm.name}
                  onChange={(e) => setEditItemForm({ ...editItemForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-item-desc">รายละเอียด</Label>
                <Input
                  id="edit-item-desc"
                  value={editItemForm.description}
                  onChange={(e) =>
                    setEditItemForm({ ...editItemForm, description: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-item-min">จุดสั่งซื้อต่ำสุด</Label>
                  <Input
                    id="edit-item-min"
                    type="number"
                    value={editItemForm.min_stock}
                    onChange={(e) =>
                      setEditItemForm({ ...editItemForm, min_stock: e.target.value })
                    }
                  />
                </div>
                {editItemForm.has_cable_measurement && (
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-item-conv">อัตราแปลงหน่วย</Label>
                    <Input
                      id="edit-item-conv"
                      type="number"
                      value={editItemForm.conversion_rate}
                      onChange={(e) =>
                        setEditItemForm({ ...editItemForm, conversion_rate: e.target.value })
                      }
                    />
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>สถานะการใช้งาน</Label>
                <SegmentedControl
                  value={editItemForm.is_active ? "active" : "inactive"}
                  onChange={(v) => setEditItemForm({ ...editItemForm, is_active: v === "active" })}
                  size="md"
                  options={[
                    { value: "active", label: "ใช้งานอยู่" },
                    { value: "inactive", label: "ปิดใช้งาน" },
                  ]}
                />
                <p className="text-xs text-gray-500">
                  ปิดใช้งาน = ไม่ให้เลือกวัสดุนี้ตอนทำรายการใหม่ แต่ประวัติ ยอดคงเหลือ
                  และต้นทุนเดิมยังอยู่ครบ · วิธีติดตาม (Serial / ตัดเมตร)
                  เปลี่ยนไม่ได้เมื่อวัสดุเดินรายการไปแล้ว
                </p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="destructive"
              className="mr-auto"
              onClick={handleDeleteItem}
              disabled={editSaving}
            >
              ลบ
            </Button>
            <Button variant="outline" onClick={() => setEditItem(null)}>
              ยกเลิก
            </Button>
            <Button
              onClick={handleUpdateItem}
              disabled={editSaving || !editItemForm.name.trim() || !editItemForm.code.trim()}
            >
              {editSaving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
