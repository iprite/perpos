"use client";

import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input } from "rizzui";
import { Title, Text } from "rizzui/typography";
import dayjs from "dayjs";
import { DatePicker } from "@core/ui/datepicker";
import { Modal } from "@core/modal-views/modal";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import TableSearch from "@/components/table/table-search";

import { useAuth } from "@/app/shared/auth-provider";
import FileUploader from "@/components/form/file-uploader";
import { PoaRequestCreateModal } from "@/components/poa/poa-request-create-modal";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type TypeOption = { id: string; name: string; base_price: number; is_active: boolean };

type ItemRow = {
  id: string;
  poa_request_type_id: string;
  unit_price_per_worker: number;
  worker_count: number;
  total_price: number;
  payment_status: string;
  poa_request_types?: { id: string; name: string; base_price: number } | null;
};

type PoaRow = {
  id: string;
  display_id: string | null;
  import_temp_id: string | null;
  poa_request_type_id: string | null;
  representative_profile_id: string | null;
  representative_name: string | null;
  representative_company_name: string | null;
  representative_rep_code: string | null;
  employer_name: string | null;
  employer_tax_id: string | null;
  employer_tel: string | null;
  employer_type: string | null;
  employer_address: string | null;
  worker_count: number;
  worker_male: number | null;
  worker_female: number | null;
  worker_nation: string | null;
  worker_type: string | null;
  status: string;
  created_at: string;
  profiles?: { email: string | null }[] | null;
  poa_request_items?: ItemRow[];
};

type CompanyRepRow = {
  profile_id: string;
  rep_code: string;
  prefix: string | null;
  first_name: string | null;
  last_name: string | null;
};

