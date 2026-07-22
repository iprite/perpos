"use client";

// create-catalog-dialog.tsx — สร้างชุดแคตตาล็อกใหม่ (POST /api/gov-procure/catalogs)
// สร้างเสร็จ → เข้าห้องทำงานของชุดนั้นทันที (ผู้ใช้จะได้วางรายการต่อได้เลย)

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { Text } from "@/components/ui/typography";
import { toast } from "@/lib/toast";
import type { Catalog, CatalogTemplate } from "@/lib/gov-procure/catalog";
import { COMPANIES, type GovProcureOrder } from "@/lib/gov-procure/types";
import { govApi } from "../../_components/api";
import { TEMPLATE_HINT } from "./format";

export function CreateCatalogDialog({
  open,
  onOpenChange,
  orgId,
  orgSlug,
  orders,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgSlug: string;
  orders: GovProcureOrder[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [template, setTemplate] = useState<CatalogTemplate>("table");
  const [orderId, setOrderId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const orderOptions = [
    { value: "", label: "ยังไม่แนบกับงาน" },
    ...orders.map((o) => ({
      value: o.id,
      label: `${o.qt_reference ?? "ไม่มีเลข QT"} · ${o.customer_name}`,
    })),
  ];

  const companyOptions = [
    { value: "", label: "ยังไม่ระบุบริษัท" },
    ...COMPANIES.map((c) => ({ value: c, label: c })),
  ];

  const titleError = touched && !title.trim() ? "กรุณาระบุชื่อชุดแคตตาล็อก" : "";

  async function create() {
    setTouched(true);
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await govApi<{ catalog: Catalog }>(
        `/api/gov-procure/catalogs?orgId=${encodeURIComponent(orgId)}`,
        "POST",
        {
          title: title.trim(),
          company: company || undefined,
          template,
          order_id: orderId || undefined,
          notes: notes.trim() || undefined,
        },
      );
      toast.success("สร้างชุดแคตตาล็อกแล้ว");
      onOpenChange(false);
      setTitle("");
      setCompany("");
      setOrderId("");
      setNotes("");
      setTouched(false);
      router.push(`/${orgSlug}/gov-procure/catalogs/${res.catalog.id}`);
    } catch (e) {
      toast.error((e as Error).message || "สร้างชุดไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>สร้างชุดแคตตาล็อก</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cat-title">ชื่อชุด *</Label>
              <Input
                id="cat-title"
                className="mt-1"
                placeholder="เช่น แคตตาล็อกวัสดุสำนักงาน กองคลัง ปี 2569"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setTouched(true)}
              />
              {titleError && <Text className="mt-1 text-xs text-red-600">{titleError}</Text>}
            </div>

            <div>
              <Label htmlFor="cat-company">บริษัทที่ออกเอกสาร</Label>
              <CustomSelect
                value={company}
                onChange={setCompany}
                options={companyOptions}
                className="mt-1"
              />
              <Text className="mt-1 text-xs text-gray-500">
                หัวจดหมายของชุดจะถูกคัดลอกจากค่าตั้งต้นของบริษัทที่เลือก
              </Text>
            </div>

            <div>
              <Label htmlFor="cat-template">รูปแบบเอกสาร</Label>
              <div className="mt-1">
                <SegmentedControl
                  value={template}
                  onChange={setTemplate}
                  ariaLabel="รูปแบบเอกสาร"
                  options={[
                    { value: "table", label: "ตาราง" },
                    { value: "narrative", label: "บรรยาย" },
                  ]}
                />
              </div>
              <Text className="mt-1 text-xs text-gray-500">{TEMPLATE_HINT[template]}</Text>
            </div>

            <div>
              <Label htmlFor="cat-order">แนบกับงาน (ไม่บังคับ)</Label>
              <CustomSelect
                value={orderId}
                onChange={setOrderId}
                options={orderOptions}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="cat-notes">หมายเหตุ</Label>
              <Textarea
                id="cat-notes"
                className="mt-1"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button disabled={saving || !title.trim()} onClick={() => void create()}>
            <Plus className="mr-1.5 h-4 w-4" />
            {saving ? "กำลังสร้าง…" : "สร้างชุด"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
