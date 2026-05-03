"use client";

import React, { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input } from "rizzui";
import { Text } from "rizzui/typography";
import dayjs from "dayjs";
import { Modal } from "@core/modal-views/modal";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useConfirmDialog } from "@/app/shared/confirm-dialog/provider";
import { buildPoaPdfBytes } from "@/components/poa/poa-pdf";
import { poaStatusLabel, poaSumTotal, type PoaRequestItemRow, type PoaRequestRow } from "@/components/poa/poa-types";

type TypeOption = { id: string; name: string; base_price: number; is_active: boolean };

function canDownload(status: string) {
  return status === "paid" || status === "completed" || status === "issued";
}

function isPendingPayment(status: string) {
  return status === "submitted";
}

export function RequestDetailModal({
  open,
  onClose,
  supabase,
  userId,
  requestId,
  types,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  supabase: SupabaseClient;
  userId: string | null;
  requestId: string | null;
  types: TypeOption[];
  onChanged: () => void;
}) {
  const confirmDialog = useConfirmDialog();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [req, setReq] = useState<PoaRequestRow | null>(null);
  const [items, setItems] = useState<PoaRequestItemRow[]>([]);

  const [editMode, setEditMode] = useState(false);
  const [editEmployerName, setEditEmployerName] = useState("");
  const [editEmployerAddress, setEditEmployerAddress] = useState("");

  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const primaryItem = items[0] ?? null;
  const typeName = primaryItem?.poa_request_types?.name ?? (req?.poa_request_type_id ? typesById.get(req.poa_request_type_id)?.name : null) ?? "-";
  const unit = Number(primaryItem?.unit_price_per_worker ?? primaryItem?.poa_request_types?.base_price ?? (req as any)?.unit_price ?? 0);
  const total = items.length > 0 ? poaSumTotal(items) : Number((req as any)?.total_price ?? 0);

  const owned = !!userId && !!req?.representative_profile_id && userId === req.representative_profile_id;
  const pending = req ? isPendingPayment(req.status) : false;
  const canEdit = owned && pending;
  const canDelete = owned && pending;

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      if (!requestId) return;
      setLoading(true);
      setError(null);
      setEditMode(false);
      const [reqRes, itemRes] = await Promise.all([
        supabase
          .from("poa_requests")
          .select(
            "id,display_id,import_temp_id,poa_request_type_id,representative_profile_id,representative_rep_code,representative_name,employer_name,employer_tax_id,employer_tel,employer_type,employer_address,worker_count,worker_male,worker_female,worker_nation,worker_type,unit_price,total_price,status,created_at",
          )
          .eq("id", requestId)
          .maybeSingle(),
        supabase
          .from("poa_request_items")
          .select("id,poa_request_type_id,unit_price_per_worker,worker_count,total_price,payment_status,poa_request_types(id,name,base_price)")
          .eq("poa_request_id", requestId)
          .order("created_at", { ascending: true }),
      ]);
      const firstError = reqRes.error ?? itemRes.error;
      if (firstError) {
        setError(firstError.message);
        setReq(null);
        setItems([]);
        setLoading(false);
        return;
      }

      const nextReq = (reqRes.data as any) as PoaRequestRow | null;
      setReq(nextReq);
      setItems((((itemRes.data ?? []) as unknown) as PoaRequestItemRow[]) ?? []);
      setEditEmployerName(nextReq?.employer_name ?? "");
      setEditEmployerAddress(nextReq?.employer_address ?? "");
      setLoading(false);
    });
  }, [requestId, supabase]);

  React.useEffect(() => {
    if (!open) return;
    refresh();
  }, [open, refresh]);

  const downloadPdf = useCallback(async () => {
    if (!req) return;
    if (!canDownload(req.status)) return;
    if (items.length === 0) {
      setError("ไม่พบรายการราคา (poa_request_items) จึงยังดาวน์โหลดไม่ได้");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const repCode = String(req.representative_rep_code ?? "").trim();
      let repDetails:
        | {
            prefix: string | null;
            first_name: string | null;
            last_name: string | null;
            id_card_no: string | null;
            address: string | null;
          }
        | null = null;

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
        poa_request_type_name: typeName,
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
      setLoading(false);
    } catch (err: any) {
      setError(err?.message ?? "ดาวน์โหลดไม่สำเร็จ");
      setLoading(false);
    }
  }, [items, req, supabase, typeName]);

  return (
    <Modal
      isOpen={open}
      onClose={() => {
        if (loading) return;
        setReq(null);
        setItems([]);
        setError(null);
        setEditMode(false);
        onClose();
      }}
      size="xl"
      rounded="md"
    >
      <div className="p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-gray-900">
              รายละเอียดคำขอ {req?.display_id ? `#${req.display_id}` : req?.import_temp_id ? `#${req.import_temp_id}` : ""}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-600">
              <div>สถานะ: {req ? poaStatusLabel(req.status) : loading ? "กำลังโหลด..." : "-"}</div>
              <div>วันที่: {req?.created_at ? dayjs(req.created_at).format("YYYY-MM-DD HH:mm") : "-"}</div>
              {req?.representative_rep_code ? <div>รหัสตัวแทน: {req.representative_rep_code}</div> : null}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {req && canDelete ? (
              <Button
                variant="outline"
                color="danger"
                disabled={loading}
                onClick={async () => {
                  if (!req) return;
                  const ok = await confirmDialog({
                    title: "ยืนยันลบคำขอ",
                    message: "ต้องการลบคำขอนี้หรือไม่?",
                    confirmText: "ลบ",
                    tone: "danger",
                  });
                  if (!ok) return;
                  setLoading(true);
                  setError(null);
                  const delRes = await supabase.from("poa_requests").delete().eq("id", req.id);
                  if (delRes.error) {
                    setError(delRes.error.message);
                    setLoading(false);
                    return;
                  }
                  toast.success("ลบแล้ว");
                  setLoading(false);
                  onClose();
                  onChanged();
                }}
              >
                ลบ
              </Button>
            ) : null}

            {req && canEdit && !editMode ? (
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => {
                  setEditEmployerName(req.employer_name ?? "");
                  setEditEmployerAddress(req.employer_address ?? "");
                  setEditMode(true);
                }}
              >
                แก้ไข
              </Button>
            ) : null}

            {req && canDownload(req.status) ? (
              <Button disabled={loading} onClick={downloadPdf}>
                ดาวน์โหลด POA
              </Button>
            ) : null}
          </div>
        </div>

        {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="mt-4 grid gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-gray-600">หนังสือมอบอำนาจ</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{typeName}</div>
              <div className="mt-0.5 text-xs text-gray-500">ราคา/คน: {Number.isFinite(unit) ? unit.toLocaleString() : "0"}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-semibold text-gray-600">จำนวน</div>
                <div className="mt-1 text-sm font-medium text-gray-900 tabular-nums">{Number(req?.worker_count ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-600">ยอดรวม</div>
                <div className="mt-1 text-sm font-medium text-gray-900 tabular-nums">{Number(total ?? 0).toLocaleString()}</div>
              </div>
            </div>

            <div className="md:col-span-2">
              {editMode ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label="ชื่อนายจ้าง"
                    value={editEmployerName}
                    onChange={(e) => setEditEmployerName(e.target.value)}
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
                  <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      disabled={loading}
                      onClick={() => {
                        setEditMode(false);
                        setEditEmployerName(req?.employer_name ?? "");
                        setEditEmployerAddress(req?.employer_address ?? "");
                      }}
                    >
                      ยกเลิก
                    </Button>
                    <Button
                      disabled={
                        loading ||
                        editEmployerName.trim().length === 0 ||
                        !req ||
                        !owned ||
                        !isPendingPayment(req.status)
                      }
                      onClick={async () => {
                        if (!req) return;
                        setLoading(true);
                        setError(null);
                        const updRes = await supabase
                          .from("poa_requests")
                          .update({ employer_name: editEmployerName.trim(), employer_address: editEmployerAddress.trim() || null })
                          .eq("id", req.id);
                        if (updRes.error) {
                          setError(updRes.error.message);
                          setLoading(false);
                          return;
                        }
                        toast.success("บันทึกแล้ว");
                        setLoading(false);
                        setEditMode(false);
                        refresh();
                        onChanged();
                      }}
                    >
                      บันทึก
                    </Button>
                  </div>
                  <div className="md:col-span-2">
                    <Text className="text-xs text-gray-500">
                      แก้ไขได้เฉพาะ “ชื่อนายจ้าง” และ “ที่อยู่” และทำได้เฉพาะสถานะรอชำระ
                    </Text>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  <div>
                    <div className="text-xs font-semibold text-gray-600">ชื่อนายจ้าง</div>
                    <div className="mt-1 text-sm text-gray-900">{req?.employer_name ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-600">ที่อยู่</div>
                    <div className="mt-1 whitespace-pre-line text-sm text-gray-900">{req?.employer_address ?? "-"}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="outline" disabled={loading} onClick={() => onClose()}>
            ปิด
          </Button>
        </div>
      </div>
    </Modal>
  );
}
