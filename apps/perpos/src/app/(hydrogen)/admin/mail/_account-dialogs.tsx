"use client";

/**
 * กล่องเมล: สร้าง / แก้ไข / ตั้งรหัสผ่านใหม่ (MAIL_UI_SPEC §5)
 *
 * กฎที่ห้ามพัง:
 *  - **รหัสผ่านแสดงครั้งเดียว** — ปิดกล่องแล้วดูซ้ำไม่ได้ (เซิร์ฟเวอร์เก็บเป็น hash อ่านคืนไม่ได้)
 *    ⇒ ต้องมีปุ่มคัดลอก + เตือนให้ส่งลูกค้าก่อนปิด · ลืมแล้วใช้ "ตั้งรหัสใหม่" เท่านั้น
 *  - ชื่อกล่อง/โดเมนแก้ไม่ได้หลังสร้าง (= เปลี่ยนที่อยู่อีเมล) — แก้ได้แค่ชื่อที่แสดงกับโควตา
 */

import { useState } from "react";
import { AlertTriangle, Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyText } from "@/utils/clipboard";
import type { MailAdminAccount, MailAdminDomain } from "@/lib/mail/admin-api";

const GB = 1024 * 1024 * 1024;

/** กล่องแสดงรหัสผ่าน — ครั้งเดียวจริง ๆ ไม่มีที่ไหนดูซ้ำได้ */
export function MailPasswordDialog({
  email,
  password,
  onClose,
}: {
  email: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>รหัสผ่านของ {email}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              รหัสนี้แสดง <strong>ครั้งเดียว</strong> — คัดลอกส่งให้ลูกค้าก่อนปิดหน้าต่าง
              ถ้าหายต้องตั้งรหัสใหม่เท่านั้น (ระบบอ่านรหัสเดิมไม่ได้)
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <code className="min-w-0 flex-1 break-all font-mono text-sm text-gray-900">
              {password}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (await copyText(password)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            ให้ลูกค้าเข้าที่ mail.perpos.ai แล้วเปลี่ยนรหัสผ่านเองทันทีที่เข้าครั้งแรก
          </p>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>ปิด</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MailAccountCreateDialog({
  open,
  onOpenChange,
  domains,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domains: MailAdminDomain[];
  busy: boolean;
  error: string | null;
  onSubmit: (input: {
    localPart: string;
    domainId: string;
    displayName: string;
    quotaGb: string;
  }) => void;
}) {
  const [localPart, setLocalPart] = useState("");
  const [domainId, setDomainId] = useState(domains[0]?.id ?? "");
  const [displayName, setDisplayName] = useState("");
  const [quotaGb, setQuotaGb] = useState("");

  const domain = domains.find((d) => d.id === domainId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>เพิ่มกล่องเมล</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="mailbox-local">ที่อยู่อีเมล *</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id="mailbox-local"
                value={localPart}
                autoFocus
                placeholder="sales"
                className="flex-1"
                onChange={(e) => setLocalPart(e.target.value)}
              />
              <span className="shrink-0 text-sm text-gray-500">@</span>
              <CustomSelect
                value={domainId}
                onChange={setDomainId}
                className="w-48"
                options={domains.map((d) => ({ value: d.id, label: d.name }))}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {domain
                ? `จะได้กล่อง ${localPart.trim() || "ชื่อกล่อง"}@${domain.name}`
                : "ยังไม่มีโดเมนในระบบ — เพิ่มโดเมนก่อน"}
            </p>
          </div>

          <div>
            <Label htmlFor="mailbox-name">ชื่อที่แสดง</Label>
            <Input
              id="mailbox-name"
              className="mt-1"
              value={displayName}
              placeholder="ฝ่ายขาย"
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="mailbox-quota">พื้นที่สูงสุด (GB)</Label>
            <Input
              id="mailbox-quota"
              className="mt-1"
              type="number"
              min="0"
              value={quotaGb}
              placeholder="เว้นว่าง = ไม่จำกัด"
              onChange={(e) => setQuotaGb(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button
            disabled={busy || !localPart.trim() || !domainId}
            onClick={() => onSubmit({ localPart, domainId, displayName, quotaGb })}
          >
            {busy ? "กำลังสร้าง…" : "สร้างกล่องเมล"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MailAccountEditDialog({
  account,
  busy,
  error,
  onClose,
  onSave,
  onResetPassword,
  onDelete,
}: {
  account: MailAdminAccount;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (patch: { displayName: string; quotaGb: string }) => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  const [displayName, setDisplayName] = useState(account.name);
  const [quotaGb, setQuotaGb] = useState(
    account.quotaBytes ? String(Math.round((account.quotaBytes / GB) * 10) / 10) : "",
  );

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="truncate">{account.email ?? account.name}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="mailbox-edit-name">ชื่อที่แสดง</Label>
            <Input
              id="mailbox-edit-name"
              className="mt-1"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="mailbox-edit-quota">พื้นที่สูงสุด (GB)</Label>
            <Input
              id="mailbox-edit-quota"
              className="mt-1"
              type="number"
              min="0"
              value={quotaGb}
              placeholder="เว้นว่าง = ไม่จำกัด"
              onChange={(e) => setQuotaGb(e.target.value)}
            />
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-medium text-gray-900">รหัสผ่าน</p>
            <p className="mt-0.5 text-xs text-gray-500">
              ระบบอ่านรหัสเดิมไม่ได้ (เก็บเป็นค่าที่ถอดกลับไม่ได้) — ลูกค้าลืมรหัสให้ตั้งใหม่
              แล้วส่งรหัสที่ได้ให้ลูกค้า
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={busy}
              onClick={onResetPassword}
            >
              <KeyRound className="h-4 w-4" /> ตั้งรหัสผ่านใหม่
            </Button>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="destructive" className="mr-auto" disabled={busy} onClick={onDelete}>
            ลบกล่องเมล
          </Button>
          <Button variant="outline" onClick={onClose}>
            ปิด
          </Button>
          <Button disabled={busy} onClick={() => onSave({ displayName, quotaGb })}>
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
