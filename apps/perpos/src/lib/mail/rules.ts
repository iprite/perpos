/**
 * กฎกรองอัตโนมัติ — ชั้นที่คุยกับเมลเซิร์ฟเวอร์ (`SieveScript/*` ของ JMAP)
 *
 * รูปแบบที่ยึดไว้ (ยืนยันกับ Stalwart จริงแล้ว):
 *  - **สคริปต์เดียวชื่อ `perpos` ต่อกล่องเมล** สร้างครั้งเดียวแล้ว *อัปเดตทับ* ตลอด
 *    ⇒ ไม่ต้องลบ ซึ่งดีเพราะ **สคริปต์ที่ active อยู่ลบไม่ได้** (เซิร์ฟเวอร์ตอบ `scriptIsActive`)
 *    และไม่มีวิธีปิดใช้งานผ่าน `onSuccessActivateScript: null` (เรียกแล้วไม่มีผล)
 *  - เนื้อสคริปต์ส่งผ่าน blob: upload → ได้ `blobId` → `SieveScript/set`
 *  - `SieveScript/validate` ก่อนเซฟเสมอ — สคริปต์ที่ผิดทำให้เมลเข้าไม่ถูกที่แบบเงียบ ๆ
 *
 * การประกอบตัวสคริปต์อยู่ที่ `lib/mail/sieve.ts` ที่เดียว (pure + มีเทส) — ไฟล์นี้ไม่ต่อสตริงเอง
 */

import {
  JMAP_USING_SIEVE,
  MailServiceError,
  buildDownloadUrl,
  buildUploadUrl,
  jmapRequest,
  pickResponse,
  responseType,
} from "./jmap";
import { fetchMailboxes } from "./messages";
import { mailboxPathById } from "./folders";
import { MAIL_SIEVE_SCRIPT_NAME, buildSieveScript, parseSieveScript } from "./sieve";
import type { MailRule, MailRulesResult, MailSession } from "./types";

const SIEVE_CONTENT_TYPE = "application/sieve";
const SIEVE_MAX_BYTES = 128 * 1024;

interface SieveScriptInfo {
  id: string;
  name: string;
  blobId: string;
  isActive: boolean;
}

async function listScripts(session: MailSession): Promise<SieveScriptInfo[]> {
  const responses = await jmapRequest(
    session,
    [["SieveScript/get", { accountId: session.accountId, ids: null }, "s"]],
    JMAP_USING_SIEVE,
  );
  const list = pickResponse(responses, "s").list as SieveScriptInfo[] | undefined;
  return Array.isArray(list) ? list : [];
}

function ourScript(scripts: SieveScriptInfo[]): SieveScriptInfo | null {
  return scripts.find((s) => s.name === MAIL_SIEVE_SCRIPT_NAME) ?? null;
}

