/**
 * กฎกรองอัตโนมัติ → สคริปต์ Sieve — **แหล่งเดียวที่ประกอบสคริปต์** (pure, มีเทสคุม)
 *
 * ทำไมไม่ให้ผู้ใช้พิมพ์ Sieve เอง: สคริปต์ที่ผิดทำให้เมล "หาย" แบบเงียบ ๆ และผู้ใช้ทั่วไป
 * อ่านไม่ออกว่ากฎไหนกินเมลไป ⇒ หน้าเว็บให้กรอกเป็นฟอร์ม "ถ้า…ให้…" แล้วเรา generate ที่นี่ที่เดียว
 * (ท่าเดียวกับ `lib/mail/dns-records.ts` ที่เป็นแหล่งเดียวของค่า DNS)
 *
 * เก็บนิยามกฎไว้ใน **บรรทัดคอมเมนต์บนหัวสคริปต์** (JSON เข้ารหัส base64 บรรทัดเดียว)
 * เพราะโซน `(mail)` ห้ามเก็บอะไรลง Supabase — เมลเซิร์ฟเวอร์ต้องเป็นที่เดียวที่ถือข้อมูล
 * สคริปต์ที่ไม่มีบรรทัดนี้ = คนอื่นเขียนไว้ ⇒ ห้ามเขียนทับเงียบ ๆ (`parseSieveScript` บอกให้รู้)
 */

import {
  MAIL_RULE_CONDITION_MAX,
  MAIL_RULE_FIELDS,
  MAIL_RULE_MAX,
  MAIL_RULE_OPERATORS,
  MAIL_RULE_VALUE_MAX,
} from "./rule-meta";
import type {
  MailRule,
  MailRuleCondition,
  MailRuleField,
  MailRuleMatch,
  MailRuleOperator,
} from "./types";

/** ชื่อสคริปต์เดียวที่หน้านี้เป็นเจ้าของ — ตัวอื่นบนเซิร์ฟเวอร์เราไม่แตะ */
export const MAIL_SIEVE_SCRIPT_NAME = "perpos";

export const MAIL_SIEVE_MARKER = "# PERPOS-RULES-V1 ";

// ─── ประกอบสคริปต์ ───────────────────────────────────────────────────────────

const BACKSLASH = String.fromCharCode(92);
const DOUBLE_QUOTE = String.fromCharCode(34);

/**
 * ค่าที่ผู้ใช้พิมพ์ทุกตัวต้องผ่านตัวนี้ก่อนเข้าสคริปต์
 * — `"` และ `\` ต้อง escape · อักขระควบคุม (รวมขึ้นบรรทัดใหม่) ตัดทิ้ง
 *   ไม่งั้นพิมพ์ `"; discard; #` แล้วแทรกคำสั่งลบเมลเข้าสคริปต์ได้
 */
export function escapeSieveString(raw: string): string {
  return Array.from(raw)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .map((ch) => (ch === BACKSLASH || ch === DOUBLE_QUOTE ? BACKSLASH + ch : ch))
    .join("");
}

function quoted(raw: string): string {
  return `${DOUBLE_QUOTE}${escapeSieveString(raw)}${DOUBLE_QUOTE}`;
}

function conditionTest(cond: MailRuleCondition): string {
  const header = quoted(cond.field);
  const value = quoted(cond.value);
  if (cond.op === "is") return `header :is ${header} ${value}`;
  if (cond.op === "not_contains") return `not header :contains ${header} ${value}`;
  return `header :contains ${header} ${value}`;
}

function ruleBlock(rule: MailRule, folderPathById: Record<string, string>): string[] {
  const tests = rule.conditions.filter((c) => c.value.trim().length > 0).map(conditionTest);
  if (tests.length === 0) return [];

  const actions: string[] = [];
  if (rule.markRead) actions.push(`setflag "${BACKSLASH}${BACKSLASH}Seen";`);
  if (rule.star) actions.push(`addflag "${BACKSLASH}${BACKSLASH}Flagged";`);
  if (rule.moveToMailboxId) {
    const path = folderPathById[rule.moveToMailboxId];
    // ปลายทางหายไปแล้ว (ผู้ใช้ลบโฟลเดอร์) → ข้ามการย้าย ดีกว่าปล่อยให้ Sieve พังทั้งสคริปต์
    if (path) actions.push(`fileinto ${quoted(path)};`);
  }
  if (rule.stop) actions.push("stop;");
  if (actions.length === 0) return [];

  const test =
    tests.length === 1
      ? tests[0]!
      : `${rule.match === "any" ? "anyof" : "allof"} (${tests.join(", ")})`;

  return [
    `# ${escapeSieveString(rule.name).split(DOUBLE_QUOTE).join("")}`,
    `if ${test} {`,
    ...actions.map((a) => `  ${a}`),
    "}",
  ];
}

