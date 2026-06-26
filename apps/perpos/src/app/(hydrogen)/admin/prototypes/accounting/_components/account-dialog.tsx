"use client";

// account-dialog.tsx — ฟอร์มเพิ่ม/แก้ไขบัญชีในผังบัญชี (B2)
// code / name / account_type / parent · is_system ลบไม่ได้ (โชว์ป้าย + ซ่อนปุ่มลบ)

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
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
import type { AccAccount, AccAccountType } from "../_fixtures/types";

const TYPE_OPTIONS: { value: AccAccountType; label: string }[] = [
  { value: "asset", label: "สินทรัพย์ (Asset)" },
  { value: "liability", label: "หนี้สิน (Liability)" },
  { value: "equity", label: "ส่วนของเจ้าของ (Equity)" },
  { value: "income", label: "รายได้ (Income)" },
  { value: "expense", label: "ค่าใช้จ่าย (Expense)" },
];

export function AccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: AccAccount | null;
}) {
  const { accounts, addAccount, updateAccount, deleteAccount } = useAccountingData();
  const isEdit = account !== null;
  const isSystem = account?.is_system ?? false;

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccAccountType>("expense");
  const [parentId, setParentId] = useState("");

  const key = `${open}-${account?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState("");
  useEffect(() => {
    if (!open || key === lastKey) return;
    setLastKey(key);
    if (account) {
      setCode(account.code);
      setName(account.name);
      setType(account.account_type);
      setParentId(account.parent_id ?? "");
    } else {
      setCode("");
      setName("");
      setType("expense");
      setParentId("");
    }
  }, [open, key, lastKey, account]);

  // parent = บัญชีหัวข้อ (parent_id = null) ประเภทเดียวกัน
  const parentOptions = useMemo(
    () => [
      { value: "", label: "— ไม่มี (บัญชีหัวข้อหลัก) —" },
      ...accounts
        .filter((a) => a.account_type === type && a.id !== account?.id)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
    ],
    [accounts, type, account?.id],
  );

  function handleSubmit() {
    if (!code.trim()) {
      toast.error("กรุณากรอกเลขที่บัญชี");
      return;
    }
    if (!name.trim()) {
      toast.error("กรุณากรอกชื่อบัญชี");
      return;
    }
    const dup = accounts.find((a) => a.code === code.trim() && a.id !== account?.id);
    if (dup) {
      toast.error(`เลขที่บัญชี ${code.trim()} ซ้ำกับบัญชีที่มีอยู่`);
      return;
    }
    if (isEdit && account) {
      updateAccount({
        ...account,
        code: code.trim(),
        name: name.trim(),
        account_type: type,
        parent_id: parentId || null,
      });
      toast.success("แก้ไขบัญชีแล้ว");
    } else {
      addAccount({
        id: `acc-new-${Date.now()}`,
        org_id: "00000000-0000-0000-0000-000000000001",
        code: code.trim(),
        name: name.trim(),
        account_type: type,
        parent_id: parentId || null,
        is_active: true,
        is_system: false,
        created_at: new Date().toISOString(),
      });
      toast.success(`เพิ่มบัญชี ${code.trim()} ${name.trim()} แล้ว`);
    }
    onOpenChange(false);
  }

  function handleDelete() {
    if (!account || isSystem) return;
    deleteAccount(account.id);
    toast.success("ลบบัญชีแล้ว");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "แก้ไขบัญชี" : "เพิ่มบัญชีใหม่"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {isSystem && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                บัญชีมาตรฐานของระบบ — แก้ชื่อ/ลำดับได้ แต่ลบไม่ได้ (auto-post พึ่งพา)
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="acc-code">เลขที่บัญชี *</Label>
                <Input
                  id="acc-code"
                  className="mt-1"
                  placeholder="เช่น 5210"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <div>
                <Label>ประเภทบัญชี *</Label>
                <CustomSelect
                  className="mt-1"
                  value={type}
                  onChange={(v) => {
                    setType(v as AccAccountType);
                    setParentId("");
                  }}
                  options={TYPE_OPTIONS}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="acc-name">ชื่อบัญชี *</Label>
              <Input
                id="acc-name"
                className="mt-1"
                placeholder="เช่น ค่าซ่อมแซมและบำรุงรักษา"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label>บัญชีแม่ (หมวด)</Label>
              <CustomSelect
                className="mt-1"
                value={parentId}
                onChange={setParentId}
                options={parentOptions}
              />
              <Text className="mt-1 text-xs text-gray-400">
                ระบุบัญชีหัวข้อที่บัญชีนี้สังกัด — เว้นว่างถ้าเป็นหัวข้อหลัก
              </Text>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          {isEdit && !isSystem && (
            <Button type="button" variant="destructive" className="mr-auto" onClick={handleDelete}>
              <Trash2 className="mr-1.5 h-4 w-4" /> ลบ
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button type="button" onClick={handleSubmit}>
            {isEdit ? "บันทึก" : "เพิ่มบัญชี"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
