"use client";

// contact-dialog.tsx — ฟอร์มเพิ่ม/แก้ไขลูกค้า/ผู้ขาย (A4)
// ช่อง: ประเภท (customer/vendor/both) · ชื่อ * · เลขภาษี · สาขา · โทร · อีเมล · ที่อยู่
// ปุ่มลบ = mr-auto (โหมดแก้ไข) · form ครอบ DialogBody+DialogFooter (DESIGN §13)
// consume mutator: addContact / updateContact / deleteContact (data-context, back agent)

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
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
import { MOCK_ORG_ID } from "../_fixtures";
import type { AccContact } from "../_fixtures/types";

const KIND_OPTIONS = [
  { value: "customer", label: "ลูกค้า" },
  { value: "vendor", label: "ผู้ขาย/ซัพพลายเออร์" },
  { value: "both", label: "ทั้งลูกค้าและผู้ขาย" },
];

export function ContactDialog({
  open,
  onOpenChange,
  contact,
  canWrite,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** contact ที่จะแก้ไข (null = เพิ่มใหม่) */
  contact: AccContact | null;
  canWrite: boolean;
}) {
  const { addContact, updateContact, deleteContact } = useAccountingData();
  const isEdit = contact !== null;
  const readOnly = !canWrite;

  const [kind, setKind] = useState<AccContact["kind"]>("customer");
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [branch, setBranch] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const key = `${open}-${contact?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState("");
  useEffect(() => {
    if (!open || key === lastKey) return;
    setLastKey(key);
    if (contact) {
      setKind(contact.kind);
      setName(contact.name);
      setTaxId(contact.tax_id ?? "");
      setBranch(contact.branch ?? "");
      setPhone(contact.phone ?? "");
      setEmail(contact.email ?? "");
      setAddress(contact.address ?? "");
    } else {
      setKind("customer");
      setName("");
      setTaxId("");
      setBranch("");
      setPhone("");
      setEmail("");
      setAddress("");
    }
  }, [open, key, lastKey, contact]);

  function handleSubmit() {
    if (!name.trim()) {
      toast.error("กรุณากรอกชื่อผู้ติดต่อ");
      return;
    }
    if (taxId && !/^\d{13}$/.test(taxId.trim())) {
      toast.error("เลขผู้เสียภาษีต้องมี 13 หลัก");
      return;
    }
    const base = {
      kind,
      name: name.trim(),
      tax_id: taxId.trim() || null,
      branch: branch.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
    };
    if (isEdit && contact) {
      updateContact({ ...contact, ...base });
      toast.success(`แก้ไข ${base.name} สำเร็จ`);
    } else {
      const newContact: AccContact = {
        id: `cnt-new-${Date.now()}`,
        org_id: MOCK_ORG_ID,
        ...base,
        created_at: new Date().toISOString(),
      };
      addContact(newContact);
      toast.success(`เพิ่มผู้ติดต่อ ${base.name} สำเร็จ`);
    }
    onOpenChange(false);
  }

  function handleDelete() {
    if (!contact) return;
    deleteContact(contact.id);
    toast.success(`ลบ ${contact.name} แล้ว`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? "รายละเอียดผู้ติดต่อ" : isEdit ? "แก้ไขผู้ติดต่อ" : "เพิ่มลูกค้า/ผู้ขาย"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label htmlFor="cnt-kind">ประเภท *</Label>
                <CustomSelect
                  className="mt-1"
                  value={kind}
                  onChange={(v) => setKind(v as AccContact["kind"])}
                  options={KIND_OPTIONS}
                />
              </div>

              <div>
                <Label htmlFor="cnt-name">ชื่อผู้ติดต่อ / บริษัท *</Label>
                <Input
                  id="cnt-name"
                  className="mt-1"
                  placeholder="เช่น บริษัท ไทยดีไซน์ สตูดิโอ จำกัด"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={readOnly}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cnt-tax">เลขผู้เสียภาษี (13 หลัก)</Label>
                  <Input
                    id="cnt-tax"
                    className="mt-1"
                    placeholder="0105561098234"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <Label htmlFor="cnt-branch">สาขา</Label>
                  <Input
                    id="cnt-branch"
                    className="mt-1"
                    placeholder="สำนักงานใหญ่"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    disabled={readOnly}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cnt-phone">โทรศัพท์</Label>
                  <Input
                    id="cnt-phone"
                    className="mt-1"
                    placeholder="02-234-5678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <Label htmlFor="cnt-email">อีเมล</Label>
                  <Input
                    id="cnt-email"
                    type="email"
                    className="mt-1"
                    placeholder="finance@example.co.th"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={readOnly}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="cnt-address">ที่อยู่</Label>
                <Input
                  id="cnt-address"
                  className="mt-1"
                  placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={readOnly}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            {isEdit && !readOnly && (
              <Button
                type="button"
                variant="destructive"
                className="mr-auto"
                onClick={handleDelete}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> ลบ
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {readOnly ? "ปิด" : "ยกเลิก"}
            </Button>
            {!readOnly && (
              <Button type="submit">{isEdit ? "บันทึกการแก้ไข" : "เพิ่มผู้ติดต่อ"}</Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
