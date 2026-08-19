import { describe, expect, it } from "vitest";

import { FIXTURE_EMAIL, FIXTURE_MAILBOXES, FIXTURE_UNDO_TOKEN } from "./fixtures";
import {
  actionToPatch,
  buildFilter,
  buildMailboxSummaries,
  buildUndoUpdates,
  buildUpdatePatch,
  LIST_ATTACHMENT_MAX,
  messageMatchesText,
  mailboxIdByKey,
  mapEmailToMessage,
  patchToAction,
  threadCountMap,
  toUndoItem,
} from "./messages";

const ids = mailboxIdByKey(FIXTURE_MAILBOXES);

describe("map JMAP → DTO", () => {
  const msg = mapEmailToMessage(FIXTURE_EMAIL, 3);

  it("ใช้ชื่อฟิลด์ตาม contract และแปลง keyword ถูก", () => {
    expect(msg.isUnread).toBe(true); // ไม่มี $seen
    expect(msg.isFlagged).toBe(true);
    expect(msg.preview).toBe("สวัสดีครับ นี่คือข้อความทดสอบ");
    expect(msg.threadCount).toBe(3);
    expect(msg.mailboxIds).toEqual(["a"]);
    expect(msg.from).toEqual({ name: "ผู้ส่งทดสอบ", email: "sender@example.com" });
  });

  it("อ่านแล้ว = มี $seen", () => {
    const read = mapEmailToMessage({ ...FIXTURE_EMAIL, keywords: { $seen: true } });
    expect(read.isUnread).toBe(false);
    expect(read.isFlagged).toBe(false);
    expect(read.threadCount).toBe(1);
  });

  it("threadCount มาจาก Thread/get", () => {
    expect(threadCountMap([{ id: "th1", emailIds: ["a", "b", "c"] }])).toEqual({ th1: 3 });
  });
});

describe("โฟลเดอร์", () => {
  const summaries = buildMailboxSummaries(FIXTURE_MAILBOXES);

  it("starred ไม่ใช่ mailbox → count เป็น null ไม่ใช่ 0", () => {
    const starred = summaries.find((s) => s.key === "starred");
    expect(starred?.unreadCount).toBeNull();
    expect(starred?.totalCount).toBeNull();
    expect(starred?.role).toBeNull();
  });

  it("ซ่อนโฟลเดอร์ที่เซิร์ฟเวอร์ไม่มี (archive)", () => {
    expect(summaries.some((s) => s.key === "archive")).toBe(false);
    const withArchive = buildMailboxSummaries([
      ...FIXTURE_MAILBOXES,
      { id: "z", name: "Archive", role: null, parentId: null },
    ]);
    expect(withArchive.find((s) => s.key === "archive")?.id).toBe("z");
  });

  it("ป้ายเป็นภาษาไทยตาม contract", () => {
    expect(summaries.find((s) => s.key === "inbox")?.name).toBe("กล่องขาเข้า");
    expect(summaries.find((s) => s.key === "trash")?.name).toBe("ถังขยะ");
  });
});

describe("filter ต่อ MailBoxKey", () => {
  it("กล่องปกติใช้ inMailbox", () => {
    expect(buildFilter({ box: "inbox" }, ids)).toEqual({ inMailbox: "a" });
  });

  it("starred ใช้ hasKeyword ห้ามใช้ inMailbox", () => {
    const f = buildFilter({ box: "starred" }, ids);
    expect(f).toEqual({ hasKeyword: "$flagged" });
    expect(JSON.stringify(f)).not.toContain("inMailbox");
  });

  it("รวมตัวกรองด้วย AND (ขอบเขต “กล่องนี้”)", () => {
    expect(
      buildFilter(
        { box: "inbox", unread: true, attachment: true, q: "ใบแจ้งหนี้", searchScope: "box" },
        ids,
      ),
    ).toEqual({
      operator: "AND",
      conditions: [
        { inMailbox: "a" },
        { notKeyword: "$seen" },
        { hasAttachment: true },
        { text: "ใบแจ้งหนี้" },
      ],
    });
  });

  it("มีคำค้น = ค้นทั้งกล่องเมล ไม่ผูกกับกล่องที่เปิดอยู่ (แต่ตัดถังขยะ/จดหมายขยะ)", () => {
    expect(buildFilter({ box: "inbox", q: "ใบแจ้งหนี้" }, ids)).toEqual({
      operator: "AND",
      conditions: [
        { operator: "NOT", conditions: [{ inMailbox: "d" }, { inMailbox: "e" }] },
        { text: "ใบแจ้งหนี้" },
      ],
    });
  });

  it("เลือก “กล่องนี้” = กลับไปผูกกับกล่องที่เปิดอยู่", () => {
    expect(buildFilter({ box: "inbox", q: "abc", searchScope: "box" }, ids)).toEqual({
      operator: "AND",
      conditions: [{ inMailbox: "a" }, { text: "abc" }],
    });
  });

  it("ยืนอยู่ในถังขยะ/จดหมายขยะ = ค้นเฉพาะกล่องนั้น (ไม่กวาดทั้งระบบ)", () => {
    expect(buildFilter({ box: "trash", q: "abc" }, ids)).toEqual({
      operator: "AND",
      conditions: [{ inMailbox: "d" }, { text: "abc" }],
    });
  });

  it("โฟลเดอร์ที่ไม่มีบนเซิร์ฟเวอร์ = error ไม่ใช่ query มั่ว", () => {
    expect(() => buildFilter({ box: "archive" }, ids)).toThrow();
  });
});

