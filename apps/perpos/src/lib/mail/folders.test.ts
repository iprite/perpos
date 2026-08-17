import { describe, expect, it } from "vitest";

import { buildMailFolders, mailboxPathById, normalizeFolderName } from "./folders";
import type { JmapMailbox } from "./types";

const box = (p: Partial<JmapMailbox> & { id: string; name: string }): JmapMailbox => ({
  role: null,
  parentId: null,
  ...p,
});

const BOXES: JmapMailbox[] = [
  box({ id: "in", name: "INBOX", role: "inbox" }),
  box({ id: "tr", name: "Deleted Items", role: "trash" }),
  box({ id: "a", name: "งาน", totalEmails: 4, unreadEmails: 1 }),
  box({ id: "b", name: "ลูกค้า", parentId: "a" }),
  box({ id: "c", name: "ใต้เข้า", parentId: "in" }),
];

const SYSTEM = new Set(["in", "tr"]);

describe("buildMailFolders", () => {
  it("คืนเฉพาะโฟลเดอร์ของผู้ใช้ (กล่องระบบไม่โผล่)", () => {
    const ids = buildMailFolders(BOXES, SYSTEM).map((f) => f.id);
    expect(ids).not.toContain("in");
    expect(ids).not.toContain("tr");
    expect(ids).toEqual(expect.arrayContaining(["a", "b", "c"]));
  });

  it("path รวมชื่อกล่องระบบที่เป็นแม่ด้วย (ไม่งั้น fileinto ย้ายผิดที่)", () => {
    const folders = buildMailFolders(BOXES, SYSTEM);
    expect(folders.find((f) => f.id === "b")?.path).toBe("งาน/ลูกค้า");
    expect(folders.find((f) => f.id === "c")?.path).toBe("INBOX/ใต้เข้า");
  });

  it("depth นับเฉพาะโฟลเดอร์ของผู้ใช้", () => {
    const folders = buildMailFolders(BOXES, SYSTEM);
    expect(folders.find((f) => f.id === "a")?.depth).toBe(0);
    expect(folders.find((f) => f.id === "b")?.depth).toBe(1);
    // อยู่ใต้ INBOX ซึ่งเป็นกล่องระบบ → ยังถือว่าอยู่ระดับบนสุด
    expect(folders.find((f) => f.id === "c")?.depth).toBe(0);
  });

  it("ไม่มีข้อมูลจำนวน = null ไม่ใช่ 0", () => {
    const folders = buildMailFolders(BOXES, SYSTEM);
    expect(folders.find((f) => f.id === "a")?.unreadCount).toBe(1);
    expect(folders.find((f) => f.id === "b")?.unreadCount).toBeNull();
  });

  it("parentId ชี้วนกันเอง → ข้ามไป ไม่ค้างลูป", () => {
    const loop: JmapMailbox[] = [
      box({ id: "x", name: "x", parentId: "y" }),
      box({ id: "y", name: "y", parentId: "x" }),
    ];
    expect(buildMailFolders(loop, new Set())).toEqual([]);
  });
});

describe("mailboxPathById", () => {
  it("มี path ของกล่องระบบด้วย (กฎกรองย้ายเข้าถังขยะได้)", () => {
    expect(mailboxPathById(BOXES).tr).toBe("Deleted Items");
  });
});

describe("normalizeFolderName", () => {
  it("ตัด `/` ทิ้ง (ชื่อที่มีตัวคั่นทำให้ path กำกวม)", () => {
    expect(normalizeFolderName("งาน/ลูกค้า")).toBe("งานลูกค้า");
  });

  it("ตัดอักขระควบคุมและช่องว่างหัวท้าย", () => {
    expect(normalizeFolderName("  งาน\n ")).toBe("งาน");
  });

  it("ค่าที่ไม่ใช่สตริง → ว่าง", () => {
    expect(normalizeFolderName(42)).toBe("");
  });
});
