"use client";

import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button, Input } from "rizzui";
import AppSelect from "@core/ui/app-select";

type RepresentativeOption = {
  rep_code: string | null;
  display_name: string;
};

type PoaTypeOption = {
  id: string;
  name: string;
  base_price: number;
  is_active: boolean;
};

type BootstrapResponse = {
  representatives: RepresentativeOption[];
  types: PoaTypeOption[];
};

function trimOrEmpty(v: string) {
  return String(v ?? "").trim();
}

function asIntOrNull(v: string) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return null;
  return n;
}

function asMoney(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PublicPoaRequestPage() {
  const router = useRouter();
  const topRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [representatives, setRepresentatives] = useState<RepresentativeOption[]>([]);
  const [types, setTypes] = useState<PoaTypeOption[]>([]);

  const [representativeRepCode, setRepresentativeRepCode] = useState("");
  const [representativeNameManual, setRepresentativeNameManual] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState("");

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

  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  React.useEffect(() => {
    Promise.resolve().then(async () => {
      setBootstrapLoading(true);
      setBootstrapError(null);
      try {
        const res = await fetch("/api/public/poa-request", { method: "GET" });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || "โหลดข้อมูลไม่สำเร็จ");
        }
        const data = (await res.json()) as BootstrapResponse;
        setRepresentatives((data.representatives ?? []).filter((x) => x.rep_code && x.display_name));
        setTypes((data.types ?? []).filter((x) => x.id && x.name && x.is_active));
        setBootstrapLoading(false);
      } catch (e: any) {
        setRepresentatives([]);
        setTypes([]);
        setBootstrapError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setBootstrapLoading(false);
      }
    });
  }, []);

  const representativeOptions = useMemo(
    () => representatives.map((r) => ({ value: String(r.rep_code ?? "").trim(), label: r.rep_code ? `${r.display_name} (${r.rep_code})` : r.display_name })),
    [representatives],
  );

  const typeOptions = useMemo(() => types.map((t) => ({ value: t.id, label: t.name })), [types]);
  const workerTypeOptions = useMemo(() => [{ value: "กรรมกร", label: "กรรมกร" }, { value: "รับใช้ในบ้าน", label: "รับใช้ในบ้าน" }], []);
  const selectedType = useMemo(() => types.find((t) => t.id === selectedTypeId) ?? null, [types, selectedTypeId]);
  const isMouSelected = useMemo(() => String(selectedType?.name ?? "").trim().toUpperCase() === "MOU", [selectedType]);

  const [resolvedUnit, setResolvedUnit] = useState<number | null>(null);
  const [resolvedSource, setResolvedSource] = useState<"default" | "override" | null>(null);

  const computedWorkerCount = useMemo(() => {
    if (isMouSelected) {
      const male = asIntOrNull(workerMale) ?? 0;
      const female = asIntOrNull(workerFemale) ?? 0;
      return Math.max(1, Math.max(0, male) + Math.max(0, female));
    }
    const wc = asIntOrNull(workerCount) ?? 1;
    return Math.max(1, wc);
  }, [isMouSelected, workerCount, workerFemale, workerMale]);

  React.useEffect(() => {
    const repCode = String(representativeRepCode ?? "").trim();
    const typeId = String(selectedTypeId ?? "").trim();
    if (!repCode || !typeId) {
      setResolvedUnit(null);
      setResolvedSource(null);
      return;
    }
    Promise.resolve().then(async () => {
      try {
        const res = await fetch(`/api/public/poa-price?rep_code=${encodeURIComponent(repCode)}&poa_request_type_id=${encodeURIComponent(typeId)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setResolvedUnit(null);
          setResolvedSource(null);
          return;
        }
        const unit = Number((data as any)?.unit_price_per_worker ?? NaN);
        if (!Number.isFinite(unit)) {
          setResolvedUnit(null);
          setResolvedSource(null);
          return;
        }
        setResolvedUnit(unit);
        setResolvedSource(((data as any)?.source ?? null) as any);
      } catch {
        setResolvedUnit(null);
        setResolvedSource(null);
      }
    });
  }, [representativeRepCode, selectedTypeId]);

  const computedUnitPrice = useMemo(() => {
    const base = Number(selectedType?.base_price ?? 0);
    const baseUnit = Number.isFinite(base) ? base : 0;
    if (Number.isFinite(Number(resolvedUnit))) return Number(resolvedUnit);
    return baseUnit;
  }, [resolvedUnit, selectedType?.base_price]);

  const computedTotalPrice = useMemo(() => computedUnitPrice * computedWorkerCount, [computedUnitPrice, computedWorkerCount]);

  React.useEffect(() => {
    if (!isMouSelected) {
      setWorkerMale("");
      setWorkerFemale("");
      setWorkerNation("");
      setWorkerType("");
    }
  }, [isMouSelected]);

  React.useEffect(() => {
    if (!isMouSelected) return;
    const male = asIntOrNull(workerMale) ?? 0;
    const female = asIntOrNull(workerFemale) ?? 0;
    const sum = Math.max(0, male) + Math.max(0, female);
    setWorkerCount(String(Math.max(1, sum)));
  }, [isMouSelected, workerFemale, workerMale]);

  const canSubmit = useMemo(() => {
    if (bootstrapLoading) return false;
    if (!representativeRepCode) return false;
    if (!selectedTypeId) return false;
    if (!trimOrEmpty(employerName)) return false;
    if (isMouSelected) {
      const male = asIntOrNull(workerMale) ?? 0;
      const female = asIntOrNull(workerFemale) ?? 0;
      return male + female >= 1;
    }
    const wc = asIntOrNull(workerCount);
    return !!wc && wc >= 1;
  }, [bootstrapLoading, employerName, isMouSelected, representativeRepCode, selectedTypeId, workerCount, workerFemale, workerMale]);

  const reset = () => {
    setRepresentativeRepCode("");
    setRepresentativeNameManual("");
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
    setFieldError({});
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!representativeRepCode) next.representative_rep_code = representatives.length ? "กรุณาเลือกชื่อตัวแทน" : "กรุณากรอกรหัสตัวแทน";
    if (!representatives.length && !trimOrEmpty(representativeNameManual)) next.representative_name = "กรุณากรอกชื่อตัวแทน";
    if (!selectedTypeId) next.poa_request_type_id = "กรุณาเลือกประเภทหนังสือมอบอำนาจ";
    if (!trimOrEmpty(employerName)) next.employer_name = "กรุณากรอกชื่อนายจ้าง/ลูกค้า";
    if (isMouSelected) {
      const male = asIntOrNull(workerMale);
      const female = asIntOrNull(workerFemale);
      const sum = (male ?? 0) + (female ?? 0);
      if (!Number.isFinite(sum) || sum < 1) next.worker_mou = "กรุณาระบุจำนวนชาย/หญิงอย่างน้อย 1 คน";
    } else {
      const wc = asIntOrNull(workerCount);
      if (!wc || wc < 1) next.worker_count = "กรุณาระบุจำนวนแรงงานอย่างน้อย 1 คน";
    }
    setFieldError(next);
    if (Object.keys(next).length > 0) {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return false;
    }
    return true;
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div ref={topRef} className="mx-auto max-w-[980px] px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-gray-900">ExApp</div>
          <Button size="sm" variant="outline" onClick={reset} disabled={loading}>
            เริ่มใหม่
          </Button>
        </div>

        <div className="mt-6">
          <div className="text-2xl font-semibold text-gray-900">ยื่นคำขอ POA</div>
          <div className="mt-1 text-sm text-gray-600">เลือกชื่อตัวแทน กรอกข้อมูลให้ครบ แล้วส่งให้ Operation ดำเนินการ</div>
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <ul className="list-disc pl-5">
              <li>ช่องที่มี * จำเป็นต้องกรอก</li>
              <li>หลังส่งแล้ว ระบบจะแสดงเลขอ้างอิงสำหรับติดตาม</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <div className="text-sm font-semibold text-gray-900">แบบฟอร์มคำขอ</div>
              <div className="mt-1 text-xs text-gray-600">กรอกข้อมูลให้ครบก่อนกดส่งคำขอ</div>
            </div>

            <div className="px-5 py-5">
              {bootstrapError ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{bootstrapError}</div> : null}

              <div className="grid gap-4">
                <div>
                  {representatives.length ? (
                    <>
                      <AppSelect
                        label="ชื่อตัวแทน *"
                        placeholder={bootstrapLoading ? "กำลังโหลด..." : "เลือก"}
                        options={representativeOptions}
                        value={representativeRepCode}
                        onChange={(v: string) => {
                          setRepresentativeRepCode(v);
                          setFieldError((m) => {
                            const next = { ...m };
                            delete next.representative_rep_code;
                            return next;
                          });
                        }}
                        getOptionValue={(o) => o.value}
                        displayValue={(selected) => representativeOptions.find((o) => o.value === selected)?.label ?? ""}
                        disabled={bootstrapLoading || !!bootstrapError || loading}
                        searchable
                        searchPlaceHolder="พิมพ์เพื่อค้นหา..."
                        selectClassName="h-10 px-3"
                        inPortal={false}
                      />
                    </>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        label="รหัสตัวแทน (rep_code) *"
                        value={representativeRepCode}
                        onChange={(e) => {
                          setRepresentativeRepCode(e.target.value);
                          setFieldError((m) => {
                            const next = { ...m };
                            delete next.representative_rep_code;
                            return next;
                          });
                        }}
                        disabled={bootstrapLoading || !!bootstrapError || loading}
                      />
                      <Input
                        label="ชื่อตัวแทน *"
                        value={representativeNameManual}
                        onChange={(e) => {
                          setRepresentativeNameManual(e.target.value);
                          setFieldError((m) => {
                            const next = { ...m };
                            delete next.representative_name;
                            return next;
                          });
                        }}
                        disabled={bootstrapLoading || !!bootstrapError || loading}
                      />
                    </div>
                  )}
                  {fieldError.representative_rep_code ? <div className="mt-1 text-xs font-medium text-red-600">{fieldError.representative_rep_code}</div> : null}
                  {fieldError.representative_name ? <div className="mt-1 text-xs font-medium text-red-600">{fieldError.representative_name}</div> : null}
                </div>

                <div>
                  <AppSelect
                    label="ประเภทหนังสือมอบอำนาจ *"
                    placeholder={bootstrapLoading ? "กำลังโหลด..." : "เลือก"}
                    options={typeOptions}
                    value={selectedTypeId}
                    onChange={(v: string) => {
                      setSelectedTypeId(v);
                      setFieldError((m) => {
                        const next = { ...m };
                        delete next.poa_request_type_id;
                        return next;
                      });
                    }}
                    getOptionValue={(o) => o.value}
                    displayValue={(selected) => typeOptions.find((o) => o.value === selected)?.label ?? ""}
                    disabled={bootstrapLoading || !!bootstrapError || loading}
                    selectClassName="h-10 px-3"
                    inPortal={false}
                  />
                  {fieldError.poa_request_type_id ? <div className="mt-1 text-xs font-medium text-red-600">{fieldError.poa_request_type_id}</div> : null}
                </div>

                <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-sm font-semibold text-gray-900">ข้อมูลนายจ้าง/ลูกค้า</div>
                  <Input
                    label="ชื่อนายจ้าง/ลูกค้า *"
                    value={employerName}
                    onChange={(e) => {
                      setEmployerName(e.target.value);
                      setFieldError((m) => {
                        const next = { ...m };
                        delete next.employer_name;
                        return next;
                      });
                    }}
                    disabled={loading}
                  />
                  {fieldError.employer_name ? <div className="-mt-2 text-xs font-medium text-red-600">{fieldError.employer_name}</div> : null}

                  <div className="grid gap-3 md:grid-cols-2">
                    <Input label="เลขผู้เสียภาษี" value={employerTaxId} onChange={(e) => setEmployerTaxId(e.target.value)} disabled={loading} />
                    <Input label="เบอร์โทร" value={employerTel} onChange={(e) => setEmployerTel(e.target.value)} disabled={loading} />
                  </div>
                  <Input label="ประเภทธุรกิจ" value={employerType} onChange={(e) => setEmployerType(e.target.value)} disabled={loading} />
                  <Input label="ที่อยู่" value={employerAddress} onChange={(e) => setEmployerAddress(e.target.value)} disabled={loading} />
                </div>

                <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-gray-900">ข้อมูลแรงงาน</div>
                    {isMouSelected ? <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-700">โหมด MOU</span> : null}
                  </div>

                  {!isMouSelected ? (
                    <div>
                      <Input
                        label="จำนวนแรงงาน *"
                        value={workerCount}
                        onChange={(e) => {
                          setWorkerCount(e.target.value);
                          setFieldError((m) => {
                            const next = { ...m };
                            delete next.worker_count;
                            return next;
                          });
                        }}
                        inputMode="numeric"
                        disabled={loading}
                      />
                      {fieldError.worker_count ? <div className="mt-1 text-xs font-medium text-red-600">{fieldError.worker_count}</div> : null}
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input
                          label="จำนวนชาย *"
                          value={workerMale}
                          onChange={(e) => {
                            setWorkerMale(e.target.value);
                            setFieldError((m) => {
                              const next = { ...m };
                              delete next.worker_mou;
                              return next;
                            });
                          }}
                          inputMode="numeric"
                          disabled={loading}
                        />
                        <Input
                          label="จำนวนหญิง *"
                          value={workerFemale}
                          onChange={(e) => {
                            setWorkerFemale(e.target.value);
                            setFieldError((m) => {
                              const next = { ...m };
                              delete next.worker_mou;
                              return next;
                            });
                          }}
                          inputMode="numeric"
                          disabled={loading}
                        />
                      </div>
                      {fieldError.worker_mou ? <div className="-mt-1 text-xs font-medium text-red-600">{fieldError.worker_mou}</div> : null}
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input label="สัญชาติ" value={workerNation} onChange={(e) => setWorkerNation(e.target.value)} disabled={loading} />
                        <AppSelect
                          label="ประเภทแรงงาน"
                          placeholder="เลือก"
                          options={workerTypeOptions}
                          value={workerType}
                          onChange={(v: string) => setWorkerType(v)}
                          getOptionValue={(o) => o.value}
                          displayValue={(selected) => workerTypeOptions.find((o) => o.value === selected)?.label ?? ""}
                          disabled={loading}
                          selectClassName="h-10 px-3"
                          inPortal={false}
                        />
                      </div>
                      <div className="text-xs text-gray-600">จำนวนรวมจะถูกคำนวณจากชาย + หญิง</div>
                    </>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">สรุปก่อนส่ง</div>
                  <div className="mt-2 grid gap-2 text-sm text-gray-700">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-gray-600">ตัวแทน</div>
                      <div className="truncate font-medium text-gray-900">
                        {representatives.length
                          ? (representativeOptions.find((x) => x.value === representativeRepCode)?.label ?? "-")
                          : trimOrEmpty(representativeNameManual) || trimOrEmpty(representativeRepCode) || "-"}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-gray-600">ประเภท</div>
                      <div className="truncate font-medium text-gray-900">{selectedType?.name ?? "-"}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-gray-600">นายจ้าง/ลูกค้า</div>
                      <div className="truncate font-medium text-gray-900">{trimOrEmpty(employerName) || "-"}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-gray-600">จำนวนแรงงาน</div>
                      <div className="font-medium text-gray-900">{computedWorkerCount}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-gray-600">ราคา/คน</div>
                      <div className="flex items-center gap-2 font-medium text-gray-900">
                        <span>{asMoney(computedUnitPrice)}</span>
                        {resolvedSource === "override" ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">ราคาพิเศษ</span> : null}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-gray-600">ยอดที่ต้องชำระ</div>
                      <div className="font-semibold text-gray-900">{asMoney(computedTotalPrice)} บาท</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    onClick={async () => {
                      if (!validate()) return;
                      setLoading(true);
                      setBootstrapError(null);
                      try {
                        const res = await fetch("/api/public/poa-request", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            representative_rep_code: representativeRepCode,
                            representative_name: trimOrEmpty(representativeNameManual) || null,
                            poa_request_type_id: selectedTypeId,
                            employer_name: trimOrEmpty(employerName),
                            employer_tax_id: trimOrEmpty(employerTaxId) || null,
                            employer_tel: trimOrEmpty(employerTel) || null,
                            employer_type: trimOrEmpty(employerType) || null,
                            employer_address: trimOrEmpty(employerAddress) || null,
                            worker_count: computedWorkerCount,
                            worker_male: asIntOrNull(workerMale) ?? 0,
                            worker_female: asIntOrNull(workerFemale) ?? 0,
                            worker_nation: trimOrEmpty(workerNation) || null,
                            worker_type: trimOrEmpty(workerType) || null,
                          }),
                        });
                        if (!res.ok) {
                          const data = (await res.json().catch(() => ({}))) as { error?: string };
                          throw new Error(data.error || "ส่งคำขอไม่สำเร็จ");
                        }
                        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; reference?: string };
                        const reference = String(data.reference ?? "").trim() || String(data.id ?? "").trim();
                        if (!reference) throw new Error("ส่งคำขอไม่สำเร็จ");
                        toast.success("ส่งคำขอสำเร็จ");
                        setLoading(false);
                        router.push(
                          `/public/poa-request/success?ref=${encodeURIComponent(reference)}&amount=${encodeURIComponent(String(computedTotalPrice))}&workers=${encodeURIComponent(String(computedWorkerCount))}`,
                        );
                      } catch (e: any) {
                        setLoading(false);
                        toast.error(e?.message ?? "ส่งคำขอไม่สำเร็จ");
                      }
                    }}
                    disabled={loading || !canSubmit}
                    className="whitespace-nowrap"
                  >
                    ยืนยันและส่งคำขอ
                  </Button>
                  <Button variant="outline" onClick={reset} disabled={loading} className="whitespace-nowrap">
                    ล้างข้อมูล
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="h-fit rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:sticky lg:top-6">
            <div className="text-sm font-semibold text-gray-900">ความครบถ้วน</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-gray-700">เลือกชื่อตัวแทน</div>
                <div className={representativeRepCode ? "font-semibold text-green-700" : "font-semibold text-gray-400"}>{representativeRepCode ? "ครบ" : "-"}</div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-gray-700">เลือกประเภท</div>
                <div className={selectedTypeId ? "font-semibold text-green-700" : "font-semibold text-gray-400"}>{selectedTypeId ? "ครบ" : "-"}</div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-gray-700">ชื่อนายจ้าง/ลูกค้า</div>
                <div className={trimOrEmpty(employerName) ? "font-semibold text-green-700" : "font-semibold text-gray-400"}>{trimOrEmpty(employerName) ? "ครบ" : "-"}</div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-gray-700">จำนวนแรงงาน</div>
                <div className={canSubmit ? "font-semibold text-green-700" : "font-semibold text-gray-400"}>{canSubmit ? "พร้อมส่ง" : "-"}</div>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="text-gray-700">ยอดที่ต้องชำระ</div>
                <div className="font-semibold text-gray-900">{asMoney(computedTotalPrice)} บาท</div>
              </div>
              <div className="mt-1 text-xs text-gray-500">คำนวณจากราคา/คน × จำนวนแรงงาน</div>
            </div>
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
              หลังส่งแล้ว ระบบจะแสดงเลขอ้างอิง ให้เก็บไว้สำหรับติดตามกับทีม Operation
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-gray-500">หากมีปัญหาในการส่งคำขอ โปรดติดต่อทีม Operation</div>
      </div>
    </div>
  );
}
