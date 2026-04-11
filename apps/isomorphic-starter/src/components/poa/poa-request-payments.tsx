"use client";

import React, { useMemo, useState } from "react";
import { Button, Input } from "rizzui";
import dayjs from "dayjs";
import { DatePicker } from "@core/ui/datepicker";
import FileUploader from "@/components/form/file-uploader";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PoaItemPaymentRow, PoaRequestItemRow, PoaRequestRow } from "./poa-types";

type Props = {
  supabase: SupabaseClient;
  request: PoaRequestRow;
  items: PoaRequestItemRow[];
  payments: PoaItemPaymentRow[];
  canOperate: boolean;
  userId: string | null;
  loading: boolean;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  onRefetch: () => void;
};

export function PoaRequestPayments({
  supabase,
  request,
  items,
  payments,
  canOperate,
  userId,
  loading,
  setLoading,
  setError,
  onRefetch,
}: Props) {
  const paymentsByItem = useMemo(() => {
    const map = new Map<string, PoaItemPaymentRow[]>();
    for (const p of payments) {
      const list = map.get(p.poa_request_item_id) ?? [];
      list.push(p);
      map.set(p.poa_request_item_id, list);
    }
    return map;
  }, [payments]);

  const [payingItemId, setPayingItemId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payFile, setPayFile] = useState<File | null>(null);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm font-semibold text-gray-900">รายการหนังสือมอบอำนาจ & การชำระเงิน</div>
      {items.length === 0 ? <div className="mt-3 text-sm text-gray-500">ยังไม่มีรายการ</div> : null}

      <div className="mt-3 grid gap-3">
        {items.map((it) => {
          const name = it.poa_request_types?.name ?? it.poa_request_type_id;
          const list = paymentsByItem.get(it.id) ?? [];

          return (
            <div key={it.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{name}</div>
                  <div className="mt-1 text-xs text-gray-600">
                    ราคา/คน {Number(it.unit_price_per_worker ?? 0).toLocaleString()} • จำนวน {Number(it.worker_count ?? 0).toLocaleString()} • รวม {Number(it.total_price ?? 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-sm text-gray-700">{it.payment_status === "confirmed" ? "ยืนยันชำระแล้ว" : it.payment_status}</div>
              </div>

              {list.length ? (
                <div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-white">
                  <div className="grid grid-cols-[0.5fr_0.5fr_0.8fr_0.6fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                    <div className="text-right">จำนวนเงิน</div>
                    <div>วันที่</div>
                    <div>อ้างอิง</div>
                    <div>สลิป</div>
                  </div>
                  {list.slice(0, 5).map((p) => (
                    <div key={p.id} className="grid grid-cols-[0.5fr_0.5fr_0.8fr_0.6fr] gap-3 border-t border-gray-100 px-3 py-2 text-sm">
                      <div className="text-right text-gray-900">{Number(p.amount ?? 0).toLocaleString()}</div>
                      <div className="text-gray-700">{p.paid_date ?? "-"}</div>
                      <div className="text-gray-700">{p.reference_no ?? "-"}</div>
                      <div className="text-gray-700">
                        {p.slip_object_path ? (
                          <button
                            type="button"
                            className="text-sm font-medium text-gray-900 underline disabled:opacity-50"
                            onClick={async () => {
                              setLoading(true);
                              setError(null);
                              try {
                                const { data, error: sErr } = await supabase.storage
                                  .from("poa_slips")
                                  .createSignedUrl(p.slip_object_path as string, 60 * 10);
                                if (sErr) throw new Error(sErr.message);
                                window.open(data.signedUrl, "_blank", "noopener,noreferrer");
                                setLoading(false);
                              } catch (err: any) {
                                setError(err?.message ?? "เปิดสลิปไม่สำเร็จ");
                                setLoading(false);
                              }
                            }}
                            disabled={loading}
                          >
                            เปิด
                          </button>
                        ) : (
                          "-"
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {canOperate ? (
                <div className="mt-3">
                  {payingItemId !== it.id ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setPayingItemId(it.id);
                        setPayAmount(String(it.total_price ?? 0));
                        setPayDate("");
                        setPayRef("");
                        setPayFile(null);
                      }}
                      disabled={loading}
                    >
                      ยืนยันชำระเงิน (แนบสลิป)
                    </Button>
                  ) : (
                    <div className="grid gap-2 rounded-lg border border-gray-200 bg-white p-3">
                      <div className="grid gap-2 md:grid-cols-3">
                        <Input label="จำนวนเงิน" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} inputMode="decimal" />
                        <DatePicker
                          selected={payDate ? dayjs(payDate).toDate() : null}
                          onChange={(date: Date | null) => setPayDate(date ? dayjs(date).format("YYYY-MM-DD") : "")}
                          placeholderText="Select Date"
                          disabled={loading}
                          inputProps={{ label: "วันที่" }}
                        />
                        <Input label="อ้างอิง" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
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
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={async () => {
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
                              const amount = Math.max(0, Number(payAmount || 0));
                              const { data: created, error: insErr } = await supabase
                                .from("poa_item_payments")
                                .insert({
                                  poa_request_item_id: it.id,
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
                              const path = `poa/${request.id}/items/${it.id}/slips/${paymentId}/${payFile.name}`;
                              const { error: upErr } = await supabase.storage.from("poa_slips").upload(path, payFile, {
                                upsert: true,
                                contentType: payFile.type || undefined,
                              });
                              if (upErr) throw new Error(upErr.message);

                              const { error: updErr } = await supabase
                                .from("poa_item_payments")
                                .update({ slip_object_path: path })
                                .eq("id", paymentId);
                              if (updErr) throw new Error(updErr.message);

                              const { error: itErr } = await supabase
                                .from("poa_request_items")
                                .update({ payment_status: "confirmed" })
                                .eq("id", it.id);
                              if (itErr) throw new Error(itErr.message);

                              const { data: statusRows, error: sErr } = await supabase
                                .from("poa_request_items")
                                .select("payment_status")
                                .eq("poa_request_id", request.id);
                              if (sErr) throw new Error(sErr.message);
                              const allConfirmed = ((statusRows ?? []) as any[]).every((x) => String(x.payment_status) === "confirmed");
                              if (allConfirmed) {
                                const { error: stErr } = await supabase.from("poa_requests").update({ status: "paid" }).eq("id", request.id);
                                if (stErr) throw new Error(stErr.message);
                              }

                              setPayingItemId(null);
                              setPayFile(null);
                              setLoading(false);
                              onRefetch();
                            } catch (err: any) {
                              setError(err?.message ?? "บันทึกการชำระเงินไม่สำเร็จ");
                              setLoading(false);
                            }
                          }}
                          disabled={loading}
                        >
                          ยืนยัน
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPayingItemId(null);
                            setPayFile(null);
                          }}
                          disabled={loading}
                        >
                          ยกเลิก
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