describe("การกระทำและการเลิกทำ", () => {
  it("action → patch → action กลับมาเหมือนเดิม", () => {
    for (const action of ["read", "unread", "star", "unstar", "archive", "trash"] as const) {
      expect(patchToAction(actionToPatch(action))).toBe(action);
    }
  });

  it("patch แปลงเป็น update ของ Email/set", () => {
    expect(buildUpdatePatch({ isUnread: false }, null)).toEqual({ "keywords/$seen": true });
    expect(buildUpdatePatch({ isUnread: true }, null)).toEqual({ "keywords/$seen": null });
    expect(buildUpdatePatch({ isFlagged: false }, null)).toEqual({ "keywords/$flagged": null });
    expect(buildUpdatePatch({ moveTo: "archive" }, "z")).toEqual({ mailboxIds: { z: true } });
    // ไม่มีปลายทาง = ไม่ย้าย (ห้ามให้เมลหายไปที่อื่นเงียบ ๆ)
    expect(buildUpdatePatch({ moveTo: "archive" }, null)).toEqual({});
  });

  it("undo คืนค่าเดิมรายฉบับ — ปลดดาวทั้งชุดแล้ว undo ต้องไม่ติดดาวเมลที่เดิมไม่ติด", () => {
    const updates = buildUndoUpdates(FIXTURE_UNDO_TOKEN);
    expect(updates.em1).toEqual({
      mailboxIds: { a: true },
      "keywords/$seen": null,
      "keywords/$flagged": true,
    });
    expect(updates.em2).toEqual({
      mailboxIds: { a: true },
      "keywords/$seen": true,
      "keywords/$flagged": null,
    });
  });

  it("สถานะเดิมถูกอ่านจากอีเมลจริง", () => {
    expect(toUndoItem(FIXTURE_EMAIL)).toEqual({
      id: "em1",
      mailboxIds: ["a"],
      wasUnread: true,
      wasFlagged: true,
    });
  });
});

describe("mapEmailToMessage — ชิปไฟล์แนบในรายการ", () => {
  const base = { id: "e1", threadId: "t1", mailboxIds: { a: true }, subject: "s" };

  it("ส่ง blobId มาด้วย — ชิปในรายการต้องกดดู/ดาวน์โหลดได้โดยไม่ต้องเปิดเมล", () => {
    const m = mapEmailToMessage({
      ...base,
      hasAttachment: true,
      attachments: [{ blobId: "b1", name: "2026Aug-E.pdf", type: "application/pdf", size: 1024 }],
    } as never);
    expect(m.attachments).toEqual([
      { blobId: "b1", name: "2026Aug-E.pdf", type: "application/pdf", sizeBytes: 1024 },
    ]);
  });

  it("เกินเพดานให้ตัด แต่ยังบอกจำนวนจริงเพื่อทำ +N", () => {
    const attachments = Array.from({ length: 5 }, (_, i) => ({
      blobId: `b${i}`,
      name: `f${i}.pdf`,
      type: "application/pdf",
      size: 10,
    }));
    const m = mapEmailToMessage({ ...base, hasAttachment: true, attachments } as never);
    expect(m.attachments).toHaveLength(LIST_ATTACHMENT_MAX);
    expect(m.attachmentCount).toBe(5);
  });

  it("รูป inline (cid / disposition=inline) ไม่ใช่ไฟล์แนบ — จดหมายข่าวต้องไม่ขึ้นชิป", () => {
    const m = mapEmailToMessage({
      ...base,
      attachments: [
        { blobId: "b1", name: "logo.png", type: "image/png", size: 10, cid: "logo@x" },
        { blobId: "b2", name: "spacer.gif", type: "image/gif", size: 5, disposition: "inline" },
        { blobId: "b3", name: "ใบแจ้งยอด.pdf", type: "application/pdf", size: 2048 },
      ],
    } as never);
    expect(m.attachments.map((a) => a.name)).toEqual(["ใบแจ้งยอด.pdf"]);
    expect(m.attachmentCount).toBe(1);
  });

  it("ไม่มีไฟล์แนบ = อาร์เรย์ว่าง ไม่ใช่ undefined", () => {
    const m = mapEmailToMessage({ ...base } as never);
    expect(m.attachments).toEqual([]);
    expect(m.attachmentCount).toBe(0);
  });
});

describe("messageMatchesText — ค้นแบบ 'มีข้อความนี้อยู่ข้างใน' (fallback)", () => {
  const base = mapEmailToMessage({
    id: "e1",
    threadId: "t1",
    mailboxIds: { a: true },
    from: [{ name: "TikTok", email: "noreply@account.tiktok.com" }],
    subject: "424197 คือรหัส 6 หลักของคุณ",
    preview: "โปรดอย่าแชร์รหัสนี้กับใคร",
    attachments: [{ blobId: "b1", name: "ใบแจ้งหนี้.pdf", type: "application/pdf", size: 1 }],
  } as never);

  it("คำบางส่วนของชื่อผู้ส่ง (สิ่งที่ดัชนีของเมลเซิร์ฟเวอร์หาไม่เจอ)", () => {
    expect(messageMatchesText(base, "tik")).toBe(true);
    expect(messageMatchesText(base, "TIK")).toBe(true);
  });

  it("คำไทยกลางประโยคที่เขียนติดกัน", () => {
    expect(messageMatchesText(base, "รหัส")).toBe(true);
  });

  it("หาในชื่อไฟล์แนบและอีเมลผู้ส่งได้ด้วย", () => {
    expect(messageMatchesText(base, "ใบแจ้งหนี้")).toBe(true);
    expect(messageMatchesText(base, "account.tiktok.com")).toBe(true);
  });

  it("ไม่ตรงก็คือไม่ตรง · คำค้นว่าง = ไม่ match (กันคืนทั้งกล่อง)", () => {
    expect(messageMatchesText(base, "instagram")).toBe(false);
    expect(messageMatchesText(base, "   ")).toBe(false);
  });
});
