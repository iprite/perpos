/**
 * โฟลเดอร์ที่ผู้ใช้สร้างเอง (M3) — อ่าน/สร้าง/เปลี่ยนชื่อ/ย้าย/ลบ ผ่าน `Mailbox/*` ของ JMAP
 *
 * กฎที่ห้ามพัง:
 *  - **ทุกอย่างอยู่บนเมลเซิร์ฟเวอร์** ห้ามสร้างตารางใน Supabase (invariant ของโซน `(mail)`)
 *  - กล่องระบบ (role ไม่ว่าง + `Archive` ที่เรารับมาเป็นคลังเก็บ) **แก้/ลบไม่ได้**
 *    — ป้ายและลำดับของกล่องพวกนั้นอยู่ที่ `boxes.ts` แหล่งเดียวเหมือนเดิม
 *  - `path` ต้องคำนวณจากสายพ่อแม่จริงเสมอ เพราะ `fileinto` ของ Sieve อ้างชื่อ ไม่ใช่ id
 */

import {
  MAIL_FOLDER_DEPTH_MAX,
  MAIL_FOLDER_MAX,
  MAIL_FOLDER_NAME_MAX,
  MAIL_FOLDER_PATH_SEPARATOR,
} from "./boxes";
import { MailServiceError, jmapRequest, pickResponse, responseType } from "./jmap";
import { fetchMailboxes, mailboxIdByKey } from "./messages";
import type { JmapMailbox, MailFolder, MailSession } from "./types";

export class MailFolderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "MailFolderError";
    this.status = status;
  }
}

/**
 * ชื่อโฟลเดอร์ที่ยอมรับ — ตัดอักขระควบคุมและตัวคั่น path ทิ้ง
 * (ชื่อที่มี `/` จะทำให้ path กำกวมจนกฎกรองย้ายผิดที่)
 */
export function normalizeFolderName(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  const cleaned = Array.from(text)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127 && ch !== MAIL_FOLDER_PATH_SEPARATOR;
    })
    .join("")
    .trim();
  return cleaned.slice(0, MAIL_FOLDER_NAME_MAX);
}

/** id ของกล่องระบบทั้งหมด (role + `Archive` ที่เรารับมา) — ห้ามให้ผู้ใช้แก้/ลบ */
export function systemMailboxIds(boxes: JmapMailbox[]): Set<string> {
  const ids = new Set<string>();
  for (const box of boxes) if ((box.role ?? "").trim()) ids.add(box.id);
  const archive = mailboxIdByKey(boxes).archive;
  if (archive) ids.add(archive);
  return ids;
}

/**
 * แปลงรายการ mailbox ดิบ → โฟลเดอร์ของผู้ใช้ (เรียงตาม path)
 *
 * pure — มีเทสคุม · กล่องระบบไม่ถูกคืนออกไป แต่ยัง **นับเป็นส่วนหนึ่งของ path**
 * ของลูก (โฟลเดอร์ที่ผู้ใช้สร้างใต้ Inbox ต้องได้ path `INBOX/…` ไม่งั้น Sieve ย้ายผิดที่)
 */
export function buildMailFolders(boxes: JmapMailbox[], systemIds: Set<string>): MailFolder[] {
  const byId = new Map(boxes.map((b) => [b.id, b]));

  const chainOf = (box: JmapMailbox): JmapMailbox[] | null => {
    const chain: JmapMailbox[] = [];
    let current: JmapMailbox | undefined = box;
    // เพดานกันลูปวน (parentId ชี้วนกันเองบนเซิร์ฟเวอร์ที่ข้อมูลเพี้ยน)
    for (let i = 0; current && i <= 32; i += 1) {
      chain.unshift(current);
      if (!current.parentId) return chain;
      current = byId.get(current.parentId);
    }
    return null;
  };

  const folders: MailFolder[] = [];
  for (const box of boxes) {
    if (systemIds.has(box.id)) continue;
    const chain = chainOf(box);
    if (!chain) continue;
    folders.push({
      id: box.id,
      name: box.name ?? "",
      parentId: box.parentId ?? null,
      // ระดับนับเฉพาะโฟลเดอร์ของผู้ใช้ — อยู่ใต้กล่องระบบยังถือว่าอยู่ระดับบนสุด
      depth: chain.filter((b) => !systemIds.has(b.id)).length - 1,
      path: chain.map((b) => b.name ?? "").join(MAIL_FOLDER_PATH_SEPARATOR),
      unreadCount: typeof box.unreadEmails === "number" ? box.unreadEmails : null,
      totalCount: typeof box.totalEmails === "number" ? box.totalEmails : null,
    });
  }
  return folders.sort((a, b) => a.path.localeCompare(b.path, "th"));
}