async function downloadScript(session: MailSession, blobId: string): Promise<string | null> {
  const url = buildDownloadUrl(session, {
    blobId,
    name: "script",
    type: SIEVE_CONTENT_TYPE,
  });
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { Authorization: `Bearer ${session.accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new MailServiceError(504);
  }
  if (!res.ok) return null;
  const text = await res.text().catch(() => null);
  if (text === null) return null;
  return text.length > SIEVE_MAX_BYTES ? text.slice(0, SIEVE_MAX_BYTES) : text;
}

export async function getMailRules(session: MailSession): Promise<MailRulesResult> {
  const scripts = await listScripts(session);
  const mine = ourScript(scripts);

  if (!mine) {
    // ไม่มีสคริปต์ของเรา แต่มีของคนอื่นอยู่ (ตั้งไว้ก่อนย้ายมา/ตั้งผ่าน ManageSieve) → ต้องเตือน
    return { rules: [], foreignScript: scripts.some((s) => s.isActive) };
  }
  const parsed = parseSieveScript(await downloadScript(session, mine.blobId));
  return { rules: parsed.rules, foreignScript: parsed.foreign };
}

async function uploadScript(session: MailSession, script: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(buildUploadUrl(session), {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": SIEVE_CONTENT_TYPE,
      },
      body: script,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new MailServiceError(504);
  }
  if (!res.ok) throw new MailServiceError(502, "บันทึกกฎกรองไม่สำเร็จ");
  const data = (await res.json().catch(() => null)) as { blobId?: string } | null;
  if (!data?.blobId) throw new MailServiceError(502, "บันทึกกฎกรองไม่สำเร็จ");
  return data.blobId;
}

export class MailSieveInvalidError extends Error {
  constructor(message = "กฎกรองชุดนี้เซิร์ฟเวอร์ไม่รับ กรุณาตรวจค่าที่กรอก") {
    super(message);
    this.name = "MailSieveInvalidError";
  }
}

/**
 * เขียนกฎทั้งชุดทับของเดิม (ทั้งชุดเสมอ — ไม่มีการแก้ทีละกฎบนเซิร์ฟเวอร์)
 * ผู้เรียกต้องกัน `foreignScript` ให้เรียบร้อยก่อน (ดู route)
 */
export async function saveMailRules(session: MailSession, rules: MailRule[]): Promise<void> {
  const boxes = await fetchMailboxes(session);
  const script = buildSieveScript(rules, mailboxPathById(boxes));
  const blobId = await uploadScript(session, script);

  const validate = await jmapRequest(
    session,
    [["SieveScript/validate", { accountId: session.accountId, blobId }, "v"]],
    JMAP_USING_SIEVE,
  );
  if (responseType(validate, "v") === "error") throw new MailServiceError(502);
  if (pickResponse(validate, "v").error) throw new MailSieveInvalidError();

  const existing = ourScript(await listScripts(session));
  const args: Record<string, unknown> = { accountId: session.accountId };
  if (existing) {
    args.update = { [existing.id]: { blobId } };
    if (!existing.isActive) args.onSuccessActivateScript = existing.id;
  } else {
    args.create = { s: { name: MAIL_SIEVE_SCRIPT_NAME, blobId } };
    args.onSuccessActivateScript = "#s";
  }

  const responses = await jmapRequest(session, [["SieveScript/set", args, "s"]], JMAP_USING_SIEVE);
  if (responseType(responses, "s") === "error") throw new MailServiceError(502);
  const result = pickResponse(responses, "s");
  const failed =
    (result.notCreated as Record<string, unknown> | null | undefined) ??
    (result.notUpdated as Record<string, unknown> | null | undefined);
  if (failed && Object.keys(failed).length > 0) {
    throw new MailServiceError(502, "บันทึกกฎกรองไม่สำเร็จ");
  }
}

/**
 * เขียนสคริปต์ใหม่จากกฎเดิม — ต้องเรียก**ทุกครั้งที่โฟลเดอร์เปลี่ยนชื่อ/ย้าย/ถูกลบ**
 * เพราะ `fileinto` อ้าง path ไม่ใช่ id ⇒ ไม่ regenerate = กฎย้ายเมลไปโฟลเดอร์ที่ไม่มีแล้ว
 *
 * `removedMailboxId` = โฟลเดอร์ที่เพิ่งถูกลบ → **ต้องล้างปลายทางของกฎที่ชี้ไปหามันทิ้ง**
 * ไม่งั้นนิยามกฎยังถือ id ค้างไว้ (id ของ Stalwart เป็นตัวสั้น ๆ ที่อาจถูกใช้ซ้ำในอนาคต
 * ⇒ วันหนึ่งกฎเก่าจะไปย้ายเมลลงโฟลเดอร์ที่ไม่เกี่ยวกันเลย) และหน้ากฎกรองจะโชว์ช่องปลายทางว่างเปล่า
 *
 * ล้มเหลว = เงียบ (การจัดโฟลเดอร์ต้องไม่พังเพราะกฎกรอง — ผู้ใช้กดบันทึกกฎใหม่เองได้)
 */
export async function refreshMailRulesScript(
  session: MailSession,
  opts: { removedMailboxId?: string } = {},
): Promise<void> {
  try {
    const current = await getMailRules(session);
    if (current.foreignScript || current.rules.length === 0) return;
    const rules = opts.removedMailboxId
      ? current.rules.map((r) =>
          r.moveToMailboxId === opts.removedMailboxId ? { ...r, moveToMailboxId: null } : r,
        )
      : current.rules;
    await saveMailRules(session, rules);
  } catch {
    /* ตั้งใจกลืน — ดูคำอธิบายด้านบน */
  }
}
