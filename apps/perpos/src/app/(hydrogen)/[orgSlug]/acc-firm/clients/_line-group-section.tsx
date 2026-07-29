"use client";

/**
 * ส่วน "กลุ่ม LINE ของลูกค้า" ในกล่องแก้ไขลูกค้า (`/acc-firm/clients`)
 *
 * ทีมงานกดสร้างรหัส → เอาไปพิมพ์ในกลุ่มที่แอด Perpos OA ไว้แล้ว → กลุ่มผูกกับลูกค้ารายนี้
 * จากนั้นเลือกได้ว่าจะให้ระบบส่งอัปเดตอะไรเข้ากลุ่มบ้าง (ต่อลูกค้า)
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, MessageSquare, RefreshCw, Send, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/badge";
import { CustomSelect } from "@/components/ui/custom-select";
import { toast } from "@/lib/toast";

type GroupRow = {
  service_client_id: string;
  status: "pending" | "linked";
  line_group_id: string | null;
  bound_at: string | null;
  pair_code: string | null;
  pair_code_expires_at: string | null;
  notify_doc_received: boolean;
  notify_tax_due: boolean;
  notify_tax_filed: boolean;
  notify_billing: boolean;
  notify_announce: boolean;
};

/** หัวข้อที่ระบบส่งเข้ากลุ่มได้ — ต้องตรงกับ CLIENT_LINE_EVENTS ใน lib/acc-firm/line-group.ts */
const NOTIFY_ITEMS: { key: keyof GroupRow; label: string; hint: string }[] = [
  {
    key: "notify_doc_received",
    label: "ได้รับเอกสารแล้ว",
    hint: "ทุกครั้งที่ทีมบันทึกเอกสารของลูกค้าเข้าคลัง",
  },
  {
    key: "notify_tax_due",
    label: "ใกล้ครบกำหนดยื่นภาษี",
    hint: "อัตโนมัติ 7 / 3 / 1 วันก่อน และวันครบกำหนด",
  },
  { key: "notify_tax_filed", label: "ยื่นภาษีให้แล้ว", hint: "เมื่อทีมกดยืนยันว่ายื่นแบบแล้ว" },
  { key: "notify_billing", label: "แจ้งค่าบริการ", hint: "ทีมงานพิมพ์ส่งเองจากหน้านี้" },
  { key: "notify_announce", label: "ประกาศจากทีมงาน", hint: "ข้อความทั่วไป ทีมงานพิมพ์ส่งเอง" },
];

const SEND_OPTIONS = [
  { value: "announce", label: "ประกาศจากทีมงาน" },
  { value: "billing", label: "แจ้งค่าบริการ" },
];

