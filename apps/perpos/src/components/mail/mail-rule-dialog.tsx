"use client";

/**
 * "สร้างกฎกรองจากเมลนี้" — ทางลัดจากบานอ่าน (Gmail = "กรองข้อความแบบนี้")
 *
 * ทำไมต้องมี: คนแทบไม่เปิดหน้า `/rules` แล้วนั่งพิมพ์อีเมลผู้ส่งเอง — จังหวะที่อยากได้กฎ
 * คือตอนกำลังมองเมลฉบับที่น่ารำคาญอยู่ตรงหน้า
 *
 * กติกาที่ห้ามพัง (เหมือนหน้า `/rules` ทุกข้อ):
 *  - เขียนลง **สคริปต์ `perpos` ตัวเดียว** เสมอ ⇒ ที่นี่ต้อง "อ่านกฎทั้งชุดมาก่อน แล้วต่อท้าย"
 *    ห้าม PUT เฉพาะกฎใหม่ (จะลบกฎเดิมทิ้งทั้งหมด)
 *  - เจอสคริปต์ของคนอื่น (`foreignScript`) = **ไม่เขียนทับจากที่นี่** ส่งผู้ใช้ไปยืนยันที่หน้ากฎกรอง
 *    (หน้านั้นมีคำเตือนเต็ม ๆ ให้อ่านก่อนตัดสินใจ)
 *  - กฎมีผลกับเมลที่เข้ามาใหม่เท่านั้น (Sieve ไม่ย้อนหลัง) — ต้องบอกในกล่องเสมอ
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { showUndoToast } from "@/components/ui/undo-toast";
import { MAIL_RULE_APPLY_LIMIT, MAIL_RULE_MAX, MAIL_RULE_VALUE_MAX } from "@/lib/mail/rule-meta";
import type {
  MailFolder,
  MailUndoToken,
  MailRule,
  MailRuleCondition,
  MailRulesResult,
  MailboxSummary,
} from "@/lib/mail/types";

export interface MailRuleSeed {
  /** อีเมลผู้ส่งของฉบับที่เปิดอยู่ — เงื่อนไขหลักของกฎ */
  fromEmail: string;
  fromName: string | null;
  subject: string;
}

/** ตัดเลขตอบกลับ/ส่งต่อออกจากหัวเรื่อง — "Re: Re: ใบแจ้งหนี้" ทำให้กฎไม่เคยตรงอีกเลย */
function cleanSubject(subject: string): string {
  return subject
    .replace(/^(\s*(re|fw|fwd|ตอบกลับ|ส่งต่อ)\s*:\s*)+/i, "")
    .trim()
    .slice(0, MAIL_RULE_VALUE_MAX);
}

