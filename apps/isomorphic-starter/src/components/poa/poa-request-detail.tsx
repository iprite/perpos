"use client";

import Link from "next/link";
import React, { useCallback, useMemo, useState } from "react";
import { Button, Input } from "rizzui";
import { Title, Text } from "rizzui/typography";
import dayjs from "dayjs";
import { DatePicker } from "@core/ui/datepicker";
import AppSelect from "@core/ui/app-select";
import { Modal } from "@core/modal-views/modal";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import FileUploader from "@/components/form/file-uploader";

import { buildPoaPdfBytes } from "./poa-pdf";
import { poaStatusLabel, poaSumTotal, type PoaRequestItemRow, type PoaRequestRow } from "./poa-types";

type Props = {
  id: string;
  role: string | null;
  userId: string | null;
};

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

export function PoaRequestDetail({ id, role, userId }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [req, setReq] = useState<PoaRequestRow | null>(null);
  const [items, setItems] = useState<PoaRequestItemRow[]>([]);
  const [types, setTypes] = useState<TypeOption[]>([]);

  const [showEdit, setShowEdit] = useState(false);
  const [editTypeId, setEditTypeId] = useState("");
  const [editEmployerName, setEditEmployerName] = useState("");
  const [editEmployerTaxId, setEditEmployerTaxId] = useState("");
  const [editEmployerTel, setEditEmployerTel] = useState("");
  const [editEmployerType, setEditEmployerType] = useState("");
  const [editEmployerAddress, setEditEmployerAddress] = useState("");
  const [editWorkerCount, setEditWorkerCount] = useState("1");
  const [editWorkerMale, setEditWorkerMale] = useState("");
  const [editWorkerFemale, setEditWorkerFemale] = useState("");
  const [editWorkerNation, setEditWorkerNation] = useState("");
  const [editWorkerType, setEditWorkerType] = useState("");

  const [showConfirmPay, setShowConfirmPay] = useState(false);
  const [payDate, setPayDate] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payFile, setPayFile] = useState<File | null>(null);

  const canOperate = role === "admin" || role === "operation";

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);

      const [reqRes, itemRes, typeRes] = await Promise.all([
        supabase
          .from("poa_requests")
          .select(
            "id,display_id,import_temp_id,poa_request_type_id,poa_request_types(id,name,base_price),representative_profile_id,representative_rep_code,representative_name,representative_company_name,employer_name,employer_address,employer_tax_id,employer_tel,employer_type,worker_count,worker_male,worker_female,worker_nation,worker_type,status,payment_amount,payment_date,payment_file_url,payment_status_text,profiles(email)"
          )
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("poa_request_items")
          .select("id,poa_request_type_id,unit_price_per_worker,worker_count,total_price,payment_status,poa_request_types(id,name,base_price)")
          .eq("poa_request_id", id)
          .order("created_at", { ascending: true }),
        supabase.from("poa_request_types").select("id,name,base_price,is_active").order("created_at", { ascending: false }),
      ]);

      const firstError = reqRes.error ?? itemRes.error ?? typeRes.error;
      if (firstError) {
        setError(firstError.message);
        setReq(null);
        setItems([]);
        setTypes([]);
        setLoading(false);
        return;
      }

      const nextReq = (reqRes.data as any) as PoaRequestRow | null;
      const nextItems = (((itemRes.data ?? []) as unknown) as PoaRequestItemRow[]) ?? [];
      setReq(nextReq);
      setItems(nextItems);
      setTypes(((typeRes.data ?? []) as TypeOption[]) ?? []);

      setLoading(false);
    });
  }, [id, supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const total = poaSumTotal(items);
  const canGeneratePdf = canOperate && (req?.status === "paid" || req?.status === "completed");
  const primaryItem = items[0] ?? null;
  const itemPaid = primaryItem ? String(primaryItem.payment_status ?? "") === "confirmed" : false;
  const primaryTypeName = primaryItem?.poa_request_types?.name ?? req?.poa_request_types?.name ?? "-";
  const locked = itemPaid || req?.status === "paid" || req?.status === "completed" || req?.status === "issued";
  const canEdit = !!req && (canOperate || (role === "representative" && !locked) || (canOperate && locked));

  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const selectedType = useMemo(() => (editTypeId ? typesById.get(editTypeId) ?? null : null), [editTypeId, typesById]);
  const isMouSelected = useMemo(() => String(selectedType?.name ?? "").trim().toUpperCase() === "MOU", [selectedType]);

  React.useEffect(() => {
    if (!showEdit) return;
    if (!isMouSelected) return;
    const male = editWorkerMale.trim().length ? Math.max(0, Math.trunc(Number(editWorkerMale))) : 0;
    const female = editWorkerFemale.trim().length ? Math.max(0, Math.trunc(Number(editWorkerFemale))) : 0;
    setEditWorkerCount(String(Math.max(1, male + female)));
  }, [editWorkerFemale, editWorkerMale, isMouSelected, showEdit]);

  const openEdit = useCallback(() => {
    if (!req) return;
    const initialTypeId = primaryItem?.poa_request_type_id ?? req.poa_request_type_id ?? "";
    setEditTypeId(String(initialTypeId ?? ""));
    setEditEmployerName(req.employer_name ?? "");
    setEditEmployerTaxId(req.employer_tax_id ?? "");
    setEditEmployerTel(req.employer_tel ?? "");
    setEditEmployerType(req.employer_type ?? "");
    setEditEmployerAddress(req.employer_address ?? "");
    setEditWorkerCount(String(req.worker_count ?? 1));
    setEditWorkerMale(req.worker_male == null ? "" : String(req.worker_male));
    setEditWorkerFemale(req.worker_female == null ? "" : String(req.worker_female));
    setEditWorkerNation(req.worker_nation ?? "");
    setEditWorkerType(req.worker_type ?? "");
    setShowEdit(true);
  }, [primaryItem?.poa_request_type_id, req]);

  return (
    <div>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <Title as="h1" className="truncate text-lg font-semibold text-gray-900">
              คำขอ POA {req?.display_id ? `#${req.display_id}` : req?.import_temp_id ? `#${req.import_temp_id}` : ""}
            </Title>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-600">
              <div>สถานะ: {req ? poaStatusLabel(req.status) : loading ? "กำลังโหลด..." : "-"}</div>
              <div>
                ผู้ขอ: {req?.representative_name || req?.profiles?.[0]?.email || "-"} {req?.representative_rep_code ? `(${req.representative_rep_code})` : ""}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <Link
              href="/poa-requests"
              className="inline-flex h-10 items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              กลับ
            </Link>
            {canGeneratePdf ? (
              <Button
                onClick={async () => {
                  if (!req) return;
                  if (!userId) {
                    setError("กรุณาเข้าสู่ระบบใหม่");
                    return;
                  }
                  setLoading(true);
                  setError(null);
                  try {
                    let repDetails:
                      | {
                          prefix: string | null;
                          first_name: string | null;
                          last_name: string | null;
                          id_card_no: string | null;
                          address: string | null;
                        }
                      | null = null;

                    const repCode = String(req.representative_rep_code ?? "").trim();
                    if (repCode) {
                      const repRes = await supabase
                        .from("company_representatives")
                        .select("prefix,first_name,last_name,id_card_no,address")
                        .eq("rep_code", repCode)
                        .maybeSingle();
                      if (repRes.error) throw new Error(repRes.error.message);
                      repDetails = (repRes.data as any) ?? null;
                    }

                    const pdfReq: PoaRequestRow = {
                      ...req,
                      poa_request_type_name: primaryTypeName,
                      representative_prefix: repDetails?.prefix ?? null,
                      representative_first_name: repDetails?.first_name ?? null,
                      representative_last_name: repDetails?.last_name ?? null,
                      representative_id_card_no: repDetails?.id_card_no ?? null,
                      representative_address: repDetails?.address ?? null,
                    };

                    const bytes = await buildPoaPdfBytes(pdfReq, items);

                    const filename = `${req.display_id ?? req.import_temp_id ?? req.id}.pdf`;
                    const blob = new Blob([bytes], { type: "application/pdf" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);

                    const { error: stErr } = await supabase.from("poa_requests").update({ status: "completed" }).eq("id", req.id);
                    if (stErr) throw new Error(stErr.message);
                    setLoading(false);
                    refresh();
                  } catch (err: any) {
                    setError(err?.message ?? "สร้าง PDF ไม่สำเร็จ");
                    setLoading(false);
                  }
                }}
                disabled={loading || !req || items.length === 0}
              >
                สร้าง PDF
              </Button>
            ) : (
              <Button disabled>สร้าง PDF</Button>
            )}
          </div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="grid gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">สรุปคำขอ</div>
              {canEdit ? (
                <Button variant="outline" onClick={openEdit} disabled={loading || !req}>
                  แก้ไข
                </Button>
              ) : null}
            </div>
            {req ? (
              <div className="mt-3 grid gap-2 text-sm text-gray-700">
                <div>
                  <span className="font-medium text-gray-900">เลขคำขอ:</span> {req.display_id ?? req.import_temp_id ?? req.id}
                </div>
                <div>
                  <span className="font-medium text-gray-900">สถานะ:</span> {poaStatusLabel(req.status)}
                </div>
                <div>
                  <span className="font-medium text-gray-900">ตัวแทน:</span> {req.representative_name || req.profiles?.[0]?.email || "-"}
                  {req.representative_rep_code ? <span className="text-gray-500"> ({req.representative_rep_code})</span> : null}
                </div>
                <div>
                  <span className="font-medium text-gray-900">หนังสือมอบอำนาจ:</span> {primaryTypeName}
                </div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ไม่พบข้อมูล"}</div>
            )}
          </div>

          {showEdit ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-sm font-semibold text-gray-900">แก้ไขคำขอ</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <LabeledSelect
                  label="หนังสือมอบอำนาจ"
                  value={editTypeId}
                  placeholder="เลือกหนังสือมอบอำนาจ"
                  options={types
                    .filter((t) => t.is_active || t.id === editTypeId)
                    .map((t) => ({ value: t.id, label: `${t.name} • ราคา/คน: ${Number(t.base_price ?? 0).toLocaleString()}` }))}
                  disabled={loading || locked}
                  onChange={(v) => setEditTypeId(v)}
                />
                <Input
                  label="จำนวนแรงงาน (รวม)"
                  value={editWorkerCount}
                  onChange={(e) => setEditWorkerCount(e.target.value)}
                  inputMode="numeric"
                  disabled={loading || locked || isMouSelected}
                />
                {isMouSelected ? (
                  <>
                    <Input
                      label="จำนวนแรงงานชาย"
                      value={editWorkerMale}
                      onChange={(e) => setEditWorkerMale(e.target.value)}
                      inputMode="numeric"
                      disabled={loading || locked}
                    />
                    <Input
                      label="จำนวนแรงงานหญิง"
                      value={editWorkerFemale}
                      onChange={(e) => setEditWorkerFemale(e.target.value)}
                      inputMode="numeric"
                      disabled={loading || locked}
                    />
                    <LabeledSelect
                      label="สัญชาติ"
                      value={editWorkerNation}
                      placeholder="เลือกสัญชาติ"
                      options={[
                        { value: "เมียนมา", label: "เมียนมา" },
                        { value: "ลาว", label: "ลาว" },
                        { value: "กัมพูชา", label: "กัมพูชา" },
                      ]}
                      disabled={loading || locked}
                      onChange={(v) => setEditWorkerNation(v)}
                    />
                    <LabeledSelect
                      label="ประเภทแรงงาน"
                      value={editWorkerType}
                      placeholder="เลือกประเภทแรงงาน"
                      options={[
                        { value: "กรรมกร", label: "กรรมกร" },
                        { value: "รับใช้ในบ้าน", label: "รับใช้ในบ้าน" },
                      ]}
                      disabled={loading || locked}
                      onChange={(v) => setEditWorkerType(v)}
                    />
                  </>
                ) : null}
                <Input
                  label="ชื่อนายจ้าง"
                  value={editEmployerName}
                  onChange={(e) => setEditEmployerName(e.target.value)}
                  disabled={loading || locked}
                />
                <Input
                  label="เลขนายจ้าง/เลขประจำตัวผู้เสียภาษี"
                  value={editEmployerTaxId}
                  onChange={(e) => setEditEmployerTaxId(e.target.value)}
                  disabled={loading || locked}
                />
                <Input label="โทร" value={editEmployerTel} onChange={(e) => setEditEmployerTel(e.target.value)} disabled={loading} />
                <Input
                  label="ประเภทกิจการ"
                  value={editEmployerType}
                  onChange={(e) => setEditEmployerType(e.target.value)}
                  disabled={loading}
                />
                <div className="md:col-span-2">
                  <div className="text-sm font-medium text-gray-700">ที่อยู่</div>
                  <textarea
                    className="mt-2 min-h-[88px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                    value={editEmployerAddress}
                    onChange={(e) => setEditEmployerAddress(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={async () => {
                    if (!req) return;
                    setLoading(true);
                    setError(null);
                    try {
                      const maleNum = isMouSelected && editWorkerMale.trim().length ? Math.max(0, Math.trunc(Number(editWorkerMale))) : 0;
                      const femaleNum = isMouSelected && editWorkerFemale.trim().length ? Math.max(0, Math.trunc(Number(editWorkerFemale))) : 0;
                      const wc = isMouSelected
                        ? Math.max(1, maleNum + femaleNum)
                        : Math.max(1, Math.trunc(Number(editWorkerCount || 1)));

                      const payload: any = locked
                        ? {
                            employer_tel: editEmployerTel.trim() || null,
                            employer_type: editEmployerType.trim() || null,
                            employer_address: editEmployerAddress.trim() || null,
                          }
                        : {
                            employer_name: editEmployerName.trim(),
                            employer_tax_id: editEmployerTaxId.trim() || null,
                            employer_tel: editEmployerTel.trim() || null,
                            employer_type: editEmployerType.trim() || null,
                            employer_address: editEmployerAddress.trim() || null,
                            worker_count: wc,
                            worker_male: isMouSelected ? maleNum : null,
                            worker_female: isMouSelected ? femaleNum : null,
                            worker_nation: isMouSelected ? editWorkerNation.trim() || null : null,
                            worker_type: isMouSelected ? editWorkerType.trim() || null : null,
                            poa_request_type_id: editTypeId || null,
                          };

                      const { error: upErr } = await supabase.from("poa_requests").update(payload).eq("id", req.id);
                      if (upErr) throw new Error(upErr.message);

                      if (!locked && editTypeId) {
                        const t = typesById.get(editTypeId) ?? null;
                        if (!t) throw new Error("ไม่พบรายการหนังสือมอบอำนาจที่เลือก");

                        const { data: existingItems, error: exErr } = await supabase
                          .from("poa_request_items")
                          .select("id,poa_request_type_id,payment_status")
                          .eq("poa_request_id", req.id);
                        if (exErr) throw new Error(exErr.message);
                        const existing = ((existingItems ?? []) as any[]).map((x) => ({
                          id: String(x.id),
                          typeId: String(x.poa_request_type_id),
                          payment_status: String(x.payment_status ?? ""),
                        }));
                        const confirmedType = existing.find((x) => x.payment_status === "confirmed")?.typeId ?? null;
                        if (confirmedType && confirmedType !== editTypeId) {
                          throw new Error("มีรายการที่ยืนยันชำระแล้ว จึงไม่สามารถเปลี่ยนหนังสือมอบอำนาจได้");
                        }

                        const unit = Number(t.base_price ?? 0);
                        const upsertRow = {
                          poa_request_id: req.id,
                          poa_request_type_id: editTypeId,
                          unit_price_per_worker: unit,
                          worker_count: wc,
                          total_price: unit * wc,
                          payment_status: confirmedType ? "confirmed" : "unpaid",
                        };
                        const { error: itemErr } = await supabase
                          .from("poa_request_items")
                          .upsert([upsertRow], { onConflict: "poa_request_id,poa_request_type_id" });
                        if (itemErr) throw new Error(itemErr.message);

                        const removeIds = existing
                          .filter((x) => x.typeId !== editTypeId && x.payment_status !== "confirmed")
                          .map((x) => x.id);
                        if (removeIds.length) {
                          const { error: delErr } = await supabase.from("poa_request_items").delete().in("id", removeIds);
                          if (delErr) throw new Error(delErr.message);
                        }
                      }

                      setShowEdit(false);
                      setLoading(false);
                      refresh();
                    } catch (err: any) {
                      setError(err?.message ?? "บันทึกไม่สำเร็จ");
                      setLoading(false);
                    }
                  }}
                  disabled={loading || !req}
                >
                  บันทึก
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEdit(false);
                  }}
                  disabled={loading}
                >
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">ข้อมูลนายจ้าง</div>
            {req ? (
              <div className="mt-3 grid gap-2 text-sm text-gray-700">
                <div>
                  <span className="font-medium text-gray-900">ชื่อ:</span> {req.employer_name ?? "-"}
                </div>
                <div>
                  <span className="font-medium text-gray-900">เลขนายจ้าง/ภาษี:</span> {req.employer_tax_id ?? "-"}
                </div>
                <div>
                  <span className="font-medium text-gray-900">โทร:</span> {req.employer_tel ?? "-"}
                </div>
                <div>
                  <span className="font-medium text-gray-900">ประเภทกิจการ:</span> {req.employer_type ?? "-"}
                </div>
                <div>
                  <span className="font-medium text-gray-900">ที่อยู่:</span> {req.employer_address ?? "-"}
                </div>
              </div>
            ) : null}
          </div>

          {req?.payment_status_text || req?.payment_file_url ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-sm font-semibold text-gray-900">ข้อมูลการชำระเงิน (จากการนำเข้า)</div>
              <div className="mt-3 grid gap-2 text-sm text-gray-700">
                <div>
                  <span className="font-medium text-gray-900">สถานะ:</span> {req.payment_status_text ?? "-"}
                </div>
                <div>
                  <span className="font-medium text-gray-900">จำนวนเงิน:</span> {req.payment_amount == null ? "-" : Number(req.payment_amount).toLocaleString()}
                </div>
                <div>
                  <span className="font-medium text-gray-900">ไฟล์:</span>{" "}
                  {req.payment_file_url ? (
                    <a className="text-gray-900 underline" href={req.payment_file_url} target="_blank" rel="noreferrer">
                      เปิด
                    </a>
                  ) : (
                    "-"
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">ยอดรวม</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{total.toLocaleString()}</div>
            <div className="mt-1 text-xs text-gray-500">คำนวณจาก ราคา/คน × จำนวนแรงงาน</div>
            <div className="mt-3 grid gap-1 text-sm text-gray-700">
              <div>
                <span className="font-medium text-gray-900">จำนวนแรงงาน:</span> {req?.worker_count == null ? "-" : Number(req.worker_count).toLocaleString()}
                {req?.worker_male != null || req?.worker_female != null ? (
                  <span className="text-gray-500"> (ชาย {req.worker_male ?? 0} • หญิง {req.worker_female ?? 0})</span>
                ) : null}
              </div>
              <div>
                <span className="font-medium text-gray-900">สถานะชำระเงิน:</span> {itemPaid ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน"}
              </div>
            </div>

            {canOperate ? (
              <div className="mt-3">
                {!primaryItem ? (
                  <Button disabled>ยืนยันชำระเงิน</Button>
                ) : itemPaid ? (
                  <Button disabled>ยืนยันชำระเงินแล้ว</Button>
                ) : (
                  <Button
                    onClick={() => {
                      setPayDate("");
                      setPayRef("");
                      setPayFile(null);
                      setShowConfirmPay(true);
                    }}
                    disabled={loading}
                  >
                    ยืนยันชำระเงิน
                  </Button>
                )}
              </div>
            ) : null}
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">เงื่อนไขสร้าง PDF</div>
            <div className="mt-2 grid gap-1 text-sm text-gray-700">
              <div>• ต้องมีรายการหนังสือมอบอำนาจ</div>
              <div>• ต้องยืนยันชำระเงินครบทุกรายการ</div>
              <div>• สถานะต้องเป็น “ชำระแล้ว”</div>
            </div>
            {!canOperate ? <div className="mt-2 text-xs text-gray-500">สิทธิ์สร้าง PDF เฉพาะ operation/admin</div> : null}
          </div>
        </div>
      </div>

      <Modal
        isOpen={!!(showConfirmPay && canOperate && primaryItem && !itemPaid)}
        onClose={() => {
          setShowConfirmPay(false);
          setPayDate("");
          setPayRef("");
          setPayFile(null);
        }}
        size="lg"
        rounded="md"
      >
        <div className="rounded-xl bg-white p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-base font-semibold text-gray-900">ยืนยันชำระเงิน</div>
              <div className="mt-1 text-sm text-gray-600">แนบสลิปและระบุข้อมูลการชำระ</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowConfirmPay(false);
                setPayDate("");
                setPayRef("");
                setPayFile(null);
              }}
              disabled={loading}
              className="whitespace-nowrap"
            >
              ปิด
            </Button>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="text-gray-600">ยอดที่ต้องยืนยัน</div>
                <div className="font-semibold text-gray-900">{Number(primaryItem?.total_price ?? 0).toLocaleString()} บาท</div>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <div className="text-sm font-medium text-gray-700">วันที่</div>
                <DatePicker
                  selected={payDate ? dayjs(payDate).toDate() : null}
                  onChange={(date: Date | null) => setPayDate(date ? dayjs(date).format("YYYY-MM-DD") : "")}
                  placeholderText="Select Date"
                  disabled={loading}
                />
              </div>
              <div>
                <Input label="อ้างอิง" value={payRef} onChange={(e) => setPayRef(e.target.value)} disabled={loading} />
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700">สลิป</div>
              <div className="mt-2">
                <FileUploader
                  label=""
                  helperText="คลิกเพื่อแนบสลิป หรือ ลากไฟล์มาวาง"
                  accept={{ "image/*": [], "application/pdf": [] }}
                  multiple={false}
                  maxFiles={1}
                  maxSizeBytes={8 * 1024 * 1024}
                  files={payFile ? [payFile] : []}
                  onFilesChange={(next) => setPayFile(next[0] ?? null)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={async () => {
                  if (!req) return;
                  if (!primaryItem) return;
                  if (!userId) {
                    setError("กรุณาเข้าสู่ระบบใหม่");
                    return;
                  }
                  if (!payFile) {
                    setError("กรุณาแนบสลิป");
                    return;
                  }
                  setLoading(true);
                  setError(null);
                  try {
                    const amount = Number(primaryItem.total_price ?? 0);
                    const { data: created, error: insErr } = await supabase
                      .from("poa_item_payments")
                      .insert({
                        poa_request_item_id: primaryItem.id,
                        amount,
                        paid_date: payDate || null,
                        reference_no: payRef.trim() || null,
                        status: "confirmed",
                        created_by_profile_id: userId,
                      })
                      .select("id")
                      .single();
                    if (insErr) throw new Error(insErr.message);

                    const paymentId = String((created as any)?.id);
                    const path = `poa/${req.id}/items/${primaryItem.id}/slips/${paymentId}/${payFile.name}`;
                    const { error: upErr } = await supabase.storage.from("poa_slips").upload(path, payFile, {
                      upsert: true,
                      contentType: payFile.type || undefined,
                    });
                    if (upErr) throw new Error(upErr.message);

                    const { error: updErr } = await supabase.from("poa_item_payments").update({ slip_object_path: path }).eq("id", paymentId);
                    if (updErr) throw new Error(updErr.message);

                    const { error: itErr } = await supabase
                      .from("poa_request_items")
                      .update({ payment_status: "confirmed" })
                      .eq("id", primaryItem.id);
                    if (itErr) throw new Error(itErr.message);

                    const { error: stErr } = await supabase.from("poa_requests").update({ status: "paid" }).eq("id", req.id);
                    if (stErr) throw new Error(stErr.message);

                    setShowConfirmPay(false);
                    setPayDate("");
                    setPayRef("");
                    setPayFile(null);
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
                ยืนยัน
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowConfirmPay(false);
                  setPayDate("");
                  setPayRef("");
                  setPayFile(null);
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
