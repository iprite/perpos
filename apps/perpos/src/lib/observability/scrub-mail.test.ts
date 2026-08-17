import { describe, expect, it } from "vitest";

import { isMailUrl, scrubMailEvent, stripQuery } from "./scrub-mail";

describe("scrubMailEvent — กันข้อมูลส่วนบุคคลของเมลหลุดเข้า Sentry (contract §7.8)", () => {
  it("ตัด query (ชื่อไฟล์แนบ) + body + header ของ /api/mail/*", () => {
    const out = scrubMailEvent({
      request: {
        url: "https://mail.perpos.ai/api/mail/attachments/abc?name=%E0%B8%AA%E0%B8%B1%E0%B8%8D%E0%B8%8D%E0%B8%B2.pdf&type=application/pdf",
        method: "GET",
        data: { q: "คำค้นของผู้ใช้" },
        headers: { cookie: "perpos_mail_session=secret" },
      },
      transaction: "GET /api/mail/attachments/abc?name=x.pdf",
    });
    expect(JSON.stringify(out)).not.toContain("name=");
    expect(JSON.stringify(out)).not.toContain("คำค้นของผู้ใช้");
    expect(JSON.stringify(out)).not.toContain("perpos_mail_session");
    expect((out.request as { url: string }).url).toBe(
      "https://mail.perpos.ai/api/mail/attachments/abc",
    );
  });

  it("ตัด query ใน breadcrumb ด้วย (fetch/xhr พก url เต็มมาเอง)", () => {
    const out = scrubMailEvent({
      breadcrumbs: [
        { category: "fetch", data: { url: "/api/mail/messages/xyz?q=เงินเดือน" } },
        { category: "fetch", data: { url: "/api/other?keep=1" } },
      ],
    });
    const crumbs = out.breadcrumbs as { data: { url: string } }[];
    expect(crumbs[0]!.data.url).toBe("/api/mail/messages/xyz");
    expect(crumbs[1]!.data.url).toBe("/api/other?keep=1");
  });

  it("event ที่ไม่เกี่ยวกับเมลคืนตัวเดิม ไม่แตะ", () => {
    const event = { request: { url: "https://app.perpos.ai/api/bi/ask?x=1", data: { a: 1 } } };
    expect(scrubMailEvent(event)).toBe(event);
  });

  it("ตัวช่วยพื้นฐาน", () => {
    expect(isMailUrl("/api/mail/messages")).toBe(true);
    // หลังบ้านของเราตอบรหัสผ่านกล่องเมลกลับไป — ต้องถูกล้างเหมือนกัน
    expect(isMailUrl("/api/admin/mail/accounts")).toBe(true);
    expect(isMailUrl("/api/mailbox")).toBe(false);
    expect(isMailUrl(undefined)).toBe(false);
    expect(stripQuery("/a/b?c=1#d")).toBe("/a/b");
    expect(stripQuery("/a/b")).toBe("/a/b");
  });
});
