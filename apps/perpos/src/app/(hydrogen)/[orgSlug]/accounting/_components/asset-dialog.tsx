"use client";

// asset-dialog.tsx (production) — ฟอร์มเพิ่ม/แก้ไขสินทรัพย์ (B5)
//   ชื่อ / บัญชีสินทรัพย์ / วันได้มา / ราคาทุน / มูลค่าซาก / อายุ(เดือน) · ค่าเสื่อม/เดือน คำนวณสด
//   "ลบ" = ปลดใช้งาน (disposed) เพราะ journal อ้างอิง (ไม่มี hard delete) · mutator = API จริง

import { useEffect, useMemo, useState } from "react";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Text } from "@/components/ui/typography";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { useAccountingData } from "./data-provider";
import { useAccountingRole } from "./role-context";
import { fmtMoney } from "./format";
import type { AccAsset } from "@/lib/accounting/types";

const round2 = (n: number) => Math.round(n * 100) / 100;
const todayISO = () => new Date().toISOString().slice(0, 10);

export function AssetDialog({
  open,
  onOpenChange,
  asset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: AccAsset | null;
}) {
  const { accounts, addAsset, updateAsset, deleteAsset } = useAccountingData();
  const { can } = useAccountingRole();
  const canWrite = can("write", "assets");

  const isEdit = asset !== null;
  const isDisposed = asset?.status === "disposed";

  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [acquireDate, setAcquireDate] = useState("");
  const [cost, setCost] = useState("");
  const [salvage, setSalvage] = useState("");
  const [life, setLife] = useState("");
  const [saving, setSaving] = useState(false);

  const assetAccountOptions = useMemo(
    () => [
      { value: "", label: "— เลือกบัญชีสินทรัพย์ —" },
      ...accounts
        .filter((a) => a.account_type === "asset" && a.is_active && a.code !== "1590")
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
    ],
    [accounts],
  );

  const key = `${open}-${asset?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState("");
  useEffect(() => {
    if (!open || key === lastKey) return;
    setLastKey(key);
    setSaving(false);
    if (asset) {
      setName(asset.name);
      setAccountId(asset.asset_account_id);
      setAcquireDate(asset.acquire_date);
      setCost(String(asset.cost));
      setSalvage(String(asset.salvage_value));
      setLife(String(asset.useful_life_months));
    } else {
      setName("");
      setAccountId("");
      setAcquireDate(todayISO());
      setCost("");
      setSalvage("0");
      setLife("36");
    }
  }, [open, key, lastKey, asset]);

  const costNum = Number(cost) || 0;
  const salvageNum = Number(salvage) || 0;
  const lifeNum = Number(life) || 0;
  const monthly = lifeNum > 0 ? round2((costNum - salvageNum) / lifeNum) : 0;

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("กรุณากรอกชื่อสินทรัพย์");
      return;
    }
    if (!accountId) {
      toast.error("กรุณาเลือกบัญชีสินทรัพย์");
      return;
    }
    if (costNum <= 0) {
      toast.error("ราคาทุนต้องมากกว่า 0");
      return;
    }
    if (salvageNum > costNum) {
      toast.error("มูลค่าซากต้องไม่เกินราคาทุน");
      return;
    }
    if (lifeNum <= 0) {
      toast.error("อายุการใช้งานต้องมากกว่า 0 เดือน");
      return;
    }
    setSaving(true);
    let r;
    if (isEdit && asset) {
      // วันได้มา/บัญชี = immutable หลังสร้าง (API PATCH ไม่รับ asset_account_id/acquire_date)
      r = await updateAsset(asset.id, {
        name: name.trim(),
        cost: costNum,
        salvage_value: salvageNum,
        useful_life_months: lifeNum,
      });
    } else {
      r = await addAsset({
        name: name.trim(),
        asset_account_id: accountId,
        acquire_date: acquireDate,
        cost: costNum,
        salvage_value: salvageNum,
        useful_life_months: lifeNum,
      });
    }
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    toast.success(isEdit ? "แก้ไขสินทรัพย์แล้ว" : `เพิ่มสินทรัพย์ ${name.trim()} แล้ว`);
    onOpenChange(false);
  }

  async function handleDispose() {
    if (!asset) return;
    setSaving(true);
    const r = await deleteAsset(asset.id);
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error ?? "ปลดใช้งานไม่สำเร็จ");
      return;
    }
    toast.success("ปลดใช้งานสินทรัพย์แล้ว (หยุดคิดค่าเสื่อม)");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "แก้ไขสินทรัพย์" : "เพิ่มสินทรัพย์"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="as-name">ชื่อสินทรัพย์ *</Label>
              <Input
                id="as-name"
                className="mt-1"
                placeholder="เช่น คอมพิวเตอร์ MacBook Pro"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canWrite}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>บัญชีสินทรัพย์ *</Label>
                <CustomSelect
                  className="mt-1"
                  value={accountId}
                  onChange={setAccountId}
                  options={assetAccountOptions}
                  disabled={!canWrite || isEdit}
                />
              </div>
              <div>
                <Label>วันได้มา *</Label>
                <ThaiDatePicker
                  value={acquireDate}
                  onChange={setAcquireDate}
                  placeholder="เลือกวันที่"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="as-cost">ราคาทุน (฿) *</Label>
                <Input
                  id="as-cost"
                  type="number"
                  className="mt-1"
                  placeholder="0.00"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  disabled={!canWrite}
                />
              </div>
              <div>
                <Label htmlFor="as-salvage">มูลค่าซาก (฿)</Label>
                <Input
                  id="as-salvage"
                  type="number"
                  className="mt-1"
                  placeholder="0.00"
                  value={salvage}
                  onChange={(e) => setSalvage(e.target.value)}
                  disabled={!canWrite}
                />
              </div>
              <div>
                <Label htmlFor="as-life">อายุใช้งาน (เดือน) *</Label>
                <Input
                  id="as-life"
                  type="number"
                  className="mt-1"
                  placeholder="36"
                  value={life}
                  onChange={(e) => setLife(e.target.value)}
                  disabled={!canWrite}
                />
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">ค่าเสื่อมราคา/เดือน (เส้นตรง)</span>
                <span className="font-semibold tabular-nums text-gray-900">
                  {fmtMoney(monthly)}
                </span>
              </div>
              <Text className="mt-1 text-xs text-gray-400">
                = (ราคาทุน − มูลค่าซาก) ÷ อายุใช้งาน
              </Text>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          {isEdit && !isDisposed && canWrite && (
            <Button
              type="button"
              variant="destructive"
              className="mr-auto"
              disabled={saving}
              onClick={() => void handleDispose()}
            >
              <Ban className="mr-1.5 h-4 w-4" /> ปลดใช้งาน
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {canWrite ? "ยกเลิก" : "ปิด"}
          </Button>
          {canWrite && (
            <Button type="button" disabled={saving} onClick={() => void handleSubmit()}>
              {saving ? "กำลังบันทึก…" : isEdit ? "บันทึก" : "เพิ่มสินทรัพย์"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
