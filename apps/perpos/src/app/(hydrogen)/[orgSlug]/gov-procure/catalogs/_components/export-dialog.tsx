"use client";

// export-dialog.tsx — ส่งออกเอกสาร PDF (GET /api/gov-procure/catalogs/[id]/pdf)
//
// P1-6 (บังคับ): ยังยืนยันไม่ครบ → ปุ่มเป็น `destructive` + label บอกผลลัพธ์ตรง ๆ
//                ("ดาวน์โหลดทั้งที่ยังมี n รายการไม่ผ่านตรวจ") — ไม่ใช่ dialog เตือนแล้วปุ่มเดิม
// C-6: เทมเพลตบรรยาย + ยังไม่เลือกบริษัท = **บล็อกการส่งออก** พร้อมบอกวิธีแก้

import { useEffect, useState } from "react";
import { AlertTriangle, FileDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/typography";
import { toast } from "@/lib/toast";
import type { Catalog, CatalogItemStats, CatalogTemplate } from "@/lib/gov-procure/catalog";
import { downloadWithAuth } from "./download";
import { fmtNum, TEMPLATE_HINT } from "./format";

export function ExportDialog({
  open,
  onOpenChange,
  catalog,
  stats,
  orgId,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: Catalog;
  stats: CatalogItemStats;
  orgId: string;
  /** ไปตั้งค่าชุด (ใช้เมื่อยังไม่ได้เลือกบริษัท) */
  onOpenSettings: () => void;
}) {
  const [template, setTemplate] = useState<CatalogTemplate>(catalog.template);
  const [showPrices, setShowPrices] = useState(catalog.show_prices);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTemplate(catalog.template);
    setShowPrices(catalog.show_prices);
  }, [open, catalog]);

  const unverified = Math.max(0, stats.total - stats.verified);
  const blockedNarrative = template === "narrative" && !catalog.company;
  const noItems = stats.total === 0;

  async function download() {
    setDownloading(true);
    try {
      const qs = new URLSearchParams({
        orgId,
        template,
        prices: showPrices ? "1" : "0",
      });
      await downloadWithAuth(
        `/api/gov-procure/catalogs/${catalog.id}/pdf?${qs.toString()}`,
        `${catalog.title || "catalog"}.pdf`,
      );
      toast.success("ดาวน์โหลดเอกสารแล้ว");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "ส่งออกไม่สำเร็จ");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>ส่งออกเอกสาร</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label>รูปแบบเอกสาร</Label>
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

            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
              <div className="min-w-0 pr-3">
                <Text className="text-sm font-medium text-gray-900">แสดงราคาในเอกสาร</Text>
                <Text className="text-xs text-gray-500">
                  ราคาที่ยังไม่ผ่านตรวจเป็นเพียงประมาณการจาก AI
                </Text>
              </div>
              <Switch checked={showPrices} onChange={setShowPrices} aria-label="แสดงราคาในเอกสาร" />
            </div>

            {blockedNarrative && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <div className="min-w-0">
                  <Text className="text-sm font-medium text-red-700">
                    ยังส่งออกแบบบรรยายไม่ได้ — ชุดนี้ยังไม่ได้เลือกบริษัท
                  </Text>
                  <Text className="mt-0.5 text-xs text-red-700">
                    เทมเพลตบรรยายพิมพ์หัวจดหมายทุกหน้า จึงต้องระบุบริษัทก่อน
                  </Text>
                  <Button variant="outline" size="sm" className="mt-2" onClick={onOpenSettings}>
                    ไปเลือกบริษัทในตั้งค่าชุด
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <Text className="text-xs font-semibold text-gray-700">
                ก่อนส่งออก ตรวจสิ่งเหล่านี้
              </Text>
              <ul className="mt-1.5 space-y-1 text-xs text-gray-600">
                <li>
                  ยังไม่ผ่านตรวจ {fmtNum(unverified)} รายการ (จากทั้งหมด {fmtNum(stats.total)})
                </li>
                <li>ยังไม่มีรูป {fmtNum(stats.no_image)} รายการ</li>
                <li>ยังไม่มีราคา {fmtNum(stats.no_price)} รายการ</li>
              </ul>
              {unverified > 0 && (
                <Text className="mt-2 text-xs text-gray-600">
                  เอกสารที่ยังตรวจไม่ครบจะมีบรรทัดกำกับ &quot;ฉบับร่าง&quot; ทุกหน้า
                </Text>
              )}
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button
            variant={unverified > 0 ? "destructive" : "default"}
            disabled={downloading || blockedNarrative || noItems}
            onClick={() => void download()}
          >
            <FileDown className="mr-1.5 h-4 w-4" />
            {downloading
              ? "กำลังสร้างไฟล์…"
              : noItems
                ? "ยังไม่มีรายการให้ส่งออก"
                : unverified > 0
                  ? `ดาวน์โหลดทั้งที่ยังมี ${fmtNum(unverified)} รายการไม่ผ่านตรวจ`
                  : "ดาวน์โหลด PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
