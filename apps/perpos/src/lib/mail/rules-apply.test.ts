import { describe, expect, it } from "vitest";

import { buildRuleQueryFilter } from "./rules-apply";
import type { MailRule } from "./types";

function rule(patch: Partial<MailRule> = {}): MailRule {
  return {
    id: "r1",
    name: "test",
    enabled: true,
    match: "all",
    conditions: [{ field: "from", op: "contains", value: "a@b.c" }],
    moveToMailboxId: null,
    markRead: false,
    star: false,
    stop: false,
    ...patch,
  };
}

describe("buildRuleQueryFilter — ต้องจำกัดอยู่ในกล่องขาเข้าเสมอ", () => {
  it("เงื่อนไขเดียว → AND กับ inMailbox", () => {
    expect(buildRuleQueryFilter(rule(), "INBOX")).toEqual({
      operator: "AND",
      conditions: [{ inMailbox: "INBOX" }, { from: "a@b.c" }],
    });
  });

  it("หลายเงื่อนไข + match any → OR ข้างใน แต่ inbox ยังเป็น AND ชั้นนอก", () => {
    const filter = buildRuleQueryFilter(
      rule({
        match: "any",
        conditions: [
          { field: "from", op: "contains", value: "a@b.c" },
          { field: "subject", op: "contains", value: "ใบแจ้งหนี้" },
        ],
      }),
      "INBOX",
    );
    expect(filter).toEqual({
      operator: "AND",
      conditions: [
        { inMailbox: "INBOX" },
        {
          operator: "OR",
          conditions: [{ from: "a@b.c" }, { subject: "ใบแจ้งหนี้" }],
        },
      ],
    });
  });

  it("not_contains → ห่อด้วย NOT", () => {
    const filter = buildRuleQueryFilter(
      rule({ conditions: [{ field: "subject", op: "not_contains", value: "spam" }] }),
      "INBOX",
    );
    expect(filter).toEqual({
      operator: "AND",
      conditions: [{ inMailbox: "INBOX" }, { operator: "NOT", conditions: [{ subject: "spam" }] }],
    });
  });

  it("กฎที่ทำแค่ 'อ่านแล้ว' ต้องตัดฉบับที่อ่านแล้วออก (ไม่งั้นวนซ้ำที่เดิมทุกครั้ง)", () => {
    const filter = buildRuleQueryFilter(rule({ markRead: true }), "INBOX");
    expect(filter).toEqual({
      operator: "AND",
      conditions: [{ inMailbox: "INBOX" }, { from: "a@b.c" }, { notKeyword: "$seen" }],
    });
  });

  it("ทำหลายอย่าง (อ่านแล้ว+ติดดาว) = ยังค้างถ้าขาดอย่างใดอย่างหนึ่ง", () => {
    const filter = buildRuleQueryFilter(rule({ markRead: true, star: true }), "INBOX") as {
      conditions: Record<string, unknown>[];
    };
    expect(filter.conditions[2]).toEqual({
      operator: "OR",
      conditions: [
        { notKeyword: "$seen" },
        { operator: "NOT", conditions: [{ hasKeyword: "$flagged" }] },
      ],
    });
  });

  it("กฎที่ย้ายกล่อง ไม่ต้องมีเงื่อนไขกันซ้ำ (ย้ายแล้วหลุดจาก inbox เอง)", () => {
    const filter = buildRuleQueryFilter(
      rule({ moveToMailboxId: "F1", markRead: true }),
      "INBOX",
    ) as { conditions: Record<string, unknown>[] };
    expect(filter.conditions).toHaveLength(2);
  });

  it("ปลายทางเป็นกล่องขาเข้าเอง = โยน (ย้ายแล้วยังตรงเงื่อนไขอยู่ดี)", () => {
    expect(() => buildRuleQueryFilter(rule({ moveToMailboxId: "INBOX" }), "INBOX")).toThrow();
  });

  it("เงื่อนไข “ตรงกับ” ต้องถูกปฏิเสธ — JMAP ไม่มี exact match จะย้ายเมลที่ Sieve ไม่แตะ", () => {
    expect(() =>
      buildRuleQueryFilter(
        rule({ conditions: [{ field: "from", op: "is", value: "a@b.c" }] }),
        "INBOX",
      ),
    ).toThrow();
  });

  it("เงื่อนไขที่ค่าว่างถูกตัดทิ้ง — ไม่มีเหลือเลย = โยน (กันกฎที่จับเมลทั้งกล่อง)", () => {
    expect(() =>
      buildRuleQueryFilter(
        rule({ conditions: [{ field: "from", op: "contains", value: "  " }] }),
        "INBOX",
      ),
    ).toThrow();
  });
});