export function MailRuleDialog({
  open,
  onOpenChange,
  seed,
  basePath,
  defaultMailboxId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seed: MailRuleSeed | null;
  /** คำนำหน้าลิงก์ของโซนเมล (invariant ข้อ 0) — ใช้พาไปหน้ากฎกรองเต็ม */
  basePath: string;
  /** โฟลเดอร์ที่เมลฉบับนี้อยู่ (ถ้าเป็นโฟลเดอร์ที่ผู้ใช้สร้างเอง) = ปลายทางที่เดาให้ */
  defaultMailboxId?: string | null;
}) {
  const [name, setName] = useState("");
  const [useSubject, setUseSubject] = useState(false);
  /** ค่าที่จะใช้จริงของเงื่อนไขหัวเรื่อง — แก้ได้ (หัวเรื่องเต็มมักจำเพาะเกินจนกฎไม่เคยตรง) */
  const [subjectInput, setSubjectInput] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [markRead, setMarkRead] = useState(false);
  const [saving, setSaving] = useState(false);
  /** ใช้กับเมลที่มีอยู่แล้วด้วยไหม + จำนวนที่จะโดน (นับก่อนเสมอ — ย้ายทีละหลายสิบฉบับ ย้อนกลับยาก) */
  const [applyExisting, setApplyExisting] = useState(false);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [targets, setTargets] = useState<{ value: string; label: string }[]>([]);

  const subjectValue = seed ? cleanSubject(seed.subject) : "";
  /** ไม่มี action = กฎไม่ทำอะไรกับเมลเดิม (บันทึกกฎได้ แต่ต้องบอกผู้ใช้ก่อน) */
  const hasAction = !!moveTo || markRead;

  // เปิดกล่องใหม่ = ตั้งค่าจากเมลฉบับที่กำลังดูเสมอ (ห้ามค้างค่าของฉบับก่อนหน้า)
  useEffect(() => {
    if (!open || !seed) return;
    setName(seed.fromName?.trim() || seed.fromEmail);
    setUseSubject(false);
    setSubjectInput(cleanSubject(seed.subject));
    setMoveTo(defaultMailboxId ?? "");
    setMarkRead(false);
    setApplyExisting(false);
    setMatchCount(null);
  }, [open, seed, defaultMailboxId]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/mail/mailboxes")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { folders?: MailFolder[]; mailboxes?: MailboxSummary[] } | null) => {
        if (!alive || !data) return;
        const system = (data.mailboxes ?? [])
          .filter((m) => m.key === "junk" || m.key === "trash")
          .map((m) => ({ value: m.id, label: m.name }));
        setTargets([
          { value: "", label: "— ไม่ย้าย —" },
          ...(data.folders ?? []).map((f) => ({ value: f.id, label: f.path })),
          ...system,
        ]);
      })
      .catch(() => {
        /* โหลดปลายทางไม่ได้ = ยังสร้างกฎแบบ "ไม่ย้าย" ได้ ไม่ต้องบล็อก */
      });
    return () => {
      alive = false;
    };
  }, [open]);

  /**
   * กฎที่กำลังจะสร้าง — ใช้ทั้งตอน "นับให้ดูก่อน" และตอนบันทึกจริง
   * (สองที่ต้องเป็นกฎเดียวกันเป๊ะ ไม่งั้นตัวเลขที่ผู้ใช้เห็นไม่ใช่ของที่จะโดนจริง)
   */
  /**
   * เงื่อนไขล้วน ๆ — แยกจาก action เพราะ **การนับใช้แค่ส่วนนี้**
   * (ถ้าเอาทั้งกฎมาเป็น dependency การพิมพ์ชื่อกฎจะยิงนับใหม่ทุกครั้ง ทั้งที่ผลค้นไม่เปลี่ยน)
   */
  const conditions: MailRuleCondition[] | null = useMemo(() => {
    if (!seed) return null;
    const list: MailRuleCondition[] = [{ field: "from", op: "contains", value: seed.fromEmail }];
    if (useSubject) {
      const value = subjectInput.trim();
      if (!value) return null;
      list.push({ field: "subject", op: "contains", value });
    }
    return list;
  }, [seed, useSubject, subjectInput]);

  const buildRule = useCallback((): MailRule | null => {
    if (!seed || !conditions) return null;
    return {
      id: `r${Date.now().toString(36)}`,
      name: name.trim() || seed.fromEmail,
      enabled: true,
      match: "all",
      conditions,
      moveToMailboxId: moveTo || null,
      markRead,
      star: false,
      stop: false,
    };
  }, [seed, conditions, name, moveTo, markRead]);

  /** นับฉบับเดิมที่ตรงกฎ — หน่วงไว้หน่อยเพราะช่องหัวเรื่องพิมพ์ได้ */
  useEffect(() => {
    if (!open || !seed || !conditions) {
      if (!conditions) setMatchCount(null);
      return;
    }
    // นับจากเงื่อนไขอย่างเดียว — action (ย้าย/อ่านแล้ว) ไม่เปลี่ยนว่าเมลฉบับไหน "ตรงกฎ"
    const rule: MailRule = {
      id: "preview",
      name: "preview",
      enabled: true,
      match: "all",
      conditions,
      moveToMailboxId: null,
      markRead: false,
      star: false,
      stop: false,
    };
    let alive = true;
    setCounting(true);
    const t = setTimeout(() => {
      fetch("/api/mail/rules/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule, dryRun: true }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { total?: number } | null) => {
          if (!alive) return;
          setMatchCount(typeof data?.total === "number" ? data.total : null);
        })
        .catch(() => alive && setMatchCount(null))
        .finally(() => alive && setCounting(false));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
      setCounting(false);
      /* ตั้งใจไม่ล้าง matchCount ตรงนี้ — จอจะกะพริบทุกตัวอักษรที่พิมพ์ */
    };
  }, [open, seed, conditions]);

  const save = useCallback(async () => {
    if (!seed) return;
    setSaving(true);
    try {
      const res = await fetch("/api/mail/rules");
      if (!res.ok) throw new Error("อ่านกฎกรองเดิมไม่สำเร็จ");
      const current = (await res.json()) as MailRulesResult;
      if (current.foreignScript) {
        // ของคนอื่นอยู่บนเซิร์ฟเวอร์ — ตัดสินใจเขียนทับต้องทำที่หน้ากฎกรองที่มีคำเตือนเต็ม
        notify.error(null, "กล่องเมลนี้มีกฎกรองเดิมจากที่อื่น — เปิดหน้า “กฎกรอง” เพื่อยืนยันก่อน");
        onOpenChange(false);
        return;
      }
      const rules = current.rules ?? [];
      if (rules.length >= MAIL_RULE_MAX) {
        notify.error(null, `มีกฎครบ ${MAIL_RULE_MAX} ข้อแล้ว — ลบของเดิมก่อน`);
        return;
      }

      const rule = buildRule();
      if (!rule) {
        notify.error(null, "เปิดเงื่อนไขหัวเรื่องไว้ แต่ยังไม่ได้กรอกคำ");
        return;
      }

      const put = await fetch("/api/mail/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: [...rules, rule] }),
      });
      const data = (await put.json().catch(() => null)) as { message?: string } | null;
      if (!put.ok) throw new Error(data?.message ?? "บันทึกกฎกรองไม่สำเร็จ");

      if (!applyExisting) {
        notify.saved("สร้างกฎกรองแล้ว — มีผลกับเมลที่เข้ามาใหม่");
        onOpenChange(false);
        return;
      }

      // ของเดิมเป็นงานคนละชิ้น (Sieve ย้อนหลังไม่ได้) — กฎถูกบันทึกไปแล้วแม้ขั้นนี้พลาด
      const applied = await fetch("/api/mail/rules/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule }),
      });
      const result = (await applied.json().catch(() => null)) as {
        affected?: number;
        remaining?: number;
        undo?: MailUndoToken;
        message?: string;
      } | null;
      if (!applied.ok) {
        notify.error(null, result?.message ?? "สร้างกฎแล้ว แต่ใช้กับเมลเดิมไม่สำเร็จ");
        onOpenChange(false);
        return;
      }
      const affected = result?.affected ?? 0;
      const remaining = result?.remaining ?? 0;
      onOpenChange(false);
      if (affected === 0) {
        notify.saved("สร้างกฎกรองแล้ว — ไม่พบเมลเดิมที่ตรงเงื่อนไข");
        return;
      }
      const undo = result?.undo;
      showUndoToast({
        message:
          `จัดการเมลเดิมแล้ว ${affected} ฉบับ` + (remaining > 0 ? ` · เหลืออีก ${remaining}` : ""),
        onUndo: () => {
          if (!undo?.items?.length) return;
          // เช็ค res.ok ด้วย — 4xx/5xx ไม่ทำให้ fetch reject ⇒ เงียบไปเฉย ๆ ผู้ใช้จะนึกว่าคืนค่าแล้ว
          void fetch("/api/mail/messages/undo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: undo.items }),
          })
            .then((res) => {
              if (!res.ok) notify.error(null, "เลิกทำไม่สำเร็จ");
            })
            .catch(() => notify.error(null, "เลิกทำไม่สำเร็จ"));
        },
      });
    } catch (e) {
      notify.error(e, "สร้างกฎกรองไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }, [seed, buildRule, applyExisting, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>สร้างกฎกรองจากเมลนี้</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {seed && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="rule-name">ชื่อกฎ</Label>
                <Input
                  id="rule-name"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                />
              </div>

              {/* เงื่อนไข = แถวละข้อ ปุ่มเปิด-ปิดอยู่ในแถวของตัวเอง
                  (เดิมสองข้ออยู่กล่องเดียวกับปุ่มเดียว → ไม่รู้ว่าปุ่มคุมข้อไหน) */}
              <div className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200">
                <div className="bg-gray-50 px-3 py-2">
                  <Text className="text-xs font-medium text-gray-500">
                    เงื่อนไข — ต้องตรงทุกข้อที่เปิดไว้
                  </Text>
                </div>

                <div className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Text className="text-xs text-gray-500">ผู้ส่งมีคำว่า</Text>
                    <Text className="mt-0.5 break-all text-sm font-medium text-gray-900">
                      {seed.fromEmail}
                    </Text>
                  </div>
                  {/* ผู้ส่งเป็นแกนของกฎที่สร้างจากเมล — ปิดไม่ได้ (ปิดแล้วเหลือกฎที่กว้างจนอันตราย) */}
                  <span className="mt-0.5 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    เสมอ
                  </span>
                </div>

                {subjectValue && (
                  <div className="px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <Text className="min-w-0 flex-1 text-xs text-gray-500">หัวเรื่องมีคำว่า</Text>
                      <YesNo
                        label="ใช้เงื่อนไขหัวเรื่องด้วย"
                        value={useSubject}
                        onChange={setUseSubject}
                      />
                    </div>
                    {useSubject ? (
                      /* แก้ได้ — หัวเรื่องเต็ม ๆ ของฉบับเดียวมักจำเพาะเกินจนกฎไม่เคยตรงอีก
                         ผู้ใช้ควรตัดเหลือคำที่ซ้ำทุกฉบับ เช่น "นัดหมายของท่าน" */
                      <Input
                        value={subjectInput}
                        maxLength={MAIL_RULE_VALUE_MAX}
                        onChange={(e) => setSubjectInput(e.target.value)}
                        placeholder="คำที่มีในหัวเรื่องทุกฉบับ"
                        className="mt-1.5"
                      />
                    ) : (
                      <Text className="mt-0.5 line-clamp-2 break-all text-sm text-gray-400">
                        {subjectValue}
                      </Text>
                    )}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="rule-target">ย้ายไปที่</Label>
                <CustomSelect
                  value={moveTo}
                  onChange={setMoveTo}
                  options={targets.length ? targets : [{ value: "", label: "— ไม่ย้าย —" }]}
                  className="mt-1 w-full"
                />
              </div>

              <div className="flex items-center gap-2">
                <Text className="text-sm text-gray-700">ทำเป็นอ่านแล้วอัตโนมัติ</Text>
                <YesNo label="ทำเป็นอ่านแล้วอัตโนมัติ" value={markRead} onChange={setMarkRead} />
              </div>

              {/* ของเดิมเป็นงานคนละชิ้น — Sieve กรองตอนเมลเข้าเท่านั้น ย้อนหลังต้องสั่ง JMAP เอง */}
              <div className="rounded-xl border border-gray-200 px-3 py-2.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <Text className="text-sm text-gray-900">ใช้กับเมลเดิมในกล่องขาเข้าด้วย</Text>
                    <Text className="mt-0.5 text-xs text-gray-500">
                      {counting
                        ? "กำลังนับ…"
                        : matchCount === null
                          ? "กฎมีผลกับอีเมลที่เข้ามาหลังจากนี้เท่านั้น"
                          : matchCount === 0
                            ? "ไม่พบเมลเดิมที่ตรงเงื่อนไข"
                            : `พบ ${matchCount} ฉบับ` +
                              (matchCount > MAIL_RULE_APPLY_LIMIT
                                ? ` — ครั้งนี้ทำได้ ${MAIL_RULE_APPLY_LIMIT}`
                                : "")}
                    </Text>
                  </div>
                  <YesNo
                    label="ใช้กับเมลเดิมด้วย"
                    value={applyExisting}
                    onChange={setApplyExisting}
                  />
                </div>
                {applyExisting && !hasAction && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <Text className="text-sm text-amber-800">
                      กฎนี้ยังไม่มีการกระทำ (ไม่ย้าย/ไม่ทำเป็นอ่านแล้ว) จึงไม่มีอะไรทำกับเมลเดิม
                    </Text>
                  </div>
                )}
              </div>

              <Text className="text-xs text-gray-500">
                แก้ไขเพิ่มเติม (เงื่อนไขหลายข้อ, ลำดับการตรวจ) ได้ที่หน้า{" "}
                <a className="underline" href={`${basePath}/rules`}>
                  กฎกรอง
                </a>
              </Text>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button
            /* เปิด "ใช้กับเมลเดิม" ไว้แต่กฎไม่มีการกระทำ = เซิร์ฟเวอร์ตอบ 400 แน่นอน
               ⇒ กันตั้งแต่ปุ่ม ไม่ใช่ปล่อยให้กฎถูกบันทึกแล้วค่อยขึ้น error */
            disabled={saving || !seed || (applyExisting && !hasAction)}
            onClick={() => void save()}
          >
            {saving ? "กำลังบันทึก…" : "สร้างกฎ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** yes/no แบบเดียวกับหน้ากฎกรอง (DESIGN.md §7 — ตัวเลือกสองทางใช้ pill ไม่ใช่ checkbox) */
function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <SegmentedControl
      size="xs"
      value={value ? "on" : "off"}
      onChange={(v) => onChange(v === "on")}
      ariaLabel={label}
      options={[
        { value: "on", label: "ใช่" },
        { value: "off", label: "ไม่" },
      ]}
    />
  );
}
