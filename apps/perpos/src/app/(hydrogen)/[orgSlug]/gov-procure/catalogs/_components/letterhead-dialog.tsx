"use client";

// letterhead-dialog.tsx — ตั้งค่า "ค่าตั้งต้นหัวจดหมาย" ของ 1 บริษัท
// PUT /api/gov-procure/catalog-letterheads (canManageSettings = owner/manager — guard จริงที่ server)
//
// ต่างจาก Dialog "ตั้งค่าชุด": ที่นี่คือค่าตั้งต้นระดับบริษัท ใช้ตอน "สร้างชุดใหม่/เปลี่ยนบริษัท"
// ชุดที่สร้างไปแล้วถือสำเนาของตัวเอง จึงไม่เปลี่ยนตาม (C1/C-6)

import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Text } from "@/components/ui/typography";
import { ImageUpload } from "@/components/ui/image-upload";
import { toast } from "@/lib/toast";
import type { Letterhead } from "@/lib/gov-procure/catalog";
import { govApi } from "../../_components/api";
import { validateLogoDataUrl } from "./format";

interface Form {
  company_name: string;
  address: string;
  phone: string;
  tax_id: string;
  logo_data_url: string | null;
}

const EMPTY: Form = {
  company_name: "",
  address: "",
  phone: "",
  tax_id: "",
  logo_data_url: null,
};

export function LetterheadDialog({
  open,
  onOpenChange,
  company,
  letterhead,
  orgId,
  canManage,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** บริษัทที่กำลังตั้งค่า (1 ใน COMPANIES) */
  company: string | null;
  /** ค่าที่ตั้งไว้แล้ว (null = ยังไม่เคยตั้ง) */
  letterhead: Letterhead | null;
  orgId: string;
  canManage: boolean;
  onSaved: (letterhead: Letterhead) => void;
}) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      letterhead
        ? {
            company_name: letterhead.company_name ?? "",
            address: (letterhead.address_lines ?? []).join("\n"),
            phone: letterhead.phone ?? "",
            tax_id: letterhead.tax_id ?? "",
            logo_data_url: letterhead.logo_data_url ?? null,
          }
        : { ...EMPTY, company_name: company ?? "" },
    );
  }, [open, letterhead, company]);

  function set(key: keyof Form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function changeLogo(dataUrl: string | null) {
    if (!dataUrl) {
      setForm((f) => ({ ...f, logo_data_url: null }));
      return;
    }
    const error = validateLogoDataUrl(dataUrl);
    if (error) {
      toast.error(error);
      return;
    }
    setForm((f) => ({ ...f, logo_data_url: dataUrl }));
  }

  async function save() {
    if (!company) return;
    if (!form.company_name.trim()) {
      toast.error("กรุณาระบุชื่อบริษัทที่จะพิมพ์บนหัวจดหมาย");
      return;
    }
    setSaving(true);
    try {
      const res = await govApi<{ letterhead: Letterhead }>(
        `/api/gov-procure/catalog-letterheads?orgId=${encodeURIComponent(orgId)}`,
        "PUT",
        {
          company,
          company_name: form.company_name.trim(),
          address_lines: form.address
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          phone: form.phone.trim(),
          tax_id: form.tax_id.trim(),
          logo_data_url: form.logo_data_url ?? "",
        },
      );
      if (res.letterhead) onSaved(res.letterhead);
      toast.success("บันทึกค่าตั้งต้นหัวจดหมายแล้ว");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>หัวจดหมาย — {company ?? ""}</DialogTitle>
          <Text className="text-xs text-gray-500">
            ค่าตั้งต้นนี้ถูกคัดลอกเข้าชุดแคตตาล็อกตอนสร้างชุดใหม่หรือเปลี่ยนบริษัทของชุด —
            ชุดที่สร้างไปแล้วจะไม่เปลี่ยนตาม
          </Text>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="lhd-name">ชื่อบริษัทที่จะพิมพ์ *</Label>
              <Input
                id="lhd-name"
                className="mt-1"
                value={form.company_name}
                readOnly={!canManage}
                placeholder="เช่น บริษัท 89 โกลบอลเวิร์ค จำกัด"
                onChange={(e) => set("company_name", e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="lhd-address">ที่อยู่ (บรรทัดละ 1 บรรทัด สูงสุด 6 บรรทัด)</Label>
              <Textarea
                id="lhd-address"
                className="mt-1"
                rows={4}
                value={form.address}
                readOnly={!canManage}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="lhd-phone">โทรศัพท์</Label>
                <Input
                  id="lhd-phone"
                  className="mt-1"
                  value={form.phone}
                  readOnly={!canManage}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="lhd-tax">เลขประจำตัวผู้เสียภาษี</Label>
                <Input
                  id="lhd-tax"
                  className="mt-1 tabular-nums"
                  value={form.tax_id}
                  readOnly={!canManage}
                  onChange={(e) => set("tax_id", e.target.value)}
                />
              </div>
            </div>

            <div>
              <Text className="mb-1.5 text-xs font-medium text-gray-700">โลโก้</Text>
              {canManage ? (
                <ImageUpload
                  value={form.logo_data_url}
                  onChange={changeLogo}
                  label="อัปโหลดโลโก้"
                  accept="image/png,image/jpeg,image/webp"
                  previewClassName="h-16 w-16"
                />
              ) : (
                <Text className="text-xs text-gray-500">
                  {form.logo_data_url ? "มีโลโก้แล้ว" : "ยังไม่มีโลโก้"}
                </Text>
              )}
              <Text className="mt-1 text-xs text-gray-500">
                รองรับ PNG / JPEG / WebP ขนาดไม่เกิน 500 KB
              </Text>
            </div>

            {!canManage && (
              <Text className="text-xs text-gray-500">
                คุณมีสิทธิ์ดูอย่างเดียว — การตั้งค่าหัวจดหมายของบริษัททำได้เฉพาะเจ้าของและผู้จัดการ
              </Text>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          {canManage && (
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
