import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { FIXTURE_SESSION } from "./fixtures";
import {
  MAIL_SESSION_MAX_AGE_MS,
  decodeMailSession,
  decryptMailPayload,
  encryptMailPayload,
  needsRefresh,
  parseSessionSecrets,
  safeEqual,
} from "./session";

const keyA = randomBytes(32);
const keyB = randomBytes(32);

describe("เข้ารหัส cookie (AES-256-GCM)", () => {
  it("round-trip ได้ค่าเดิม และขึ้นต้นด้วย v1.", () => {
    const value = encryptMailPayload(FIXTURE_SESSION, [keyA]);
    expect(value.startsWith("v1.")).toBe(true);
    expect(value.split(".")).toHaveLength(4);
    expect(decryptMailPayload(value, [keyA])).toEqual(FIXTURE_SESSION);
  });

  it("IV สุ่มใหม่ทุกครั้ง (ciphertext ไม่ซ้ำ)", () => {
    const a = encryptMailPayload(FIXTURE_SESSION, [keyA]);
    const b = encryptMailPayload(FIXTURE_SESSION, [keyA]);
    expect(a).not.toBe(b);
  });

  it("key rotation: เขียนด้วยคีย์ใหม่ อ่านของเก่าได้", () => {
    const old = encryptMailPayload(FIXTURE_SESSION, [keyB]);
    expect(decryptMailPayload(old, [keyA, keyB])).toEqual(FIXTURE_SESSION);
    expect(decryptMailPayload(old, [keyA])).toBeNull();
  });

  it("payload ปลอม / tag เพี้ยน = ปฏิเสธ", () => {
    const value = encryptMailPayload(FIXTURE_SESSION, [keyA]);
    const parts = value.split(".");
    const tampered = [parts[0], parts[1], parts[2], "AAAAAAAAAAAAAAAAAAAAAA"].join(".");
    expect(decryptMailPayload(tampered, [keyA])).toBeNull();
    expect(decryptMailPayload("v1.a.b.c", [keyA])).toBeNull();
    expect(decryptMailPayload("v2.a.b.c", [keyA])).toBeNull();
    expect(decryptMailPayload(undefined, [keyA])).toBeNull();
  });

  it("parseSessionSecrets รับหลายคีย์คั่น comma และทิ้งคีย์ที่ยาวไม่ถึง 32 byte", () => {
    const raw = [keyA.toString("base64"), "c2hvcnQ=", keyB.toString("base64")].join(",");
    const keys = parseSessionSecrets(raw);
    expect(keys).toHaveLength(2);
    expect(keys[0]!.equals(keyA)).toBe(true);
  });
});

describe("absolute expiry 30 วัน", () => {
  it("ปฏิเสธเองเมื่อ now - issuedAt เกิน 30 วัน", () => {
    const old = { ...FIXTURE_SESSION, issuedAt: Date.now() - MAIL_SESSION_MAX_AGE_MS - 1000 };
    const value = encryptMailPayload(old, [keyA]);
    expect(decodeMailSession(value, [keyA])).toBeNull();

    const fresh = encryptMailPayload({ ...FIXTURE_SESSION, issuedAt: Date.now() }, [keyA]);
    expect(decodeMailSession(fresh, [keyA])).not.toBeNull();
  });

  it("payload ที่ไม่ใช่ v1 / ขาด token = ปฏิเสธ", () => {
    const broken = encryptMailPayload({ ...FIXTURE_SESSION, accessToken: "" }, [keyA]);
    expect(decodeMailSession(broken, [keyA])).toBeNull();
  });
});

describe("ตัวช่วยอื่น", () => {
  it("needsRefresh เมื่อเหลือน้อยกว่า 60 วิ", () => {
    expect(needsRefresh({ ...FIXTURE_SESSION, expiresAt: Date.now() + 30_000 })).toBe(true);
    expect(needsRefresh({ ...FIXTURE_SESSION, expiresAt: Date.now() + 600_000 })).toBe(false);
  });

  it("safeEqual เทียบ state แบบคงเวลา", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
    expect(safeEqual("abc123", "abc124")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(false);
  });
});
