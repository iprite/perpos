import { describe, expect, it } from "vitest";

import { formatMailDateTime, formatMailSize, formatMailTime, mailDisplayName } from "./format";

// เวลาไทย = UTC+7 → 2026-08-15T03:00:00Z คือ 15 ส.ค. 2569 10:00 น.
const now = new Date("2026-08-15T03:00:00Z");

describe("formatMailTime — เวลาไทยสัมพัทธ์", () => {
  it("วันนี้ → เวลา HH:mm", () => {
    expect(formatMailTime("2026-08-15T01:30:00Z", now)).toBe("08:30");
  });

  it("เมื่อวาน", () => {
    expect(formatMailTime("2026-08-14T10:00:00Z", now)).toBe("เมื่อวาน");
  });

  it("ปีนี้ → วัน + เดือนย่อ", () => {
    expect(formatMailTime("2026-03-02T04:00:00Z", now)).toBe("2 มี.ค.");
  });

  it("ปีก่อน → มี พ.ศ. สองหลัก", () => {
    expect(formatMailTime("2025-12-31T05:00:00Z", now)).toBe("31 ธ.ค. 68");
  });

  it("ค่าที่ไม่ใช่วันที่ = ว่าง", () => {
    expect(formatMailTime("ไม่ใช่วันที่", now)).toBe("");
  });
});

describe("formatMailDateTime", () => {
  it("วันเวลาเต็มเป็น พ.ศ.", () => {
    expect(formatMailDateTime("2026-08-15T03:00:00Z")).toBe("15 ส.ค. 2569 10:00");
  });
});

describe("ตัวช่วยอื่น", () => {
  it("ขนาดไฟล์", () => {
    expect(formatMailSize(0)).toBe("0 KB");
    expect(formatMailSize(512)).toBe("512 B");
    expect(formatMailSize(2048)).toBe("2.0 KB");
    expect(formatMailSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("ชื่อผู้ส่ง", () => {
    expect(mailDisplayName({ name: "สมชาย", email: "a@b.c" })).toBe("สมชาย");
    expect(mailDisplayName({ name: null, email: "a@b.c" })).toBe("a@b.c");
    expect(mailDisplayName(null)).toBe("ไม่ทราบผู้ส่ง");
  });
});
