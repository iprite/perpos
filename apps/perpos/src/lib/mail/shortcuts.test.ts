import { describe, expect, it } from "vitest";

import {
  MAIL_SHORTCUTS,
  formatDisplayKeys,
  mailShortcutRows,
  shouldFireShortcut,
} from "./shortcuts";

describe("registry คีย์ลัด M1", () => {
  it("ครบทุกคีย์ตาม UI_SPEC §3 (เฉพาะที่ทำงานจริงใน M1)", () => {
    const actions = MAIL_SHORTCUTS.map((s) => s.action).sort();
    expect(actions).toEqual(
      [
        "archive",
        "close",
        "gotoInbox",
        "help",
        "markUnread",
        "next",
        "open",
        "prev",
        "search",
        "selectToggle",
        "star",
        "trash",
      ].sort(),
    );
  });

  it("ยังไม่ผูกคีย์ของ M2 (c r a f)", () => {
    const keys = MAIL_SHORTCUTS.map((s) => s.keys);
    expect(keys).not.toContain("c");
    expect(keys).not.toContain("r");
    expect(keys).not.toContain("f");
  });

  it("ตาราง `?` เรนเดอร์จาก registry ตัวเดียวกับที่ผูก handler", () => {
    expect(mailShortcutRows()).toBe(MAIL_SHORTCUTS);
    expect(MAIL_SHORTCUTS.every((s) => s.label.length > 0 && s.display.length > 0)).toBe(true);
  });

  it("g i ผูกเป็น sequence g>i (ไม่ใช่กดพร้อมกัน)", () => {
    const goto = MAIL_SHORTCUTS.find((s) => s.action === "gotoInbox");
    expect(goto?.keys).toBe("g>i");
    expect(goto?.display).toEqual(["g", "i"]);
  });
});

describe("formatDisplayKeys", () => {
  it("mac ได้ ⌘ ⇧ ↵ ⌫ · windows ได้ Ctrl Shift Enter Backspace", () => {
    const tokens = ["mod", "shift", "enter", "backspace"];
    expect(formatDisplayKeys(tokens, "mac")).toEqual(["⌘", "⇧", "↵", "⌫"]);
    expect(formatDisplayKeys(tokens, "win")).toEqual(["Ctrl", "Shift", "Enter", "Backspace"]);
  });

  it("ปุ่มธรรมดาไม่ถูกแปลง", () => {
    expect(formatDisplayKeys(["j", "#"], "mac")).toEqual(["j", "#"]);
  });
});

describe("ปิดคีย์ลัดขณะพิมพ์", () => {
  it("พิมพ์ใน input/textarea/contenteditable แล้วไม่ยิง e/#/s", () => {
    expect(shouldFireShortcut({ tagName: "INPUT" })).toBe(false);
    expect(shouldFireShortcut({ tagName: "TEXTAREA" })).toBe(false);
    expect(shouldFireShortcut({ tagName: "DIV", isContentEditable: true })).toBe(false);
  });

  it("อยู่นอกช่องพิมพ์ยังยิงได้", () => {
    expect(shouldFireShortcut({ tagName: "DIV" })).toBe(true);
    expect(shouldFireShortcut(null)).toBe(true);
  });
});
