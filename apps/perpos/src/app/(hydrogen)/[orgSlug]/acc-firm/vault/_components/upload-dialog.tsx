"use client";

// upload-dialog.tsx — อัปโหลดเอกสารเข้าคลัง (ใช้ร่วมทั้งแท็บงวดและแท็บเอกสาร)
// ไฟล์วิ่งตรงจาก browser → storage ด้วย signed upload URL (ไม่ผ่าน route)

import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { toast } from "@/lib/toast";
import { GROUP_LABELS, type VaultCategory } from "@/lib/acc-firm/vault/types";
import { useVaultApi } from "./api";

export function UploadDocumentDialog({
  open,
  onOpenChange,
  orgId,
  clientId,
  fiscalYear,
  periodId,
  categories,
  defaultCategoryId,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  clientId: string;
  fiscalYear: number;
  periodId?: string | null;
  categories: VaultCategory[];
  defaultCategoryId?: string;
  onUploaded: () => void;
}) {
  const api = useVaultApi(orgId);
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "");
  const [title, setTitle] = useState("");
  const [docDate, setDocDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCategoryId(defaultCategoryId ?? "");
      setTitle("");
      setDocDate("");
      setFile(null);
    }
  }, [open, defaultCategoryId]);

  const options = [
    { value: "", label: "— เลือกประเภทเอกสาร —" },
    ...categories.map((c) => ({
      value: c.id,
      label: `${GROUP_LABELS[c.groupCode]} · ${c.nameTh}`,
    })),
  ];

  async function submit() {
    if (!file || !categoryId || !title.trim()) return;
    setSaving(true);
    try {
      await api.uploadDocument({
        clientId,
        categoryId,
        periodId: periodId ?? null,
        fiscalYear,
        title: title.trim(),
        docDate: docDate || null,
        file,
      });
      toast.success("อัปโหลดเอกสารแล้ว");
      onOpenChange(false);
      onUploaded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>อัปโหลดเอกสารเข้าคลัง</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label>ประเภทเอกสาร *</Label>
              <CustomSelect
                value={categoryId}
                onChange={setCategoryId}
                options={options}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label htmlFor="vault-upload-title">ชื่อเอกสาร *</Label>
              <Input
                id="vault-upload-title"
                className="mt-1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="เช่น ใบกำกับภาษีซื้อ ก.ค. 2569"
              />
            </div>
            <div>
              <Label>วันที่บนเอกสาร</Label>
              <ThaiDatePicker value={docDate} onChange={setDocDate} placeholder="เลือกวันที่" />
            </div>
            <div>
              <Label htmlFor="vault-upload-file">ไฟล์ *</Label>
              <FileDropzone
                id="vault-upload-file"
                value={file}
                onChange={setFile}
                accept="application/pdf,image/*"
                maxSizeMb={50}
                hint="รองรับ PDF / รูปภาพ ขนาดไม่เกิน 50 MB"
                disabled={saving}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={saving || !file || !categoryId || !title.trim()}>
            {saving ? (
              "กำลังอัปโหลด…"
            ) : (
              <>
                <Upload className="mr-1 h-4 w-4" /> อัปโหลด
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
