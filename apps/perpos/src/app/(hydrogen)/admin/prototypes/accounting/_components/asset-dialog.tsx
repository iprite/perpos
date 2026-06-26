"use client";

// asset-dialog.tsx — ฟอร์มเพิ่ม/แก้ไขสินทรัพย์ (B5)
// ชื่อ / บัญชีสินทรัพย์ / วันได้มา / ราคาทุน / มูลค่าซาก / อายุ(เดือน) · ค่าเสื่อม/เดือน คำนวณสด

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
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
import { useAccountingData } from "./data-context";
import { fmtMoney } from "./format";
import type { AccAsset } from "../_fixtures/types";

const round2 = (n: number) => Math.round(n * 100) / 100;

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
  const isEdit = asset !== null;

  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [acquireDate, setAcquireDate] = useState("");
  const [cost, setCost] = useState("");
  const [salvage, setSalvage] = useState("");
  const [life, setLife] = useState("");

  // บัญชีสินทรัพย์ (1xxx) ที่ active
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
      setAcquireDate("2026-06-26");
      setCost("");
      setSalvage("0");
      setLife("36");
    }
  }, [open, key, lastKey, asset]);

  const costNum = Number(cost) || 0;
  const salvageNum = Number(salvage) || 0;
  const lifeNum = Number(life) || 0;
  const monthly = lifeNum > 0 ? round2((costNum - salvageNum) / lifeNum) : 0;

  function handleSubmit() {
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
    if (salvageNum >= costNum) {
      toast.error("มูลค่าซากต้องน้อยกว่าราคาทุน");
      return;
    }
    if (lifeNum <= 0) {
      toast.error("อายุการใช้งานต้องมากกว่า 0 เดือน");
      return;
    }
    const accName = accounts.find((a) => a.id === accountId)?.name;
    if (isEdit && asset) {
      updateAsset({
        ...asset,
        name: name.trim(),
        asset_account_id: accountId,
        acquire_date: acquireDate,
        cost: costNum,
        salvage_value: salvageNum,
        useful_life_months: lifeNum,
        monthly_depreciation: monthly,
        book_value: round2(costNum - asset.accumulated_depreciation),
        asset_account_name: accName,
      });
      toast.success("แก้ไขสินทรัพย์แล้ว");
    } else {
      addAsset({
        id: `asset-new-${Date.now()}`,
        org_id: "00000000-0000-0000-0000-000000000001",
        name: name.trim(),
        asset_account_id: accountId,
        acquire_date: acquireDate,
        cost: costNum,
        salvage_value: salvageNum,
        useful_life_months: lifeNum,
        depreciation_method: "straight_line",
        accumulated_depreciation: 0,
        status: "active",
        created_at: new Date().toISOString(),
        book_value: costNum,
        monthly_depreciation: monthly,
        asset_account_name: accName,
      });
      toast.success(`เพิ่มสินทรัพย์ ${name.trim()} แล้ว`);
    }
    onOpenChange(false);
  }

  function handleDelete() {
    if (!asset) return;
    deleteAsset(asset.id);
    toast.success("ลบสินทรัพย์แล้ว");
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
          {isEdit && (
            <Button type="button" variant="destructive" className="mr-auto" onClick={handleDelete}>
              <Trash2 className="mr-1.5 h-4 w-4" /> ลบ
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button type="button" onClick={handleSubmit}>
            {isEdit ? "บันทึก" : "เพิ่มสินทรัพย์"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