function repDisplayName(r: CompanyRepRow | null) {
  if (!r) return null;
  const full = `${r.prefix ?? ""}${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
  return full || null;
}

function repCodePrefix3(v: string | null) {
  const t = String(v ?? "").trim();
  return t.length >= 3 ? t.slice(0, 3) : "";
}

function statusLabel(s: string) {
  if (s === "draft") return "ร่าง";
  if (s === "submitted") return "รอชำระ";
  if (s === "paid") return "ชำระแล้ว";
  if (s === "completed") return "สร้าง PDF แล้ว";
  if (s === "need_info") return "ขอข้อมูลเพิ่ม";
  if (s === "rejected") return "ปฏิเสธ";
  if (s === "cancelled") return "ยกเลิก";
  if (s === "issued") return "ออกหนังสือแล้ว";
  return s;
}

function sumTotal(items: ItemRow[] | undefined) {
  return (items ?? []).reduce((acc, x) => acc + Number(x.total_price ?? 0), 0);
}

function unique<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function TableCheckbox({
  checked,
  indeterminate,
  disabled,
  ariaLabel,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={"inline-flex items-center" + (disabled ? " cursor-not-allowed" : " cursor-pointer")}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={
          "relative inline-flex h-5 w-5 items-center justify-center rounded-[10px] border-[1.5px] border-gray-300 bg-white transition-[background-color,border-color,box-shadow] peer-checked:border-blue-600 peer-checked:bg-blue-600 peer-disabled:border-gray-200 peer-disabled:bg-gray-100 peer-hover:border-blue-600 peer-hover:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] peer-focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.18)]" +
          (indeterminate ? " border-blue-600 bg-blue-600" : "")
        }
      >
        {indeterminate ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="h-0.5 w-3 rounded bg-white" />
          </span>
        ) : checked ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-3.5 w-3.5 text-white"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
        ) : null}
      </span>
    </label>
  );
}

export default function PoaRequestsPage() {
  const { role, userId } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const topRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PoaRow[]>([]);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");

  const canOperate = role === "admin" || role === "operation";
  const [selectedRequestIds, setSelectedRequestIds] = useState<Record<string, boolean>>({});
  const [showBulkPay, setShowBulkPay] = useState(false);
  const [bulkPayDate, setBulkPayDate] = useState("");
  const [bulkPayRef, setBulkPayRef] = useState("");
  const [bulkPayFile, setBulkPayFile] = useState<File | null>(null);

  const [showCreate, setShowCreate] = useState(false);

  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const typeName = r.poa_request_items?.[0]?.poa_request_types?.name ?? "";
      const hay = [
        r.display_id,
        r.import_temp_id,
        r.representative_name,
        r.representative_company_name,
        r.representative_rep_code,
        r.employer_name,
        typeName,
        r.status,
      ]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [rows, search]);

  const selectedRows = useMemo(() => rows.filter((r) => !!selectedRequestIds[r.id]), [rows, selectedRequestIds]);
  const selectedTotal = useMemo(() => selectedRows.reduce((sum, r) => sum + sumTotal(r.poa_request_items), 0), [selectedRows]);

  const selectableRequestIds = useMemo(
    () =>
      displayRows
        .filter((r) => String(r.poa_request_items?.[0]?.payment_status ?? "") !== "confirmed")
        .map((r) => r.id),
    [displayRows],
  );
  const allSelectableChecked = useMemo(
    () => selectableRequestIds.length > 0 && selectableRequestIds.every((id) => !!selectedRequestIds[id]),
    [selectableRequestIds, selectedRequestIds],
  );
  const someSelectableChecked = useMemo(
    () => selectableRequestIds.some((id) => !!selectedRequestIds[id]),
    [selectableRequestIds, selectedRequestIds],
  );

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);

      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      let poaQuery = supabase
        .from("poa_requests")
        .select(
          "id,display_id,import_temp_id,poa_request_type_id,representative_profile_id,representative_rep_code,representative_name,representative_company_name,employer_name,employer_tax_id,employer_tel,employer_type,employer_address,worker_count,worker_male,worker_female,worker_nation,worker_type,status,created_at,profiles(email),poa_request_items(id,poa_request_type_id,unit_price_per_worker,worker_count,total_price,payment_status,poa_request_types(id,name,base_price))"
        )
        .order("created_at", { ascending: false })
        .range(from, to);
      if (role === "representative") {
        setError("หน้านี้สำหรับทีมงานปฏิบัติการ • กรุณาไปที่เมนู ‘คำขอ POA’");
        setRows([]);
        setLoading(false);
        return;
      }

      const poaRes = await poaQuery;

      const firstError = poaRes.error;
      if (firstError) {
        setError(firstError.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const poaRows = ((((poaRes.data ?? []) as unknown) as PoaRow[]) ?? []) as PoaRow[];

      const repCodes = unique(poaRows.map((r) => (r.representative_rep_code ?? "").trim()).filter((x) => x.length > 0));
      const repsMap = new Map<string, CompanyRepRow>();
      if (repCodes.length) {
        const { data: reps, error: repErr } = await supabase
          .from("company_representatives")
          .select("profile_id,rep_code,prefix,first_name,last_name")
          .in("rep_code", repCodes);
        if (!repErr) {
          for (const r of ((reps ?? []) as any[]) as CompanyRepRow[]) {
            if (!r.rep_code) continue;
            repsMap.set(String(r.rep_code), r);
          }
        }
      }

      setRows(
        poaRows.map((r) => {
          const key = (r.representative_rep_code ?? "").trim();
          const cr = key ? (repsMap.get(key) ?? null) : null;
          const display = repDisplayName(cr);
          return {
            ...r,
            representative_name: display ?? r.representative_name,
            representative_company_name: r.representative_company_name ?? (cr?.rep_code ? cr.rep_code : null),
          };
        }),
      );
      setLoading(false);

      Promise.resolve().then(async () => {
        const countRes = await supabase.from("poa_requests").select("id", { count: "estimated", head: true });
        if (!countRes.error) setTotalCount(countRes.count ?? 0);
      });
    });
  }, [pagination.pageIndex, pagination.pageSize, role, supabase]);

  const refreshTypes = useCallback(() => {
    Promise.resolve().then(async () => {
      const { data, error: e } = await supabase
        .from("poa_request_types")
        .select("id,name,base_price,is_active")
        .order("created_at", { ascending: false });
      if (e) return;
      setTypes(((data ?? []) as TypeOption[]) ?? []);
    });
  }, [supabase]);

  React.useEffect(() => {
    if (pagination.pageIndex === 0) return;
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [pagination.pageIndex, pagination.pageSize]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [search]);

  const table = useReactTable({
    data: displayRows,
    columns: useMemo(() => [{ accessorKey: "id" }], []),
    state: { pagination },
    onPaginationChange: setPagination,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(Math.max(0, totalCount) / Math.max(1, pagination.pageSize))),
    getCoreRowModel: getCoreRowModel(),
  });

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    refreshTypes();
  }, [refreshTypes]);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  const isOperationContext = role === "operation" || searchParams.get("source") === "operation";

  return (
    <div ref={topRef}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            คำขอ POA
          </Title>
          <Text className="mt-1 text-sm text-gray-600">ส่งคำขอ POA และติดตามสถานะชำระเงิน พร้อมสร้าง PDF</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <TableSearch value={search} onChange={setSearch} disabled={loading} />
          {canOperate ? (
            <Button
              variant="outline"
              onClick={() => {
                setShowCreate(true);
              }}
              disabled={loading}
            >
              เพิ่ม
            </Button>
          ) : null}
        </div>
      </div>

      <PoaRequestCreateModal
        isOpen={showCreate && canOperate}
        onClose={() => setShowCreate(false)}
        supabase={supabase}
        types={types}
        role={role}
        userId={userId}
        isOperationContext={isOperationContext}
        onCreated={() => {
          toast.success(isOperationContext ? "สร้างคำขอและ PDF แล้ว" : "ส่งคำขอแล้ว");
          refresh();
        }}
      />

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {canOperate && selectedRows.length > 0 ? (
          <div className="border-b border-gray-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">
                เลือกแล้ว {selectedRows.length.toLocaleString()} รายการ • รวม {selectedTotal.toLocaleString()} บาท
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => setShowBulkPay(true)}
                  disabled={loading}
                >
                  ยืนยันชำระเงิน
                </button>
                <button
                  type="button"
                  className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => {
                    setSelectedRequestIds({});
                    setShowBulkPay(false);
                    setBulkPayDate("");
                    setBulkPayRef("");
                    setBulkPayFile(null);
                  }}
                  disabled={loading}
                >
                  ล้างการเลือก
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="custom-scrollbar w-full max-w-full overflow-x-auto scroll-smooth">
          <div className="min-w-[1000px]">
            <div
              className={`grid ${
                canOperate
                  ? "grid-cols-[56px_0.8fr_1.1fr_0.9fr_100px_120px_120px]"
                  : "grid-cols-[0.8fr_1.1fr_0.9fr_100px_120px_120px]"
              } items-center gap-4 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600`}
            >
              {canOperate ? (
                <div>
                  <TableCheckbox
                    checked={allSelectableChecked}
                    indeterminate={someSelectableChecked && !allSelectableChecked}
                    ariaLabel="เลือกทั้งหมด"
                    disabled={loading || selectableRequestIds.length === 0}
                    onChange={(checked) => {
                      setSelectedRequestIds(() => {
                        if (!checked) return {};
                        const next: Record<string, boolean> = {};
                        for (const id of selectableRequestIds) next[id] = true;
                        return next;
                      });
                    }}
                  />
                </div>
              ) : null}
              <div>ตัวแทน</div>
              <div>นายจ้าง</div>
              <div>หนังสือมอบอำนาจ</div>
              <div className="text-center">จำนวน</div>
              <div className="text-right">ยอดรวม</div>
              <div className="text-center">สถานะ</div>
            </div>

            {displayRows.length === 0 ? (
              <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
            ) : (
              displayRows.map((r) => {
                const disabledSelect = String(r.poa_request_items?.[0]?.payment_status ?? "") === "confirmed";
                const repCode = r.representative_rep_code || r.representative_company_name || "";
                const repPrefix = repCodePrefix3(repCode);
                return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    className={`grid ${
                      canOperate
                        ? "grid-cols-[56px_0.8fr_1.1fr_0.9fr_100px_120px_120px]"
                        : "grid-cols-[0.8fr_1.1fr_0.9fr_100px_120px_120px]"
                    } gap-4 border-b border-gray-100 px-4 py-3 last:border-b-0 cursor-pointer transition-colors hover:bg-gray-100 active:bg-gray-200`}
                    onClick={() => {
                      router.push(`/poa-requests/${r.id}`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      router.push(`/poa-requests/${r.id}`);
                    }}
                  >
                    {canOperate ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <TableCheckbox
                          checked={!!selectedRequestIds[r.id]}
                          ariaLabel="เลือกแถว"
                          disabled={disabledSelect || loading}
                          onChange={(checked) => {
                            setSelectedRequestIds((prev) => {
                              const next = { ...prev };
                              if (checked) next[r.id] = true;
                              else delete next[r.id];
                              return next;
                            });
                          }}
                        />
                      </div>
                    ) : null}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">{r.representative_name || r.profiles?.[0]?.email || "-"}</div>
                      <div className="mt-0.5 truncate text-xs text-gray-500">
                        {repCode ? repCode : "-"}
                        {repPrefix ? ` • ทีม ${repPrefix}` : ""}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">{r.employer_name ?? "-"}</div>
                      <div className="mt-0.5 truncate text-xs text-gray-500">{r.display_id ?? r.import_temp_id ?? r.id}</div>
                    </div>
                    <div className="min-w-0">
                      {(() => {
                        const fromItem = r.poa_request_items?.[0]?.poa_request_types ?? null;
                        const fromRequest = r.poa_request_type_id ? (typeById.get(r.poa_request_type_id) ?? null) : null;
                        const name = fromItem?.name ?? fromRequest?.name ?? "-";
                        const price = Number(r.poa_request_items?.[0]?.unit_price_per_worker ?? fromItem?.base_price ?? fromRequest?.base_price ?? 0);
                        return (
                          <>
                            <div className="truncate text-sm font-medium text-gray-900">{name}</div>
                            <div className="mt-0.5 truncate text-xs text-gray-500">ราคา/คน: {price.toLocaleString()}</div>
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex items-center justify-center text-center text-sm text-gray-900">{Number(r.worker_count ?? 0).toLocaleString()}</div>
                    <div className="flex items-center justify-end text-right text-sm text-gray-900">{sumTotal(r.poa_request_items).toLocaleString()}</div>
                    <div className="flex items-center justify-center text-sm text-gray-700">{statusLabel(r.status)}</div>
                  </div>
                );
              })
            )}

            <TablePagination table={table} />
          </div>
        </div>
      </div>

      <Modal
        isOpen={!!(showBulkPay && canOperate && selectedRows.length > 0)}
        onClose={() => {
          setShowBulkPay(false);
          setBulkPayDate("");
          setBulkPayRef("");
          setBulkPayFile(null);
        }}
        size="lg"
        rounded="md"
      >
        <div className="rounded-xl bg-white p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-base font-semibold text-gray-900">ยืนยันชำระเงิน</div>
              <div className="mt-1 text-sm text-gray-600">ยืนยันชำระเงินสำหรับ {selectedRows.length.toLocaleString()} รายการ</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowBulkPay(false);
                setBulkPayDate("");
                setBulkPayRef("");
                setBulkPayFile(null);
              }}
              disabled={loading}
              className="whitespace-nowrap"
            >
              ปิด
            </Button>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="grid gap-2 md:grid-cols-3">
              <Input label="จำนวนเงินรวม" value={selectedTotal.toString()} disabled />
              <div>
                <div className="text-sm font-medium text-gray-700">วันที่</div>
                <DatePicker
                  selected={bulkPayDate ? dayjs(bulkPayDate).toDate() : null}
                  onChange={(date: Date | null) => setBulkPayDate(date ? dayjs(date).format("YYYY-MM-DD") : "")}
                  placeholderText="Select Date"
                  disabled={loading}
                />
              </div>
              <Input label="อ้างอิง" value={bulkPayRef} onChange={(e) => setBulkPayRef(e.target.value)} disabled={loading} />
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700">สลิป (ใช้ใบเดียวกับทุกรายการที่เลือก)</div>
              <div className="mt-2">
                <FileUploader
                  label=""
                  helperText="คลิกเพื่อแนบสลิป หรือ ลากไฟล์มาวาง"
                  accept={{ "image/*": [], "application/pdf": [] }}
                  multiple={false}
                  maxFiles={1}
                  maxSizeBytes={8 * 1024 * 1024}
                  files={bulkPayFile ? [bulkPayFile] : []}
                  onFilesChange={(next) => setBulkPayFile(next[0] ?? null)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={async () => {
                  if (!canOperate) return;
                  if (!userId) {
                    setError("กรุณาเข้าสู่ระบบใหม่");
                    return;
                  }
                  if (!bulkPayFile) {
                    setError("กรุณาแนบสลิป");
                    return;
                  }
                  setLoading(true);
                  setError(null);

                  try {
                    for (const r of selectedRows) {
                      const item = r.poa_request_items?.[0];
                      if (!item) continue;
                      if (String(item.payment_status ?? "") === "confirmed") continue;

                      const amount = Number(item.total_price ?? 0);
                      const { data: created, error: insErr } = await supabase
                        .from("poa_item_payments")
                        .insert({
                          poa_request_item_id: item.id,
                          amount,
                          paid_date: bulkPayDate || null,
                          reference_no: bulkPayRef.trim() || null,
                          status: "confirmed",
                          created_by_profile_id: userId,
                        })
                        .select("id")
                        .single();
                      if (insErr) throw new Error(insErr.message);

                      const paymentId = String((created as any)?.id);
                      const path = `poa/${r.id}/items/${item.id}/slips/${paymentId}/${bulkPayFile.name}`;
                      const { error: upErr } = await supabase.storage.from("poa_slips").upload(path, bulkPayFile, {
                        upsert: true,
                        contentType: bulkPayFile.type || undefined,
                      });
                      if (upErr) throw new Error(upErr.message);

                      const { error: updErr } = await supabase
                        .from("poa_item_payments")
                        .update({ slip_object_path: path })
                        .eq("id", paymentId);
                      if (updErr) throw new Error(updErr.message);

                      const { error: itErr } = await supabase.from("poa_request_items").update({ payment_status: "confirmed" }).eq("id", item.id);
                      if (itErr) throw new Error(itErr.message);

                      const { error: stErr } = await supabase.from("poa_requests").update({ status: "paid" }).eq("id", r.id);
                      if (stErr) throw new Error(stErr.message);
                    }

                    setSelectedRequestIds({});
                    setShowBulkPay(false);
                    setBulkPayDate("");
                    setBulkPayRef("");
                    setBulkPayFile(null);
                    setLoading(false);
                    refresh();
                  } catch (err: any) {
                    setError(err?.message ?? "ยืนยันชำระเงินไม่สำเร็จ");
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="whitespace-nowrap"
              >
                ยืนยันชำระเงิน
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowBulkPay(false);
                  setBulkPayDate("");
                  setBulkPayRef("");
                  setBulkPayFile(null);
                }}
                disabled={loading}
                className="whitespace-nowrap"
              >
                ยกเลิก
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
