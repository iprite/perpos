"use client";

import React from "react";
import dayjs from "dayjs";
import { Button, Input } from "rizzui";
import { DatePicker } from "@core/ui/datepicker";
import { Modal } from "@core/modal-views/modal";

import FileUploader from "@/components/form/file-uploader";
import { withBasePath } from "@/utils/base-path";

export function WorkerDocAddModal({
  open,
  onClose,
  loading,
  editingId,
  docType,
  onChangeDocType,
  docExpiryDate,
  onChangeDocExpiryDate,
  docFile,
  onChangeDocFile,
  onUploaded,
  onError,
  onLoading,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  editingId: string | null;
  docType: string;
  onChangeDocType: (v: string) => void;
  docExpiryDate: string;
  onChangeDocExpiryDate: (v: string) => void;
  docFile: File | null;
  onChangeDocFile: (v: File | null) => void;
  onUploaded: (workerId: string) => void;
  onError: (message: string) => void;
  onLoading: (v: boolean) => void;
}) {
  return (
    <Modal isOpen={open} onClose={onClose} size="lg" rounded="md">
      <div className="rounded-xl bg-white p-5">
        <div className="text-base font-semibold text-gray-900">เพิ่มเอกสาร</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Input label="ประเภทเอกสาร" value={docType} onChange={(e) => onChangeDocType(e.target.value)} disabled={loading} />
          <DatePicker
            selected={docExpiryDate ? dayjs(docExpiryDate).toDate() : null}
            onChange={(date: Date | null) => onChangeDocExpiryDate(date ? dayjs(date).format("YYYY-MM-DD") : "")}
            placeholderText="เลือกวันที่"
            disabled={loading}
            inputProps={{ label: "วันหมดอายุ (ถ้ามี)" }}
          />
          <div className="md:col-span-2">
            <FileUploader
              label=""
              helperText="คลิกเพื่อแนบไฟล์ หรือ ลากไฟล์มาวาง"
              accept={{ "image/*": [], "application/pdf": [] }}
              multiple={false}
              maxFiles={1}
              maxSizeBytes={20 * 1024 * 1024}
              files={docFile ? [docFile] : []}
              onFilesChange={(next) => onChangeDocFile(next[0] ?? null)}
              disabled={loading}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            ยกเลิก
          </Button>
          <Button
            onClick={async () => {
              if (!editingId) return;
              if (!docFile) return;
              onLoading(true);
              const form = new FormData();
              form.set("entityType", "worker");
              form.set("entityId", editingId);
              form.set("docType", docType.trim());
              if (docExpiryDate.trim()) form.set("expiryDate", docExpiryDate.trim());
              form.set("file", docFile);
              const res = await fetch(withBasePath("/api/storage/upload"), { method: "POST", body: form });
              if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                onError(data.error || "อัปโหลดเอกสารไม่สำเร็จ");
                onLoading(false);
                return;
              }
              onChangeDocType("");
              onChangeDocExpiryDate("");
              onChangeDocFile(null);
              onLoading(false);
              onClose();
              onUploaded(editingId);
            }}
            disabled={loading || !editingId || !docFile}
          >
            อัปโหลด
          </Button>
        </div>
      </div>
    </Modal>
  );
}
