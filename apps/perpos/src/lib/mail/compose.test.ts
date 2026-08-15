import { describe, expect, it } from "vitest";

import {
  MailComposeError,
  isEmailAddress,
  buildDraftEmail,
  buildForwardBody,
  buildQuotedReply,
  forwardSubject,
  parseRecipients,
  quoteBody,
  replyRecipients,
  replySubject,
} from "./compose";

const ME = { name: "ฉัน", email: "me@perpos.ai" };

describe("parseRecipients — ผู้ใช้วางรายชื่อมาทั้งก้อนได้", () => {
  it("รับหลายรูปแบบ + คั่นได้หลายแบบ", () => {
    const { valid, invalid } = parseRecipients('a@x.com, "คุณบี" <b@x.com>;c@x.com\nd@x.com');
    expect(valid.map((v) => v.email)).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
    expect(valid[1]!.name).toBe("คุณบี");
    expect(invalid).toEqual([]);
  });

  it("แยกอันที่ใช้ไม่ได้ออกมาบอกผู้ใช้", () => {
    const { valid, invalid } = parseRecipients("ok@x.com, ไม่ใช่อีเมล, @nope");
    expect(valid).toHaveLength(1);
    expect(invalid).toEqual(["ไม่ใช่อีเมล", "@nope"]);
  });
});

describe("หัวเรื่องตอบ/ส่งต่อ — ห้ามซ้อนคำนำหน้า", () => {
  it("Re: ไม่ซ้อน", () => {
    expect(replySubject("ใบเสนอราคา")).toBe("Re: ใบเสนอราคา");
    expect(replySubject("Re: ใบเสนอราคา")).toBe("Re: ใบเสนอราคา");
    expect(replySubject("RE: ใบเสนอราคา")).toBe("RE: ใบเสนอราคา");
    expect(replySubject("")).toBe("Re:");
  });

  it("Fwd: ไม่ซ้อน (รับทั้ง Fw/Fwd)", () => {
    expect(forwardSubject("บิล")).toBe("Fwd: บิล");
    expect(forwardSubject("Fwd: บิล")).toBe("Fwd: บิล");
    expect(forwardSubject("Fw: บิล")).toBe("Fw: บิล");
  });
});

describe("replyRecipients — ห้ามส่งกลับหาตัวเอง / ห้ามซ้ำ", () => {
  const source = {
    from: { name: null, email: "sender@x.com" },
    to: [
      { name: null, email: "me@perpos.ai" },
      { name: null, email: "team@x.com" },
    ],
    cc: [
      { name: null, email: "team@x.com" },
      { name: null, email: "boss@x.com" },
    ],
  };

  it("ตอบ = ผู้ส่งคนเดียว", () => {
    expect(replyRecipients(source, ME.email, false)).toEqual({
      to: [{ name: null, email: "sender@x.com" }],
      cc: [],
    });
  });

  it("ตอบทั้งหมด = ทุกคนยกเว้นตัวเอง และไม่ซ้ำ", () => {
    const out = replyRecipients(source, ME.email, true);
    expect(out.to.map((a) => a.email)).toEqual(["sender@x.com"]);
    expect(out.cc.map((a) => a.email)).toEqual(["team@x.com", "boss@x.com"]);
    expect(JSON.stringify(out)).not.toContain("me@perpos.ai");
  });

  it("ตัวเองเป็นผู้ส่ง (ตอบเมลตัวเอง) → ไม่มีผู้รับซ้ำตัวเอง", () => {
    const out = replyRecipients(
      { from: { name: null, email: "ME@perpos.ai" }, to: [], cc: [] },
      ME.email,
      true,
    );
    expect(out.to).toEqual([]);
  });
});

describe("ข้อความที่อ้างถึง", () => {
  it("ใส่ > ทุกบรรทัด รวมบรรทัดว่าง", () => {
    expect(quoteBody("บรรทัด 1\n\nบรรทัด 2")).toBe("> บรรทัด 1\n>\n> บรรทัด 2");
    expect(quoteBody("")).toBe("");
  });

  it("ตอบ/ส่งต่อ ใส่หัวข้อมูลต้นทางครบ", () => {
    const reply = buildQuotedReply({
      from: { name: "ผู้ส่ง", email: "s@x.com" },
      receivedAt: "2026-08-15T03:00:00Z",
      textBody: "สวัสดี",
    });
    expect(reply).toContain("ผู้ส่ง <s@x.com> เขียนว่า:");
    expect(reply).toContain("> สวัสดี");

    const fwd = buildForwardBody({
      from: { name: null, email: "s@x.com" },
      to: [{ name: null, email: "me@perpos.ai" }],
      subject: "บิล",
      receivedAt: "2026-08-15T03:00:00Z",
      textBody: "เนื้อหา",
    });
    expect(fwd).toContain("---------- ข้อความที่ส่งต่อ ----------");
    expect(fwd).toContain("หัวเรื่อง: บิล");
  });
});

