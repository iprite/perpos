/**
 * ตั้งค่าบัญชีของผู้ใช้เมลเอง — ชื่อที่แสดง (Identity) + รหัสผ่าน
 *
 * 🔴 ทุกอย่างทำ "ในนามผู้ใช้" ด้วย token จาก cookie เท่านั้น (`withMailSession`)
 *    **ห้ามแตะ credential ของแอดมิน** ที่นี่ — ผู้ใช้ต้องแก้ได้เฉพาะบัญชีตัวเอง
 *    (`lib/mail/admin-api.ts` เป็นคนละขั้ว ห้าม import เข้ามาในเส้นทางนี้)
 *
 * กฎที่ห้ามพัง:
 *  - เปลี่ยนรหัสผ่าน **ต้องยืนยันรหัสปัจจุบันเสมอ** — Stalwart ตรวจให้เอง (`currentSecret`)
 *    ถ้าผิดจะได้ `forbidden: Current secret is incorrect.` · ห้ามเลี่ยงด้วย service key
 *  - **ห้าม log รหัสผ่านทั้งเก่าและใหม่** · Sentry ตัด body ของ `/api/mail/*` อยู่แล้ว
 */

import { type NextRequest } from "next/server";

import { mailError, mailJson, readJsonBody, withMailSession } from "../../_lib";
import { jmapRequest, JMAP_USING_SUBMISSION } from "@/lib/mail/jmap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JMAP_USING_ADMIN = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"] as const;

/** ชื่อที่แสดงยาวเกินนี้ = พังหัวเมล (RFC 5322 แนะนำบรรทัดละ ≤78 ตัว) */
const MAX_NAME = 80;

interface Identity {
  id: string;
  name: string | null;
  email: string;
}

/**
 * บัญชีที่มีนามแฝงจะมี **หลาย identity** (ที่อยู่ละหนึ่ง) — ต้องอ่าน/เขียนให้ครบ
 * ไม่งั้นเปลี่ยนชื่อแล้วผู้รับเห็นชื่อไม่เหมือนกันแล้วแต่ว่าส่งจากที่อยู่ไหน
 */
async function loadIdentities(
  session: Parameters<typeof jmapRequest>[0] & { accountId: string },
): Promise<Identity[]> {
  const res = await jmapRequest(
    session,
    [["Identity/get", { accountId: session.accountId }, "i"]],
    JMAP_USING_SUBMISSION,
  );
  const list = res.find((r) => r[2] === "i")?.[1]?.list;
  if (!Array.isArray(list)) return [];
  return (list as Record<string, unknown>[])
    .filter((raw) => typeof raw.id === "string")
    .map((raw) => ({
      id: String(raw.id),
      name: typeof raw.name === "string" ? raw.name : null,
      email: String(raw.email ?? ""),
    }));
}

export async function GET(req: NextRequest) {
  return withMailSession(req, async (session) => {
    // ยึดชื่อจาก identity ของที่อยู่หลัก (ตรงกับอีเมลที่ล็อกอิน) ถ้าไม่เจอใช้ตัวแรก
    const identities = await loadIdentities(session);
    const primary = identities.find((i) => i.email === session.email) ?? identities[0];
    return mailJson({
      email: session.email,
      // Stalwart ตั้ง name เริ่มต้นเป็นอีเมล — ถือว่า "ยังไม่ได้ตั้งชื่อ"
      displayName: primary && primary.name !== primary.email ? primary.name : "",
      /** ทุกที่อยู่ที่ส่งในนามได้ (ที่อยู่หลัก + นามแฝง) — หน้าบัญชีตั้งชื่อแยกรายที่อยู่ได้ */
      identities: identities.map((i) => ({
        email: i.email,
        name: i.name && i.name !== i.email ? i.name : "",
      })),
    });
  });
}

