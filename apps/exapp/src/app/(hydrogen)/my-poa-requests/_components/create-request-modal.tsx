"use client";

import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input } from "rizzui";
import AppSelect from "@core/ui/app-select";
import { Modal } from "@core/modal-views/modal";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePoaUnitPricePerWorker } from "@/components/poa/poa-pricing";

type TypeOption = { id: string; name: string; base_price: number; is_active: boolean };

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
      id={id}
      label={label}
      placeholder={placeholder}
      options={options}
      value={value}
      onChange={(v: string) => onChange(v)}
      getOptionValue={(o) => o.value}
      displayValue={(selected) => options.find((o) => o.value === selected)?.label ?? ""}
      disabled={disabled}
      inPortal={false}
      selectClassName="h-10 px-3"
    />
  );
}

export function CreateRequestModal({
  open,
  onClose,
  supabase,
  userId,
  types,
  resolvedTypePriceById,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  supabase: SupabaseClient;
  userId: string | null;
  types: TypeOption[];
  resolvedTypePriceById: Map<string, number>;
  onCreated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const canSave = employerName.trim().length > 0 && selectedTypeId.length > 0;

  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const selectedType = useMemo(() => (selectedTypeId ? typesById.get(selectedTypeId) ?? null : null), [selectedTypeId, typesById]);
  const isMouSelected = useMemo(() => String(selectedType?.name ?? "").trim().toUpperCase() === "MOU", [selectedType]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(false);
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (isMouSelected) return;
    setWorkerMale("");
    setWorkerFemale("");
    setWorkerNation("");
    setWorkerType("");
  }, [isMouSelected, open]);

  useEffect(() => {
    if (!open) return;
    if (!isMouSelected) return;
    const male = workerMale.trim().length ? Math.max(0, Math.trunc(Number(workerMale))) : 0;
    const female = workerFemale.trim().length ? Math.max(0, Math.trunc(Number(workerFemale))) : 0;
    setWorkerCount(String(Math.max(1, male + female)));
  }, [isMouSelected, open, workerFemale, workerMale]);

  const typeOptions = useMemo(() => {
    return types
      .filter((t) => t.is_active)
      .map((t) => ({
        value: t.id,
        label: `${t.name} • ราคา/คน: ${Number(resolvedTypePriceById.get(t.id) ?? t.base_price ?? 0).toLocaleString()}`,
      }));
  }, [resolvedTypePriceById, types]);

  return (
    <Modal
      isOpen={open}
      onClose={() => {
        if (loading) return;
        onClose();
      }}
      size="lg"
      rounded="md"
    >
      <div className="p-4">
        <div className="text-base font-semibold text-gray-900">ส่งคำขอใหม่</div>
        {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <LabeledSelect
            label="หนังสือมอบอำนาจ"
            value={selectedTypeId}
            placeholder={typeOptions.length ? "เลือกหนังสือมอบอำนาจ" : "ยังไม่มีรายการ"}
            options={typeOptions}
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

          <Input label="ชื่อนายจ้าง" value={employerName} onChange={(e) => setEmployerName(e.target.value)} disabled={loading} />
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

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={loading} onClick={() => onClose()}>
            ยกเลิก
          </Button>
          <Button
            disabled={loading || !canSave}
            onClick={async () => {
              if (!userId) {
                setError("กรุณาเข้าสู่ระบบใหม่");
                return;
              }
              const typeId = selectedTypeId;
              const t = typesById.get(typeId);
              if (!t) {
                setError("ไม่พบรายการหนังสือมอบอำนาจที่เลือก");
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
                poa_request_type_id: typeId,
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

                const resolved = await resolvePoaUnitPricePerWorker({
                  supabase,
                  repCode,
                  poaRequestTypeId: typeId,
                  fallbackUnitPrice: Number(t.base_price ?? 0),
                });
                const unit = resolved.unit;
                const upsertRow = {
                  poa_request_id: requestId,
                  poa_request_type_id: typeId,
                  unit_price_per_worker: unit,
                  worker_count: wc,
                  total_price: unit * wc,
                  payment_status: "unpaid",
                };

                const { error: itemErr } = await supabase
                  .from("poa_request_items")
                  .upsert([upsertRow], { onConflict: "poa_request_id,poa_request_type_id" });
                if (itemErr) throw new Error(itemErr.message);

                const sessionRes = await supabase.auth.getSession();
                const token = sessionRes.data.session?.access_token;
                if (token) {
                  await fetch("/api/notifications/line/poa-request-created", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ requestId }),
                  }).catch(() => null);
                }

                toast.success("ส่งคำขอแล้ว");
                setLoading(false);
                onClose();
                onCreated();
              } catch (err: any) {
                setError(err?.message ?? "บันทึกไม่สำเร็จ");
                setLoading(false);
              }
            }}
          >
            ส่งคำขอ
          </Button>
        </div>
      </div>
    </Modal>
  );
}
