import { selectThreadWindow } from "./messages";
import { describe, expect, it } from "vitest";

import { FIXTURE_HTML_QUOTED, FIXTURE_HTML_REMOTE } from "./fixtures";
import {
  INLINE_BUDGET_BYTES,
  buildInlineImageMap,
  prepareMailHtml,
  restructureMailHtml,
} from "./sanitize";

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("ยุบข้อความที่อ้างถึงเป็น <details>", () => {
  const { html } = prepareMailHtml(FIXTURE_HTML_QUOTED);

  it("ห่อด้วย details.quoted-toggle และไม่ซ้อนกันแม้ blockquote ซ้อน 3 ชั้น", () => {
    expect(html).toContain('<details class="quoted-toggle">');
    expect(html).toContain("<summary>แสดงข้อความที่อ้างถึง</summary>");
    // gmail_quote + gmail_extra + divRplyFwdMsg = 3 กล่อง (blockquote ข้างในต้องไม่ถูกห่อซ้ำ)
    expect(count(html, "<details")).toBe(3);
  });

  it("เนื้อหาที่ตอบล่าสุดยังอยู่นอก details", () => {
    expect(html.indexOf("ตอบกลับล่าสุด")).toBeLessThan(html.indexOf("<details"));
  });

  it("unwrap details/summary ที่ผู้ส่งแนบมาก่อน — เนื้อหาจริงต้องไม่ถูกยุบซ่อน", () => {
    const spoof =
      '<details class="quoted-toggle"><summary>ดูเพิ่ม</summary><p>เนื้อหาจริง</p></details>';
    const out = restructureMailHtml(spoof);
    expect(out.html).toContain("เนื้อหาจริง");
    expect(out.html).not.toContain("<details");
    expect(out.html).not.toContain("ดูเพิ่ม");
  });
});

describe("tracking pixel + preheader", () => {
  const { html } = prepareMailHtml(FIXTURE_HTML_REMOTE);

  it("ตัด pixel 1x1 ทิ้ง แต่รูปจริงยังอยู่", () => {
    expect(html).not.toContain("pixel.gif");
    expect(html).toContain("hero.png");
  });

  it("ตัด pixel 0x0 ที่ระบุด้วย style", () => {
    const out = restructureMailHtml(
      '<img src="https://t.example.com/p.gif" style="width:0px;height:0px">',
    );
    expect(out.html).not.toContain("p.gif");
  });

  it("ตัด preheader ที่ display:none / font-size:0", () => {
    expect(html).not.toContain("preheader ที่ซ่อนไว้");
    const out = restructureMailHtml('<div style="opacity:0">ซ่อน</div><div>เห็น</div>');
    expect(out.html).not.toContain("ซ่อน");
    expect(out.html).toContain("เห็น");
  });
});

describe("cid: → data: (ด่าน MIME อยู่ตอนประกอบ data: เอง)", () => {
  const base64 = "AAAA";

  it("แปลงเฉพาะ 4 ชนิดรูปที่อนุญาต", () => {
    const map = buildInlineImageMap([
      { cid: "p", type: "image/png", base64 },
      { cid: "j", type: "image/jpeg", base64 },
      { cid: "g", type: "image/gif", base64 },
      { cid: "w", type: "image/webp", base64 },
    ]);
    expect(Object.keys(map).sort()).toEqual(["g", "j", "p", "w"]);
    expect(map.p).toBe(`data:image/png;base64,${base64}`);
  });

  it("image/svg+xml ต้องคง cid: ไม่แปลง", () => {
    const map = buildInlineImageMap([{ cid: "s", type: "image/svg+xml", base64 }]);
    expect(map.s).toBeUndefined();
    const out = restructureMailHtml('<img src="cid:s">', { inlineImages: map });
    expect(out.html).toContain("cid:s");
    expect(out.html).not.toContain("data:");
  });

  it("แทนค่าใน HTML ได้ (รองรับ cid ที่มี <>)", () => {
    const map = buildInlineImageMap([{ cid: "logo", type: "image/png", base64 }]);
    const out = restructureMailHtml('<img src="cid:<logo>">', { inlineImages: map });
    expect(out.html).toContain("data:image/png;base64,AAAA");
  });

  it("นับ byte หลัง base64 แล้วชนเพดาน 5 MB → ไม่ inline", () => {
    const big = "A".repeat(INLINE_BUDGET_BYTES);
    const map = buildInlineImageMap([
      { cid: "first", type: "image/png", base64: big },
      { cid: "second", type: "image/png", base64: big },
    ]);
    expect(Object.keys(map)).toEqual([]);
    const okMap = buildInlineImageMap([{ cid: "small", type: "image/png", base64: "AAAA" }]);
    expect(okMap.small).toBeDefined();
  });
});

describe("selectThreadWindow — เพดานจำนวนฉบับต่อเธรด (กัน memory บาน)", () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}` }));

  it("เธรดสั้นกว่าเพดาน คืนครบทุกฉบับ", () => {
    const list = mk(5);
    expect(selectThreadWindow(list, "m2", 30)).toEqual(list);
  });

  it("เธรดยาวเกิน คืนเฉพาะฉบับล่าสุดตามเพดาน", () => {
    const out = selectThreadWindow(mk(100), "m99", 30);
    expect(out).toHaveLength(30);
    expect(out[0]!.id).toBe("m70");
    expect(out.at(-1)!.id).toBe("m99");
  });

  it("ฉบับที่ผู้ใช้กดเปิดต้องอยู่ในผลลัพธ์เสมอ แม้เป็นฉบับเก่ากลางเธรด", () => {
    const out = selectThreadWindow(mk(100), "m3", 30);
    expect(out).toHaveLength(30);
    expect(out.map((e) => e.id)).toContain("m3");
    expect(out.at(-1)!.id).toBe("m99");
  });
});
