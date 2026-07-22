"use client";

// verify-bulk-dialog.tsx — ยืนยันหลายรายการพร้อมกัน (POST …/items/verify-bulk)
//
// B1 — บรรทัด "ยังไม่เปิดอ่าน" อยู่บนสุดของสรุปความเสี่ยง · `Switch` "ข้ามรายการเสี่ยง (แนะนำ)"
//      default **เปิด** · ปิดสวิตช์ → ปุ่มเป็น `destructive` + ระบุจำนวนที่ไม่มีใครเปิดอ่านตรง ๆ
// A-3 — route รับ **filter descriptor** (q/category) ไม่ใช่ array id → ขอบเขตที่แสดงในกล่องนี้
//      จึงคิดจาก "คำค้น + หมวดหมู่" ที่กรองอยู่ (ไม่ผูกกับแท็บ) ให้ตรงกับที่ server จะทำจริง

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/typography";
import { toast } from "@/lib/toast";
import type { CatalogItem } from "@/lib/gov-procure/catalog";
import { govApi } from "../../_components/api";
import { fmtNum, isItemLocked, RISKY_CONFIDENCE } from "./format";

interface BulkResult {
  verified: number;
  skipped: {
    locked: number;
    lowConfidence: number;
    notViewed: number;
    alreadyVerified: number;
    noImage: number;
    noPrice: number;
  };
}

export function VerifyBulkDialog({
  open,
  onOpenChange,
  orgId,
  catalogId,
  /** รายการในขอบเขตที่ server จะทำจริง (กรองด้วยคำค้น + หมวดหมู่เท่านั้น) */
  scopeItems,
  q,
  category,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  catalogId: string;
  scopeItems: CatalogItem[];
  q: string;
  category: string;
  onDone: () => void;
}) {
  const [skipRisky, setSkipRisky] = useState(true);
  const [saving, setSaving] = useState(false);

  const summary = useMemo(() => {
    const pending = scopeItems.filter((i) => i.source !== "human_verified");
    const notViewed = pending.filter((i) => !i.viewed_at).length;
    const lowConf = pending.filter(
      (i) => typeof i.confidence === "number" && i.confidence < RISKY_CONFIDENCE,
    ).length;
    const locked = pending.filter((i) => isItemLocked(i)).length;
    const noImage = pending.filter((i) => !i.image_path).length;
    const noPrice = pending.filter((i) => i.unit_price_ref === null).length;

    const willVerify = pending.filter((i) => {
      if (isItemLocked(i)) return false;
      if (!skipRisky) return true;
      if (typeof i.confidence === "number" && i.confidence < RISKY_CONFIDENCE) return false;
      if (!i.viewed_at) return false;
      return true;
    }).length;

    return { total: pending.length, notViewed, lowConf, locked, noImage, noPrice, willVerify };
  }, [scopeItems, skipRisky]);

  async function run() {
    setSaving(true);
    try {
      const res = await govApi<BulkResult>(
        `/api/gov-procure/catalogs/${catalogId}/items/verify-bulk?orgId=${encodeURIComponent(orgId)}`,
        "POST",
        { q, category, skipRisky },
      );
      // นับ "ข้ามไว้" ให้ครบทุกเหตุผลที่ server ข้ามจริง — ไม่งั้นตัวเลขบน toast
      // ต่ำกว่าความจริง แล้วผู้ใช้เข้าใจผิดว่ายืนยันไปหมดแล้ว
      const s = res.skipped;
      const skippedTotal = s.notViewed + s.lowConfidence + s.locked + s.noImage + s.noPrice;
      toast.success(
        `ยืนยันแล้ว ${fmtNum(res.verified)} รายการ · ข้ามไว้ ${fmtNum(skippedTotal)} รายการ`,
      );
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message || "ยืนยันไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>ยืนยัน {fmtNum(summary.total)} รายการที่ยังไม่ผ่านตรวจ</DialogTitle>
          <Text className="text-xs text-gray-500">
            ขอบเขต:{" "}
            {q || category ? "เฉพาะที่ตรงกับคำค้น/หมวดหมู่ที่กรองอยู่" : "ทุกรายการในชุดนี้"}
          </Text>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <ul className="space-y-1.5 text-sm text-gray-700">
              <li className="flex items-center justify-between">
                <span>ยังไม่เปิดอ่าน</span>
                <span className="tabular-nums">{fmtNum(summary.notViewed)} รายการ</span>
              </li>
              <li className="flex items-center justify-between">
                <span>ความเชื่อมั่นต่ำกว่า 60%</span>
                <span className="tabular-nums">{fmtNum(summary.lowConf)} รายการ</span>
              </li>
              <li className="flex items-center justify-between">
                <span>ยังไม่มีรูป</span>
                <span className="tabular-nums">{fmtNum(summary.noImage)} รายการ</span>
              </li>
              <li className="flex items-center justify-between">
                <span>ยังไม่มีราคา</span>
                <span className="tabular-nums">{fmtNum(summary.noPrice)} รายการ</span>
              </li>
              {summary.locked > 0 && (
                <li className="flex items-center justify-between text-gray-500">
                  <span>AI กำลังเติมข้อมูล (ยืนยันไม่ได้)</span>
                  <span className="tabular-nums">{fmtNum(summary.locked)} รายการ</span>
                </li>
              )}
            </ul>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
              <div className="min-w-0 pr-3">
                <Text className="text-sm font-medium text-gray-900">ข้ามรายการเสี่ยง (แนะนำ)</Text>
                <Text className="text-xs text-gray-500">
                  ข้ามรายการที่ยังไม่มีใครเปิดอ่าน และรายการที่ความเชื่อมั่นต่ำกว่า 60%
                </Text>
              </div>
              <Switch checked={skipRisky} onChange={setSkipRisky} aria-label="ข้ามรายการเสี่ยง" />
            </div>

            {skipRisky ? (
              <Text className="text-xs text-gray-500">
                อีก {fmtNum(summary.total - summary.willVerify)} รายการยังคงสถานะ &quot;AI เดา&quot;
                ให้เปิดอ่าน/ตรวจทีละรายการ
              </Text>
            ) : (
              <Text className="text-xs text-amber-700">
                กำลังจะประทับว่า &quot;ยืนยันแล้ว&quot; ให้รายการที่ยังไม่มีใครเปิดอ่าน{" "}
                {fmtNum(summary.notViewed)} รายการ
              </Text>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button
            variant={skipRisky ? "default" : "destructive"}
            disabled={saving || summary.willVerify === 0}
            onClick={() => void run()}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            {saving
              ? "กำลังยืนยัน…"
              : skipRisky
                ? `ยืนยัน ${fmtNum(summary.willVerify)} รายการ`
                : `ยืนยันทั้ง ${fmtNum(summary.willVerify)} รายการ (มี ${fmtNum(summary.notViewed)} รายการที่ยังไม่มีใครเปิดอ่าน)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
