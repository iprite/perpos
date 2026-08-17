/**
 * รูปโปรไฟล์ของผู้ใช้เมล — เก็บเป็นไฟล์ **ในกล่องเมลของเจ้าตัวเอง** (Stalwart FileNode)
 *
 * ทำไมไม่เก็บใน Supabase: โซน `(mail)` ตั้งใจไม่ผูกกับฐานข้อมูล/บัญชีของ PERPOS เลย
 * (contract §1 invariant ข้อ 1) · เก็บไว้ที่เมลเซิร์ฟเวอร์ = ลบบัญชีทีเดียวข้อมูลหายตาม
 * ไม่มีของตกค้างในระบบเรา และใช้โควตาของเจ้าตัวเอง
 *
 * ⚠️ รูปนี้เห็นเฉพาะใน **เว็บเมลของเรา** — ปลายทางที่รับเมลไม่เห็น (มาตรฐานอีเมลไม่มีรูปโปรไฟล์
 *    ผู้รับเห็นจาก Gravatar/BIMI ซึ่งเป็นคนละกลไก)
 */

import { NextResponse, type NextRequest } from "next/server";

import { mailError, mailJson, withMailSession } from "../../_lib";
import { buildUploadUrl, fetchBlob, jmapRequest } from "@/lib/mail/jmap";
import type { MailSession } from "@/lib/mail/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JMAP_USING_FILES = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:filenode"] as const;

const AVATAR_NAME = "avatar";
/** เล็กพอที่จะโหลดเร็วและไม่กินโควตาเมลของผู้ใช้ */
const MAX_BYTES = 256 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"] as const;

interface FileNode {
  id: string;
  name: string;
  blobId: string;
  type: string | null;
}

/** หา node รูปโปรไฟล์ของบัญชีนี้ (ชื่อขึ้นต้น `avatar`) */
async function findAvatar(session: MailSession): Promise<FileNode | null> {
  const res = await jmapRequest(
    session,
    [["FileNode/get", { accountId: session.accountId }, "g"]],
    JMAP_USING_FILES,
  );
  const list = res.find((r) => r[2] === "g")?.[1]?.list;
  if (!Array.isArray(list)) return null;
  for (const raw of list as Record<string, unknown>[]) {
    const name = typeof raw.name === "string" ? raw.name : "";
    if (!name.startsWith(AVATAR_NAME)) continue;
    if (typeof raw.blobId !== "string" || typeof raw.id !== "string") continue;
    return {
      id: raw.id,
      name,
      blobId: raw.blobId,
      type: typeof raw.type === "string" ? raw.type : null,
    };
  }
  return null;
}

export async function GET(req: NextRequest) {
  return withMailSession(req, async (session) => {
    const node = await findAvatar(session);
    if (!node) return mailJson({ hasAvatar: false });

    const res = await fetchBlob(session, {
      blobId: node.blobId,
      name: node.name,
      type: node.type ?? "image/png",
    });

    // ต้องเป็น NextResponse เพื่อให้ `withMailSession` แนบ cookie ที่ต่ออายุแล้วได้
    return new NextResponse(await res.arrayBuffer(), {
      headers: {
        "Content-Type": node.type ?? "image/png",
        // instance เดียวเสิร์ฟหลายคน — ห้าม cache ร่วม (contract §1 invariant ข้อ 7)
        "Cache-Control": "private, no-store",
      },
    });
  });
}

export async function PUT(req: NextRequest) {
  const type = req.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!ALLOWED.includes(type as (typeof ALLOWED)[number])) {
    return mailError("mail_bad_request", "รองรับเฉพาะไฟล์ PNG / JPEG / WEBP", 400);
  }
  const body = await req.arrayBuffer();
  if (body.byteLength === 0) return mailError("mail_bad_request", "ไม่พบไฟล์รูป", 400);
  if (body.byteLength > MAX_BYTES) {
    return mailError("mail_bad_request", "รูปต้องมีขนาดไม่เกิน 256 KB", 400);
  }

  return withMailSession(req, async (session) => {
    const up = await fetch(buildUploadUrl(session), {
      method: "POST",
      headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": type },
      body,
      redirect: "manual",
      cache: "no-store",
    });
    if (!up.ok) return mailError("mail_service", "อัปโหลดรูปไม่สำเร็จ", 502);
    const blob = (await up.json()) as { blobId?: string };
    if (!blob.blobId) return mailError("mail_service", "อัปโหลดรูปไม่สำเร็จ", 502);

    // เปลี่ยนรูป = ลบของเดิมทิ้งเสมอ ไม่งั้นไฟล์เก่าค้างกินโควตาผู้ใช้
    const existing = await findAvatar(session);
    const ext = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
    const res = await jmapRequest(
      session,
      [
        [
          "FileNode/set",
          {
            accountId: session.accountId,
            ...(existing ? { destroy: [existing.id] } : {}),
            create: {
              a: { name: `${AVATAR_NAME}.${ext}`, parentId: null, blobId: blob.blobId, type },
            },
          },
          "c",
        ],
      ],
      JMAP_USING_FILES,
    );
    const result = res.find((r) => r[2] === "c")?.[1];
    const notCreated = result?.notCreated as Record<string, { description?: string }> | undefined;
    const failure = notCreated && Object.values(notCreated)[0];
    if (failure)
      return mailError("mail_bad_request", failure.description ?? "บันทึกรูปไม่สำเร็จ", 400);
    return mailJson({ ok: true });
  });
}

export async function DELETE(req: NextRequest) {
  return withMailSession(req, async (session) => {
    const node = await findAvatar(session);
    if (!node) return mailJson({ ok: true });
    await jmapRequest(
      session,
      [["FileNode/set", { accountId: session.accountId, destroy: [node.id] }, "d"]],
      JMAP_USING_FILES,
    );
    return mailJson({ ok: true });
  });
}
