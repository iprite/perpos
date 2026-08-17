import { describe, expect, it } from "vitest";

import {
  MAIL_SIEVE_MARKER,
  buildSieveScript,
  escapeSieveString,
  normalizeRules,
  parseSieveScript,
} from "./sieve";
import type { MailRule } from "./types";

const PATHS = { fid: "งาน/ลูกค้า", trash: "Deleted Items" };

function rule(patch: Partial<MailRule> = {}): MailRule {
  return {
    id: "r1",
    name: "ใบแจ้งหนี้",
    enabled: true,
    match: "all",
    conditions: [{ field: "from", op: "contains", value: "billing@acme.com" }],
    moveToMailboxId: "fid",
    markRead: false,
    star: false,
    stop: false,
    ...patch,
  };
}

describe("escapeSieveString", () => {
  it('escape เครื่องหมาย " และ \\ (กันแทรกคำสั่งเข้าสคริปต์)', () => {
    expect(escapeSieveString('a"b')).toBe('a\\"b');
    expect(escapeSieveString("a\\b")).toBe("a\\\\b");
  });

  it("ตัดอักขระควบคุม/ขึ้นบรรทัดใหม่ทิ้ง", () => {
    expect(escapeSieveString("a\nb\tc")).toBe("abc");
  });

  it("ค่าที่จงใจปิดสตริงแล้วต่อคำสั่ง ต้องกลายเป็นข้อความล้วน", () => {
    const script = buildSieveScript(
      [rule({ conditions: [{ field: "from", op: "contains", value: '"; discard; #' }] })],
      PATHS,
    );
    expect(script).not.toMatch(/^\s*discard;/m);
    expect(script).toContain('\\"; discard; #');
  });
});

describe("buildSieveScript", () => {
  it("ประกอบ require + เงื่อนไข + การกระทำ", () => {
    const script = buildSieveScript([rule({ markRead: true, star: true, stop: true })], PATHS);
    expect(script).toContain('require ["fileinto", "imap4flags"];');
    expect(script).toContain('header :contains "from" "billing@acme.com"');
    expect(script).toContain('fileinto "งาน/ลูกค้า";');
    expect(script).toContain('setflag "\\\\Seen";');
    expect(script).toContain('addflag "\\\\Flagged";');
    expect(script).toContain("stop;");
  });

  it("หลายเงื่อนไข → allof / anyof ตามที่เลือก", () => {
    const conditions = [
      { field: "from" as const, op: "contains" as const, value: "a" },
      { field: "subject" as const, op: "is" as const, value: "b" },
    ];
    expect(buildSieveScript([rule({ conditions })], PATHS)).toContain("allof (");
    expect(buildSieveScript([rule({ conditions, match: "any" })], PATHS)).toContain("anyof (");
  });

  it("`ไม่มีคำว่า` = not header :contains", () => {
    const script = buildSieveScript(
      [rule({ conditions: [{ field: "subject", op: "not_contains", value: "spam" }] })],
      PATHS,
    );
    expect(script).toContain('not header :contains "subject" "spam"');
  });

  it("กฎที่ปิดอยู่ไม่ถูกใส่ในสคริปต์ (แต่ยังเก็บไว้ในนิยาม)", () => {
    const script = buildSieveScript([rule({ enabled: false })], PATHS);
    expect(script).not.toContain('fileinto "');
    expect(parseSieveScript(script).rules).toHaveLength(1);
  });

  it("ปลายทางที่ไม่มี path แล้ว (โฟลเดอร์ถูกลบ) → ไม่ออก fileinto ลอย ๆ", () => {
    const script = buildSieveScript([rule({ moveToMailboxId: "gone" })], PATHS);
    expect(script).not.toContain('fileinto "');
  });
});

describe("parseSieveScript", () => {
  it("อ่านกฎกลับมาได้ครบ (round-trip)", () => {
    const rules = [rule(), rule({ id: "r2", name: "ข่าวสาร", match: "any", star: true })];
    const parsed = parseSieveScript(buildSieveScript(rules, PATHS));
    expect(parsed.foreign).toBe(false);
    expect(parsed.rules).toEqual(rules);
  });

  it("สคริปต์ว่าง = ไม่มีกฎ และไม่ใช่ของคนอื่น", () => {
    expect(parseSieveScript(null)).toEqual({ rules: [], foreign: false });
    expect(parseSieveScript("   ")).toEqual({ rules: [], foreign: false });
  });

  it("สคริปต์ที่ไม่มีเครื่องหมายของเรา = ของคนอื่น (ห้ามเขียนทับเงียบ ๆ)", () => {
    const parsed = parseSieveScript('require ["fileinto"];\nkeep;\n');
    expect(parsed.foreign).toBe(true);
    expect(parsed.rules).toHaveLength(0);
  });

  it("เครื่องหมายมีแต่เนื้อในพัง → ถือว่าเป็นของเราแต่ว่างเปล่า", () => {
    const parsed = parseSieveScript(`${MAIL_SIEVE_MARKER}!!!not-base64!!!\nkeep;\n`);
    expect(parsed.foreign).toBe(false);
    expect(parsed.rules).toHaveLength(0);
  });
});

describe("normalizeRules", () => {
  it("ตัดกฎที่ไม่มีเงื่อนไขที่กรอกค่าแล้วทิ้ง", () => {
    expect(normalizeRules([{ conditions: [{ field: "from", value: "  " }] }])).toHaveLength(0);
  });

  it("ค่าที่ไม่รู้จักตกกลับเป็นค่าเริ่มต้น ไม่โยน", () => {
    const [r] = normalizeRules([
      { conditions: [{ field: "evil", op: "regex", value: "x" }], match: "weird" },
    ]);
    expect(r?.conditions[0]).toEqual({ field: "from", op: "contains", value: "x" });
    expect(r?.match).toBe("all");
  });
});
