"use client";

/**
 * กฎกรองอัตโนมัติ (M3) — ฟอร์ม "ถ้า…ให้…"
 *
 * ผู้ใช้ไม่เคยเห็นภาษา Sieve เลยโดยตั้งใจ — สคริปต์ถูกประกอบที่ `lib/mail/sieve.ts` ที่เดียว
 * (สคริปต์ที่ผิดทำให้เมลหายเงียบ ๆ และผู้ใช้ทั่วไปตรวจเองไม่ได้)
 *
 * บันทึก = เขียนทั้งชุดทับของเดิมเสมอ ⇒ ปุ่มบันทึกมีปุ่มเดียวสำหรับทุกกฎ
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { Title, Text } from "@/components/ui/typography";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/toast";
import {
  MAIL_RULE_CONDITION_MAX,
  MAIL_RULE_FIELDS,
  MAIL_RULE_FIELD_LABELS,
  MAIL_RULE_MAX,
  MAIL_RULE_OPERATORS,
  MAIL_RULE_OPERATOR_LABELS,
  MAIL_RULE_VALUE_MAX,
} from "@/lib/mail/rule-meta";
import type {
  MailFolder,
  MailRule,
  MailRuleCondition,
  MailRuleField,
  MailRuleOperator,
  MailRulesResult,
  MailboxSummary,
} from "@/lib/mail/types";

function emptyRule(index: number): MailRule {
  return {
    id: `r${Date.now().toString(36)}${index}`,
    name: `กฎที่ ${index + 1}`,
    enabled: true,
    match: "all",
    conditions: [{ field: "from", op: "contains", value: "" }],
    moveToMailboxId: null,
    markRead: false,
    star: false,
    stop: false,
  };
}

export function MailRulesView() {
  const [rules, setRules] = useState<MailRule[]>([]);
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [mailboxes, setMailboxes] = useState<MailboxSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [foreignScript, setForeignScript] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * กฎที่กางอยู่ — ค่าเริ่มต้น "ยุบทุกใบ" เพราะกฎใบเดียวสูงเกือบเต็มจอ
   * (กฎ 10 ข้อ = ต้องเลื่อนหาเป็นนาที) · กฎที่เพิ่งเพิ่มจะกางให้เองเพราะยังไม่มีอะไรกรอก
   */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rulesRes, boxesRes] = await Promise.all([
        fetch("/api/mail/rules"),
        fetch("/api/mail/mailboxes"),
      ]);
      if (!rulesRes.ok) throw new Error("โหลดกฎกรองไม่สำเร็จ");
      const data = (await rulesRes.json()) as MailRulesResult;
      setRules(data.rules ?? []);
      setForeignScript(!!data.foreignScript);
      if (boxesRes.ok) {
        const b = (await boxesRes.json()) as {
          folders?: MailFolder[];
          mailboxes?: MailboxSummary[];
        };
        setFolders(b.folders ?? []);
        setMailboxes(b.mailboxes ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดกฎกรองไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** ปลายทางที่ย้ายได้ = โฟลเดอร์ของผู้ใช้ + จดหมายขยะ/ถังขยะ (สองอันหลังคือสิ่งที่คนอยากได้จริง) */
  const targetOptions = useMemo(() => {
    const system = mailboxes
      .filter((m) => m.key === "junk" || m.key === "trash")
      .map((m) => ({ value: m.id, label: m.name }));
    return [
      { value: "", label: "— ไม่ย้าย —" },
      ...folders.map((f) => ({ value: f.id, label: f.path })),
      ...system,
    ];
  }, [folders, mailboxes]);

  const addRule = useCallback(() => {
    setRules((prev) => {
      const rule = emptyRule(prev.length);
      // กฎใหม่ยังว่างเปล่า — ยุบไว้ก็ไม่มีประโยชน์ กางให้เลย
      setExpanded((ex) => new Set(ex).add(rule.id));
      return [...prev, rule];
    });
  }, []);

  const update = useCallback((index: number, patch: Partial<MailRule>) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }, []);

  const move = useCallback((index: number, delta: number) => {
    setRules((prev) => {
      const next = [...prev];
      const to = index + delta;
      if (to < 0 || to >= next.length) return prev;
      [next[index], next[to]] = [next[to]!, next[index]!];
      return next;
    });
  }, []);

  const save = useCallback(
    async (overwriteForeign = false) => {
      const invalid = rules.find((r) => r.conditions.every((c) => !c.value.trim()));
      if (invalid) {
        notify.error(null, `“${invalid.name}” ยังไม่ได้กรอกเงื่อนไข`);
        return;
      }
      setSaving(true);
      try {
        const res = await fetch("/api/mail/rules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rules, overwriteForeign }),
        });
        const data = (await res.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        if (res.status === 409 && data?.error === "mail_rules_foreign_script") {
          setForeignScript(true);
          notify.error(null, data.message ?? "มีกฎกรองเดิมอยู่");
          return;
        }
        if (!res.ok) throw new Error(data?.message ?? "บันทึกกฎกรองไม่สำเร็จ");
        setForeignScript(false);
        notify.saved("บันทึกกฎกรองแล้ว");
      } catch (e) {
        notify.error(e, "บันทึกกฎกรองไม่สำเร็จ");
      } finally {
        setSaving(false);
      }
    },
    [rules],
  );

  if (loading) {
    return (
      <div className="w-full space-y-3 py-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <Title as="h1" className="text-2xl font-semibold text-primary">
            กฎกรอง
          </Title>
          <Text className="mt-0.5 text-sm text-gray-500">
            จัดการอีเมลที่เข้ามาใหม่โดยอัตโนมัติ — ตรวจจากบนลงล่าง
          </Text>
        </div>
        {rules.length > 1 && (
          <Button
            variant="outline"
            onClick={() =>
              setExpanded((prev) =>
                prev.size === rules.length ? new Set() : new Set(rules.map((r) => r.id)),
              )
            }
          >
            {expanded.size === rules.length ? "ยุบทั้งหมด" : "กางทั้งหมด"}
          </Button>
        )}
        <Button
          variant="outline"
          disabled={rules.length >= MAIL_RULE_MAX}
          onClick={() => addRule()}
        >
          <Plus className="h-4 w-4" />
          เพิ่มกฎ
        </Button>
        <Button disabled={saving} onClick={() => void save(foreignScript)}>
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <Text className="text-sm text-red-700">{error}</Text>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => void load()}>
            ลองใหม่
          </Button>
        </div>
      )}

      {foreignScript && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <Text className="text-sm text-amber-800">
            กล่องเมลนี้มีกฎกรองเดิมที่ตั้งไว้จากที่อื่น (ไม่ได้สร้างจากหน้านี้) — กดบันทึกจะ
            <strong>เขียนทับทั้งหมด</strong> กรุณาตรวจกับผู้ดูแลก่อนถ้าไม่แน่ใจ
          </Text>
        </div>
      )}

      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-16 text-center">
          <Text className="text-sm font-medium text-gray-900">ยังไม่มีกฎกรอง</Text>
          <Text className="mt-1 text-sm text-gray-500">
            เช่น “ถ้าผู้ส่งมีคำว่า invoice ให้ย้ายไปโฟลเดอร์ ใบแจ้งหนี้”
          </Text>
          <Button className="mt-4" size="sm" onClick={() => addRule()}>
            <Plus className="h-4 w-4" />
            เพิ่มกฎแรก
          </Button>
        </div>
      ) : (
        rules.map((rule, index) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            index={index}
            total={rules.length}
            targetOptions={targetOptions}
            expanded={expanded.has(rule.id)}
            onToggleExpanded={() => toggleExpanded(rule.id)}
            onChange={(patch) => update(index, patch)}
            onMove={(delta) => move(index, delta)}
            onRemove={() => {
              // ต้องล้าง id ออกจากเซ็ตด้วย ไม่งั้นป้ายปุ่ม "กาง/ยุบทั้งหมด" นับผิดหลังลบ
              setExpanded((prev) => {
                const next = new Set(prev);
                next.delete(rule.id);
                return next;
              });
              setRules((prev) => prev.filter((_, i) => i !== index));
            }}
          />
        ))
      )}

      {rules.length > 0 && (
        <Text className="text-xs text-gray-500">
          กฎถูกตรวจจากบนลงล่าง · เมลที่ไม่ตรงกฎไหนเลยจะเข้ากล่องขาเข้าตามปกติ ·
          กฎมีผลกับอีเมลที่เข้ามา<strong>หลังบันทึก</strong>เท่านั้น (ไม่ย้อนหลัง)
        </Text>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  index,
  total,
  targetOptions,
  expanded,
  onToggleExpanded,
  onChange,
  onMove,
  onRemove,
}: {
  rule: MailRule;
  index: number;
  total: number;
  targetOptions: { value: string; label: string }[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (patch: Partial<MailRule>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const setCondition = (i: number, patch: Partial<MailRuleCondition>) => {
    onChange({
      conditions: rule.conditions.map((c, ci) => (ci === i ? { ...c, ...patch } : c)),
    });
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-xs font-medium tabular-nums text-gray-400">{index + 1}</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          aria-label={expanded ? "ยุบกฎนี้" : "กางกฎนี้"}
          aria-expanded={expanded}
          onClick={onToggleExpanded}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
        </Button>
        {expanded ? (
          <Input
            className="h-8 min-w-[10rem] flex-1"
            value={rule.name}
            maxLength={80}
            aria-label="ชื่อกฎ"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        ) : (
          /* ยุบอยู่ = อ่านอย่างเดียว กดที่บรรทัดนี้เพื่อกาง (แก้ชื่อได้เมื่อกางแล้ว) */
          <button
            type="button"
            onClick={onToggleExpanded}
            className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-start"
          >
            <span className="truncate text-sm font-medium text-gray-900">{rule.name}</span>
            <span className="min-w-0 truncate text-xs text-gray-500">
              {summarizeRule(rule, targetOptions)}
            </span>
          </button>
        )}
        <SegmentedControl
          value={rule.enabled ? "on" : "off"}
          onChange={(v) => onChange({ enabled: v === "on" })}
          ariaLabel="เปิดใช้งานกฎนี้"
          options={[
            { value: "on", label: "เปิด" },
            { value: "off", label: "ปิด" },
          ]}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="เลื่อนขึ้น"
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="เลื่อนลง"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8 border-red-200 text-red-600 hover:bg-red-50"
          aria-label="ลบกฎ"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-gray-500">ถ้า</Label>
            <SegmentedControl
              value={rule.match}
              onChange={(v) => onChange({ match: v === "any" ? "any" : "all" })}
              ariaLabel="เงื่อนไขต้องตรงแบบไหน"
              options={[
                { value: "all", label: "ตรงทุกข้อ" },
                { value: "any", label: "ตรงข้อใดข้อหนึ่ง" },
              ]}
            />
          </div>

          {rule.conditions.map((cond, ci) => (
            <div key={ci} className="flex flex-wrap items-center gap-2">
              <CustomSelect
                className="w-36"
                value={cond.field}
                onChange={(v) => setCondition(ci, { field: v as MailRuleField })}
                options={MAIL_RULE_FIELDS.map((f) => ({
                  value: f,
                  label: MAIL_RULE_FIELD_LABELS[f],
                }))}
              />
              <CustomSelect
                className="w-36"
                value={cond.op}
                onChange={(v) => setCondition(ci, { op: v as MailRuleOperator })}
                options={MAIL_RULE_OPERATORS.map((o) => ({
                  value: o,
                  label: MAIL_RULE_OPERATOR_LABELS[o],
                }))}
              />
              <Input
                className="min-w-[12rem] flex-1"
                value={cond.value}
                maxLength={MAIL_RULE_VALUE_MAX}
                placeholder="เช่น @exworker.co.th"
                aria-label="ค่าที่ใช้เทียบ"
                onChange={(e) => setCondition(ci, { value: e.target.value })}
              />
              {rule.conditions.length > 1 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  aria-label="เอาเงื่อนไขนี้ออก"
                  onClick={() =>
                    onChange({ conditions: rule.conditions.filter((_, i) => i !== ci) })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          {rule.conditions.length < MAIL_RULE_CONDITION_MAX && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onChange({
                  conditions: [...rule.conditions, { field: "from", op: "contains", value: "" }],
                })
              }
            >
              <Plus className="h-4 w-4" />
              เพิ่มเงื่อนไข
            </Button>
          )}

          <div className="border-t border-gray-200 pt-3">
            <Label className="text-xs text-gray-500">ให้</Label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600">ย้ายไป</span>
              <CustomSelect
                className="w-56"
                value={rule.moveToMailboxId ?? ""}
                onChange={(v) => onChange({ moveToMailboxId: v || null })}
                options={targetOptions}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <ToggleRow
                label="ทำเป็นอ่านแล้ว"
                value={rule.markRead}
                onChange={(v) => onChange({ markRead: v })}
              />
              <ToggleRow label="ติดดาว" value={rule.star} onChange={(v) => onChange({ star: v })} />
              <ToggleRow
                label="หยุดตรวจกฎถัดไป"
                value={rule.stop}
                onChange={(v) => onChange({ stop: v })}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** สรุปกฎเป็นบรรทัดเดียวสำหรับตอนยุบ — ต้องอ่านแล้วรู้ว่ากฎนี้ทำอะไรโดยไม่ต้องกาง */
function summarizeRule(rule: MailRule, targets: { value: string; label: string }[]): string {
  const joiner = rule.match === "any" ? " หรือ " : " และ ";
  const conditions = rule.conditions
    .filter((c) => c.value.trim())
    .map(
      (c) =>
        `${MAIL_RULE_FIELD_LABELS[c.field]}${MAIL_RULE_OPERATOR_LABELS[c.op]}“${c.value.trim()}”`,
    )
    .join(joiner);

  const actions: string[] = [];
  if (rule.moveToMailboxId) {
    const label = targets.find((t) => t.value === rule.moveToMailboxId)?.label;
    actions.push(`ย้ายไป ${label ?? "โฟลเดอร์ที่เลือก"}`);
  }
  if (rule.markRead) actions.push("ทำเป็นอ่านแล้ว");
  if (rule.star) actions.push("ติดดาว");
  if (rule.stop) actions.push("หยุดตรวจกฎถัดไป");

  if (!conditions) return "ยังไม่ได้กรอกเงื่อนไข";
  return `ถ้า ${conditions} → ${actions.length ? actions.join(" · ") : "ไม่ทำอะไร"}`;
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-sm text-gray-600">{label}</span>
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
    </span>
  );
}
