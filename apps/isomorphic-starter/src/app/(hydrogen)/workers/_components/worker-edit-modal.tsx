"use client";

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "rizzui";
import { Modal } from "@core/modal-views/modal";
import { X } from "lucide-react";

import { useConfirmDialog } from "@/app/shared/confirm-dialog/provider";

import type { CustomerOption, WorkerOrderDocumentRow, WorkerRow } from "./worker-edit-types";
import { WorkerProfilePanel } from "./worker-profile-panel";
import { WorkerFieldsForm } from "./worker-fields-form";
import { WorkerDocumentsPanel } from "./worker-documents-panel";
import { WorkerDocAddModal } from "./worker-doc-add-modal";
import { WorkerDocViewerModal } from "./worker-doc-viewer-modal";
import { useWorkerEditForm } from "./use-worker-edit-form";
import { WorkerOrderDocumentsPanel } from "./worker-order-documents-panel";
import { WorkerOrderDocViewerModal } from "./worker-order-doc-viewer-modal";

export function WorkerEditModal({
  open,
  onClose,
  initial,
  supabase,
  role,
  userId,
  customers,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: WorkerRow | null;
  supabase: any;
  role: string | null;
  userId: string | null;
  customers: CustomerOption[];
  onSaved: () => void;
}) {
  const confirmDialog = useConfirmDialog();
  const canDelete = role === "admin" || role === "operation";
  const form = useWorkerEditForm({ open, initial, supabase, userId, onSaved, onClose });

  const [linkedOrders, setLinkedOrders] = useState<{ id: string; display_id: string | null }[]>([]);
  const [orderDocs, setOrderDocs] = useState<WorkerOrderDocumentRow[]>([]);
  const [orderDocViewerOpen, setOrderDocViewerOpen] = useState(false);
  const [orderDocViewerId, setOrderDocViewerId] = useState<string | null>(null);
  const [orderDocViewerTitle, setOrderDocViewerTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!form.editingId) {
      setLinkedOrders([]);
      setOrderDocs([]);
      return;
    }
    const workerId = form.editingId;
    Promise.resolve().then(async () => {
      try {
        const links = await supabase
          .from("order_item_workers")
          .select("order_item_id")
          .eq("worker_id", workerId)
          .limit(5000);

        const orderItemIds = (links.data ?? []).map((x: any) => String(x.order_item_id)).filter(Boolean);
        const orderItemsRes = orderItemIds.length
          ? await supabase
              .from("order_items")
              .select("id,order_id")
              .in("id", orderItemIds)
              .limit(5000)
          : { data: [] as any[], error: null as any };

        const orderIds = Array.from(new Set((orderItemsRes.data ?? []).map((x: any) => String(x.order_id)).filter(Boolean)));
        const ordersRes = orderIds.length
          ? await supabase.from("orders").select("id,display_id").in("id", orderIds).limit(200)
          : { data: [] as any[], error: null as any };

        setLinkedOrders(
          (ordersRes.data ?? []).map((o: any) => ({ id: String(o.id), display_id: String(o.display_id ?? "") || null })),
        );

        const dRes = await supabase
          .from("order_documents")
          .select("id,order_id,order_item_id,doc_type,storage_provider,storage_bucket,storage_path,file_name,drive_web_view_link,drive_file_id,created_at,orders(display_id),order_items(services(name))")
          .eq("worker_id", workerId)
          .order("created_at", { ascending: false })
          .limit(300);

        setOrderDocs(((dRes.data ?? []) as any[]) as WorkerOrderDocumentRow[]);
      } catch {
        setLinkedOrders([]);
        setOrderDocs([]);
      }
    });
  }, [form.editingId, open, supabase]);

  const formTitle = form.editingId ? "แก้ไขแรงงาน" : "เพิ่มแรงงาน";

  return (
    <>
      <Modal isOpen={open} onClose={form.closeAndReset} size="xl" customSize={880} rounded="md">
        <div className="rounded-xl bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-gray-900">{formTitle}</div>
              <div className="mt-1 text-sm text-gray-600">กรอกข้อมูลแรงงานและจัดการเอกสารประกอบ</div>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
              onClick={form.closeAndReset}
              disabled={form.loading}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {form.error ? <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{form.error}</div> : null}

          <div className="grid gap-5 px-5 py-5 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <WorkerProfilePanel
                loading={form.loading}
                profilePicUrl={form.profilePicUrl}
                onChangeProfilePicUrl={form.setProfilePicUrl}
                profilePicFile={form.profilePicFile}
                onChangeProfilePicFile={form.setProfilePicFile}
                osSex={form.osSex}
                onChangeOsSex={form.setOsSex}
                wpType={form.wpType}
                onChangeWpType={form.setWpType}
                nationality={form.nationality}
                onChangeNationality={form.setNationality}
              />
            </div>

            <div className="lg:col-span-8">
              <WorkerFieldsForm
                loading={form.loading}
                nameInputRef={form.nameInputRef}
                customers={customers}
                workerId={form.workerId}
                onChangeWorkerId={form.setWorkerId}
                fullName={form.fullName}
                onChangeFullName={form.setFullName}
                birthDate={form.birthDate}
                onChangeBirthDate={form.setBirthDate}
                customerId={form.customerId}
                onChangeCustomerId={form.setCustomerId}
                passportType={form.passportType}
                onChangePassportType={form.setPassportType}
                passportNo={form.passportNo}
                onChangePassportNo={form.setPassportNo}
                passportExpireDate={form.passportExpireDate}
                onChangePassportExpireDate={form.setPassportExpireDate}
                visaExpDate={form.visaExpDate}
                onChangeVisaExpDate={form.setVisaExpDate}
                wpNumber={form.wpNumber}
                onChangeWpNumber={form.setWpNumber}
                wpExpireDate={form.wpExpireDate}
                onChangeWpExpireDate={form.setWpExpireDate}
              />

              <WorkerDocumentsPanel
                loading={form.loading}
                editingId={form.editingId}
                docs={form.docRows}
                onAdd={() => form.setDocAddOpen(true)}
                onOpenDoc={(d) => {
                  form.setDocViewerId(d.id);
                  form.setDocViewerTitle(d.doc_type || "เอกสาร");
                  form.setDocViewerOpen(true);
                }}
              />

              <WorkerOrderDocumentsPanel
                loading={form.loading}
                orders={linkedOrders}
                docs={orderDocs}
                onOpenOrder={(id) => (window.location.href = `/manage-orders/${id}`)}
                onOpenDoc={(d) => {
                  setOrderDocViewerId(d.id);
                  setOrderDocViewerTitle(d.doc_type || d.file_name || "เอกสาร");
                  setOrderDocViewerOpen(true);
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-4">
            <div>
              {form.editingId && canDelete ? (
                <Button
                  variant="outline"
                  onClick={async () => {
                    const ok = await confirmDialog({ title: "ยืนยันการลบ", message: "ต้องการลบแรงงานนี้หรือไม่?", confirmText: "ลบ", tone: "danger" });
                    if (!ok) return;
                    form.setLoading(true);
                    form.setError(null);
                    const { error: delErr } = await supabase.from("workers").delete().eq("id", form.editingId);
                    if (delErr) {
                      form.setError(delErr.message);
                      form.setLoading(false);
                      return;
                    }
                    toast.success("ลบแล้ว");
                    form.setLoading(false);
                    onSaved();
                    form.closeAndReset();
                  }}
                  disabled={form.loading}
                >
                  ลบ
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={form.closeAndReset} disabled={form.loading}>
                ยกเลิก
              </Button>
              <Button
                onClick={() => form.submitWorker(form.editingId ? "edit" : "add")}
                disabled={form.loading || !form.canSave}
              >
                {form.editingId ? "อัปเดต" : "บันทึก"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <WorkerDocAddModal
        open={form.docAddOpen}
        onClose={() => {
          form.setDocAddOpen(false);
          form.setDocType("");
          form.setDocExpiryDate("");
          form.setDocFile(null);
        }}
        loading={form.loading}
        editingId={form.editingId}
        docType={form.docType}
        onChangeDocType={form.setDocType}
        docExpiryDate={form.docExpiryDate}
        onChangeDocExpiryDate={form.setDocExpiryDate}
        docFile={form.docFile}
        onChangeDocFile={form.setDocFile}
        onUploaded={(id) => {
          toast.success("อัปโหลดแล้ว");
          void form.refreshDocs(id);
        }}
        onError={(m) => form.setError(m)}
        onLoading={(v) => form.setLoading(v)}
      />

      <WorkerDocViewerModal
        open={form.docViewerOpen}
        onClose={() => {
          form.setDocViewerOpen(false);
          form.setDocViewerId(null);
          form.setDocViewerTitle(null);
        }}
        loading={form.loading}
        supabase={supabase}
        docId={form.docViewerId}
        title={form.docViewerTitle}
      />

      <WorkerOrderDocViewerModal
        open={orderDocViewerOpen}
        onClose={() => {
          setOrderDocViewerOpen(false);
          setOrderDocViewerId(null);
          setOrderDocViewerTitle(null);
        }}
        loading={form.loading}
        supabase={supabase}
        docId={orderDocViewerId}
        title={orderDocViewerTitle}
      />
    </>
  );
}
