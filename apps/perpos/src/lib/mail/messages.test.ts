import { describe, expect, it } from "vitest";

import { FIXTURE_EMAIL, FIXTURE_MAILBOXES, FIXTURE_UNDO_TOKEN } from "./fixtures";
import {
  actionToPatch,
  buildFilter,
  buildMailboxSummaries,
  buildUndoUpdates,
  buildUpdatePatch,
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

  it("รวมตัวกรองด้วย AND", () => {
    expect(
      buildFilter({ box: "inbox", unread: true, attachment: true, q: "ใบแจ้งหนี้" }, ids),
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
