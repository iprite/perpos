"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import { Box, Button, Input, Popover, Textarea } from "rizzui";
import { Title, Text } from "rizzui/typography";
import AppSelect from "@core/ui/app-select";
import TablePagination from "@core/components/table/pagination";
import {
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import TableSearch from "@/components/table/table-search";

import { Modal } from "@core/modal-views/modal";
import { DatePicker } from "@core/ui/datepicker";
import FileUploader from "@/components/form/file-uploader";
import { PiFilePlus, PiTrashSimple } from "react-icons/pi";
import { WorkerEditModal } from "@/app/(hydrogen)/workers/_components/worker-edit-modal";
import type { CustomerOption as WorkerCustomerOption, WorkerRow as WorkerRow } from "@/app/(hydrogen)/workers/_components/worker-edit-types";

import { useAuth } from "@/app/shared/auth-provider";
import { useConfirmDialog } from "@/app/shared/confirm-dialog/provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";


type CustomerRow = {
  id: string;
  display_id: string | null;
  import_temp_id: string | null;
  province_th: string | null;
  name: string;
  tax_id: string | null;
  address: string | null;
  branch_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  organization_id: string | null;
  created_at: string;
  updated_at?: string;
};

type CustomerDocumentRow = {
  id: string;
  doc_type: string | null;
  expiry_date: string | null;
  storage_provider: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  created_at: string;
};

type CustomerWorkplaceRow = {
  id: string;
  customer_id: string;
  name: string | null;
  address: string;
  created_at: string;
};

async function getSignedStorageUrl(input: { supabase: any; table: "customer_documents"; id: string; disposition: "inline" | "attachment" }) {
  const sessionRes = await input.supabase.auth.getSession();
  const token = sessionRes.data.session?.access_token;
  if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const res = await fetch("/api/storage/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ table: input.table, id: input.id, disposition: input.disposition }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "ขอ signed url ไม่สำเร็จ");
  }
  const data = (await res.json()) as { ok: true; url: string };
  return data.url;
}

async function deleteStorageDoc(input: { supabase: any; table: "customer_documents"; id: string }) {
  const sessionRes = await input.supabase.auth.getSession();
  const token = sessionRes.data.session?.access_token;
  if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const res = await fetch("/api/storage/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ table: input.table, id: input.id }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "ลบเอกสารไม่สำเร็จ");
  }
}

function isPdfUrl(url: string) {
  const u = url.toLowerCase();
  return u.includes(".pdf") || u.includes("application/pdf");
}

function digitsOnly(v: string) {
  return String(v ?? "").replace(/\D/g, "");
}

function normalizeThaiTaxIdDigits(v: string) {
  return digitsOnly(v).slice(0, 13);
}

function normalizeThaiPhoneDigits(v: string) {
  const d = digitsOnly(v);
  if (d.startsWith("02")) return d.slice(0, 9);
  if (d.startsWith("0")) return d.slice(0, 10);
  return d.slice(0, 10);
}

function formatThaiPhoneDigits(digits: string) {
  const d = normalizeThaiPhoneDigits(digits);
  if (!d) return "";
  if (d.startsWith("02")) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  }
  if (d.startsWith("0")) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return d;
}

function displayThaiPhone(v: string | null | undefined) {
  const d = normalizeThaiPhoneDigits(v ?? "");
  return d ? formatThaiPhoneDigits(d) : "-";
}

const DEFAULT_THAI_PROVINCES = [
  "กรุงเทพมหานคร",
  "กระบี่",
  "กาญจนบุรี",
  "กาฬสินธุ์",
  "กำแพงเพชร",
  "ขอนแก่น",
  "จันทบุรี",
  "ฉะเชิงเทรา",
  "ชลบุรี",
  "ชัยนาท",
  "ชัยภูมิ",
  "ชุมพร",
  "เชียงราย",
  "เชียงใหม่",
  "ตรัง",
  "ตราด",
  "ตาก",
  "นครนายก",
  "นครปฐม",
  "นครพนม",
  "นครราชสีมา",
  "นครศรีธรรมราช",
  "นครสวรรค์",
  "นนทบุรี",
  "นราธิวาส",
  "น่าน",
  "บึงกาฬ",
  "บุรีรัมย์",
  "ปทุมธานี",
  "ประจวบคีรีขันธ์",
  "ปราจีนบุรี",
  "ปัตตานี",
  "พระนครศรีอยุธยา",
  "พะเยา",
  "พังงา",
  "พัทลุง",
  "พิจิตร",
  "พิษณุโลก",
  "เพชรบุรี",
  "เพชรบูรณ์",
  "แพร่",
  "ภูเก็ต",
  "มหาสารคาม",
  "มุกดาหาร",
  "แม่ฮ่องสอน",
  "ยโสธร",
  "ยะลา",
  "ร้อยเอ็ด",
  "ระนอง",
  "ระยอง",
  "ราชบุรี",
  "ลพบุรี",
  "ลำปาง",
  "ลำพูน",
  "เลย",
  "ศรีสะเกษ",
  "สกลนคร",
  "สงขลา",
  "สตูล",
  "สมุทรปราการ",
  "สมุทรสงคราม",
  "สมุทรสาคร",
  "สระแก้ว",
  "สระบุรี",
  "สิงห์บุรี",
  "สุโขทัย",
  "สุพรรณบุรี",
  "สุราษฎร์ธานี",
  "สุรินทร์",
  "หนองคาย",
  "หนองบัวลำภู",
  "อ่างทอง",
  "อำนาจเจริญ",
  "อุดรธานี",
  "อุตรดิตถ์",
  "อุทัยธานี",
  "อุบลราชธานี",
];

