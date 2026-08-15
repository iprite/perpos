import { describe, expect, it } from "vitest";

import { FIXTURE_HTML_REMOTE, FIXTURE_HTML_TABLE } from "./fixtures";
import {
  MAIL_IFRAME_SANDBOX,
  buildMailSrcdoc,
  mailCsp,
  prepareMailHtml,
  sanitizeMailHtml,
} from "./sanitize";

const CSP_BLOCKED =
  "default-src 'none'; img-src 'none'; style-src 'unsafe-inline'; font-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'";
const CSP_ALLOWED =
  "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'";

describe("sanitizeMailHtml — ตัดของอันตราย", () => {
  const { html } = sanitizeMailHtml(FIXTURE_HTML_REMOTE);

  it("ตัด script / on* / javascript:", () => {
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
  });

  it("บล็อกรูปนอกครบทั้ง 6 ทาง (นอกเหนือจาก CSP)", () => {
    expect(html).not.toContain("<link");
    expect(html).not.toContain("@import");
    expect(html).not.toContain("background-image");
    expect(html).not.toContain("<video");
    expect(html).not.toContain("xlink:href");
    expect(html).not.toContain("http-equiv");
  });

  it("ตั้ง hasRemoteImages เมื่อเจอช่องทางใดก็ตาม", () => {
    expect(sanitizeMailHtml(FIXTURE_HTML_REMOTE).hasRemoteImages).toBe(true);
    expect(sanitizeMailHtml("<p>ข้อความล้วน</p>").hasRemoteImages).toBe(false);
  });

  it("ลิงก์ได้ target/rel ครบ", () => {
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it("ตาราง newsletter รอดทั้งชุด", () => {
    const table = sanitizeMailHtml(FIXTURE_HTML_TABLE).html;
    for (const attr of [
      "cellpadding",
      "cellspacing",
      "border",
      "bgcolor",
      "colspan",
      "align",
      "valign",
    ]) {
      expect(table).toContain(attr);
    }
  });
});

describe("CSP + sandbox ของ srcdoc", () => {
  it("สตริง CSP ตรงเป๊ะทั้งสองโหมด", () => {
    expect(mailCsp(false)).toBe(CSP_BLOCKED);
    expect(mailCsp(true)).toBe(CSP_ALLOWED);
  });

  it("สตริง sandbox ตรงเป๊ะและไม่มี allow-scripts / allow-same-origin", () => {
    expect(MAIL_IFRAME_SANDBOX).toBe("allow-popups allow-popups-to-escape-sandbox");
    expect(MAIL_IFRAME_SANDBOX).not.toContain("allow-scripts");
    expect(MAIL_IFRAME_SANDBOX).not.toContain("allow-same-origin");
  });

  it("meta CSP เป็นบรรทัดแรกใน head เสมอ แม้ body ว่าง/HTML เป็น null", () => {
    for (const body of [null, undefined, "", "<p>x</p>"]) {
      const doc = buildMailSrcdoc(body, { showImages: false });
      expect(doc).toContain(
        `<head><meta http-equiv="Content-Security-Policy" content="${CSP_BLOCKED}">`,
      );
      expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("<body>"));
    }
    expect(buildMailSrcdoc("<p>x</p>", { showImages: true })).toContain(CSP_ALLOWED);
  });
});

describe("prepareMailHtml — โหมดปิดรูป", () => {
  it('ถอด src ของรูปนอกออกเมื่อยังไม่กด "แสดงรูป" (ชั้นรองของ CSP)', () => {
    const closed = prepareMailHtml(FIXTURE_HTML_REMOTE, { stripRemoteImages: true });
    expect(closed.html).not.toContain("https://cdn.example.com/hero.png");
    expect(closed.hasRemoteImages).toBe(true);

    const open = prepareMailHtml(FIXTURE_HTML_REMOTE);
    expect(open.html).toContain("https://cdn.example.com/hero.png");
  });
});
