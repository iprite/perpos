"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "rizzui";
import { Title, Text } from "rizzui/typography";
import { Modal } from "@core/modal-views/modal";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PoaRequestCreateForm, type CompanyRepRow, type TypeOption } from "./poa-request-create-form";
import { createPoaRequestAndMaybePdf } from "./poa-request-create-actions";

export function PoaRequestCreateModal({
  isOpen,
  onClose,
  supabase,
  types,
  role,
  userId,
  isOperationContext,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  supabase: SupabaseClient;
  types: TypeOption[];
  role: string | null;
  userId: string | null;
  isOperationContext: boolean;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ requestId: string; filename: string; url: string } | null>(null);

  const [repsLoading, setRepsLoading] = useState(false);
  const [reps, setReps] = useState<CompanyRepRow[]>([]);

  const [selectedRepCode, setSelectedRepCode] = useState<string>("");
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
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

  const employerNameInputRef = useRef<HTMLInputElement | null>(null);

  const resetAll = () => {
    setError(null);
    setSuccess(null);
    setSelectedRepCode("");
    setSelectedTypeId("");
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
  };

  const close = () => {
    if (loading) return;
    if (success?.url) URL.revokeObjectURL(success.url);
    resetAll();
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccess(null);
    window.setTimeout(() => employerNameInputRef.current?.focus?.(), 50);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    Promise.resolve().then(async () => {
      setRepsLoading(true);
      try {
        const { data, error: e } = await supabase
          .from("company_representatives")
          .select("profile_id,rep_code,prefix,first_name,last_name,id_card_no,address")
          .ilike("rep_code", "EXW%")
          .order("rep_code", { ascending: true })
          .limit(500);
        if (e) throw new Error(e.message);
        if (!cancelled) setReps((((data ?? []) as unknown) as CompanyRepRow[]) ?? []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "โหลดรายชื่อตัวแทนไม่สำเร็จ");
      } finally {
        if (!cancelled) setRepsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, supabase]);

  useEffect(() => {
    return () => {
      if (success?.url) URL.revokeObjectURL(success.url);
    };
  }, [success?.url]);

  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const selectedType = useMemo(() => (selectedTypeId ? typesById.get(selectedTypeId) ?? null : null), [selectedTypeId, typesById]);
  const isMouSelected = useMemo(() => String(selectedType?.name ?? "").trim().toUpperCase() === "MOU", [selectedType]);

  useEffect(() => {
    if (isMouSelected) return;
    setWorkerMale("");
    setWorkerFemale("");
    setWorkerNation("");
    setWorkerType("");
  }, [isMouSelected]);

  useEffect(() => {
    if (!isMouSelected) return;
    const male = workerMale.trim().length ? Math.max(0, Math.trunc(Number(workerMale))) : 0;
    const female = workerFemale.trim().length ? Math.max(0, Math.trunc(Number(workerFemale))) : 0;
    const sum = male + female;
    setWorkerCount(String(Math.max(1, sum)));
  }, [isMouSelected, workerFemale, workerMale]);

  const canSubmit = useMemo(() => {
    return (
      selectedRepCode.trim().length > 0 &&
      selectedTypeId.trim().length > 0 &&
      employerName.trim().length > 0 &&
      (role === "admin" || role === "operation")
    );
  }, [employerName, role, selectedRepCode, selectedTypeId]);

  const submit = async () => {
    if (!userId) {
      setError("กรุณาเข้าสู่ระบบใหม่");
      return;
    }
    if (!(role === "admin" || role === "operation")) {
      setError("บทบาทนี้สร้างคำขอใหม่ไม่ได้");
      return;
    }
    const rep = reps.find((r) => r.rep_code === selectedRepCode) ?? null;
    if (!rep) {
      setError("กรุณาเลือก Representative (รหัสขึ้นต้น EXW)");
      return;
    }
    const t = selectedTypeId ? typesById.get(selectedTypeId) ?? null : null;
    if (!t) {
      setError("ไม่พบรายการหนังสือมอบอำนาจที่เลือก");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await createPoaRequestAndMaybePdf({
        supabase,
        rep,
        type: t,
        isOperationContext,
        isMouSelected,
        employerName,
        employerTaxId,
        employerTel,
        employerType,
        employerAddress,
        workerCount,
        workerMale,
        workerFemale,
        workerNation,
        workerType,
      });

      onCreated();
      if (!res.pdf) {
        setLoading(false);
        close();
        return;
      }

      const blob = new Blob([res.pdf.bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setSuccess({ requestId: res.requestId, filename: res.pdf.filename, url });
      setLoading(false);
    } catch (err: any) {
      setError(err?.message ?? "บันทึกไม่สำเร็จ");
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} size="xl" rounded="md">
      <div className="rounded-xl bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Title as="h3" className="text-base font-semibold text-gray-900">
              สร้าง POA
            </Title>
            <Text className="mt-1 text-sm text-gray-600">
              {isOperationContext ? "สร้างจาก Operation • ไม่คิดเงินและสร้าง PDF ได้ทันที" : "ส่งคำขอ POA และติดตามสถานะชำระเงิน"}
            </Text>
          </div>
          <Button size="sm" variant="outline" onClick={close} disabled={loading} className="whitespace-nowrap">
            ปิด
          </Button>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        {success ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-sm font-semibold text-emerald-900">สร้างคำขอสำเร็จ</div>
            <div className="mt-1 text-sm text-emerald-800">พร้อมไฟล์ PDF แล้ว</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => window.open(success.url, "_blank", "noopener,noreferrer")} disabled={loading}>
                เปิด PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = success.url;
                  a.download = success.filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                }}
                disabled={loading}
              >
                ดาวน์โหลด PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  close();
                  router.push(`/poa-requests/${success.requestId}`);
                }}
                disabled={loading}
              >
                ไปที่คำขอ
              </Button>
            </div>
          </div>
        ) : (
          <PoaRequestCreateForm
            supabase={supabase}
            loading={loading}
            repsLoading={repsLoading}
            reps={reps}
            types={types}
            isOperationContext={isOperationContext}
            selectedRepCode={selectedRepCode}
            setSelectedRepCode={setSelectedRepCode}
            selectedTypeId={selectedTypeId}
            setSelectedTypeId={setSelectedTypeId}
            workerCount={workerCount}
            setWorkerCount={setWorkerCount}
            workerMale={workerMale}
            setWorkerMale={setWorkerMale}
            workerFemale={workerFemale}
            setWorkerFemale={setWorkerFemale}
            workerNation={workerNation}
            setWorkerNation={setWorkerNation}
            workerType={workerType}
            setWorkerType={setWorkerType}
            employerName={employerName}
            setEmployerName={setEmployerName}
            employerTaxId={employerTaxId}
            setEmployerTaxId={setEmployerTaxId}
            employerTel={employerTel}
            setEmployerTel={setEmployerTel}
            employerType={employerType}
            setEmployerType={setEmployerType}
            employerAddress={employerAddress}
            setEmployerAddress={setEmployerAddress}
            employerNameInputRef={employerNameInputRef}
            onSubmit={submit}
            onCancel={close}
            canSubmit={canSubmit}
          />
        )}
      </div>
    </Modal>
  );
}