export default function CustomersPage() {
  const { role, userId } = useAuth();
  const confirm = useConfirmDialog();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const topRef = useRef<HTMLDivElement | null>(null);
  const initialFormRef = useRef<{
    province: string;
    name: string;
    taxId: string;
    address: string;
    branchName: string;
    contactName: string;
    phone: string;
    email: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDisplayId, setEditingDisplayId] = useState<string | null>(null);

  const [provinces, setProvinces] = useState<string[]>([]);

  const provinceOptions = useMemo(() => provinces.map((p) => ({ label: p, value: p })), [provinces]);

  const [province, setProvince] = useState("");
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [branchName, setBranchName] = useState("สำนักงานใหญ่");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [docRows, setDocRows] = useState<CustomerDocumentRow[]>([]);
  const [docType, setDocType] = useState("");
  const [docExpiryDate, setDocExpiryDate] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docAddOpen, setDocAddOpen] = useState(false);
  const [docViewerOpen, setDocViewerOpen] = useState(false);
  const [docViewerLoading, setDocViewerLoading] = useState(false);
  const [docViewerUrl, setDocViewerUrl] = useState<string | null>(null);
  const [docViewerId, setDocViewerId] = useState<string | null>(null);
  const [docViewerTitle, setDocViewerTitle] = useState<string | null>(null);
  const [docViewerError, setDocViewerError] = useState<string | null>(null);

  const [workerRows, setWorkerRows] = useState<WorkerRow[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [workersError, setWorkersError] = useState<string | null>(null);
  const [workerEditOpen, setWorkerEditOpen] = useState(false);
  const [workerEditing, setWorkerEditing] = useState<WorkerRow | null>(null);

  const [workplaceRows, setWorkplaceRows] = useState<CustomerWorkplaceRow[]>([]);
  const [workplaceAddOpen, setWorkplaceAddOpen] = useState(false);
  const [workplaceEditingId, setWorkplaceEditingId] = useState<string | null>(null);
  const [workplaceName, setWorkplaceName] = useState("");
  const [workplaceAddress, setWorkplaceAddress] = useState("");

  const resetForm = useCallback(() => {
    initialFormRef.current = null;
    setEditingId(null);
    setEditingDisplayId(null);
    setProvince("");
    setName("");
    setTaxId("");
    setAddress("");
    setBranchName("สำนักงานใหญ่");
    setContactName("");
    setPhone("");
    setEmail("");
    setDocRows([]);
    setDocType("");
    setDocExpiryDate("");
    setDocFile(null);
    setDocAddOpen(false);
    setDocViewerOpen(false);
    setDocViewerLoading(false);
    setDocViewerUrl(null);
    setDocViewerId(null);
    setDocViewerTitle(null);
    setDocViewerError(null);

    setWorkerRows([]);
    setWorkersLoading(false);
    setWorkersError(null);
    setWorkerEditOpen(false);
    setWorkerEditing(null);

    setWorkplaceRows([]);
    setWorkplaceAddOpen(false);
    setWorkplaceEditingId(null);
    setWorkplaceName("");
    setWorkplaceAddress("");
  }, []);

  const openEditCustomer = useCallback(
    (r: CustomerRow) => {
      if (role === "employer") return;
      const taxIdDigits = normalizeThaiTaxIdDigits(r.tax_id ?? "");
      const phoneDigits = normalizeThaiPhoneDigits(r.phone ?? "");
      initialFormRef.current = {
        province: r.province_th ?? "",
        name: r.name ?? "",
        taxId: taxIdDigits,
        address: r.address ?? "",
        branchName: r.branch_name ?? "สำนักงานใหญ่",
        contactName: r.contact_name ?? "",
        phone: phoneDigits,
        email: r.email ?? "",
      };
      setEditingId(r.id);
      setEditingDisplayId(r.display_id ?? null);
      setProvince(r.province_th ?? "");
      setName(r.name ?? "");
      setTaxId(taxIdDigits);
      setAddress(r.address ?? "");
      setBranchName(r.branch_name ?? "สำนักงานใหญ่");
      setContactName(r.contact_name ?? "");
      setPhone(phoneDigits);
      setEmail(r.email ?? "");
      setDocAddOpen(false);
      setDocViewerOpen(false);
      setDocViewerLoading(false);
      setDocViewerUrl(null);
      setDocViewerId(null);
      setDocViewerTitle(null);
      setDocViewerError(null);

      setWorkplaceRows([]);
      setWorkplaceAddOpen(false);
      setWorkplaceEditingId(null);
      setWorkplaceName("");
      setWorkplaceAddress("");
      setShowForm(true);
      window.setTimeout(() => {
        (document.getElementById("customer-name") as HTMLInputElement | null)?.focus?.();
      }, 50);
    },
    [role]
  );

  const refreshDocs = useCallback(
    (customerId: string) => {
      Promise.resolve().then(async () => {
        try {
          const { data, error: e } = await supabase
            .from("customer_documents")
            .select("id,doc_type,expiry_date,storage_provider,storage_bucket,storage_path,file_name,created_at")
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false });
          if (e) return;
          setDocRows((data ?? []) as CustomerDocumentRow[]);
        } catch {
          return;
        }
      });
    },
    [supabase],
  );

  const refreshWorkers = useCallback(
    (customerId: string) => {
      Promise.resolve().then(async () => {
        setWorkersLoading(true);
        setWorkersError(null);
        try {
          const res = await supabase
            .from("workers")
            .select(
              "id,worker_id,full_name,customer_id,workplace_id,order_id,passport_no,passport_type,passport_expire_date,nationality,birth_date,os_sex,profile_pic_url,visa_exp_date,wp_number,wp_expire_date,wp_type,created_at",
            )
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(200);
          if (res.error) {
            setWorkersError(res.error.message);
            setWorkerRows([]);
            setWorkersLoading(false);
            return;
          }
          setWorkerRows(((res.data ?? []) as any[]) as WorkerRow[]);
          setWorkersLoading(false);
        } catch (e: any) {
          setWorkersError(e?.message ?? "โหลดรายการแรงงานไม่สำเร็จ");
          setWorkerRows([]);
          setWorkersLoading(false);
        }
      });
    },
    [supabase],
  );

  const refreshWorkplaces = useCallback(
    (customerId: string) => {
      Promise.resolve().then(async () => {
        try {
          const { data, error: e } = await supabase
            .from("customer_workplaces")
            .select("id,customer_id,name,address,created_at")
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false });
          if (e) return;
          setWorkplaceRows((data ?? []) as CustomerWorkplaceRow[]);
        } catch {
          return;
        }
      });
    },
    [supabase],
  );

  useEffect(() => {
    if (!showForm) return;
    if (!editingId) return;
    refreshDocs(editingId);
  }, [editingId, refreshDocs, showForm]);

  useEffect(() => {
    if (!showForm) return;
    if (!editingId) return;
    refreshWorkers(editingId);
  }, [editingId, refreshWorkers, showForm]);

  useEffect(() => {
    if (!showForm) return;
    if (!editingId) return;
    refreshWorkplaces(editingId);
  }, [editingId, refreshWorkplaces, showForm]);


  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      try {
        const from = pagination.pageIndex * pagination.pageSize;
        const to = from + pagination.pageSize - 1;
        const q = search.trim();

        const buildQuery = (preferUpdatedAt: boolean) => {
          let query = supabase
            .from("customers")
            .select(
              "id,display_id,import_temp_id,province_th,name,tax_id,address,branch_name,contact_name,phone,email,organization_id,created_at,updated_at",
              { count: "estimated" },
            );
          if (preferUpdatedAt) {
            query = query
              .order("updated_at", { ascending: false })
              .order("created_at", { ascending: false })
              .order("id", { ascending: false });
          } else {
            query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
          }
          return query;
        };

        let query = buildQuery(true);

        if (q) {
          const like = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
          query = query.or(
            [
              `name.ilike.${like}`,
              `display_id.ilike.${like}`,
              `import_temp_id.ilike.${like}`,
              `tax_id.ilike.${like}`,
              `contact_name.ilike.${like}`,
              `phone.ilike.${like}`,
              `email.ilike.${like}`,
            ].join(","),
          );
        }

        const res = await query.range(from, to);
        if (res.error) {
          const msg = String(res.error.message ?? "");
          if (msg.includes("customers.updated_at") || (msg.includes("updated_at") && msg.toLowerCase().includes("does not exist"))) {
            const fallbackRes = await buildQuery(false).range(from, to);
            if (fallbackRes.error) {
              setError(fallbackRes.error.message);
              setRows([]);
              setTotalRows(0);
              setLoading(false);
              return;
            }
            setRows((fallbackRes.data ?? []) as CustomerRow[]);
            setTotalRows(fallbackRes.count ?? 0);
            setLoading(false);
            return;
          }
          setError(msg || "โหลดข้อมูลไม่สำเร็จ");
          setRows([]);
          setTotalRows(0);
          setLoading(false);
          return;
        }
        setRows((res.data ?? []) as CustomerRow[]);
        setTotalRows(res.count ?? 0);
        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setRows([]);
        setTotalRows(0);
        setLoading(false);
      }
    });
  }, [pagination.pageIndex, pagination.pageSize, search, supabase]);

  const refreshProvinces = useCallback(() => {
    Promise.resolve().then(async () => {
      try {
        const { data, error: e } = await supabase
          .from("pat_provinces")
          .select("province_th")
          .order("province_th", { ascending: true });
        if (!e) {
          const list = (data ?? [])
            .map((x) => (x as { province_th?: string | null }).province_th ?? "")
            .map((x) => x.trim())
            .filter(Boolean);
          if (list.length > 0) {
            setProvinces(list);
            return;
          }
        }
      } catch {
      }

      try {
        const { data, error: e } = await supabase
          .from("customers")
          .select("province_th")
          .not("province_th", "is", null)
          .order("province_th", { ascending: true })
          .range(0, 999);
        if (e) {
          setProvinces(DEFAULT_THAI_PROVINCES);
          return;
        }
        const set = new Set<string>();
        for (const x of data ?? []) {
          const p = String((x as any).province_th ?? "").trim();
          if (p) set.add(p);
        }
        const fromCustomers = Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
        setProvinces(fromCustomers.length ? fromCustomers : DEFAULT_THAI_PROVINCES);
      } catch {
        setProvinces(DEFAULT_THAI_PROVINCES);
        return;
      }
    });
  }, [supabase]);

  React.useEffect(() => {
    refreshProvinces();
  }, [refreshProvinces]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [search]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const table = useReactTable({
    data: rows,
    columns: useMemo(() => [{ accessorKey: "id" }], []),
    state: { pagination },
    onPaginationChange: setPagination,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(totalRows / Math.max(1, pagination.pageSize))),
    getCoreRowModel: getCoreRowModel(),
  });

  const taxIdDigits = useMemo(() => normalizeThaiTaxIdDigits(taxId), [taxId]);
  const taxIdOk = taxIdDigits.length === 0 || taxIdDigits.length === 13;
  const canSave = name.trim().length > 0 && taxIdOk;
  const canDelete = !!editingId;
  const workerModalCustomers = useMemo(() => {
    if (!editingId) return [] as WorkerCustomerOption[];
    return [{ id: editingId, name: name.trim() || "ลูกค้า" }];
  }, [editingId, name]);
  const isFormMode = Boolean(showForm);
  const isDirty = useMemo(() => {
    if (!editingId) return true;
    const init = initialFormRef.current;
    if (!init) return true;
    const normalize = (v: {
      province: string;
      name: string;
      taxId: string;
      address: string;
      branchName: string;
      contactName: string;
      phone: string;
      email: string;
    }) => ({
      province: v.province.trim(),
      name: v.name.trim(),
      taxId: normalizeThaiTaxIdDigits(v.taxId),
      address: v.address.trim(),
      branchName: v.branchName.trim() || "สำนักงานใหญ่",
      contactName: v.contactName.trim(),
      phone: normalizeThaiPhoneDigits(v.phone),
      email: v.email.trim(),
    });
    const a = normalize(init);
    const b = normalize({ province, name, taxId, address, branchName, contactName, phone, email });
    return (
      a.province !== b.province ||
      a.name !== b.name ||
      a.taxId !== b.taxId ||
      a.address !== b.address ||
      a.branchName !== b.branchName ||
      a.contactName !== b.contactName ||
      a.phone !== b.phone ||
      a.email !== b.email
    );
  }, [address, branchName, contactName, editingId, email, name, phone, province, taxId]);

  const deleteCustomer = useCallback(async () => {
    if (!editingId) return;
    const ok = await confirm({
      title: "ยืนยันการลบ",
      message: "ต้องการลบรายการนี้หรือไม่?",
      confirmText: "ลบ",
      tone: "danger",
    });
    if (!ok) return;
    setLoading(true);
    setError(null);
    try {
      const { count, error: countErr } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", editingId);
      if (countErr) {
        setError(countErr.message);
        setLoading(false);
        return;
      }
      if ((count ?? 0) > 0) {
        setError(`ลบไม่ได้ เนื่องจากมีออเดอร์ผูกอยู่ ${count} รายการ`);
        setLoading(false);
        return;
      }
    } catch {
      setLoading(false);
      return;
    }
    const { error: e } = await supabase.from("customers").delete().eq("id", editingId);
    if (e) {
      if (String(e.message || "").includes("orders_customer_id_fkey")) {
        setError("ลบไม่ได้ เนื่องจากมีออเดอร์ผูกอยู่ (กรุณาย้าย/ลบออเดอร์ก่อน)");
      } else {
        setError(e.message);
      }
      setLoading(false);
      return;
    }
    toast.success("ลบแล้ว");
    resetForm();
    setShowForm(false);
    setLoading(false);
    refresh();
  }, [confirm, editingId, refresh, resetForm, supabase]);

  return (
    <div ref={topRef}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        {!isFormMode ? (
          <div>
            <Title as="h1" className="text-lg font-semibold text-gray-900">
              นายจ้าง/ลูกค้า
            </Title>
            <Text className="mt-1 text-sm text-gray-600">ข้อมูลนายจ้าง/ลูกค้า และผู้ติดต่อ</Text>
          </div>
        ) : null}
        {role !== "employer" && !isFormMode ? (
          <div className="flex flex-wrap gap-2">
            <TableSearch value={search} onChange={setSearch} />
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setShowForm(true);
                window.setTimeout(() => {
                  (document.getElementById("customer-name") as HTMLInputElement | null)?.focus?.();
                }, 50);
              }}
              disabled={loading}
            >
              เพิ่ม
            </Button>
          </div>
        ) : null}
      </div>

      {role !== "employer" && showForm ? (
        <div className="mt-5">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <div className="text-lg font-semibold text-gray-900">{editingId ? "แก้ไขลูกค้า" : "เพิ่มลูกค้า"}</div>
              <div className="mt-1 text-sm text-gray-600">ข้อมูลนายจ้าง/ลูกค้า และผู้ติดต่อ</div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!editingId || isDirty ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    const payload = {
                      province_th: province.trim() || null,
                      name: name.trim(),
                    tax_id: taxIdDigits || null,
                      address: address.trim() || null,
                      branch_name: branchName.trim() || "สำนักงานใหญ่",
                      contact_name: contactName.trim() || null,
                      phone: phone.trim() || null,
                      email: email.trim() || null,
                    };

                    if (editingId) {
                      const { error: e } = await supabase.from("customers").update(payload).eq("id", editingId);
                      if (e) {
                        setError(e.message);
                        setLoading(false);
                        return;
                      }
                      toast.success("อัปเดตแล้ว");
                      resetForm();
                      setShowForm(false);
                      setLoading(false);
                      refresh();
                      return;
                    }

                    const { data: created, error: e } = await supabase
                      .from("customers")
                      .insert({ ...payload, created_by_profile_id: userId })
                      .select("id,display_id")
                      .single();
                    if (e) {
                      setError(e.message);
                      setLoading(false);
                      return;
                    }
                    toast.success("บันทึกแล้ว");
                    resetForm();
                    setShowForm(false);
                    setLoading(false);
                    refresh();
                  }}
                  disabled={loading || !canSave}
                >
                  {editingId ? "อัปเดต" : "บันทึก"}
                </Button>
              ) : null}
              <Popover placement="bottom-end">
                <Popover.Trigger>
                  <Button size="sm" variant="outline" disabled={loading}>
                    จัดการ
                  </Button>
                </Popover.Trigger>
                <Popover.Content className="z-0 min-w-max px-2 py-2 dark:bg-gray-100 [&>svg]:dark:fill-gray-100">
                  {({ setOpen }) => (
                    <Box className="text-gray-900">
                      <Button
                        variant="text"
                        className="flex w-full items-center justify-start whitespace-nowrap px-2 py-2 hover:bg-gray-100 focus:outline-none dark:hover:bg-gray-50"
                        onClick={() => {
                          setDocAddOpen(true);
                          setOpen(false);
                        }}
                        disabled={loading || !editingId}
                      >
                        <PiFilePlus className="mr-2 h-4 w-4 text-gray-500" />
                        เพิ่มเอกสาร
                      </Button>
                      <Button
                        variant="text"
                        className="flex w-full items-center justify-start whitespace-nowrap px-2 py-2 text-red-700 hover:bg-red-50 focus:outline-none dark:hover:bg-red-50"
                        onClick={async () => {
                          await deleteCustomer();
                          setOpen(false);
                        }}
                        disabled={loading || !canDelete}
                      >
                        <PiTrashSimple className="mr-2 h-4 w-4 text-red-700" />
                        ลบ
                      </Button>
                    </Box>
                  )}
                </Popover.Content>
              </Popover>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                disabled={loading}
              >
                ปิด
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-5 lg:grid-cols-2 lg:items-start">
            <div className="grid gap-5">
              <div className="rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
                <div className="text-sm font-semibold text-gray-900">ข้อมูลลูกค้า</div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Input id="customer-name" label="ชื่อลูกค้า" value={name} onChange={(e) => setName(e.target.value)} className="md:col-span-2" />
                  <Input
                    label="Tax ID"
                    value={taxIdDigits}
                    onChange={(e) => setTaxId(normalizeThaiTaxIdDigits(e.target.value))}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                  />
                  <Input label="สาขา" value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="สำนักงานใหญ่" />
                  {provinceOptions.length ? (
                    <div className="md:col-span-2">
                      <AppSelect
                        label="จังหวัด"
                        placeholder="เลือกจังหวัด"
                        options={provinceOptions}
                        value={province}
                        onChange={(v: string) => setProvince(v)}
                        getOptionValue={(o) => o.value}
                        displayValue={(selected) => provinceOptions.find((o) => o.value === selected)?.label ?? ""}
                        inPortal={true}
                        selectClassName="h-10 px-3"
                        dropdownClassName="!z-[9999]"
                      />
                    </div>
                  ) : (
                    <Input
                      label="จังหวัด"
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      placeholder="พิมพ์จังหวัด"
                      className="md:col-span-2"
                    />
                  )}
                  <div className="md:col-span-2">
                    <Textarea label="ที่อยู่" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} disabled={loading} />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">ที่อยู่ที่ทำงาน</div>
                    <div className="mt-0.5 text-xs text-gray-500">สามารถเพิ่มได้หลายที่ต่อ 1 ลูกค้า</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setWorkplaceEditingId(null);
                      setWorkplaceName("");
                      setWorkplaceAddress("");
                      setWorkplaceAddOpen(true);
                    }}
                    disabled={loading || !editingId}
                  >
                    เพิ่มที่อยู่
                  </Button>
                </div>

                {!editingId ? (
                  <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                    บันทึกลูกค้าก่อน แล้วจึงเพิ่มที่อยู่ที่ทำงานได้
                  </div>
                ) : null}

                <div className="mt-4 grid gap-2">
                  {editingId && workplaceRows.length === 0 ? <div className="text-sm text-gray-600">ยังไม่มีที่อยู่ที่ทำงาน</div> : null}
                  {editingId
                    ? workplaceRows.map((w, idx) => (
                        <div key={w.id} className="rounded-xl border border-gray-200 bg-white p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-[220px]">
                              <div className="text-sm font-medium text-gray-900">{(w.name ?? "").trim() || `ที่อยู่ที่ทำงาน #${idx + 1}`}</div>
                              <div className="mt-1 whitespace-pre-line text-xs text-gray-600">{w.address}</div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={loading}
                                onClick={() => {
                                  setWorkplaceEditingId(w.id);
                                  setWorkplaceName(w.name ?? "");
                                  setWorkplaceAddress(w.address ?? "");
                                  setWorkplaceAddOpen(true);
                                }}
                              >
                                แก้ไข
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={loading}
                                onClick={async () => {
                                  if (!editingId) return;
                                  const ok = await confirm({
                                    title: "ยืนยันการลบ",
                                    message: "ต้องการลบที่อยู่ที่ทำงานนี้หรือไม่?",
                                    confirmText: "ลบ",
                                    tone: "danger",
                                  });
                                  if (!ok) return;
                                  setLoading(true);
                                  setError(null);
                                  const { error: delErr } = await supabase.from("customer_workplaces").delete().eq("id", w.id);
                                  if (delErr) {
                                    setError(delErr.message);
                                    setLoading(false);
                                    return;
                                  }
                                  toast.success("ลบแล้ว");
                                  setLoading(false);
                                  refreshWorkplaces(editingId);
                                }}
                              >
                                ลบ
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    : null}
                </div>

                <Modal
                  isOpen={workplaceAddOpen}
                  onClose={() => {
                    setWorkplaceAddOpen(false);
                    setWorkplaceEditingId(null);
                    setWorkplaceName("");
                    setWorkplaceAddress("");
                  }}
                  size="lg"
                  rounded="md"
                >
                  <div className="rounded-xl bg-white p-5">
                    <div className="text-base font-semibold text-gray-900">{workplaceEditingId ? "แก้ไขที่อยู่ที่ทำงาน" : "เพิ่มที่อยู่ที่ทำงาน"}</div>
                    <div className="mt-3 grid gap-3">
                      <Input label="ชื่อสถานที่ (ถ้ามี)" value={workplaceName} onChange={(e) => setWorkplaceName(e.target.value)} disabled={loading} />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setWorkplaceAddress(address)}
                          disabled={loading || !address.trim()}
                        >
                          คัดลอกจากที่อยู่นายจ้าง
                        </Button>
                      </div>
                      <Textarea
                        label="ที่อยู่ที่ทำงาน"
                        value={workplaceAddress}
                        onChange={(e) => setWorkplaceAddress(e.target.value)}
                        rows={4}
                        disabled={loading}
                      />
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setWorkplaceAddOpen(false);
                          setWorkplaceEditingId(null);
                          setWorkplaceName("");
                          setWorkplaceAddress("");
                        }}
                        disabled={loading}
                      >
                        ยกเลิก
                      </Button>
                      <Button
                        onClick={async () => {
                          if (!editingId) return;
                          if (!workplaceAddress.trim()) return;
                          setLoading(true);
                          setError(null);
                          const now = new Date().toISOString();
                          if (workplaceEditingId) {
                            const { error: upErr } = await supabase
                              .from("customer_workplaces")
                              .update({ name: workplaceName.trim() || null, address: workplaceAddress.trim(), updated_at: now })
                              .eq("id", workplaceEditingId);
                            if (upErr) {
                              setError(upErr.message);
                              setLoading(false);
                              return;
                            }
                            toast.success("อัปเดตแล้ว");
                          } else {
                            const { error: insErr } = await supabase.from("customer_workplaces").insert({
                              customer_id: editingId,
                              name: workplaceName.trim() || null,
                              address: workplaceAddress.trim(),
                              created_by_profile_id: userId,
                              updated_at: now,
                            });
                            if (insErr) {
                              setError(insErr.message);
                              setLoading(false);
                              return;
                            }
                            toast.success("บันทึกแล้ว");
                          }
                          setWorkplaceAddOpen(false);
                          setWorkplaceEditingId(null);
                          setWorkplaceName("");
                          setWorkplaceAddress("");
                          setLoading(false);
                          refreshWorkplaces(editingId);
                        }}
                        disabled={loading || !editingId || !workplaceAddress.trim()}
                      >
                        {workplaceEditingId ? "อัปเดต" : "บันทึก"}
                      </Button>
                    </div>
                  </div>
                </Modal>
              </div>
            </div>

            <div className="grid gap-5">
              <div className="rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
                <div className="text-sm font-semibold text-gray-900">ข้อมูลผู้ติดต่อ</div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Input label="ชื่อผู้ติดต่อ" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                  <Input
                    label="เบอร์ติดต่อ"
                    value={formatThaiPhoneDigits(phone)}
                    onChange={(e) => setPhone(normalizeThaiPhoneDigits(e.target.value))}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="tel"
                  />
                  <Input className="md:col-span-2" label="อีเมล" value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">รายการเอกสาร</div>
                    <div className="mt-0.5 text-xs text-gray-500">เอกสารประกอบของลูกค้า</div>
                  </div>
                </div>

                {!editingId ? (
                  <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                    บันทึกลูกค้าก่อน แล้วจึงเพิ่มเอกสารได้
                  </div>
                ) : null}

                <div className="mt-4 max-h-[360px] overflow-y-auto">
                  <div className="grid gap-2">
                    {editingId && docRows.length === 0 ? <div className="text-sm text-gray-600">ยังไม่มีเอกสาร</div> : null}
                    {editingId
                      ? docRows.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50"
                            onClick={async () => {
                              setDocViewerError(null);
                              setDocViewerTitle(d.doc_type || "เอกสาร");
                              setDocViewerId(d.id);
                              setDocViewerUrl(null);
                              setDocViewerLoading(true);
                              setDocViewerOpen(true);
                              try {
                                const url = await getSignedStorageUrl({ supabase, table: "customer_documents", id: d.id, disposition: "inline" });
                                setDocViewerUrl(url);
                              } catch (e: any) {
                                setDocViewerError(e?.message ?? "เปิดไฟล์ไม่สำเร็จ");
                              }
                              setDocViewerLoading(false);
                            }}
                            disabled={loading}
                          >
                            <div className="min-w-[220px]">
                              <div className="text-sm font-medium text-gray-900">{d.doc_type || "เอกสาร"}</div>
                              <div className="text-xs text-gray-600">
                                {d.file_name || "-"}
                                {d.expiry_date ? ` • หมดอายุ ${d.expiry_date}` : ""}
                              </div>
                            </div>
                            <div className="text-xs font-semibold text-gray-700">เปิด</div>
                          </button>
                        ))
                      : null}
                  </div>
                </div>

                <Modal
                  isOpen={docAddOpen}
                  onClose={() => {
                    setDocAddOpen(false);
                    setDocType("");
                    setDocExpiryDate("");
                    setDocFile(null);
                  }}
                  size="lg"
                  rounded="md"
                >
                  <div className="rounded-xl bg-white p-5">
                    <div className="text-base font-semibold text-gray-900">เพิ่มเอกสาร</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <Input label="ประเภทเอกสาร" value={docType} onChange={(e) => setDocType(e.target.value)} disabled={loading} />
                      <DatePicker
                        selected={docExpiryDate ? new Date(docExpiryDate) : null}
                        onChange={(date: Date | null) => setDocExpiryDate(date ? date.toISOString().slice(0, 10) : "")}
                        placeholderText="เลือกวันที่"
                        disabled={loading}
                        inputProps={{ label: "วันหมดอายุ (ถ้ามี)" }}
                      />
                      <div className="md:col-span-2">
                        <FileUploader
                          label=""
                          helperText="คลิกเพื่อแนบไฟล์ หรือ ลากไฟล์มาวาง"
                          accept={{ "image/*": [], "application/pdf": [] }}
                          multiple={false}
                          maxFiles={1}
                          maxSizeBytes={20 * 1024 * 1024}
                          files={docFile ? [docFile] : []}
                          onFilesChange={(next) => setDocFile(next[0] ?? null)}
                          disabled={loading}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setDocAddOpen(false);
                          setDocType("");
                          setDocExpiryDate("");
                          setDocFile(null);
                        }}
                        disabled={loading}
                      >
                        ยกเลิก
                      </Button>
                      <Button
                        onClick={async () => {
                          if (!editingId) return;
                          if (!docFile) return;
                          setLoading(true);
                          setError(null);
                          const form = new FormData();
                          form.set("entityType", "customer");
                          form.set("entityId", editingId);
                          form.set("docType", docType.trim());
                          if (docExpiryDate.trim()) form.set("expiryDate", docExpiryDate.trim());
                          form.set("file", docFile);
                          const res = await fetch("/api/storage/upload", { method: "POST", body: form });
                          if (!res.ok) {
                            const data = (await res.json().catch(() => ({}))) as { error?: string };
                            setError(data.error || "อัปโหลดเอกสารไม่สำเร็จ");
                            setLoading(false);
                            return;
                          }
                          toast.success("อัปโหลดแล้ว");
                          setDocType("");
                          setDocExpiryDate("");
                          setDocFile(null);
                          setDocAddOpen(false);
                          setLoading(false);
                          refreshDocs(editingId);
                        }}
                        disabled={loading || !editingId || !docFile}
                      >
                        อัปโหลด
                      </Button>
                    </div>
                  </div>
                </Modal>

                <Modal
                  isOpen={docViewerOpen}
                  onClose={() => {
                    setDocViewerOpen(false);
                    setDocViewerLoading(false);
                    setDocViewerUrl(null);
                    setDocViewerId(null);
                    setDocViewerTitle(null);
                    setDocViewerError(null);
                  }}
                  size="lg"
                  rounded="md"
                >
                  <div className="rounded-xl bg-white p-5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate text-base font-semibold text-gray-900">{docViewerTitle ?? "เอกสาร"}</div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="outline"
                          onClick={async () => {
                            if (!docViewerId) return;
                            const ok = await confirm({
                              title: "ยืนยันการลบ",
                              message: "ต้องการลบเอกสารนี้หรือไม่?",
                              confirmText: "ลบ",
                              tone: "danger",
                            });
                            if (!ok) return;
                            setDocViewerError(null);
                            setDocViewerLoading(true);
                            try {
                              await deleteStorageDoc({ supabase, table: "customer_documents", id: docViewerId });
                              toast.success("ลบแล้ว");
                              setDocViewerOpen(false);
                              setDocViewerUrl(null);
                              setDocViewerId(null);
                              setDocViewerTitle(null);
                              setDocViewerError(null);
                              if (editingId) refreshDocs(editingId);
                            } catch (e: any) {
                              setDocViewerError(e?.message ?? "ลบเอกสารไม่สำเร็จ");
                            }
                            setDocViewerLoading(false);
                          }}
                          disabled={loading || docViewerLoading || !docViewerId}
                        >
                          ลบ
                        </Button>
                        <Button
                          variant="outline"
                          onClick={async () => {
                            if (!docViewerId) return;
                            setDocViewerError(null);
                            try {
                              const url = await getSignedStorageUrl({
                                supabase,
                                table: "customer_documents",
                                id: docViewerId,
                                disposition: "attachment",
                              });
                              window.open(url, "_blank", "noopener,noreferrer");
                            } catch (e: any) {
                              setDocViewerError(e?.message ?? "ดาวน์โหลดไม่สำเร็จ");
                            }
                          }}
                          disabled={loading || docViewerLoading || !docViewerId}
                        >
                          ดาวน์โหลด
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setDocViewerOpen(false);
                            setDocViewerLoading(false);
                            setDocViewerUrl(null);
                            setDocViewerId(null);
                            setDocViewerTitle(null);
                            setDocViewerError(null);
                          }}
                          disabled={loading || docViewerLoading}
                        >
                          ปิด
                        </Button>
                      </div>
                    </div>

                    {docViewerError ? (
                      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{docViewerError}</div>
                    ) : null}

                    <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                      {docViewerUrl ? (
                        isPdfUrl(docViewerUrl) ? (
                          <iframe src={docViewerUrl} className="h-[70vh] w-full" />
                        ) : (
                          <img src={docViewerUrl} alt={docViewerTitle ?? "document"} className="h-[70vh] w-full object-contain" />
                        )
                      ) : docViewerLoading ? (
                        <div className="p-6 text-sm text-gray-600">กำลังโหลด...</div>
                      ) : (
                        <div className="p-6 text-sm text-gray-600">ไม่พบไฟล์</div>
                      )}
                    </div>
                  </div>
                </Modal>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">รายการแรงงาน</div>
                    <div className="mt-0.5 text-xs text-gray-500">แรงงานที่ผูกกับนายจ้าง/ลูกค้านี้</div>
                  </div>
                </div>

                {!editingId ? (
                  <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">บันทึกลูกค้าก่อน แล้วจึงดูรายการแรงงานได้</div>
                ) : workersError ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{workersError}</div>
                ) : (
                  <div className="mt-4">
                    {workersLoading ? (
                      <div className="text-sm text-gray-600">กำลังโหลด...</div>
                    ) : workerRows.length === 0 ? (
                      <div className="text-sm text-gray-600">ยังไม่มีแรงงาน</div>
                    ) : (
                      <div className="grid gap-2">
                        {workerRows.map((w) => (
                          <button
                            key={w.id}
                            type="button"
                            className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50"
                            onClick={() => {
                              setWorkerEditing(w);
                              setWorkerEditOpen(true);
                            }}
                            disabled={loading}
                          >
                            <div className="flex min-w-[220px] items-center gap-3">
                              <div className="relative h-9 w-9 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
                                {w.profile_pic_url ? (
                                  <Image src={String(w.profile_pic_url)} alt="worker" fill unoptimized className="object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-gray-600">
                                    {String(w.full_name ?? "")
                                      .trim()
                                      .split(/\s+/)
                                      .slice(0, 2)
                                      .map((x) => x.slice(0, 1))
                                      .join("")
                                      .toUpperCase() || "W"}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900">{w.full_name || "-"}</div>
                                <div className="text-xs text-gray-600">
                                  {(() => {
                                    const wid = String(w.worker_id ?? "").trim();
                                    const nat = String(w.nationality ?? "").trim();
                                    const pass = String(w.passport_no ?? "").trim();
                                    const wp = String(w.wp_number ?? "").trim();
                                    const parts = [wid, nat, pass ? `P ${pass}` : "", wp ? `WP ${wp}` : ""].filter(Boolean);
                                    return parts.length ? parts.join(" • ") : "-";
                                  })()}
                                </div>
                              </div>
                            </div>
                            <div className="text-xs font-semibold text-gray-700">ดูรายละเอียด</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <WorkerEditModal
            open={workerEditOpen}
            onClose={() => {
              setWorkerEditOpen(false);
              setWorkerEditing(null);
            }}
            initial={workerEditing}
            supabase={supabase}
            role={role}
            userId={userId}
            customers={workerModalCustomers}
            onSaved={() => {
              if (editingId) refreshWorkers(editingId);
            }}
          />
        </div>
      ) : null}

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {!showForm ? (
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-[1100px] overflow-hidden rounded-xl">
            <div className="grid grid-cols-[0.6fr_1.4fr_0.8fr_0.9fr_0.8fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
              <div>ID</div>
              <div>ลูกค้า</div>
              <div>จังหวัด</div>
              <div>ผู้ติดต่อ</div>
              <div>เบอร์ติดต่อ</div>
            </div>
            {rows.length === 0 ? (
              <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
            ) : (
              table.getRowModel().rows.map((row) => {
                const r = row.original as CustomerRow;
                return (
                  <div
                    key={r.id}
                    role={role !== "employer" ? "button" : undefined}
                    tabIndex={role !== "employer" ? 0 : undefined}
                    className={`grid grid-cols-[0.6fr_1.4fr_0.8fr_0.9fr_0.8fr] gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 ${
                      role !== "employer" ? "cursor-pointer transition-colors hover:bg-gray-100 active:bg-gray-200" : ""
                    }`}
                    onClick={() => {
                      if (role === "employer") return;
                      openEditCustomer(r);
                    }}
                    onKeyDown={(e) => {
                      if (role === "employer") return;
                      if (e.key !== "Enter") return;
                      openEditCustomer(r);
                    }}
                  >
                    <div className="text-sm font-medium text-gray-900">{r.display_id ?? "-"}</div>
                    <div className="text-sm font-medium text-gray-900">{r.name}</div>
                    <div className="text-sm text-gray-700">{r.province_th ?? "-"}</div>
                    <div className="text-sm text-gray-700">{r.contact_name ?? "-"}</div>
                    <div className="text-sm text-gray-700">{displayThaiPhone(r.phone)}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <TablePagination table={table} />
      </div>
      ) : null}
    </div>
  );
}
