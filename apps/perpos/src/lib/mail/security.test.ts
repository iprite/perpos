import { describe, expect, it } from "vitest";

import { FIXTURE_SESSION } from "./fixtures";
import {
  MailServiceError,
  buildDownloadUrl,
  isValidBlobId,
  resolveDownloadType,
  sanitizeAttachmentName,
} from "./jmap";
import { sanitizeReturnTo } from "./oauth";

describe("allowlist ของ returnTo (open redirect)", () => {
  it("ผ่านเฉพาะเส้นทางใต้ /mail", () => {
    expect(sanitizeReturnTo("/mail")).toBe("/mail");
    expect(sanitizeReturnTo("/mail/connect")).toBe("/mail/connect");
    expect(sanitizeReturnTo("/mail?box=starred")).toBe("/mail?box=starred");
  });

  it("บล็อกทุกรูปแบบที่พาออกนอกแอป", () => {
    const backslash = String.fromCharCode(92);
    for (const bad of [
      `/${backslash}evil.com`,
      "//evil.com",
      "https://evil.com",
      "/admin",
      "/mailbox-อื่น",
      "",
      null,
      undefined,
    ]) {
      expect(sanitizeReturnTo(bad)).toBe("/mail");
    }
  });

  it("decode แล้วยังต้องผ่านด่านเดิม", () => {
    expect(sanitizeReturnTo("%2F%2Fevil.com")).toBe("/mail");
    expect(sanitizeReturnTo("%2Fmail%2Fconnect")).toBe("/mail/connect");
  });
});

describe("blobId", () => {
  it("รับเฉพาะรูปแบบที่กำหนด", () => {
    expect(isValidBlobId("abc_123-XYZ")).toBe(true);
    expect(isValidBlobId("")).toBe(false);
    expect(isValidBlobId("../etc/passwd")).toBe(false);
    expect(isValidBlobId("a".repeat(129))).toBe(false);
    expect(isValidBlobId("abc?x=1")).toBe(false);
  });

  it("buildDownloadUrl ปฏิเสธ blobId ผิดรูป", () => {
    expect(() =>
      buildDownloadUrl(FIXTURE_SESSION, { blobId: "../x", name: "a.pdf", type: "application/pdf" }),
    ).toThrow(MailServiceError);
  });
});

describe("ชื่อไฟล์แนบ (header injection)", () => {
  it("ตัด CR/LF/quote/backslash/slash ทิ้ง", () => {
    const backslash = String.fromCharCode(92);
    const evil = `a${String.fromCharCode(13)}${String.fromCharCode(10)}X-Evil: 1"${backslash}/b.pdf`;
    const safe = sanitizeAttachmentName(evil);
    expect(safe).not.toContain(String.fromCharCode(13));
    expect(safe).not.toContain(String.fromCharCode(10));
    expect(safe).not.toContain('"');
    expect(safe).not.toContain(backslash);
    expect(safe).not.toContain("/");
  });

  it("ชื่อไทยยังใช้ได้ · ว่างเปล่า = attachment", () => {
    expect(sanitizeAttachmentName("ใบกำกับภาษี ส.ค..pdf")).toContain("ใบกำกับภาษี");
    expect(sanitizeAttachmentName("")).toBe("attachment");
    expect(sanitizeAttachmentName(null)).toBe("attachment");
  });
});

describe("Content-Type ของไฟล์แนบ", () => {
  it("allowlist รูป 4 ชนิดผ่าน · นอกนั้นเป็น octet-stream", () => {
    expect(resolveDownloadType("image/png")).toBe("image/png");
    expect(resolveDownloadType("IMAGE/JPEG; charset=x")).toBe("image/jpeg");
    expect(resolveDownloadType("image/svg+xml")).toBe("application/octet-stream");
    expect(resolveDownloadType("text/html")).toBe("application/octet-stream");
    expect(resolveDownloadType("application/pdf")).toBe("application/octet-stream");
    expect(resolveDownloadType(null)).toBe("application/octet-stream");
  });
});

describe("URL ดาวน์โหลดประกอบจาก template ของ session", () => {
  it("encode ทุก placeholder และคง origin เดิม", () => {
    const url = buildDownloadUrl(FIXTURE_SESSION, {
      blobId: "blob1",
      name: "ใบเสร็จ ก.ค..pdf",
      type: "application/pdf",
    });
    expect(url.startsWith("https://mail.example.com/jmap/download/")).toBe(true);
    expect(url).not.toContain(" ");
    expect(url).toContain("accept=application%2Fpdf");
  });
});
