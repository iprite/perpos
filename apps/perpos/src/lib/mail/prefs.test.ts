import { describe, expect, it } from "vitest";

import {
  MAIL_LIST_WIDTH_DEFAULT,
  MAIL_LIST_WIDTH_MAX,
  MAIL_LIST_WIDTH_MIN,
  MAIL_SIGNATURE_MAX,
} from "./prefs-storage";
import { MAIL_PREFS_DEFAULT, normalizeMailPrefs } from "./prefs";

describe("normalizeMailPrefs", () => {
  it("รับเฉพาะค่าที่รู้จัก", () => {
    expect(normalizeMailPrefs({ pane: "list", listWidth: 420, locale: "en" })).toEqual({
      pane: "list",
      listWidth: 420,
      locale: "en",
      signature: "",
      signatureOnReply: true,
      signatureByAddress: {},
      defaultFromEmail: "",
      replyFromReceived: true,
    });
    expect(normalizeMailPrefs({ pane: "split" })).toEqual(MAIL_PREFS_DEFAULT);
    expect(normalizeMailPrefs({ locale: "fr" }).locale).toBe("th");
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

  it("ลายเซ็น: ตัด CRLF/ช่องว่างท้าย + บีบความยาว · ค่าที่ไม่ใช่ข้อความ = ว่าง", () => {
    expect(normalizeMailPrefs({ signature: "ก\r\nข  " }).signature).toBe("ก\nข");
    expect(
      normalizeMailPrefs({ signature: "x".repeat(MAIL_SIGNATURE_MAX + 50) }).signature,
    ).toHaveLength(MAIL_SIGNATURE_MAX);
    for (const bad of [null, 42, {}, []]) {
      expect(normalizeMailPrefs({ signature: bad }).signature).toBe("");
    }
  });

  it("ไฟล์เก่าที่ยังไม่มีช่อง signatureOnReply = ใส่ลายเซ็นตอนตอบด้วย", () => {
    expect(normalizeMailPrefs({ pane: "split" }).signatureOnReply).toBe(true);
    expect(normalizeMailPrefs({ signatureOnReply: false }).signatureOnReply).toBe(false);
  });

  it("ค่าเริ่มต้นคือ split (บานอ่านคู่กับรายการ) กว้าง 380px ภาษาไทย ไม่มีลายเซ็น", () => {
    expect(MAIL_PREFS_DEFAULT).toEqual({
      pane: "split",
      listWidth: MAIL_LIST_WIDTH_DEFAULT,
      locale: "th",
      signature: "",
      signatureOnReply: true,
      signatureByAddress: {},
      defaultFromEmail: "",
      replyFromReceived: true,
    });
  });
});

describe("normalizeMailPrefs — ผู้ส่ง/ลายเซ็นแยกรายที่อยู่", () => {
  it("ลายเซ็นรายที่อยู่: คีย์ต้องเป็นอีเมล (ตัวพิมพ์เล็ก) · ค่าว่างไม่เก็บ", () => {
    const out = normalizeMailPrefs({
      signatureByAddress: { "INFO@perpos.ai": "ฝ่ายขาย", ไม่ใช่อีเมล: "x", "a@b.co": "   " },
    }).signatureByAddress;
    expect(out).toEqual({ "info@perpos.ai": "ฝ่ายขาย" });
  });

  it("ที่อยู่เริ่มต้นต้องเป็นอีเมลจริง ไม่งั้นถือว่าไม่ได้ตั้ง", () => {
    expect(normalizeMailPrefs({ defaultFromEmail: "Info@Perpos.ai" }).defaultFromEmail).toBe(
      "info@perpos.ai",
    );
    expect(normalizeMailPrefs({ defaultFromEmail: "ไม่ใช่อีเมล" }).defaultFromEmail).toBe("");
  });

  it("ไฟล์เก่าที่ยังไม่มีช่อง replyFromReceived = เปิดไว้", () => {
    expect(normalizeMailPrefs({ pane: "split" }).replyFromReceived).toBe(true);
    expect(normalizeMailPrefs({ replyFromReceived: false }).replyFromReceived).toBe(false);
  });
});
