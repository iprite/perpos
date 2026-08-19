import { describe, expect, it } from "vitest";

import { MAIL_LIST_WIDTH_DEFAULT, MAIL_LIST_WIDTH_MAX, MAIL_LIST_WIDTH_MIN } from "./prefs-storage";
import { MAIL_PREFS_DEFAULT, normalizeMailPrefs } from "./prefs";

describe("normalizeMailPrefs", () => {
  it("รับเฉพาะค่าที่รู้จัก", () => {
    expect(normalizeMailPrefs({ pane: "list", listWidth: 420 })).toEqual({
      pane: "list",
      listWidth: 420,
    });
    expect(normalizeMailPrefs({ pane: "split" })).toEqual({
      pane: "split",
      listWidth: MAIL_LIST_WIDTH_DEFAULT,
    });
  });

  it("ไฟล์ที่ผู้ใช้/ไคลเอนต์อื่นแก้จนเพี้ยน → ค่าเริ่มต้น ไม่โยน", () => {
    for (const raw of [null, undefined, 42, "list", [], { pane: "weird" }, { pane: 1 }]) {
      expect(normalizeMailPrefs(raw)).toEqual(MAIL_PREFS_DEFAULT);
    }
  });

  it("ความกว้างคอลัมน์รายการถูกบีบเข้ากรอบเสมอ", () => {
    expect(normalizeMailPrefs({ listWidth: 10 }).listWidth).toBe(MAIL_LIST_WIDTH_MIN);
    expect(normalizeMailPrefs({ listWidth: 9999 }).listWidth).toBe(MAIL_LIST_WIDTH_MAX);
    expect(normalizeMailPrefs({ listWidth: 400.6 }).listWidth).toBe(401);
    for (const bad of [null, "400", NaN, Infinity, {}]) {
      expect(normalizeMailPrefs({ listWidth: bad }).listWidth).toBe(MAIL_LIST_WIDTH_DEFAULT);
    }
  });

  it("ค่าเริ่มต้นคือ split (บานอ่านคู่กับรายการ) กว้าง 380px", () => {
    expect(MAIL_PREFS_DEFAULT).toEqual({ pane: "split", listWidth: MAIL_LIST_WIDTH_DEFAULT });
  });
});