/** path เต็มของ **ทุก** mailbox (รวมกล่องระบบ) — ใช้ประกอบ `fileinto` ของกฎกรอง */
export function mailboxPathById(boxes: JmapMailbox[]): Record<string, string> {
  const all = buildMailFolders(boxes, new Set());
  return Object.fromEntries(all.map((f) => [f.id, f.path]));
}

export async function listMailFolders(session: MailSession): Promise<MailFolder[]> {
  const boxes = await fetchMailboxes(session);
  return buildMailFolders(boxes, systemMailboxIds(boxes));
}

function assertParent(
  boxes: JmapMailbox[],
  systemIds: Set<string>,
  parentId: string | null,
  movingId?: string,
): void {
  if (!parentId) return;
  const folders = buildMailFolders(boxes, systemIds);
  const parent = folders.find((f) => f.id === parentId);
  if (!parent) throw new MailFolderError("ไม่พบโฟลเดอร์แม่ที่เลือก", 404);
  if (parent.depth + 1 > MAIL_FOLDER_DEPTH_MAX - 1) {
    throw new MailFolderError(`ซ้อนโฟลเดอร์ได้ลึกสุด ${MAIL_FOLDER_DEPTH_MAX} ชั้น`);
  }
  if (movingId) {
    // ย้ายโฟลเดอร์ไปไว้ใต้ลูกของตัวเอง = ตัดสายขาดจากราก (เซิร์ฟเวอร์บางตัวยอม แล้วโฟลเดอร์หายไปเลย)
    let cursor: string | null = parentId;
    for (let i = 0; cursor && i <= 32; i += 1) {
      if (cursor === movingId) throw new MailFolderError("ย้ายโฟลเดอร์ไปไว้ใต้ตัวเองไม่ได้");
      cursor = folders.find((f) => f.id === cursor)?.parentId ?? null;
    }
  }
}