/**
 * กฎ → สคริปต์ Sieve พร้อมใช้
 * `folderPathById` = path เต็มของทุก mailbox (จาก `folders.mailboxPathById`) — id ใช้กับ `fileinto` ไม่ได้
 */
export function buildSieveScript(
  rules: MailRule[],
  folderPathById: Record<string, string>,
): string {
  const payload = Buffer.from(JSON.stringify(rules), "utf8").toString("base64");
  const lines: string[] = [
    `${MAIL_SIEVE_MARKER}${payload}`,
    "# สคริปต์นี้สร้างโดย PERPOS Mail อัตโนมัติ — แก้ผ่านหน้า “กฎกรอง” เท่านั้น",
    `require ["fileinto", "imap4flags"];`,
    "",
  ];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const block = ruleBlock(rule, folderPathById);
    if (block.length === 0) continue;
    lines.push(...block, "");
  }
  return `${lines.join("\n")}\n`;
}

// ─── อ่านกลับ ────────────────────────────────────────────────────────────────

function asString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** ค่าที่อ่านกลับมาจากเซิร์ฟเวอร์ = ข้อมูลภายนอก ต้องตรวจรูปแบบทีละช่องเสมอ */
export function normalizeRule(raw: unknown, index: number): MailRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const conditions: MailRuleCondition[] = (Array.isArray(r.conditions) ? r.conditions : [])
    .slice(0, MAIL_RULE_CONDITION_MAX)
    .map((c) => {
      const obj = (c ?? {}) as Record<string, unknown>;
      const field = MAIL_RULE_FIELDS.includes(obj.field as MailRuleField)
        ? (obj.field as MailRuleField)
        : "from";
      const op = MAIL_RULE_OPERATORS.includes(obj.op as MailRuleOperator)
        ? (obj.op as MailRuleOperator)
        : "contains";
      return { field, op, value: asString(obj.value, MAIL_RULE_VALUE_MAX).trim() };
    })
    .filter((c) => c.value.length > 0);
  if (conditions.length === 0) return null;

  const moveTo = asString(r.moveToMailboxId, 128).trim();
  return {
    id: asString(r.id, 64) || `rule-${index + 1}`,
    name: asString(r.name, 80).trim() || `กฎที่ ${index + 1}`,
    enabled: r.enabled !== false,
    match: (r.match === "any" ? "any" : "all") as MailRuleMatch,
    conditions,
    moveToMailboxId: moveTo || null,
    markRead: r.markRead === true,
    star: r.star === true,
    stop: r.stop === true,
  };
}

export function normalizeRules(raw: unknown): MailRule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAIL_RULE_MAX)
    .map((r, i) => normalizeRule(r, i))
    .filter((r): r is MailRule => r !== null);
}

export interface ParsedSieve {
  rules: MailRule[];
  /** สคริปต์มีเนื้อหาแต่ไม่มีเครื่องหมายของเรา = ของคนอื่น ห้ามเขียนทับเงียบ ๆ */
  foreign: boolean;
}

export function parseSieveScript(script: string | null): ParsedSieve {
  const text = (script ?? "").trim();
  if (!text) return { rules: [], foreign: false };

  const line = text.split("\n").find((l) => l.startsWith(MAIL_SIEVE_MARKER));
  if (!line) return { rules: [], foreign: true };

  try {
    const json = Buffer.from(line.slice(MAIL_SIEVE_MARKER.length).trim(), "base64").toString(
      "utf8",
    );
    return { rules: normalizeRules(JSON.parse(json)), foreign: false };
  } catch {
    // เครื่องหมายมีแต่เนื้อในพัง — ถือว่าเป็นของเราแต่ว่างเปล่า (ผู้ใช้ตั้งกฎใหม่ทับได้)
    return { rules: [], foreign: false };
  }
}
