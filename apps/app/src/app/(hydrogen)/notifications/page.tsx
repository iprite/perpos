"use client";

import React, { useCallback, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Button, Input } from "rizzui";
import { Title, Text } from "rizzui/typography";

import AppSelect from "@core/ui/app-select";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type CustomerOption = { id: string; name: string };

type ExpiryRow = {
  worker_id: string;
  customer_id: string | null;
  worker_full_name: string;
  passport_no: string | null;
  wp_number: string | null;
  doc_type: "passport" | "visa" | "wp";
  expires_at: string | null;
  days_left: number | null;
};

type DeliveryRow = {
  id: string;
  scan_date: string;
  customer_id: string;
  worker_id: string;
  doc_type: "passport" | "visa" | "wp";
  expires_at: string;
  days_left: number;
  lead_day: number;
  audience: "employer" | "sale";
  destination_email: string;
  status: "queued" | "sent" | "failed" | "skipped";
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
};

function docTypeLabel(t: ExpiryRow["doc_type"]) {
  if (t === "passport") return "พาสปอร์ต";
  if (t === "visa") return "วีซ่า";
  return "ใบอนุญาตทำงาน";
}

function statusLabel(daysLeft: number | null) {
  if (daysLeft === null) return "-";
  if (daysLeft < 0) return "หมดอายุ";
  if (daysLeft <= 30) return "ใกล้หมดอายุ";
  return "ปกติ";
}

function statusTone(daysLeft: number | null) {
  if (daysLeft === null) return "bg-gray-100 text-gray-700";
  if (daysLeft < 0) return "bg-red-100 text-red-700";
  if (daysLeft <= 7) return "bg-amber-100 text-amber-800";
  if (daysLeft <= 30) return "bg-yellow-100 text-yellow-800";
  return "bg-emerald-100 text-emerald-800";
}

