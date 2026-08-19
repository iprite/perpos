"use client";

/**
 * กฎกรองอัตโนมัติ (M3) — ฟอร์ม "ถ้า…ให้…"
 *
 * ผู้ใช้ไม่เคยเห็นภาษา Sieve เลยโดยตั้งใจ — สคริปต์ถูกประกอบที่ `lib/mail/sieve.ts` ที่เดียว
 * (สคริปต์ที่ผิดทำให้เมลหายเงียบ ๆ และผู้ใช้ทั่วไปตรวจเองไม่ได้)
 *
 * บันทึก = เขียนทั้งชุดทับของเดิมเสมอ ⇒ ปุ่มบันทึกมีปุ่มเดียวสำหรับทุกกฎ
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Plus,
  Trash2,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { Title, Text } from "@/components/ui/typography";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/toast";
import { useMailLocale, useMailT } from "@/components/mail/mail-locale";
import type { MailLocale, MailTranslate } from "@/lib/mail/i18n";
import {
  MAIL_RULE_CONDITION_MAX,
  MAIL_RULE_FIELDS,
  MAIL_RULE_FIELD_LABELS_BY_LOCALE,
  MAIL_RULE_MAX,
  MAIL_RULE_OPERATORS,
  MAIL_RULE_OPERATOR_LABELS_BY_LOCALE,
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

function emptyRule(index: number, t: MailTranslate): MailRule {
  return {
    id: `r${Date.now().toString(36)}${index}`,
    name: t("rules.defaultName", { n: index + 1 }),
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
  const { locale, t } = useMailLocale();
  /** ให้ `load` อ่าน t ล่าสุดโดยไม่ต้องพึ่ง dependency — สลับภาษาแล้วต้องไม่ดึงกฎใหม่ทับที่ยังไม่บันทึก */
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
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
      if (!rulesRes.ok) throw new Error(tRef.current("rules.load.failed"));
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
      setError(e instanceof Error ? e.message : tRef.current("rules.load.failed"));
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
      { value: "", label: t("rules.target.none") },
      ...folders.map((f) => ({ value: f.id, label: f.path })),
      ...system,
    ];
  }, [folders, mailboxes, t]);

  const addRule = useCallback(() => {
    setRules((prev) => {
      const rule = emptyRule(prev.length, t);
      // กฎใหม่ยังว่างเปล่า — ยุบไว้ก็ไม่มีประโยชน์ กางให้เลย
      setExpanded((ex) => new Set(ex).add(rule.id));
      return [...prev, rule];
    });
  }, [t]);

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
        notify.error(null, t("rules.validation.emptyCondition", { name: invalid.name }));
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
          notify.error(null, data.message ?? t("rules.save.foreignExists"));
          return;
        }
        if (!res.ok) throw new Error(data?.message ?? t("rules.save.failed"));
        setForeignScript(false);
        notify.saved(t("rules.save.done"));
      } catch (e) {
        notify.error(e, t("rules.save.failed"));
      } finally {
        setSaving(false);
      }
    },
    [rules, t],
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

  const allExpanded = rules.length > 0 && expanded.size === rules.length;
  const collapseLabel = allExpanded ? t("rules.collapseAll") : t("rules.expandAll");
  const saveLabel = saving ? t("common.saving") : t("common.save");

  return (
    <div className="w-full space-y-4 py-4">
      {/* หัวเรื่องกับปุ่มอยู่คนละบรรทัดบนมือถือ — ก่อนหน้านี้ปุ่มบีบคอลัมน์หัวเรื่องจนคำอธิบาย
          ตกบรรทัดละ 2–3 คำ · จอแคบปุ่มเหลือแต่ไอคอน (ป้ายยังอยู่ครบใน aria-label/title) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Title as="h1" className="text-2xl font-semibold text-primary">
            {t("rules.title")}
          </Title>
          <Text className="mt-0.5 text-sm text-gray-500">{t("rules.subtitle")}</Text>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {rules.length > 1 && (
            <Button
              variant="outline"
              className="w-9 px-0 sm:w-auto sm:px-4"
              title={collapseLabel}
              aria-label={collapseLabel}
              onClick={() =>
                setExpanded((prev) =>
                  prev.size === rules.length ? new Set() : new Set(rules.map((r) => r.id)),
                )
              }
            >
              {allExpanded ? (
                <ChevronsDownUp className="h-4 w-4" />
              ) : (
                <ChevronsUpDown className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">{collapseLabel}</span>
            </Button>
          )}
          <Button
            variant="outline"
            className="w-9 px-0 sm:w-auto sm:px-4"
            disabled={rules.length >= MAIL_RULE_MAX}
            title={t("rules.add")}
            aria-label={t("rules.add")}
            onClick={() => addRule()}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t("rules.add")}</span>
          </Button>
          <Button
            className="ms-auto w-9 px-0 sm:ms-0 sm:w-auto sm:px-4"
            disabled={saving}
            title={saveLabel}
            aria-label={saveLabel}
            onClick={() => void save(foreignScript)}
          >
            <Check className="h-4 w-4" />
            <span className="hidden sm:inline">{saveLabel}</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <Text className="text-sm text-red-700">{error}</Text>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        </div>
      )}

      {foreignScript && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <Text className="text-sm text-amber-800">
            {t("rules.foreign.warning.before")}
            <strong>{t("rules.foreign.warning.strong")}</strong>
            {t("rules.foreign.warning.after")}
          </Text>
        </div>
      )}

      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-16 text-center">
          <Text className="text-sm font-medium text-gray-900">{t("rules.empty.title")}</Text>
          <Text className="mt-1 text-sm text-gray-500">{t("rules.empty.example")}</Text>
          <Button className="mt-4" size="sm" onClick={() => addRule()}>
            <Plus className="h-4 w-4" />
            {t("rules.empty.addFirst")}
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
            locale={locale}
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
          {t("rules.footer.before")}
          <strong>{t("rules.footer.strong")}</strong>
          {t("rules.footer.after")}
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
  locale,
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
  locale: MailLocale;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (patch: Partial<MailRule>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const t = useMailT();
  const fieldLabels = MAIL_RULE_FIELD_LABELS_BY_LOCALE[locale];
  const operatorLabels = MAIL_RULE_OPERATOR_LABELS_BY_LOCALE[locale];
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
          aria-label={expanded ? t("rules.card.collapse") : t("rules.card.expand")}
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
            aria-label={t("rules.card.name")}
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
              {summarizeRule(rule, targetOptions, locale, t)}
            </span>
          </button>
        )}
        <SegmentedControl
          value={rule.enabled ? "on" : "off"}
          onChange={(v) => onChange({ enabled: v === "on" })}
          ariaLabel={t("rules.card.enabledAria")}
          options={[
            { value: "on", label: t("rules.on") },
            { value: "off", label: t("rules.off") },
          ]}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label={t("rules.card.moveUp")}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label={t("rules.card.moveDown")}
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8 border-red-200 text-red-600 hover:bg-red-50"
          aria-label={t("rules.card.remove")}
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-gray-500">{t("rules.if")}</Label>
            <SegmentedControl
              value={rule.match}
              onChange={(v) => onChange({ match: v === "any" ? "any" : "all" })}
              ariaLabel={t("rules.match.aria")}
              options={[
                { value: "all", label: t("rules.match.all") },
                { value: "any", label: t("rules.match.any") },
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
                  label: fieldLabels[f],
                }))}
              />
              <CustomSelect
                className="w-36"
                value={cond.op}
                onChange={(v) => setCondition(ci, { op: v as MailRuleOperator })}
                options={MAIL_RULE_OPERATORS.map((o) => ({
                  value: o,
                  label: operatorLabels[o],
                }))}
              />
              <Input
                className="min-w-[12rem] flex-1"
                value={cond.value}
                maxLength={MAIL_RULE_VALUE_MAX}
                placeholder={t("rules.condition.placeholder")}
                aria-label={t("rules.condition.valueAria")}
                onChange={(e) => setCondition(ci, { value: e.target.value })}
              />
              {rule.conditions.length > 1 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  aria-label={t("rules.condition.remove")}
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
              {t("rules.condition.add")}
            </Button>
          )}

          <div className="border-t border-gray-200 pt-3">
            <Label className="text-xs text-gray-500">{t("rules.then")}</Label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600">{t("rules.action.moveTo")}</span>
              <CustomSelect
                className="w-56"
                value={rule.moveToMailboxId ?? ""}
                onChange={(v) => onChange({ moveToMailboxId: v || null })}
                options={targetOptions}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <ToggleRow
                label={t("rules.action.markRead")}
                value={rule.markRead}
                onChange={(v) => onChange({ markRead: v })}
              />
              <ToggleRow
                label={t("rules.action.star")}
                value={rule.star}
                onChange={(v) => onChange({ star: v })}
              />
              <ToggleRow
                label={t("rules.action.stop")}
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
function summarizeRule(
  rule: MailRule,
  targets: { value: string; label: string }[],
  locale: MailLocale,
  t: MailTranslate,
): string {
  const fieldLabels = MAIL_RULE_FIELD_LABELS_BY_LOCALE[locale];
  const operatorLabels = MAIL_RULE_OPERATOR_LABELS_BY_LOCALE[locale];
  const joiner = rule.match === "any" ? t("rules.summary.or") : t("rules.summary.and");
  const conditions = rule.conditions
    .filter((c) => c.value.trim())
    .map((c) =>
      t("rules.summary.condition", {
        field: fieldLabels[c.field],
        op: operatorLabels[c.op],
        value: c.value.trim(),
      }),
    )
    .join(joiner);

  const actions: string[] = [];
  if (rule.moveToMailboxId) {
    const label = targets.find((tg) => tg.value === rule.moveToMailboxId)?.label;
    actions.push(t("rules.summary.moveTo", { target: label ?? t("rules.summary.selectedFolder") }));
  }
  if (rule.markRead) actions.push(t("rules.action.markRead"));
  if (rule.star) actions.push(t("rules.action.star"));
  if (rule.stop) actions.push(t("rules.action.stop"));

  if (!conditions) return t("rules.summary.noCondition");
  return t("rules.summary.line", {
    conditions,
    actions: actions.length ? actions.join(" · ") : t("rules.summary.noAction"),
  });
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
  const t = useMailT();
  return (
    <span className="flex items-center gap-2">
      <span className="text-sm text-gray-600">{label}</span>
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
    </span>
  );
}
