import { describe, expect, it } from "vitest";

import { MAIL_PREFS_DEFAULT, normalizeMailPrefs } from "./prefs";

describe("normalizeMailPrefs", () => {
  it("รับเฉพาะค่าที่รู้จัก", () => {
    expect(normalizeMailPrefs({ pane: "list" })).toEqual({ pane: "list" });
    expect(normalizeMailPrefs({ pane: "split" })).toEqual({ pane: "split" });
  });

  it("ไฟล์ที่ผู้ใช้/ไคลเอนต์อื่นแก้จนเพี้ยน → ค่าเริ่มต้น ไม่โยน", () => {
    for (const raw of [null, undefined, 42, "list", [], { pane: "weird" }, { pane: 1 }]) {
      expect(normalizeMailPrefs(raw)).toEqual(MAIL_PREFS_DEFAULT);
    }
  });

  it("ค่าเริ่มต้นคือ split (บานอ่านคู่กับรายการ)", () => {
    expect(MAIL_PREFS_DEFAULT).toEqual({ pane: "split" });
  });
});
