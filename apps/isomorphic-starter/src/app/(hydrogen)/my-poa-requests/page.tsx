"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input } from "rizzui";
import { Title, Text } from "rizzui/typography";
import AppSelect from "@core/ui/app-select";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import TableSearch from "@/components/table/table-search";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolvePoaUnitPricePerWorker } from "@/components/poa/poa-pricing";

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
  representative_rep_code: string | null;
  representative_name: string | null;
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
  poa_request_items?: ItemRow[];
};

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

function LabeledSelect({
  id,
  label,
  value,
  placeholder,
  options,
  disabled,
  onChange,
}: {
  id?: string;
  label: string;
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <AppSelect
      label={label}
      placeholder={placeholder}
      options={options}
      value={value}
      onChange={(v: string) => onChange(v)}
      getOptionValue={(o) => o.value}
      displayValue={(selected) => options.find((o) => o.value === selected)?.label ?? ""}
      disabled={disabled}
      selectClassName="h-10 px-3"
    />
  );
}

export default function MyPoaRequestsPage() {
  const { role, userId } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const topRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PoaRow[]>([]);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);

  const [employerName, setEmployerName] = useState("");
  const [employerTaxId, setEmployerTaxId] = useState("");
  const [employerTel, setEmployerTel] = useState("");
  const [employerType, setEmployerType] = useState("");
  const [employerAddress, setEmployerAddress] = useState("");

  const [workerCount, setWorkerCount] = useState("1");
  const [workerMale, setWorkerMale] = useState("");
  const [workerFemale, setWorkerFemale] = useState("");
  const [workerNation, setWorkerNation] = useState("");
  const [workerType, setWorkerType] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");

  const canUsePage = role === "representative";
  const canSave = employerName.trim().length > 0 && selectedTypeId.length > 0;

  const selectedType = useMemo(() => types.find((t) => t.id === selectedTypeId) ?? null, [types, selectedTypeId]);
  const isMouSelected = useMemo(() => String(selectedType?.name ?? "").trim().toUpperCase() === "MOU", [selectedType]);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  const [resolvedTypePriceById, setResolvedTypePriceById] = useState<Map<string, number>>(new Map());

  React.useEffect(() => {
    if (isMouSelected) return;
    setWorkerMale("");
    setWorkerFemale("");
    setWorkerNation("");
    setWorkerType("");
  }, [isMouSelected]);

  React.useEffect(() => {
    if (!isMouSelected) return;
    const male = workerMale.trim().length ? Math.max(0, Math.trunc(Number(workerMale))) : 0;
    const female = workerFemale.trim().length ? Math.max(0, Math.trunc(Number(workerFemale))) : 0;
    const sum = male + female;
    setWorkerCount(String(Math.max(1, sum)));
  }, [isMouSelected, workerFemale, workerMale]);

  React.useEffect(() => {
    Promise.resolve().then(async () => {
      if (!userId) return;
      if (types.length === 0) {
        setResolvedTypePriceById(new Map());
        return;
      }
      const { data: myRep } = await supabase.from("company_representatives").select("rep_code").eq("profile_id", userId).maybeSingle();
      const repCode = String((myRep as any)?.rep_code ?? "").trim();
      if (!repCode) {
        setResolvedTypePriceById(new Map());
        return;
      }
      const entries = await Promise.all(
        types.map(async (t) => {
          const resolved = await resolvePoaUnitPricePerWorker({ supabase, repCode, poaRequestTypeId: t.id, fallbackUnitPrice: Number(t.base_price ?? 0) });
          return [t.id, resolved.unit] as const;
        }),
      );
      setResolvedTypePriceById(new Map(entries));
    });
  }, [supabase, types, userId]);

  const resetForm = useCallback(() => {
    setEmployerName("");
    setEmployerTaxId("");
    setEmployerTel("");
    setEmployerType("");
    setEmployerAddress("");
    setWorkerCount("1");
    setWorkerMale("");
    setWorkerFemale("");
    setWorkerNation("");
    setWorkerType("");
    setSelectedTypeId("");
  }, []);

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      if (!userId) return;
      setLoading(true);
      setError(null);

      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      const { data: myRep, error: myRepErr } = await supabase
        .from("company_representatives")
        .select("rep_code")
        .eq("profile_id", userId)
        .maybeSingle();
      if (myRepErr) {
        setError(myRepErr.message);
        setLoading(false);
        return;
      }
      const myRepCode = String((myRep as any)?.rep_code ?? "").trim();
      if (!myRepCode) {
        setError("ไม่พบ rep_code ของตัวแทน (กรุณาให้แอดมินผูกตัวแทนกับผู้ใช้)");
        setLoading(false);
        return;
      }
      const isLead = myRepCode.endsWith("-00");
      const teamPrefix = myRepCode.slice(0, 3);

      const poaRes = await (() => {
        let q = supabase
          .from("poa_requests")
          .select(
            "id,display_id,import_temp_id,poa_request_type_id,representative_profile_id,representative_rep_code,representative_name,employer_name,employer_tax_id,employer_tel,employer_type,employer_address,worker_count,worker_male,worker_female,worker_nation,worker_type,status,created_at,poa_request_items(id,poa_request_type_id,unit_price_per_worker,worker_count,total_price,payment_status,poa_request_types(id,name,base_price))",
          )
          .order("created_at", { ascending: false })
          .range(from, to);
        if (isLead) {
          q = q.like("representative_rep_code", `${teamPrefix}-%`);
        } else {
          q = q.eq("representative_rep_code", myRepCode);
        }
        return q;
      })();

      const firstError = poaRes.error;
      if (firstError) {
        setError(firstError.message);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((((poaRes.data ?? []) as unknown) as PoaRow[]) ?? []);
      setLoading(false);

      Promise.resolve().then(async () => {
        let q = supabase.from("poa_requests").select("id", { count: "estimated", head: true });
        if (isLead) {
          q = q.like("representative_rep_code", `${teamPrefix}-%`);
        } else {
          q = q.eq("representative_rep_code", myRepCode);
        }
        const countRes = await q;
        if (!countRes.error) setTotalCount(countRes.count ?? 0);
      });
    });
  }, [pagination.pageIndex, pagination.pageSize, supabase, userId]);

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
  }, [pagination.pageSize]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [search]);

  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const typeName = r.poa_request_items?.[0]?.poa_request_types?.name ?? "";
      const hay = [r.display_id, r.import_temp_id, r.employer_name, typeName, r.status]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [rows, search]);

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

  if (!canUsePage) {
    return (
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          คำขอ POA
        </Title>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
          หน้านี้สำหรับตัวแทนเท่านั้น
          <div className="mt-2">
            <Link className="text-blue-600 hover:underline" href="/poa-requests">
              ไปหน้าจัดการคำขอ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={topRef}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            คำขอ POA
          </Title>
          <Text className="mt-1 text-sm text-gray-600">รายการคำขอของคุณเท่านั้น</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TableSearch value={search} onChange={setSearch} disabled={loading} />
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              setShowForm(true);
              topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              window.setTimeout(() => {
                (document.getElementById("poa-employer-name") as HTMLInputElement | null)?.focus?.();
              }, 50);
            }}
            disabled={loading}
          >
            เพิ่ม
          </Button>
        </div>
      </div>

      {showForm ? (
        <div className="mt-5 grid gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">เพิ่มคำขอ</div>
          <div className="grid gap-3 md:grid-cols-2">
            <LabeledSelect
              label="หนังสือมอบอำนาจ"
              value={selectedTypeId}
              placeholder="เลือกหนังสือมอบอำนาจ"
              options={types
                .filter((t) => t.is_active)
                .map((t) => ({
                  value: t.id,
                  label: `${t.name} • ราคา/คน: ${Number(resolvedTypePriceById.get(t.id) ?? t.base_price ?? 0).toLocaleString()}`,
                }))}
              disabled={loading}
              onChange={(v) => setSelectedTypeId(v)}
            />
            <Input
              label="จำนวนแรงงาน (รวม)"
              value={workerCount}
              onChange={(e) => setWorkerCount(e.target.value)}
              inputMode="numeric"
              disabled={loading || isMouSelected}
            />
            {isMouSelected ? (
              <>
                <Input
                  label="จำนวนแรงงานชาย"
                  value={workerMale}
                  onChange={(e) => setWorkerMale(e.target.value)}
                  inputMode="numeric"
                  disabled={loading}
                />
                <Input
                  label="จำนวนแรงงานหญิง"
                  value={workerFemale}
                  onChange={(e) => setWorkerFemale(e.target.value)}
                  inputMode="numeric"
                  disabled={loading}
                />
                <LabeledSelect
                  label="สัญชาติ"
                  value={workerNation}
                  placeholder="เลือกสัญชาติ"
                  options={[
                    { value: "เมียนมา", label: "เมียนมา" },
                    { value: "ลาว", label: "ลาว" },
                    { value: "กัมพูชา", label: "กัมพูชา" },
                  ]}
                  disabled={loading}
                  onChange={(v) => setWorkerNation(v)}
                />
                <LabeledSelect
                  label="ประเภทแรงงาน"
                  value={workerType}
                  placeholder="เลือกประเภทแรงงาน"
                  options={[
                    { value: "กรรมกร", label: "กรรมกร" },
                    { value: "รับใช้ในบ้าน", label: "รับใช้ในบ้าน" },
                  ]}
                  disabled={loading}
                  onChange={(v) => setWorkerType(v)}
                />
              </>
            ) : null}
            <Input
              id="poa-employer-name"
              label="ชื่อนายจ้าง"
              value={employerName}
              onChange={(e) => setEmployerName(e.target.value)}
              disabled={loading}
            />
            <Input
              label="เลขนายจ้าง/เลขประจำตัวผู้เสียภาษี"
              value={employerTaxId}
              onChange={(e) => setEmployerTaxId(e.target.value)}
              disabled={loading}
            />
            <Input label="โทร" value={employerTel} onChange={(e) => setEmployerTel(e.target.value)} disabled={loading} />
            <Input label="ประเภทกิจการ" value={employerType} onChange={(e) => setEmployerType(e.target.value)} disabled={loading} />
            <div className="md:col-span-2">
              <div className="text-sm font-medium text-gray-700">ที่อยู่</div>
              <textarea
                className="mt-2 min-h-[88px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                value={employerAddress}
                onChange={(e) => setEmployerAddress(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                if (!userId) {
                  setError("กรุณาเข้าสู่ระบบใหม่");
                  return;
                }
                setLoading(true);
                setError(null);

                const { data: myRep, error: myRepErr } = await supabase
                  .from("company_representatives")
                  .select("rep_code,prefix,first_name,last_name")
                  .eq("profile_id", userId)
                  .maybeSingle();
                if (myRepErr) {
                  setError(myRepErr.message);
                  setLoading(false);
                  return;
                }
                const repCode = String((myRep as any)?.rep_code ?? "").trim();
                if (!repCode) {
                  setError("ไม่พบ rep_code ของตัวแทน (กรุณาให้แอดมินผูกตัวแทนกับผู้ใช้)");
                  setLoading(false);
                  return;
                }
                const repName = `${String((myRep as any)?.prefix ?? "").trim()}${String((myRep as any)?.first_name ?? "").trim()} ${String(
                  (myRep as any)?.last_name ?? "",
                ).trim()}`.trim();

                const maleNum = isMouSelected && workerMale.trim().length ? Math.max(0, Math.trunc(Number(workerMale))) : 0;
                const femaleNum = isMouSelected && workerFemale.trim().length ? Math.max(0, Math.trunc(Number(workerFemale))) : 0;
                const wc = isMouSelected ? Math.max(1, maleNum + femaleNum) : Math.max(1, Math.trunc(Number(workerCount || 1)));
                const male = isMouSelected && workerMale.trim().length ? Math.max(0, Math.trunc(Number(workerMale))) : null;
                const female = isMouSelected && workerFemale.trim().length ? Math.max(0, Math.trunc(Number(workerFemale))) : null;

                const payload: any = {
                  employer_name: employerName.trim(),
                  employer_tax_id: employerTaxId.trim() || null,
                  employer_tel: employerTel.trim() || null,
                  employer_type: employerType.trim() || null,
                  employer_address: employerAddress.trim() || null,
                  worker_count: wc,
                  worker_male: male,
                  worker_female: female,
                  worker_nation: isMouSelected ? workerNation.trim() || null : null,
                  worker_type: isMouSelected ? workerType.trim() || null : null,
                  poa_request_type_id: selectedTypeId,
                  status: "submitted",
                  representative_profile_id: userId,
                  representative_rep_code: repCode,
                  representative_name: repName || null,
                  representative_company_name: repCode,
                };

                try {
                  const { data: created, error: insErr } = await supabase.from("poa_requests").insert(payload).select("id").single();
                  if (insErr) throw new Error(insErr.message);
                  const requestId = String((created as any)?.id);

                  const typeMap = new Map(types.map((t) => [t.id, t]));
                  const t = typeMap.get(selectedTypeId);
                  if (!t) throw new Error("ไม่พบรายการหนังสือมอบอำนาจที่เลือก");

                  const resolved = await resolvePoaUnitPricePerWorker({
                    supabase,
                    repCode,
                    poaRequestTypeId: selectedTypeId,
                    fallbackUnitPrice: Number(t.base_price ?? 0),
                  });
                  const unit = resolved.unit;
                  const upsertRow = {
                    poa_request_id: requestId,
                    poa_request_type_id: selectedTypeId,
                    unit_price_per_worker: unit,
                    worker_count: wc,
                    total_price: unit * wc,
                    payment_status: "unpaid",
                  };

                  const { error: itemErr } = await supabase
                    .from("poa_request_items")
                    .upsert([upsertRow], { onConflict: "poa_request_id,poa_request_type_id" });
                  if (itemErr) throw new Error(itemErr.message);

                  toast.success("ส่งคำขอแล้ว");
                  resetForm();
                  setShowForm(false);
                  setLoading(false);
                  refresh();
                } catch (err: any) {
                  setError(err?.message ?? "บันทึกไม่สำเร็จ");
                  setLoading(false);
                }
              }}
              disabled={loading || !canSave}
            >
              ส่งคำขอ
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              disabled={loading}
            >
              ยกเลิก
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[1.2fr_0.7fr_0.35fr_0.45fr_0.6fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
          <div>นายจ้าง</div>
          <div>หนังสือมอบอำนาจ</div>
          <div className="text-right">จำนวน</div>
          <div className="text-right">ยอดรวม</div>
          <div className="text-center">สถานะ</div>
        </div>
        {displayRows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
        ) : (
          displayRows.map((r) => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              className="grid grid-cols-[1.2fr_0.7fr_0.35fr_0.45fr_0.6fr] gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 cursor-pointer transition-colors hover:bg-gray-100 active:bg-gray-200"
              onClick={() => {
                router.push(`/poa-requests/${r.id}`);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                router.push(`/poa-requests/${r.id}`);
              }}
            >
              <div>
                <div className="text-sm font-medium text-gray-900">{r.employer_name ?? "-"}</div>
                <div className="mt-0.5 text-xs text-gray-500">{r.display_id ?? r.import_temp_id ?? r.id}</div>
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
              <div className="text-sm text-gray-900 text-right">{Number(r.worker_count ?? 0).toLocaleString()}</div>
              <div className="text-sm text-gray-900 text-right">{sumTotal(r.poa_request_items).toLocaleString()}</div>
              <div className="flex items-center justify-center gap-2">
                <div className="text-sm text-gray-700">{statusLabel(r.status)}</div>
              </div>
            </div>
          ))
        )}
        <TablePagination table={table} />
      </div>
    </div>
  );
}
