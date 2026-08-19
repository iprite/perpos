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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useMailT } from "@/components/mail/mail-locale";
import { MAIL_RULE_APPLY_LIMIT, MAIL_RULE_MAX, MAIL_RULE_VALUE_MAX } from "@/lib/mail/rule-meta";

/**
 * เพดานจำนวน "ก้อน" ต่อการกดหนึ่งครั้ง — กันลูปไม่รู้จบถ้าเซิร์ฟเวอร์รายงาน `remaining` ไม่ลด
 * (200 × 25 = 5,000 ฉบับ ซึ่งเกินกล่องขาเข้าของคนทั่วไปไปมากแล้ว)
 */
const MAX_BATCHES = 25;
import type {
  MailFolder,
  MailUndoItem,
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
  const t = useMailT();
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
  /** ความคืบหน้าตอนไล่จัดการเมลเดิม (งานเป็นก้อนละ MAIL_RULE_APPLY_LIMIT) */
  const [applyDone, setApplyDone] = useState(0);
  const [applyLeft, setApplyLeft] = useState(0);
  /** กดหยุดกลางทาง — หยุด "หลังจบก้อนปัจจุบัน" เสมอ ไม่ตัดกลาง request */
  const stopRef = useRef(false);
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
    setApplyDone(0);
    setApplyLeft(0);
    stopRef.current = false;
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
          { value: "", label: t("rules.target.none") },
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
  }, [open, t]);

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
    const timer = setTimeout(() => {
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
      clearTimeout(timer);
      setCounting(false);
      /* ตั้งใจไม่ล้าง matchCount ตรงนี้ — จอจะกะพริบทุกตัวอักษรที่พิมพ์ */
    };
  }, [open, seed, conditions]);

  const save = useCallback(async () => {
    if (!seed) return;
    stopRef.current = false;
    setApplyDone(0);
    setSaving(true);
    try {
      const res = await fetch("/api/mail/rules");
      if (!res.ok) throw new Error(t("rules.dialog.readFailed"));
      const current = (await res.json()) as MailRulesResult;
      if (current.foreignScript) {
        // ของคนอื่นอยู่บนเซิร์ฟเวอร์ — ตัดสินใจเขียนทับต้องทำที่หน้ากฎกรองที่มีคำเตือนเต็ม
        notify.error(null, t("rules.dialog.foreign"));
        onOpenChange(false);
        return;
      }
      const rules = current.rules ?? [];
      if (rules.length >= MAIL_RULE_MAX) {
        notify.error(null, t("rules.dialog.maxReached", { max: MAIL_RULE_MAX }));
        return;
      }

      const rule = buildRule();
      if (!rule) {
        notify.error(null, t("rules.dialog.subjectEmpty"));
        return;
      }

      const put = await fetch("/api/mail/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: [...rules, rule] }),
      });
      const data = (await put.json().catch(() => null)) as { message?: string } | null;
      if (!put.ok) throw new Error(data?.message ?? t("rules.save.failed"));

      if (!applyExisting) {
        notify.saved(t("rules.dialog.created"));
        onOpenChange(false);
        return;
      }

      /**
       * ของเดิมเป็นงานคนละชิ้น (Sieve ย้อนหลังไม่ได้) — กฎถูกบันทึกไปแล้วแม้ขั้นนี้พลาด
       *
       * เพดาน 200 คือเพดานของ **หนึ่ง request** (กันย้ายครึ่ง ๆ กลาง ๆ ตอน timeout)
       * ไม่ใช่เพดานของงาน ⇒ วนยิงเป็นก้อนจนหมด แล้วรายงานยอดรวมทีเดียว
       * ผู้ใช้กดหยุดกลางทางได้ — ที่ทำไปแล้วยังเลิกทำได้ครบ
       */
      const undoItems: MailUndoItem[] = [];
      let done = 0;
      let left = 0;
      let batches = 0;
      for (;;) {
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
          // ก้อนแรกพัง = ยังไม่ได้ทำอะไรเลย · ก้อนหลังพัง = ทำไปแล้วบางส่วน ต้องบอกยอดจริง
          notify.error(
            null,
            done === 0
              ? (result?.message ?? t("rules.dialog.applyFailedFirst"))
              : t("rules.dialog.applyFailedPartial", { done }),
          );
          break;
        }
        const affected = result?.affected ?? 0;
        done += affected;
        left = result?.remaining ?? 0;
        if (result?.undo?.items?.length) undoItems.push(...result.undo.items);
        setApplyDone(done);
        setApplyLeft(left);
        batches += 1;

        if (affected === 0 || left === 0) break;
        if (stopRef.current) break;
        // กันลูปไม่รู้จบถ้าเซิร์ฟเวอร์รายงาน remaining ผิด (เช่นกฎที่ย้ายไม่สำเร็จเงียบ ๆ)
        if (batches >= MAX_BATCHES) break;
      }

      onOpenChange(false);
      if (done === 0) {
        notify.saved(t("rules.dialog.createdNoMatch"));
        return;
      }
      showUndoToast({
        message:
          t("rules.dialog.appliedDone", { done }) +
          (left > 0 ? t("rules.dialog.appliedLeft", { left }) : ""),
        onUndo: () => {
          if (undoItems.length === 0) return;
          // เลิกทำต้องแบ่งก้อนเหมือนกัน — route รับได้ครั้งละ MAIL_RULE_APPLY_LIMIT รายการ
          void (async () => {
            for (let i = 0; i < undoItems.length; i += MAIL_RULE_APPLY_LIMIT) {
              const chunk = undoItems.slice(i, i + MAIL_RULE_APPLY_LIMIT);
              try {
                // เช็ค res.ok ด้วย — 4xx/5xx ไม่ทำให้ fetch reject ⇒ เงียบไปเฉย ๆ
                const res = await fetch("/api/mail/messages/undo", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ items: chunk }),
                });
                if (!res.ok) throw new Error("undo failed");
              } catch {
                notify.error(null, t("rules.dialog.undoFailed"));
                return;
              }
            }
          })();
        },
      });
    } catch (e) {
      notify.error(e, t("rules.dialog.createFailed"));
    } finally {
      setSaving(false);
    }
  }, [seed, buildRule, applyExisting, onOpenChange, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t("rules.dialog.title")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {seed && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="rule-name">{t("rules.card.name")}</Label>
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
                    {t("rules.dialog.conditionsHeader")}
                  </Text>
                </div>

                <div className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Text className="text-xs text-gray-500">
                      {t("rules.dialog.senderContains")}
                    </Text>
                    <Text className="mt-0.5 break-all text-sm font-medium text-gray-900">
                      {seed.fromEmail}
                    </Text>
                  </div>
                  {/* ผู้ส่งเป็นแกนของกฎที่สร้างจากเมล — ปิดไม่ได้ (ปิดแล้วเหลือกฎที่กว้างจนอันตราย) */}
                  <span className="mt-0.5 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {t("rules.dialog.always")}
                  </span>
                </div>

                {subjectValue && (
                  <div className="px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <Text className="min-w-0 flex-1 text-xs text-gray-500">
                        {t("rules.dialog.subjectContains")}
                      </Text>
                      <YesNo
                        label={t("rules.dialog.useSubjectAria")}
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
                        placeholder={t("rules.dialog.subjectPlaceholder")}
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
                <Label htmlFor="rule-target">{t("rules.dialog.moveTo")}</Label>
                <CustomSelect
                  value={moveTo}
                  onChange={setMoveTo}
                  options={
                    targets.length ? targets : [{ value: "", label: t("rules.target.none") }]
                  }
                  className="mt-1 w-full"
                />
              </div>

              <div className="flex items-center gap-2">
                <Text className="text-sm text-gray-700">{t("rules.dialog.markReadAuto")}</Text>
                <YesNo
                  label={t("rules.dialog.markReadAuto")}
                  value={markRead}
                  onChange={setMarkRead}
                />
              </div>

              {/* ของเดิมเป็นงานคนละชิ้น — Sieve กรองตอนเมลเข้าเท่านั้น ย้อนหลังต้องสั่ง JMAP เอง */}
              <div className="rounded-xl border border-gray-200 px-3 py-2.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <Text className="text-sm text-gray-900">{t("rules.dialog.applyExisting")}</Text>
                    <Text className="mt-0.5 text-xs text-gray-500">
                      {counting
                        ? t("rules.dialog.counting")
                        : matchCount === null
                          ? t("rules.dialog.newOnly")
                          : matchCount === 0
                            ? t("rules.dialog.noMatch")
                            : t("rules.dialog.found", { count: matchCount }) +
                              (matchCount > MAIL_RULE_APPLY_LIMIT
                                ? t("rules.dialog.foundBatched", { limit: MAIL_RULE_APPLY_LIMIT })
                                : "")}
                    </Text>
                  </div>
                  <YesNo
                    label={t("rules.dialog.applyExistingAria")}
                    value={applyExisting}
                    onChange={setApplyExisting}
                  />
                </div>
                {applyExisting && !hasAction && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <Text className="text-sm text-amber-800">
                      {t("rules.dialog.noActionWarning")}
                    </Text>
                  </div>
                )}
              </div>

              <Text className="text-xs text-gray-500">
                {t("rules.dialog.moreAt")}{" "}
                <a className="underline" href={`${basePath}/rules`}>
                  {t("rules.title")}
                </a>
              </Text>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {/* ระหว่างไล่จัดการของเดิมต้องเห็นความคืบหน้า + หยุดได้ (งานยาวหลายก้อน) */}
          {saving && applyExisting && (applyDone > 0 || applyLeft > 0) && (
            <Text className="mr-auto text-xs tabular-nums text-gray-500">
              {t("rules.dialog.progress", { done: applyDone })}
              {applyLeft > 0 ? t("rules.dialog.progressLeft", { left: applyLeft }) : ""}
            </Text>
          )}
          {saving && applyExisting ? (
            <Button variant="outline" onClick={() => (stopRef.current = true)}>
              {t("rules.dialog.stop")}
            </Button>
          ) : (
            <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
          )}
          <Button
            /* เปิด "ใช้กับเมลเดิม" ไว้แต่กฎไม่มีการกระทำ = เซิร์ฟเวอร์ตอบ 400 แน่นอน
               ⇒ กันตั้งแต่ปุ่ม ไม่ใช่ปล่อยให้กฎถูกบันทึกแล้วค่อยขึ้น error */
            disabled={saving || !seed || (applyExisting && !hasAction)}
            onClick={() => void save()}
          >
            {!saving
              ? t("rules.dialog.create")
              : applyExisting
                ? t("rules.dialog.applying")
                : t("common.saving")}
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
  const t = useMailT();
  return (
    <SegmentedControl
      size="xs"
      value={value ? "on" : "off"}
      onChange={(v) => onChange(v === "on")}
      ariaLabel={label}
      options={[
        { value: "on", label: t("rules.yes") },
        { value: "off", label: t("rules.no") },
      ]}
    />
  );
}
