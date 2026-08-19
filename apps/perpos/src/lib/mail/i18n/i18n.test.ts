import { describe, expect, it } from "vitest";

import { MAIL_MESSAGES, normalizeMailLocale, translateMail } from "./index";

describe("mail i18n", () => {
  it("ทุกคีย์มีทั้ง th/en ไม่ว่าง และคีย์ขึ้นต้นด้วยชื่อพื้นที่", () => {
    const keys = Object.keys(MAIL_MESSAGES);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const entry = MAIL_MESSAGES[key as keyof typeof MAIL_MESSAGES];
      expect(entry.th.trim(), key).not.toBe("");
      expect(entry.en.trim(), key).not.toBe("");
      expect(key, key).toMatch(
        /^(common|shell|account|login|workspace|list|reader|compose|rules|preview)\./,
      );
    }
  });

  it("ตัวแปร {name} ที่อ้างใน th ต้องมีใน en ด้วย (ไม่งั้นแปลแล้วข้อมูลหาย)", () => {
    const vars = (s: string) => Array.from(s.matchAll(/\{(\w+)\}/g), (m) => m[1]).sort();
    for (const [key, entry] of Object.entries(MAIL_MESSAGES)) {
      expect(vars(entry.en), key).toEqual(vars(entry.th));
    }
  });

  it("แทนที่ตัวแปร + ภาษาที่ไม่รู้จัก → ไทย", () => {
    expect(normalizeMailLocale("en")).toBe("en");
    expect(normalizeMailLocale("fr")).toBe("th");
    expect(normalizeMailLocale(undefined)).toBe("th");
    expect(translateMail("th", "common.save")).toBe("บันทึก");
    expect(translateMail("en", "common.save")).toBe("Save");
  });
});
