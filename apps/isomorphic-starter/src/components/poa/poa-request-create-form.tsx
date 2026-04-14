"use client";

import React, { RefObject, useEffect, useMemo, useState } from "react";
import { Button, Input } from "rizzui";
import { Text } from "rizzui/typography";
import AppSelect from "@core/ui/app-select";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TypeOption = { id: string; name: string; base_price: number; is_active: boolean };

export type CompanyRepRow = {
  profile_id: string;
  rep_code: string;
  prefix: string | null;
  first_name: string | null;
  last_name: string | null;
  id_card_no: string | null;
  address: string | null;
};

function repDisplayName(r: CompanyRepRow | null) {
  if (!r) return null;
  const full = `${r.prefix ?? ""}${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
  return full || null;
}

export function PoaRequestCreateForm({
  supabase,
  loading,
  repsLoading,
  reps,
  types,
  isOperationContext,
  selectedRepCode,
  setSelectedRepCode,
  selectedTypeId,
  setSelectedTypeId,
  workerCount,
  setWorkerCount,
  workerMale,
  setWorkerMale,
  workerFemale,
  setWorkerFemale,
  workerNation,
  setWorkerNation,
  workerType,
  setWorkerType,
  employerName,
  setEmployerName,
  employerTaxId,
  setEmployerTaxId,
  employerTel,
  setEmployerTel,
  employerType,
  setEmployerType,
  employerAddress,
  setEmployerAddress,
  employerNameInputRef,
  onSubmit,
  onCancel,
  canSubmit,
}: {
  supabase: SupabaseClient;
  loading: boolean;
  repsLoading: boolean;
  reps: CompanyRepRow[];
  types: TypeOption[];
  isOperationContext: boolean;
  selectedRepCode: string;
  setSelectedRepCode: (v: string) => void;
  selectedTypeId: string;
  setSelectedTypeId: (v: string) => void;
  workerCount: string;
  setWorkerCount: (v: string) => void;
  workerMale: string;
  setWorkerMale: (v: string) => void;
  workerFemale: string;
  setWorkerFemale: (v: string) => void;
  workerNation: string;
  setWorkerNation: (v: string) => void;
  workerType: string;
  setWorkerType: (v: string) => void;
  employerName: string;
  setEmployerName: (v: string) => void;
  employerTaxId: string;
  setEmployerTaxId: (v: string) => void;
  employerTel: string;
  setEmployerTel: (v: string) => void;
  employerType: string;
  setEmployerType: (v: string) => void;
  employerAddress: string;
  setEmployerAddress: (v: string) => void;
  employerNameInputRef: RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
  onCancel: () => void;
  canSubmit: boolean;
}) {
  const repOptions = useMemo(
    () =>
      reps
        .filter((r) => String(r.rep_code ?? "").toUpperCase().startsWith("EXW"))
        .map((r) => ({
          value: r.rep_code,
          label: `${r.rep_code} • ${repDisplayName(r) ?? "-"}`,
        })),
    [reps],
  );

  const typesActive = useMemo(() => types.filter((t) => t.is_active), [types]);
  const selectedType = useMemo(() => types.find((t) => t.id === selectedTypeId) ?? null, [selectedTypeId, types]);
  const isMouSelected = useMemo(() => String(selectedType?.name ?? "").trim().toUpperCase() === "MOU", [selectedType]);

  const [employerOpen, setEmployerOpen] = useState(false);
  const [employerLoading, setEmployerLoading] = useState(false);
  const [employerOptions, setEmployerOptions] = useState<
    Array<{ id: string; name: string; display_id: string | null; tax_id: string | null; address: string | null; phone: string | null }>
  >([]);

  useEffect(() => {
    if (!employerOpen) return;
    const q = employerName.trim();
    if (q.length < 2) {
      setEmployerOptions([]);
      setEmployerLoading(false);
      return;
    }

    let cancelled = false;
    setEmployerLoading(true);
    const t = window.setTimeout(() => {
      Promise.resolve().then(async () => {
        try {
          const { data, error } = await supabase
            .from("customers")
            .select("id,name,display_id,tax_id,address,phone")
            .ilike("name", `%${q}%`)
            .order("name", { ascending: true })
            .limit(10);
          if (error) throw new Error(error.message);
          if (!cancelled) setEmployerOptions((((data ?? []) as unknown) as any[]) ?? []);
        } catch {
          if (!cancelled) setEmployerOptions([]);
        } finally {
          if (!cancelled) setEmployerLoading(false);
        }
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [employerName, employerOpen, supabase]);

  return (
    <div className="mt-4 grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <AppSelect
          label="Representative"
          placeholder={repsLoading ? "กำลังโหลด..." : "เลือกตัวแทน (เฉพาะ EXW...)"}
          options={repOptions}
          value={selectedRepCode}
          onChange={(v: string) => setSelectedRepCode(v)}
          getOptionValue={(o) => o.value}
          displayValue={(selected) => repOptions.find((o) => o.value === selected)?.label ?? ""}
          disabled={loading || repsLoading}
          selectClassName="h-10 px-3"
          dropdownClassName="!z-[10000]"
        />
        <AppSelect
          label="หนังสือมอบอำนาจ"
          placeholder="เลือกหนังสือมอบอำนาจ"
          options={typesActive.map((t) => ({ value: t.id, label: `${t.name} • ราคา/คน: ${Number(t.base_price ?? 0).toLocaleString()}` }))}
          value={selectedTypeId}
          onChange={(v: string) => setSelectedTypeId(v)}
          getOptionValue={(o) => o.value}
          displayValue={(selected) => types.find((o) => o.id === selected)?.name ?? ""}
          disabled={loading}
          selectClassName="h-10 px-3"
          dropdownClassName="!z-[10000]"
        />

        <Input
          label="จำนวนแรงงาน (รวม)"
          value={workerCount}
          onChange={(e) => setWorkerCount(e.target.value)}
          inputMode="numeric"
          disabled={loading || isMouSelected}
        />
        <div className="relative">
          <Input
            ref={employerNameInputRef}
            label="ชื่อนายจ้าง"
            value={employerName}
            onChange={(e) => setEmployerName(e.target.value)}
            onFocus={() => setEmployerOpen(true)}
            onBlur={() => window.setTimeout(() => setEmployerOpen(false), 120)}
            disabled={loading}
            suffix={
              employerLoading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" /> : null
            }
          />
          {employerOpen && employerName.trim().length >= 2 ? (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[10001] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
              <div className="max-h-56 overflow-auto py-1">
                {employerOptions.length ? (
                  employerOptions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setEmployerName(c.name);
                        setEmployerTaxId(String(c.tax_id ?? ""));
                        setEmployerTel(String(c.phone ?? ""));
                        setEmployerAddress(String(c.address ?? ""));
                        setEmployerOpen(false);
                      }}
                    >
                      <div className="font-medium">{c.name}</div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {[c.display_id ? `รหัส ${c.display_id}` : null, c.tax_id ? `เลขผู้เสียภาษี ${c.tax_id}` : null]
                          .filter(Boolean)
                          .join(" • ") || "-"}
                      </div>
                    </button>
                  ))
                ) : employerLoading ? null : (
                  <div className="px-3 py-2 text-sm text-gray-500">ไม่พบนายจ้างที่ตรงกับคำค้นหา</div>
                )}
              </div>
            </div>
          ) : null}
        </div>

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
            <Input label="สัญชาติ" value={workerNation} onChange={(e) => setWorkerNation(e.target.value)} disabled={loading} />
            <Input label="ประเภทแรงงาน" value={workerType} onChange={(e) => setWorkerType(e.target.value)} disabled={loading} />
          </>
        ) : null}

        <Input
          label="เลขนายจ้าง/เลขประจำตัวผู้เสียภาษี"
          value={employerTaxId}
          onChange={(e) => setEmployerTaxId(e.target.value)}
          disabled={loading}
        />
        <Input label="โทร" value={employerTel} onChange={(e) => setEmployerTel(e.target.value)} disabled={loading} />
        <Input
          label="ประเภทกิจการ"
          value={employerType}
          onChange={(e) => setEmployerType(e.target.value)}
          disabled={loading}
        />
        <div className="md:col-span-2">
          <div className="text-sm font-medium text-gray-700">ที่อยู่</div>
          <textarea
            className="mt-2 min-h-[96px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
            value={employerAddress}
            onChange={(e) => setEmployerAddress(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>

      {isOperationContext ? <Text className="text-xs text-gray-500">โหมด Operation: ข้ามชำระเงิน และจะสร้าง PDF ให้ทันที</Text> : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onSubmit} disabled={loading || !canSubmit}>
          {isOperationContext ? (loading ? "กำลังสร้าง..." : "สร้างและสร้าง PDF") : loading ? "กำลังส่ง..." : "ส่งคำขอ"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}