export async function PATCH(req: NextRequest) {
  const body = await readJsonBody(req);
  return withMailSession(req, async (session) => {
    // ── เปลี่ยนรหัสผ่าน ────────────────────────────────────────────────────
    if (body.action === "change_password") {
      const currentSecret = typeof body.currentPassword === "string" ? body.currentPassword : "";
      const secret = typeof body.newPassword === "string" ? body.newPassword : "";
      if (!currentSecret || !secret) {
        return mailError("mail_bad_request", "ต้องกรอกทั้งรหัสผ่านปัจจุบันและรหัสผ่านใหม่", 400);
      }
      if (secret === currentSecret) {
        return mailError("mail_bad_request", "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม", 400);
      }

      const res = await jmapRequest(
        session,
        [
          [
            "x:AccountPassword/set",
            { accountId: session.accountId, update: { singleton: { currentSecret, secret } } },
            "p",
          ],
        ],
        JMAP_USING_ADMIN,
      );
      const result = res.find((r) => r[2] === "p")?.[1];
      const notUpdated = result?.notUpdated as
        Record<string, { description?: string; type?: string }> | undefined;
      const failure = notUpdated && Object.values(notUpdated)[0];
      if (failure) {
        // ข้อความจาก Stalwart เป็นภาษาอังกฤษ — แปลเคสที่ผู้ใช้เจอบ่อยให้เข้าใจ
        const raw = failure.description ?? "";
        if (/current secret/i.test(raw)) {
          return mailError("mail_bad_request", "รหัสผ่านปัจจุบันไม่ถูกต้อง", 400);
        }
        if (/too weak|commonly used/i.test(raw)) {
          return mailError(
            "mail_bad_request",
            "รหัสผ่านใหม่เดาง่ายเกินไป — ใช้ให้ยาวขึ้นหรือผสมคำที่ไม่ใช่คำทั่วไป",
            400,
          );
        }
        return mailError("mail_bad_request", raw || "เปลี่ยนรหัสผ่านไม่สำเร็จ", 400);
      }
      return mailJson({ ok: true });
    }

    // ── เปลี่ยนชื่อที่แสดง ─────────────────────────────────────────────────
    /**
     * รับได้ 2 แบบ:
     *  - `displayName`            → ตั้งชื่อเดียวให้ **ทุก** ที่อยู่ (กล่องที่ไม่มีนามแฝง)
     *  - `names: {email: name}`   → ตั้งชื่อ **แยกรายที่อยู่** (กล่องที่มีนามแฝง เช่น ฝ่ายขาย/บัญชี)
     * ที่อยู่ที่ไม่ได้ส่งมาใน `names` = ไม่แตะ (ห้ามรีเซ็ตของที่ผู้ใช้ตั้งไว้เงียบ ๆ)
     */
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : null;
    const rawNames =
      body.names && typeof body.names === "object" && !Array.isArray(body.names)
        ? (body.names as Record<string, unknown>)
        : null;
    if (displayName === null && !rawNames) {
      return mailError("mail_bad_request", "ไม่มีข้อมูลให้บันทึก", 400);
    }

    const byEmail = new Map<string, string>();
    for (const [email, value] of Object.entries(rawNames ?? {})) {
      byEmail.set(email.trim().toLowerCase(), typeof value === "string" ? value.trim() : "");
    }
    for (const name of [
      ...(displayName === null ? [] : [displayName]),
      ...Array.from(byEmail.values()),
    ]) {
      if (name.length > MAX_NAME) {
        return mailError("mail_bad_request", `ชื่อที่แสดงยาวเกิน ${MAX_NAME} ตัวอักษร`, 400);
      }
      // ขึ้นบรรทัดใหม่ในชื่อ = แทรกหัวเมลเพิ่มได้ (header injection)
      if (/[\r\n]/.test(name)) {
        return mailError("mail_bad_request", "ชื่อที่แสดงมีอักขระที่ใช้ไม่ได้", 400);
      }
    }

    const identities = await loadIdentities(session);
    if (identities.length === 0) {
      return mailError("mail_service", "ไม่พบข้อมูลผู้ส่งของบัญชีนี้", 502);
    }

    // ว่าง = กลับไปใช้อีเมลเป็นชื่อ (พฤติกรรมเริ่มต้นของ Stalwart)
    const update: Record<string, { name: string }> = {};
    for (const identity of identities) {
      const key = identity.email.trim().toLowerCase();
      const next = rawNames ? byEmail.get(key) : (displayName ?? undefined);
      if (next === undefined) continue;
      update[identity.id] = { name: next || identity.email };
    }
    if (Object.keys(update).length === 0) {
      return mailError("mail_bad_request", "ไม่พบที่อยู่ที่จะตั้งชื่อ", 400);
    }

    const res = await jmapRequest(
      session,
      [["Identity/set", { accountId: session.accountId, update }, "u"]],
      JMAP_USING_SUBMISSION,
    );
    const notUpdated = res.find((r) => r[2] === "u")?.[1]?.notUpdated as
      Record<string, { description?: string }> | undefined;
    const failure = notUpdated && Object.values(notUpdated)[0];
    if (failure)
      return mailError("mail_bad_request", failure.description ?? "บันทึกไม่สำเร็จ", 400);
    return mailJson({ ok: true, displayName: displayName ?? undefined });
  });
}
