"use client";

/**
 * ตัวช่วยตั้ง DNS ของโดเมน (MAIL_UI_SPEC §5.1) — หน้าที่สำคัญที่สุดของโมดูลนี้
 *
 * กฎที่ห้ามพัง:
 *  - **ทีละ record ไม่ใช่กองรวม** · ทุกช่องมีปุ่มคัดลอก (ห้ามให้พิมพ์ตามเอง — DKIM ยาว 400+ ตัวอักษร)
 *  - อธิบายว่า record นี้มีไว้ทำอะไรเป็นภาษาคน ไม่ใช่ศัพท์เทคนิค
 *  - **ผิดต้องบอกสิ่งที่เจอจริง** ("พบค่า … ต้องเพิ่ม include:… ด้วย") ไม่ใช่แค่ "ไม่ผ่าน"
 *  - ตรวจซ้ำอัตโนมัติทุก 30 วิระหว่างเปิดหน้าอยู่ — ลูกค้าเพิ่งไปกดที่ผู้ให้บริการโดเมนมา
 *    ต้องเห็นผลเองโดยไม่ต้องรีเฟรช
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { CopyInline } from "@/components/ui/copy-cell";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/badge";
import type { MailDnsRecord } from "@/lib/mail/dns-records";
import type { MailDnsCheck, MailDnsStatus } from "@/lib/mail/dns-check";

const RECHECK_MS = 30_000;

const STATUS_LABEL: Record<MailDnsStatus, string> = {
  ok: "ยืนยันแล้ว",
  missing: "ยังไม่พบ",
  mismatch: "ค่าไม่ตรง",
  unknown: "ตรวจไม่ได้",
};

function statusTone(status: MailDnsStatus) {
  if (status === "ok") return "success" as const;
  if (status === "mismatch") return "danger" as const;
  return "warning" as const;
}

export function MailDnsDialog({
  domainId,
  domainName,
  open,
  onOpenChange,
  onDelete,
  authToken,
}: {
  domainId: string;
  domainName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  /** token ของ super_admin — route ฝั่งหลังบ้านต้องการ Bearer */
  authToken: () => Promise<string>;
}) {
  const [records, setRecords] = useState<MailDnsRecord[]>([]);
  const [checks, setChecks] = useState<Record<string, MailDnsCheck>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/mail/dns?id=${encodeURIComponent(domainId)}`, {
        headers: { authorization: `Bearer ${await authToken()}` },
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as {
        records?: MailDnsRecord[];
        checks?: MailDnsCheck[];
        checkedAt?: string;
        error?: string;
      } | null;
      if (!res.ok || !json?.records) throw new Error(json?.error ?? "ตรวจ DNS ไม่สำเร็จ");
      setRecords(json.records);
      setChecks(Object.fromEntries((json.checks ?? []).map((c) => [c.key, c])));
      setCheckedAt(json.checkedAt ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ตรวจ DNS ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [authToken, domainId]);

  useEffect(() => {
    if (!open) return;
    void load();
    const timer = setInterval(() => void load(), RECHECK_MS);
    return () => clearInterval(timer);
  }, [load, open]);

  const requiredOk = records.filter((r) => r.required).every((r) => checks[r.key]?.status === "ok");
  const doneCount = records.filter((r) => checks[r.key]?.status === "ok").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">ตั้งค่า DNS สำหรับ {domainName}</span>
            {records.length > 0 && (
              <span className="shrink-0 text-xs font-normal text-gray-500">
                ยืนยันแล้ว {doneCount} จาก {records.length}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!requiredOk && records.length > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              ยังตั้งไม่ครบ — สร้างกล่องเมลได้ก็จริงแต่เมลจะเข้าไม่ถึงหรือถูกตีเป็นสแปม
              ควรตั้งให้ครบก่อนส่งมอบให้ลูกค้า
            </p>
          )}

          {records.map((r) => {
            const check = checks[r.key];
            const status = check?.status ?? "unknown";
            return (
              <div key={r.key} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{r.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{r.description}</p>
                  </div>
                  <StatusBadge tone={statusTone(status)}>
                    {status === "ok" && <Check className="me-1 h-3 w-3" />}
                    {STATUS_LABEL[status]}
                  </StatusBadge>
                </div>

                <dl className="mt-2.5 space-y-1 rounded-md bg-gray-50 p-2.5 text-xs">
                  <div className="flex gap-2">
                    <dt className="w-14 shrink-0 text-gray-500">ชนิด</dt>
                    <dd className="font-mono text-gray-900">{r.type}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-14 shrink-0 text-gray-500">ชื่อ</dt>
                    <dd className="min-w-0">
                      <CopyInline value={r.host} className="text-gray-900" />
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-14 shrink-0 text-gray-500">ค่า</dt>
                    <dd className="min-w-0 flex-1">
                      <CopyInline
                        value={r.value}
                        className="w-full text-gray-900"
                        label={<span className="block truncate">{r.value}</span>}
                      />
                    </dd>
                  </div>
                </dl>

                {check?.message && (
                  <p
                    className={cn(
                      "mt-2 text-xs",
                      status === "mismatch" ? "text-red-600" : "text-amber-600",
                    )}
                  >
                    {check.message}
                  </p>
                )}
              </div>
            );
          })}

          {records.length === 0 && !error && (
            <p className="py-6 text-center text-sm text-gray-500">
              {loading ? "กำลังอ่านค่าจากเมลเซิร์ฟเวอร์…" : "ยังไม่มีรายการ DNS ของโดเมนนี้"}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="destructive" className="mr-auto" onClick={onDelete}>
            ลบโดเมน
          </Button>
          {checkedAt && (
            <span className="me-2 self-center text-xs text-gray-400">
              ตรวจล่าสุด {new Date(checkedAt).toLocaleTimeString("th-TH")}
            </span>
          )}
          <Button variant="outline" disabled={loading} onClick={() => void load()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            ตรวจสอบอีกครั้ง
          </Button>
          <Button onClick={() => onOpenChange(false)}>ปิด</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
