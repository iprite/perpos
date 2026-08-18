import { describe, expect, it } from "vitest";

import { FIXTURE_HTML_REMOTE, FIXTURE_HTML_TABLE } from "./fixtures";
import {
  MAIL_HEIGHT_MESSAGE,
  MAIL_IFRAME_SANDBOX,
  buildMailSrcdoc,
  isValidCspNonce,
  mailCsp,
  prepareMailHtml,
  sanitizeMailHtml,
} from "./sanitize";

const NONCE = "abcdef0123456789abcdef0123456789";
const CSP_BLOCKED = `default-src 'none'; img-src 'none'; script-src 'nonce-${NONCE}'; style-src 'unsafe-inline'; font-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'`;
const CSP_ALLOWED = `default-src 'none'; img-src https: data:; script-src 'nonce-${NONCE}'; style-src 'unsafe-inline'; font-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'`;

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

  it('img src="data:" ที่ผู้ส่งยัดมาเองถูกตัด (data: มาได้ทางเดียวคือ cid: ที่เราแปลงเองหลัง sanitize)', () => {
    const out = sanitizeMailHtml(
      '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="x">',
    ).html;
    expect(out).not.toContain("data:");
    expect(sanitizeMailHtml('<img src="cid:logo">').html).toContain("cid:logo");
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
    expect(mailCsp(false, NONCE)).toBe(CSP_BLOCKED);
    expect(mailCsp(true, NONCE)).toBe(CSP_ALLOWED);
  });

  /**
   * 🔴 เทสนี้คือด่านของ invariant ที่แพงที่สุดในโมดูล — `allow-same-origin` คู่กับ `allow-scripts`
   *    เมื่อไร frame ถอด sandbox ตัวเองออกและอ่าน DOM/cookie ของ mail.perpos.ai ได้ทันที
   */
  it("sandbox ต้องไม่มี allow-same-origin เด็ดขาด", () => {
    expect(MAIL_IFRAME_SANDBOX).not.toContain("allow-same-origin");
    expect(MAIL_IFRAME_SANDBOX).toBe("allow-popups allow-popups-to-escape-sandbox allow-scripts");
  });

  it("CSP ห้ามเปิดทางสคริปต์นอกเหนือจาก nonce ของเรา", () => {
    for (const csp of [mailCsp(false, NONCE), mailCsp(true, NONCE)]) {
      expect(csp).not.toContain("unsafe-inline'; script");
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).not.toContain("strict-dynamic");
      expect(csp).toContain(`script-src 'nonce-${NONCE}'`);
    }
  });

  it("nonce ผิดรูปแบบ = ไม่ยอมประกอบ srcdoc (กัน CSP ทั้งบรรทัดเพี้ยน)", () => {
    for (const bad of ["", "sh0rt", `x'; script-src *`, '"><script>']) {
      expect(isValidCspNonce(bad)).toBe(false);
      expect(() => buildMailSrcdoc("<p>x</p>", { showImages: false, nonce: bad })).toThrow();
    }
  });

  it("สคริปต์วัดความสูงต้องมี nonce และไม่แตะเนื้อหาของเมล", () => {
    const doc = buildMailSrcdoc("<p>x</p>", { showImages: false, nonce: NONCE });
    expect(doc).toContain(`<script nonce="${NONCE}">`);
    expect(doc).toContain(MAIL_HEIGHT_MESSAGE);
    // สคริปต์ต้องอยู่ท้าย body เสมอ — ไม่งั้นวัดตอนเนื้อหายังไม่ถูก parse
    expect(doc.indexOf("<script")).toBeGreaterThan(doc.indexOf("<p>x</p>"));
  });

  it("meta CSP เป็นบรรทัดแรกใน head เสมอ แม้ body ว่าง/HTML เป็น null", () => {
    for (const body of [null, undefined, "", "<p>x</p>"]) {
      const doc = buildMailSrcdoc(body, { showImages: false, nonce: NONCE });
      expect(doc).toContain(
        `<head><meta http-equiv="Content-Security-Policy" content="${CSP_BLOCKED}">`,
      );
      expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("<body>"));
    }
    expect(buildMailSrcdoc("<p>x</p>", { showImages: true, nonce: NONCE })).toContain(CSP_ALLOWED);
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

describe("สคริปต์ใน srcdoc (วัดความสูง + เลื่อนไปหาคำค้น)", () => {
  const doc = buildMailSrcdoc("<p>x</p>", { showImages: false, nonce: NONCE });
  const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(doc)?.[1] ?? "";

  it("สคริปต์ต้องเป็น JS ที่ถูกไวยากรณ์ (ประกอบจากสตริงหลายชิ้น พังง่าย)", () => {
    expect(script.length).toBeGreaterThan(0);
    expect(() => new Function(script)).not.toThrow();
  });

  it("รับคำสั่งเลื่อนไปหาคำค้นได้ และเลื่อนอย่างเดียว ไม่แก้เนื้อหาเมล", () => {
    expect(script).toContain("perpos-mail-scroll");
    expect(script).toContain("scrollIntoView");
    // ห้ามมีคำสั่งที่เขียนทับ DOM ของเมล
    expect(script).not.toContain("innerHTML");
    expect(script).not.toContain("insertAdjacent");
  });

  it("มีสไตล์ของคำค้นที่ไฮไลต์", () => {
    expect(doc).toContain("mark.perpos-hit");
    expect(doc).toContain("mark.perpos-hit-active");
  });
});
