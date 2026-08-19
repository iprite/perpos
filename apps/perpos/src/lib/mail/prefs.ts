/**
 * ความชอบส่วนตัวของผู้ใช้เมล (มุมมองรายการ ฯลฯ) — เก็บเป็นไฟล์ **ในกล่องเมลของเจ้าตัวเอง**
 * (Stalwart FileNode) ท่าเดียวกับรูปโปรไฟล์
 *
 * ทำไมไม่เก็บใน localStorage อย่างเดียว: อย่างนั้นเป็นความชอบของ "เครื่อง" ไม่ใช่ของ "คน"
 * — เครื่องที่ใช้ร่วมกันจะเห็นค่าของคนก่อนหน้า และเปลี่ยนเบราว์เซอร์/เครื่องแล้วค่าหาย
 * เก็บที่เมลเซิร์ฟเวอร์ = ตามตัวผู้ใช้ไปทุกที่ และ **ไม่ผูกกับ DB ของ PERPOS**
 * (invariant ข้อ 1 ของโซน `(mail)`) · ลบกล่องเมลทีเดียวข้อมูลหายตาม ไม่มีของตกค้างฝั่งเรา
 *
 * ⚠️ อ่านไม่ได้/ยังไม่มีไฟล์ = คืนค่าเริ่มต้นเสมอ **ห้ามโยน** — ความชอบพังต้องไม่ทำให้เปิดเมลไม่ได้
 */

import { MailServiceError, buildDownloadUrl, buildUploadUrl, jmapRequest } from "./jmap";
import { MAIL_LOCALE_DEFAULT, normalizeMailLocale } from "./i18n";
import {
  MAIL_LIST_WIDTH_DEFAULT,
  clampMailListWidth,
  normalizeMailSignature,
} from "./prefs-storage";
import type { MailPrefs, MailSession } from "./types";

const JMAP_USING_FILES = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:filenode"] as const;

const PREFS_NAME = "perpos-prefs.json";
const PREFS_TYPE = "application/json";
/** ไฟล์ตั้งค่าเล็กมาก — ใหญ่กว่านี้แปลว่ามีอะไรผิด ไม่ต้องอ่านต่อ */
const MAX_BYTES = 8 * 1024;

export const MAIL_PREFS_DEFAULT: MailPrefs = {
  pane: "split",
  listWidth: MAIL_LIST_WIDTH_DEFAULT,
  locale: MAIL_LOCALE_DEFAULT,
  signature: "",
  signatureOnReply: true,
};

interface FileNodeInfo {
  id: string;
  blobId: string;
}

async function findPrefsNode(session: MailSession): Promise<FileNodeInfo | null> {
  const res = await jmapRequest(
    session,
    [["FileNode/get", { accountId: session.accountId }, "g"]],
    JMAP_USING_FILES,
  );
  const list = res.find((r) => r[2] === "g")?.[1]?.list;
  if (!Array.isArray(list)) return null;
  for (const raw of list as Record<string, unknown>[]) {
    if (raw.name !== PREFS_NAME) continue;
    if (typeof raw.id !== "string" || typeof raw.blobId !== "string") continue;
    return { id: raw.id, blobId: raw.blobId };
  }
  return null;
}

/** ตรวจทีละช่อง — ไฟล์นี้ผู้ใช้แก้เองผ่าน IMAP/ไคลเอนต์อื่นได้ ห้ามเชื่อรูปร่างที่อ่านมา */
export function normalizeMailPrefs(raw: unknown): MailPrefs {
  if (!raw || typeof raw !== "object") return MAIL_PREFS_DEFAULT;
  const obj = raw as Record<string, unknown>;
  return {
    pane: obj.pane === "list" ? "list" : "split",
    listWidth: clampMailListWidth(obj.listWidth),
    locale: normalizeMailLocale(obj.locale),
    signature: normalizeMailSignature(obj.signature),
    // ไม่เคยตั้ง (ไฟล์เก่า) = ใส่ตอนตอบด้วย — ตรงกับที่ผู้ใช้คาดจากเมลไคลเอนต์ทั่วไป
    signatureOnReply: obj.signatureOnReply !== false,
  };
}

export async function readMailPrefs(session: MailSession): Promise<MailPrefs> {
  try {
    const node = await findPrefsNode(session);
    if (!node) return MAIL_PREFS_DEFAULT;
    const url = buildDownloadUrl(session, {
      blobId: node.blobId,
      name: PREFS_NAME,
      type: PREFS_TYPE,
    });
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { Authorization: `Bearer ${session.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return MAIL_PREFS_DEFAULT;
    const text = await res.text();
    if (text.length > MAX_BYTES) return MAIL_PREFS_DEFAULT;
    return normalizeMailPrefs(JSON.parse(text));
  } catch {
    return MAIL_PREFS_DEFAULT;
  }
}

export async function writeMailPrefs(session: MailSession, prefs: MailPrefs): Promise<void> {
  const body = JSON.stringify(normalizeMailPrefs(prefs));

  const up = await fetch(buildUploadUrl(session), {
    method: "POST",
    redirect: "manual",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": PREFS_TYPE,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!up.ok) throw new MailServiceError(502, "บันทึกการตั้งค่าไม่สำเร็จ");
  const blob = (await up.json().catch(() => null)) as { blobId?: string } | null;
  if (!blob?.blobId) throw new MailServiceError(502, "บันทึกการตั้งค่าไม่สำเร็จ");

  // เขียนทับ = ลบไฟล์เดิมในคำสั่งเดียวกัน ไม่งั้นไฟล์เก่าค้างกินโควตาของผู้ใช้ (บทเรียนจากรูปโปรไฟล์)
  const existing = await findPrefsNode(session);
  await jmapRequest(
    session,
    [
      [
        "FileNode/set",
        {
          accountId: session.accountId,
          ...(existing ? { destroy: [existing.id] } : {}),
          create: {
            p: { name: PREFS_NAME, parentId: null, blobId: blob.blobId, type: PREFS_TYPE },
          },
        },
        "c",
      ],
    ],
    JMAP_USING_FILES,
  );
}
