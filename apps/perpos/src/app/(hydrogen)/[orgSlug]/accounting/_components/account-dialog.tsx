"use client";

// account-dialog.tsx (production) — ฟอร์มเพิ่ม/แก้ไขบัญชีในผังบัญชี (B2)
//   code / name / account_type / parent · is_system: แก้ได้แค่ชื่อ/parent, ลบไม่ได้
//   mutator = API จริง (async) → toast ตามผล

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
import { useAccountingData, type AccountInput } from "./data-provider";
import { useAccountingRole } from "./role-context";
import type { AccAccount, AccAccountType } from "@/lib/accounting/types";

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
  const { can } = useAccountingRole();
  const canWrite = can("write", "accounts");

  const isEdit = account !== null;
  const isSystem = account?.is_system ?? false;

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccAccountType>("expense");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);

  const key = `${open}-${account?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState("");
  useEffect(() => {
    if (!open || key === lastKey) return;
    setLastKey(key);
    setSaving(false);
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

  async function handleSubmit() {
    if (!code.trim()) {
      toast.error("กรุณากรอกเลขที่บัญชี");
      return;
    }
    if (!name.trim()) {
      toast.error("กรุณากรอกชื่อบัญชี");
      return;
    }
    setSaving(true);
    let r;
    if (isEdit && account) {
      // is_system: API ปฏิเสธการแก้ code/type → ส่งเฉพาะที่แก้ได้
      const patch: Partial<AccountInput> = isSystem
        ? { name: name.trim(), parent_id: parentId || null }
        : {
            code: code.trim(),
            name: name.trim(),
            account_type: type,
            parent_id: parentId || null,
          };
      r = await updateAccount(account.id, patch);
    } else {
      r = await addAccount({
        code: code.trim(),
        name: name.trim(),
        account_type: type,
        parent_id: parentId || null,
        is_active: true,
      });
    }
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    toast.success(isEdit ? "แก้ไขบัญชีแล้ว" : `เพิ่มบัญชี ${code.trim()} ${name.trim()} แล้ว`);
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!account || isSystem) return;
    setSaving(true);
    const r = await deleteAccount(account.id);
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error ?? "ลบไม่สำเร็จ");
      return;
    }
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
                  disabled={!canWrite || isSystem}
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
                  disabled={!canWrite || isSystem}
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
                disabled={!canWrite}
              />
            </div>
            <div>
              <Label>บัญชีแม่ (หมวด)</Label>
              <CustomSelect
                className="mt-1"
                value={parentId}
                onChange={setParentId}
                options={parentOptions}
                disabled={!canWrite}
              />
              <Text className="mt-1 text-xs text-gray-400">
                ระบุบัญชีหัวข้อที่บัญชีนี้สังกัด — เว้นว่างถ้าเป็นหัวข้อหลัก
              </Text>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          {isEdit && !isSystem && canWrite && (
            <Button
              type="button"
              variant="destructive"
              className="mr-auto"
              disabled={saving}
              onClick={() => void handleDelete()}
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> ลบ
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {canWrite ? "ยกเลิก" : "ปิด"}
          </Button>
          {canWrite && (
            <Button type="button" disabled={saving} onClick={() => void handleSubmit()}>
              {saving ? "กำลังบันทึก…" : isEdit ? "บันทึก" : "เพิ่มบัญชี"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