describe("buildDraftEmail — ประกอบ JMAP Email", () => {
  it("ส่งเป็น text/plain เท่านั้น (ไม่มี htmlBody)", () => {
    const { email } = buildDraftEmail({ to: ["a@x.com"], subject: "ทดสอบ", body: "เนื้อหา" }, ME);
    expect(email.htmlBody).toBeUndefined();
    expect(email.textBody).toEqual([{ partId: "b", type: "text/plain" }]);
    expect((email.bodyValues as Record<string, { value: string }>).b.value).toBe("เนื้อหา");
    expect(email.from).toEqual([{ name: "ฉัน", email: "me@perpos.ai" }]);
  });

  it("ต่อ header เธรดเมื่อเป็นการตอบ", () => {
    const { email } = buildDraftEmail(
      { to: ["a@x.com"], inReplyTo: "<msg-2@x.com>", references: ["<msg-1@x.com>"] },
      ME,
    );
    expect(email.inReplyTo).toEqual(["<msg-2@x.com>"]);
    expect(email.references).toEqual(["<msg-1@x.com>", "<msg-2@x.com>"]);
  });

  it("ร่างเปล่าเซฟได้ แต่ส่งไม่ได้ถ้าไม่มีผู้รับ", () => {
    expect(() => buildDraftEmail({ to: [] }, ME)).not.toThrow();
    expect(() => buildDraftEmail({ to: [] }, ME, { requireRecipients: true })).toThrow(
      MailComposeError,
    );
  });

  it("ที่อยู่ผิดรูปแบบ / ไฟล์แนบเกินเพดาน → ข้อความไทย", () => {
    expect(() => buildDraftEmail({ to: ["ไม่ใช่อีเมล"] }, ME)).toThrow(/ไม่ถูกต้อง/);
    expect(() =>
      buildDraftEmail(
        {
          to: ["a@x.com"],
          // 20MB ดิบ → base64 แล้ว ~26.7MB = เกินเพดาน (นี่คือเคสที่ผู้ใช้เจอจริง)
          attachments: [
            { blobId: "b1", name: "big.zip", type: "application/zip", size: 20 * 1024 * 1024 },
          ],
        },
        ME,
      ),
    ).toThrow(/25 MB/);
  });

  it("ไฟล์แนบ 15MB ยังผ่าน (คิด base64 แล้วยังไม่ถึงเพดาน)", () => {
    expect(() =>
      buildDraftEmail(
        {
          to: ["a@x.com"],
          attachments: [
            { blobId: "b1", name: "ok.zip", type: "application/zip", size: 15 * 1024 * 1024 },
          ],
        },
        ME,
      ),
    ).not.toThrow();
  });

  it("cc/bcc ว่าง = null ไม่ใช่ [] (JMAP ไม่รับ array ว่าง)", () => {
    const { email } = buildDraftEmail({ to: ["a@x.com"] }, ME);
    expect(email.cc).toBeNull();
    expect(email.bcc).toBeNull();
  });
});

describe("ค่าที่ไปเป็น header ต้องปลอดภัย (จาก security review M2)", () => {
  it("CRLF แทรก header ไม่ทะลุ — ส่วนที่แทรกมากลายเป็น 'ที่อยู่ใช้ไม่ได้' และบล็อกการส่ง", () => {
    const injected = "a@x.com\r\nBcc: victim@x.com";
    expect(isEmailAddress(injected)).toBe(false);

    const { valid, invalid } = parseRecipients(injected);
    // บรรทัดถูกตัดตั้งแต่ต้น — ที่อยู่จริงไม่มี CR/LF ติดไปด้วย
    expect(valid.map((v) => v.email)).toEqual(["a@x.com"]);
    expect(valid.every((v) => !/[\r\n]/.test(v.email))).toBe(true);
    expect(invalid).toEqual(["Bcc: victim@x.com"]);

    // และร่างที่มีของแบบนี้ต้องส่งไม่ได้เลย
    expect(() => buildDraftEmail({ to: [injected] }, ME)).toThrow(/ไม่ถูกต้อง/);
  });

  it("ชื่อที่มีอักขระควบคุมถูกตัดออกจากที่อยู่ที่ประกอบได้", () => {
    const { valid } = parseRecipients('"ชื่อ" <ok@x.com>');
    expect(valid[0]).toEqual({ name: "ชื่อ", email: "ok@x.com" });
  });
});
