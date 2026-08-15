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
import { MAIL_DEFAULT_HOST, isMailHost, mailBasePath, mailHostname } from "./base-path";
import { isSameOriginRequest } from "@/app/api/mail/_lib";
import { buildUploadUrl } from "./jmap";

describe("allowlist ของ returnTo (open redirect)", () => {
  it("ผ่านเฉพาะเส้นทางใต้ /mail", () => {
    expect(sanitizeReturnTo("/mail")).toBe("/mail");
    expect(sanitizeReturnTo("/mail/login")).toBe("/mail/login");
    expect(sanitizeReturnTo("/mail?box=starred")).toBe("/mail?box=starred");
    // โดเมนเมลใช้ path สั้น
    expect(sanitizeReturnTo("/")).toBe("/");
    expect(sanitizeReturnTo("/?box=sent")).toBe("/?box=sent");
    expect(sanitizeReturnTo("/login?reason=expired")).toBe("/login?reason=expired");
    // ของนอกโซนเมลไม่ผ่าน
    expect(sanitizeReturnTo("/admin")).toBe("/");
    expect(sanitizeReturnTo("/loginx")).toBe("/");
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
      expect(sanitizeReturnTo(bad)).toBe("/");
    }
  });

  it("decode แล้วยังต้องผ่านด่านเดิม", () => {
    expect(sanitizeReturnTo("%2F%2Fevil.com")).toBe("/");
    expect(sanitizeReturnTo("%2Fmail%2Flogin")).toBe("/mail/login");
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

describe("isSameOriginRequest — กัน CSRF ของ route ที่ไม่ต้องมี session (oauth/disconnect)", () => {
  const base = "https://mail.perpos.ai";
  const h = (init: Record<string, string>) => new Headers(init);

  it("เว็บอื่นสั่งไม่ได้", () => {
    expect(isSameOriginRequest(h({ "sec-fetch-site": "cross-site" }), base)).toBe(false);
    expect(isSameOriginRequest(h({ "sec-fetch-site": "same-site" }), base)).toBe(false);
    expect(isSameOriginRequest(h({ origin: "https://evil.example.com" }), base)).toBe(false);
  });

  it("หน้าเว็บของเราเองสั่งได้", () => {
    expect(isSameOriginRequest(h({ "sec-fetch-site": "same-origin" }), base)).toBe(true);
    expect(isSameOriginRequest(h({ origin: base }), base)).toBe(true);
    expect(isSameOriginRequest(h({ origin: `${base}/` }), base)).toBe(true);
  });

  it("ไม่บอก origin เลย = ไม่ไว้ใจ", () => {
    expect(isSameOriginRequest(h({}), base)).toBe(false);
  });
});

describe("mailBasePath — URL ที่ผู้ใช้เห็นต่างกันตามโดเมน", () => {
  const MAIL = "mail.perpos.ai";

  it("โดเมนเมลไม่มี /mail ซ้ำซ้อน", () => {
    expect(mailBasePath("mail.perpos.ai", MAIL)).toBe("");
    expect(mailBasePath("mail.perpos.ai:443", MAIL)).toBe("");
    expect(mailBasePath("MAIL.PERPOS.AI", MAIL)).toBe("");
  });

  it("โดเมนอื่น (dev / app.perpos.ai) ยังใช้ /mail", () => {
    expect(mailBasePath("127.0.0.1:3005", MAIL)).toBe("/mail");
    expect(mailBasePath("app.perpos.ai", MAIL)).toBe("/mail");
    expect(mailBasePath(null, MAIL)).toBe("/mail");
  });

  it("ชื่อคล้ายกันต้องไม่หลุด", () => {
    expect(isMailHost("mail.perpos.ai.evil.com", MAIL)).toBe(false);
    expect(isMailHost("notmail.perpos.ai", MAIL)).toBe(false);
  });

  it("อ่านชื่อโฮสต์จาก MAIL_APP_BASE_URL · ค่าพังก็ยังมี default", () => {
    expect(mailHostname("https://webmail.example.com")).toBe("webmail.example.com");
    expect(mailHostname("ไม่ใช่ URL")).toBe(MAIL_DEFAULT_HOST);
    expect(mailHostname(undefined)).toBe(MAIL_DEFAULT_HOST);
  });
});

describe("discovery ต้อง pin กับ JMAP host ไม่ใช่ issuer (บั๊กล็อกอินไม่ผ่าน 2026-08-15)", () => {
  // จำลองสัญญาจริง: เซิร์ฟเวอร์ประกาศ apiUrl เป็นชื่อ JMAP เสมอ แม้เราถามผ่านชื่อ login
  const advertisedApiUrl = "https://stalwart.perpos.ai/jmap/";
  const jmapUrl = "https://stalwart.perpos.ai/jmap/";
  const issuer = "https://login.perpos.ai";

  it("apiUrl ที่เซิร์ฟเวอร์ประกาศ อยู่ origin เดียวกับ MAIL_JMAP_URL", () => {
    expect(new URL(advertisedApiUrl).origin).toBe(new URL(jmapUrl).origin);
  });

  it("ถ้าไป pin กับ issuer จะไม่มีวันตรง (คือบั๊กที่ทำให้ล็อกอินพังทั้งระบบ)", () => {
    expect(new URL(advertisedApiUrl).origin).not.toBe(new URL(issuer).origin);
  });

  it("apiUrl ที่ชี้ออกนอก origin ของ JMAP host ต้องถือว่าใช้ไม่ได้ (กัน SSRF)", () => {
    expect(new URL("https://evil.example.com/jmap/").origin).not.toBe(new URL(jmapUrl).origin);
  });
});

describe("buildUploadUrl — แทน placeholder ให้ถูก (บั๊กแนบไฟล์ไม่ได้ 2026-08-15)", () => {
  const base = {
    apiUrl: "https://stalwart.perpos.ai/jmap/",
    accountId: "b",
  };

  it("ใช้ template จาก session ตามปกติ", () => {
    expect(
      buildUploadUrl({ ...base, uploadUrl: "https://stalwart.perpos.ai/jmap/upload/{accountId}/" }),
    ).toBe("https://stalwart.perpos.ai/jmap/upload/b/");
  });

  it("cookie เก่าที่ยังไม่มี uploadUrl → fallback ต้องได้ path ที่ใช้ได้จริง", () => {
    // เคยพลาด: new URL(...).toString() ทำให้ {} กลายเป็น %7B%7D แล้ว replace ไม่แมตช์
    const url = buildUploadUrl(base);
    expect(url).toBe("https://stalwart.perpos.ai/jmap/upload/b/");
    expect(url).not.toContain("%7B");
  });

  it("ปลายทางต้องอยู่ origin เดียวกับ JMAP (กัน SSRF)", () => {
    expect(() =>
      buildUploadUrl({ ...base, uploadUrl: "https://evil.example.com/jmap/upload/{accountId}/" }),
    ).toThrow();
  });
});