export function ClientLineGroupSection({
  orgId,
  token,
  clientId,
  canWrite,
  onChanged,
}: {
  orgId: string;
  token: string;
  clientId: string;
  canWrite: boolean;
  onChanged?: () => void;
}) {
  const [row, setRow] = useState<GroupRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [sendEvent, setSendEvent] = useState("announce");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!orgId || !token) return;
    setLoading(true);
    const res = await fetch(`/api/acc-firm/client-line-group?orgId=${orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const j = (await res.json()) as { rows: GroupRow[] };
      const mine = (j.rows ?? []).find((r) => r.service_client_id === clientId) ?? null;
      setRow(mine);
      if (mine?.pair_code && mine.status !== "linked") {
        setCode({ code: mine.pair_code, expiresAt: mine.pair_code_expires_at ?? "" });
      }
    }
    setLoading(false);
  }, [orgId, token, clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch("/api/acc-firm/client-line-group", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orgId, serviceClientId: clientId, ...body }),
    });
    setBusy(false);
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      toast.error(String(j.error ?? "ดำเนินการไม่สำเร็จ"));
      return null;
    }
    return j;
  }

  async function genCode() {
    const j = await post({ action: "code" });
    if (!j) return;
    setCode({ code: String(j.code), expiresAt: String(j.expiresAt) });
    setCopied(false);
    toast.success("สร้างรหัสแล้ว — นำไปพิมพ์ในกลุ่ม LINE ของลูกค้า");
    onChanged?.();
  }

  async function unlink() {
    const j = await post({ action: "unlink" });
    if (!j) return;
    setCode(null);
    setConfirmUnlink(false);
    await load();
    toast.success("เลิกเชื่อมกลุ่มแล้ว");
    onChanged?.();
  }

  async function send() {
    if (!message.trim()) return;
    const j = await post({ action: "send", event: sendEvent, message });
    if (!j) return;
    setMessage("");
    toast.success("ส่งเข้ากลุ่มแล้ว");
  }

  async function toggleNotify(key: keyof GroupRow) {
    const current = row?.[key];
    const next = !(typeof current === "boolean" ? current : true);
    setBusy(true);
    const res = await fetch("/api/acc-firm/client-line-group", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orgId, serviceClientId: clientId, notify: { [key]: next } }),
    });
    setBusy(false);
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(e.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    setRow((await res.json()) as GroupRow);
  }

  const linked = row?.status === "linked";

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-gray-500" />
        <p className="text-sm font-medium text-gray-700">กลุ่ม LINE ของลูกค้า</p>
        {!loading && (
          <StatusBadge tone={linked ? "success" : "neutral"}>
            {linked ? "เชื่อมกลุ่มแล้ว" : "ยังไม่เชื่อม"}
          </StatusBadge>
        )}
      </div>

      {loading ? (
        <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
      ) : (
        <>
          {!linked && (
            <div className="space-y-2.5 rounded-xl border bg-gray-50 p-3">
              <p className="text-xs text-gray-500">
                วิธีเชื่อม: เพิ่ม <b>Perpos</b> (LINE OA) เข้ากลุ่มของลูกค้าก่อน →
                กดสร้างรหัสด้านล่าง → นำรหัสไปพิมพ์ในกลุ่มนั้น
              </p>

              {code ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-mono text-base font-semibold tracking-widest text-gray-800">
                    {code.code}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      navigator.clipboard.writeText(code.code);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? "คัดลอกแล้ว" : "คัดลอก"}
                  </Button>
                  {canWrite && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-xs"
                      disabled={busy}
                      onClick={genCode}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> สร้างรหัสใหม่
                    </Button>
                  )}
                  <span className="w-full text-xs text-gray-400">
                    รหัสใช้ได้ครั้งเดียว · หมดอายุ{" "}
                    {code.expiresAt
                      ? new Date(code.expiresAt).toLocaleString("th-TH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "ภายใน 24 ชั่วโมง"}
                  </span>
                </div>
              ) : canWrite ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={genCode}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  {busy ? "กำลังสร้าง…" : "สร้างรหัสเชื่อมกลุ่ม"}
                </Button>
              ) : (
                <p className="text-xs text-gray-400">บัญชีของคุณเป็นสิทธิ์อ่านอย่างเดียว</p>
              )}
            </div>
          )}

          {linked && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-gray-50 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800">กลุ่มนี้รับอัปเดตของลูกค้ารายนี้อยู่</p>
                <p className="text-xs text-gray-400">
                  เชื่อมเมื่อ{" "}
                  {row?.bound_at
                    ? new Date(row.bound_at).toLocaleString("th-TH", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—"}
                </p>
              </div>
              {canWrite && (
                <Button
                  size="sm"
                  variant={confirmUnlink ? "destructive" : "outline"}
                  className="gap-1.5 text-xs"
                  disabled={busy}
                  onClick={() => (confirmUnlink ? unlink() : setConfirmUnlink(true))}
                >
                  <Unlink className="h-3.5 w-3.5" />
                  {confirmUnlink ? "กดอีกครั้งเพื่อยืนยัน" : "เลิกเชื่อม"}
                </Button>
              )}
            </div>
          )}

          {/* สวิตช์หัวข้อที่จะส่ง — ตั้งล่วงหน้าได้แม้ยังไม่เชื่อมกลุ่ม */}
          <div className="space-y-1.5">
            <Label>อัปเดตที่จะส่งเข้ากลุ่ม</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {NOTIFY_ITEMS.map((item) => {
                const on = row ? Boolean(row[item.key]) : true;
                return (
                  <button
                    key={String(item.key)}
                    type="button"
                    disabled={!canWrite || busy}
                    onClick={() => toggleNotify(item.key)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-default disabled:opacity-70 ${
                      on
                        ? "border-teal-300 bg-teal-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <span
                      className={`block text-sm font-medium ${on ? "text-teal-700" : "text-gray-500"}`}
                    >
                      {on ? "✓ " : ""}
                      {item.label}
                    </span>
                    <span className="block text-xs text-gray-400">{item.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ส่งข้อความเข้ากลุ่มเอง */}
          {linked && canWrite && (
            <div className="space-y-1.5">
              <Label>ส่งข้อความเข้ากลุ่ม</Label>
              <div className="flex flex-wrap gap-2">
                <CustomSelect
                  value={sendEvent}
                  onChange={setSendEvent}
                  options={SEND_OPTIONS}
                  className="w-44"
                />
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="เช่น ส่งใบแจ้งค่าบริการเดือนนี้แล้วครับ"
                  className="min-w-[14rem] flex-1"
                  maxLength={1500}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={busy || !message.trim()}
                  onClick={send}
                >
                  <Send className="h-3.5 w-3.5" />
                  {busy ? "กำลังส่ง…" : "ส่ง"}
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                ข้อความจะไปเป็นการ์ดในกลุ่มพร้อมชื่อบริษัท — ส่งได้เมื่อเปิดหัวข้อนั้นไว้
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