function assertUniqueName(
  folders: MailFolder[],
  name: string,
  parentId: string | null,
  exceptId?: string,
): void {
  const clash = folders.some(
    (f) =>
      f.id !== exceptId &&
      (f.parentId ?? null) === parentId &&
      f.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  if (clash) throw new MailFolderError("มีโฟลเดอร์ชื่อนี้อยู่แล้วในระดับเดียวกัน", 409);
}

export async function createMailFolder(
  session: MailSession,
  args: { name: string; parentId: string | null },
): Promise<MailFolder> {
  const name = normalizeFolderName(args.name);
  if (!name) throw new MailFolderError("กรุณาตั้งชื่อโฟลเดอร์");

  const boxes = await fetchMailboxes(session);
  const systemIds = systemMailboxIds(boxes);
  const folders = buildMailFolders(boxes, systemIds);
  if (folders.length >= MAIL_FOLDER_MAX) {
    throw new MailFolderError(`สร้างโฟลเดอร์ได้สูงสุด ${MAIL_FOLDER_MAX} โฟลเดอร์`);
  }
  assertParent(boxes, systemIds, args.parentId);
  assertUniqueName(folders, name, args.parentId);

  const responses = await jmapRequest(session, [
    [
      "Mailbox/set",
      {
        accountId: session.accountId,
        create: { f: { name, parentId: args.parentId } },
      },
      "s",
    ],
  ]);
  if (responseType(responses, "s") === "error") throw new MailServiceError(502);
  const result = pickResponse(responses, "s");
  const created = (result.created as Record<string, { id?: string }> | undefined)?.f;
  if (!created?.id) throw new MailFolderError("สร้างโฟลเดอร์ไม่สำเร็จ", 502);

  const after = await listMailFolders(session);
  const folder = after.find((f) => f.id === created.id);
  if (!folder) throw new MailFolderError("สร้างโฟลเดอร์ไม่สำเร็จ", 502);
  return folder;
}

export async function updateMailFolder(
  session: MailSession,
  id: string,
  args: { name?: string; parentId?: string | null },
): Promise<MailFolder> {
  const boxes = await fetchMailboxes(session);
  const systemIds = systemMailboxIds(boxes);
  if (systemIds.has(id)) throw new MailFolderError("กล่องของระบบเปลี่ยนไม่ได้", 403);

  const folders = buildMailFolders(boxes, systemIds);
  const current = folders.find((f) => f.id === id);
  if (!current) throw new MailFolderError("ไม่พบโฟลเดอร์นี้", 404);

  const update: Record<string, unknown> = {};
  const nextParent = args.parentId === undefined ? current.parentId : args.parentId;
  let nextName = current.name;

  if (args.name !== undefined) {
    nextName = normalizeFolderName(args.name);
    if (!nextName) throw new MailFolderError("กรุณาตั้งชื่อโฟลเดอร์");
    if (nextName !== current.name) update.name = nextName;
  }
  if (args.parentId !== undefined && args.parentId !== current.parentId) {
    assertParent(boxes, systemIds, args.parentId, id);
    update.parentId = args.parentId;
  }
  if (Object.keys(update).length === 0) return current;
  assertUniqueName(folders, nextName, nextParent, id);

  const responses = await jmapRequest(session, [
    ["Mailbox/set", { accountId: session.accountId, update: { [id]: update } }, "s"],
  ]);
  if (responseType(responses, "s") === "error") throw new MailServiceError(502);
  const result = pickResponse(responses, "s");
  const notUpdated = result.notUpdated as Record<string, unknown> | null | undefined;
  if (notUpdated && notUpdated[id]) throw new MailFolderError("แก้ไขโฟลเดอร์ไม่สำเร็จ", 409);

  const after = await listMailFolders(session);
  return after.find((f) => f.id === id) ?? current;
}

/**
 * ลบโฟลเดอร์ — `onDestroyRemoveEmails` เป็น **false เสมอ**
 * (โฟลเดอร์ที่ยังมีเมลต้องลบไม่ได้ ผู้ใช้จะได้ไม่เผลอทำเมลหายทั้งกอง)
 */
export async function deleteMailFolder(session: MailSession, id: string): Promise<void> {
  const boxes = await fetchMailboxes(session);
  const systemIds = systemMailboxIds(boxes);
  if (systemIds.has(id)) throw new MailFolderError("กล่องของระบบลบไม่ได้", 403);

  const folders = buildMailFolders(boxes, systemIds);
  const target = folders.find((f) => f.id === id);
  if (!target) throw new MailFolderError("ไม่พบโฟลเดอร์นี้", 404);
  if (folders.some((f) => f.parentId === id)) {
    throw new MailFolderError("ลบโฟลเดอร์ที่ยังมีโฟลเดอร์ย่อยไม่ได้", 409);
  }
  if ((target.totalCount ?? 0) > 0) {
    throw new MailFolderError("ย้ายอีเมลออกให้หมดก่อนจึงจะลบโฟลเดอร์ได้", 409);
  }

  const responses = await jmapRequest(session, [
    [
      "Mailbox/set",
      { accountId: session.accountId, destroy: [id], onDestroyRemoveEmails: false },
      "s",
    ],
  ]);
  if (responseType(responses, "s") === "error") throw new MailServiceError(502);
  const result = pickResponse(responses, "s");
  const notDestroyed = result.notDestroyed as Record<string, unknown> | null | undefined;
  if (notDestroyed && notDestroyed[id]) throw new MailFolderError("ลบโฟลเดอร์ไม่สำเร็จ", 409);
}