export default function NotificationsDashboardPage() {
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [rows, setRows] = useState<ExpiryRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);

  const [customerId, setCustomerId] = useState<string>("");
  const [docType, setDocType] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [deliveryPagination, setDeliveryPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const canSeeSettings = role === "admin" || role === "sale" || role === "operation";

  const customerOptions = useMemo(() => customers.map((c) => ({ label: c.name, value: c.id })), [customers]);

  const load = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      try {
        const custRes = await supabase
          .from("customers")
          .select("id,name")
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500);
        if (custRes.error) {
          const msg = String(custRes.error.message ?? "");
          if (msg.includes("customers.updated_at") || (msg.includes("updated_at") && msg.toLowerCase().includes("does not exist"))) {
            const fallback = await supabase.from("customers").select("id,name").order("created_at", { ascending: false }).limit(500);
            if (fallback.error) throw new Error(fallback.error.message);
            setCustomers(((fallback.data ?? []) as CustomerOption[]) ?? []);
          } else {
            throw new Error(msg || "โหลดข้อมูลไม่สำเร็จ");
          }
        } else {
          setCustomers(((custRes.data ?? []) as CustomerOption[]) ?? []);
        }

        let q = supabase
          .from("worker_document_expiry_view")
          .select("worker_id,customer_id,worker_full_name,passport_no,wp_number,doc_type,expires_at,days_left")
          .not("expires_at", "is", null)
          .order("days_left", { ascending: true })
          .limit(2000);

        if (customerId) q = q.eq("customer_id", customerId);
        if (docType) q = q.eq("doc_type", docType);
        if (status === "expired") q = q.lt("days_left", 0);
        if (status === "expiring") q = q.gte("days_left", 0).lte("days_left", 30);
        if (status === "ok") q = q.gt("days_left", 30);

        const expRes = await q;
        if (expRes.error) throw new Error(expRes.error.message);
        const list = ((expRes.data ?? []) as any[]).map((r) => ({
          worker_id: String(r.worker_id),
          customer_id: r.customer_id ? String(r.customer_id) : null,
          worker_full_name: String(r.worker_full_name ?? ""),
          passport_no: r.passport_no ? String(r.passport_no) : null,
          wp_number: r.wp_number ? String(r.wp_number) : null,
          doc_type: String(r.doc_type) as any,
          expires_at: r.expires_at ? String(r.expires_at) : null,
          days_left: typeof r.days_left === "number" ? r.days_left : r.days_left === null ? null : Number(r.days_left),
        })) as ExpiryRow[];
        setRows(list);

        const delRes = await supabase
          .from("document_expiry_notification_deliveries")
          .select(
            "id,scan_date,customer_id,worker_id,doc_type,expires_at,days_left,lead_day,audience,destination_email,status,error_message,sent_at,created_at"
          )
          .order("created_at", { ascending: false })
          .limit(500);
        if (delRes.error) throw new Error(delRes.error.message);
        setDeliveries(((delRes.data ?? []) as DeliveryRow[]) ?? []);
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setRows([]);
        setDeliveries([]);
      } finally {
        setLoading(false);
      }
    });
  }, [customerId, docType, status, supabase]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [customerId, docType, status, search, rows.length]);

  React.useEffect(() => {
    setDeliveryPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [deliveries.length]);

  const customerNameById = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const customerName = r.customer_id ? customerNameById.get(r.customer_id) ?? r.customer_id : "";
      const hay = [r.worker_full_name, r.passport_no, r.wp_number, customerName]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [customerNameById, rows, search]);

  const expiring30 = useMemo(() => rows.filter((r) => (r.days_left ?? 999999) >= 0 && (r.days_left ?? 999999) <= 30).length, [rows]);
  const expiring7 = useMemo(() => rows.filter((r) => (r.days_left ?? 999999) >= 0 && (r.days_left ?? 999999) <= 7).length, [rows]);
  const expired = useMemo(() => rows.filter((r) => (r.days_left ?? 0) < 0).length, [rows]);

  const table = useReactTable({
    data: filteredRows,
    columns: useMemo(() => [{ accessorKey: "worker_id" }], []),
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const deliveryTable = useReactTable({
    data: deliveries,
    columns: useMemo(() => [{ accessorKey: "id" }], []),
    state: { pagination: deliveryPagination },
    onPaginationChange: setDeliveryPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (!userId) {
    return (
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          แจ้งเตือนเอกสาร
        </Title>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">กรุณาเข้าสู่ระบบ</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            แจ้งเตือนเอกสารแรงงาน
          </Title>
          <Text className="mt-1 text-sm text-gray-600">ภาพรวมเอกสารใกล้หมดอายุ/หมดอายุ และประวัติการส่ง</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => load()} disabled={loading}>
            รีเฟรช
          </Button>
          {canSeeSettings ? (
            <Button onClick={() => (window.location.href = "/settings/notifications")} disabled={loading}>
              ตั้งค่า
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold text-gray-600">ใกล้หมดอายุ (30 วัน)</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{expiring30.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold text-gray-600">ใกล้หมดอายุ (7 วัน)</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{expiring7.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold text-gray-600">หมดอายุแล้ว</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{expired.toLocaleString()}</div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">รายการเอกสาร</div>
            <div className="mt-1 text-xs text-gray-500">คลิกรีเฟรชเพื่ออัปเดตสถานะล่าสุด</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-64">
              <AppSelect
                label="นายจ้าง"
                placeholder="ทั้งหมด"
                options={[{ label: "ทั้งหมด", value: "" }, ...customerOptions]}
                value={customerId}
                onChange={(v: string) => setCustomerId(v)}
                getOptionValue={(o) => o.value}
                displayValue={(selected) =>
                  ([{ label: "ทั้งหมด", value: "" }, ...customerOptions] as any[]).find((o) => o.value === selected)?.label ?? ""
                }
                selectClassName="h-10 px-3"
                searchable
                searchPlaceHolder="ค้นหานายจ้าง..."
                inPortal={false}
                disabled={loading}
              />
            </div>
            <div className="w-44">
              <AppSelect
                label="ประเภทเอกสาร"
                placeholder="ทั้งหมด"
                options={[
                  { label: "ทั้งหมด", value: "" },
                  { label: "พาสปอร์ต", value: "passport" },
                  { label: "วีซ่า", value: "visa" },
                  { label: "ใบอนุญาตทำงาน", value: "wp" },
                ]}
                value={docType}
                onChange={(v: string) => setDocType(v)}
                getOptionValue={(o) => o.value}
                displayValue={(selected) =>
                  (
                    [
                      { label: "ทั้งหมด", value: "" },
                      { label: "พาสปอร์ต", value: "passport" },
                      { label: "วีซ่า", value: "visa" },
                      { label: "ใบอนุญาตทำงาน", value: "wp" },
                    ] as any[]
                  ).find((o) => o.value === selected)?.label ?? ""
                }
                selectClassName="h-10 px-3"
                inPortal={false}
                disabled={loading}
              />
            </div>
            <div className="w-44">
              <AppSelect
                label="สถานะ"
                placeholder="ทั้งหมด"
                options={[
                  { label: "ทั้งหมด", value: "" },
                  { label: "ใกล้หมดอายุ (<=30)", value: "expiring" },
                  { label: "หมดอายุ", value: "expired" },
                  { label: "ปกติ", value: "ok" },
                ]}
                value={status}
                onChange={(v: string) => setStatus(v)}
                getOptionValue={(o) => o.value}
                displayValue={(selected) =>
                  (
                    [
                      { label: "ทั้งหมด", value: "" },
                      { label: "ใกล้หมดอายุ (<=30)", value: "expiring" },
                      { label: "หมดอายุ", value: "expired" },
                      { label: "ปกติ", value: "ok" },
                    ] as any[]
                  ).find((o) => o.value === selected)?.label ?? ""
                }
                selectClassName="h-10 px-3"
                inPortal={false}
                disabled={loading}
              />
            </div>
            <div className="w-64">
              <Input label="ค้นหา" placeholder="ชื่อแรงงาน/เลขเอกสาร" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[1.2fr_0.9fr_0.7fr_0.6fr_0.5fr_0.5fr] gap-3 rounded-lg bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
              <div>แรงงาน</div>
              <div>นายจ้าง</div>
              <div>ประเภทเอกสาร</div>
              <div>วันหมดอายุ</div>
              <div>เหลือ(วัน)</div>
              <div>สถานะ</div>
            </div>
            {table.getRowModel().rows.length === 0 ? (
              <div className="px-3 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ไม่พบข้อมูล"}</div>
            ) : (
              table.getRowModel().rows.map((row) => {
                const r = row.original as ExpiryRow;
                const cname = r.customer_id ? customerNameById.get(r.customer_id) ?? r.customer_id : "-";
                const daysLeft = r.days_left;
                return (
                  <div key={`${r.worker_id}|${r.doc_type}|${r.expires_at ?? ""}`} className="grid grid-cols-[1.2fr_0.9fr_0.7fr_0.6fr_0.5fr_0.5fr] gap-3 border-b border-gray-100 px-3 py-3 text-sm last:border-b-0">
                    <div>
                      <div className="font-medium text-gray-900">{r.worker_full_name}</div>
                      <div className="mt-0.5 text-xs text-gray-500">{r.passport_no ? `P ${r.passport_no}` : r.wp_number ? `WP ${r.wp_number}` : "-"}</div>
                    </div>
                    <div className="text-gray-700">{cname}</div>
                    <div className="text-gray-700">{docTypeLabel(r.doc_type)}</div>
                    <div className="text-gray-700">{r.expires_at ?? "-"}</div>
                    <div className="text-gray-700">{daysLeft === null ? "-" : daysLeft.toLocaleString()}</div>
                    <div>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusTone(daysLeft)}`}>{statusLabel(daysLeft)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <TablePagination table={table} />
      </div>

      <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">ประวัติการส่ง</div>
            <div className="mt-1 text-xs text-gray-500">แสดงล่าสุด 500 รายการตามสิทธิ์ของคุณ</div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-[0.7fr_0.9fr_0.6fr_0.6fr_0.8fr_0.5fr_0.9fr] gap-3 rounded-lg bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
              <div>เวลา</div>
              <div>นายจ้าง</div>
              <div>ประเภท</div>
              <div>ผู้รับ</div>
              <div>อีเมล</div>
              <div>สถานะ</div>
              <div>ผลลัพธ์</div>
            </div>
            {deliveryTable.getRowModel().rows.length === 0 ? (
              <div className="px-3 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีประวัติ"}</div>
            ) : (
              deliveryTable.getRowModel().rows.map((row) => {
                const d = row.original as DeliveryRow;
                const cname = customerNameById.get(d.customer_id) ?? d.customer_id;
                const time = d.sent_at ?? d.created_at;
                return (
                  <div key={d.id} className="grid grid-cols-[0.7fr_0.9fr_0.6fr_0.6fr_0.8fr_0.5fr_0.9fr] gap-3 border-b border-gray-100 px-3 py-3 text-sm last:border-b-0">
                    <div className="text-gray-700">{dayjs(time).format("YYYY-MM-DD HH:mm")}</div>
                    <div className="text-gray-700">{cname}</div>
                    <div className="text-gray-700">{docTypeLabel(d.doc_type)}</div>
                    <div className="text-gray-700">{d.audience === "sale" ? "ทีมขาย" : "นายจ้าง"}</div>
                    <div className="text-gray-700">{d.destination_email}</div>
                    <div className="text-gray-700">{d.status}</div>
                    <div className="text-gray-600">{d.error_message ?? "-"}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <TablePagination table={deliveryTable} />
      </div>
    </div>
  );
}
