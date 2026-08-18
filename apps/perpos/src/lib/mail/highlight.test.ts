import { describe, expect, it } from "vitest";

import { highlightHtml } from "./highlight";

describe("ไฮไลต์คำค้นในเนื้อเมล", () => {
  it("หุ้ม <mark> รอบทุกคำที่ตรง และนับจำนวนถูก", () => {
    const { html, count } = highlightHtml("<p>ใบกำกับภาษี เลขที่ ใบกำกับ</p>", "ใบกำกับ");
    expect(count).toBe(2);
    expect(html).toContain('<mark class="perpos-hit perpos-hit-active">ใบกำกับ</mark>');
    expect(html).toContain('<mark class="perpos-hit">ใบกำกับ</mark>');
  });

  it("ไม่แตะข้อความที่อยู่ในแท็ก — คำค้นที่ไปตรงกับชื่อคลาส/URL ต้องไม่ถูกนับ", () => {
    const { html, count } = highlightHtml('<a href="https://invoice.example">บิล</a>', "invoice");
    expect(count).toBe(0);
    expect(html).toBe('<a href="https://invoice.example">บิล</a>');
  });

  it("ข้ามเนื้อใน <style> (ไม่ใช่ข้อความที่ผู้ใช้เห็น)", () => {
    const { count } = highlightHtml("<style>.total{color:red}</style><p>total 100</p>", "total");
    expect(count).toBe(1);
  });

  it("ตัวใหญ่-เล็กไม่สำคัญ และ &nbsp; นับเป็นช่องว่างปกติ", () => {
    const { count } = highlightHtml("<p>Total&nbsp;Amount</p>", "total amount");
    expect(count).toBe(1);
  });

  it("ตัวที่ activeIndex ได้คลาส -active ตัวเดียว", () => {
    const { html } = highlightHtml("<p>aa aa aa</p>", "aa", 2);
    expect(html.split("perpos-hit-active").length - 1).toBe(1);
    expect(html.indexOf("perpos-hit-active")).toBeGreaterThan(html.indexOf("perpos-hit"));
  });

  it("คำค้นว่าง = คืน HTML เดิมไม่แตะต้อง", () => {
    const src = "<p>ทดสอบ</p>";
    expect(highlightHtml(src, "  ")).toEqual({ html: src, count: 0 });
  });

  it("ไม่ทำให้ HTML พัง — อักขระพิเศษถูก escape กลับ", () => {
    const { html } = highlightHtml("<p>a &lt;b&gt; c</p>", "b");
    expect(html).toContain("&lt;");
    expect(html).not.toContain("<b>");
  });
});
