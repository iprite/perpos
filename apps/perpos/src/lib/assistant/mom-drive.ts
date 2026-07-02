/**
 * MoM → PDF + Google Drive — โค้ดใช้ร่วมระหว่าง
 *   - mom-deliver (งาน LINE/บอท: render PDF แล้วทั้งส่ง LINE + เซฟ Drive)
 *   - mom-save-drive (งานเว็บ: render PDF แล้วเซฟ Drive อย่างเดียว)
 * แยกมาที่เดียวเพื่อไม่ให้ตรรกะ "เซฟ MoM ลง Drive" หลุดหายในบางช่องทาง (เดิม web ไม่มี)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMomHtml, MOM_FOOTER_TEMPLATE, type MomJson } from "@/lib/assistant/mom-html";
import { saveToDrive } from "@/lib/google/drive";

/** วันที่ไทย (Asia/Bangkok) สำหรับหัวรายงาน + ชื่อไฟล์ */
export function momDateText(createdAtIso: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(createdAtIso));
}

/** HTML → PDF ผ่าน pdf-renderer (Chromium) — throw ถ้าพลาด (ให้ caller จัดการ) */
export async function renderMomPdf(tj: MomJson, dateText: string): Promise<Buffer> {
  const renderUrl = process.env.PDF_RENDER_URL;
  const renderSecret = process.env.PDF_SERVICE_SECRET;
  if (!renderUrl) throw new Error("ยังไม่ได้ตั้งค่า PDF_RENDER_URL");

  const resp = await fetch(`${renderUrl.replace(/\/$/, "")}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(renderSecret ? { "x-pdf-secret": renderSecret } : {}),
    },
    body: JSON.stringify({
      html: buildMomHtml(tj, dateText),
      filename: "minutes-of-meeting",
      footerHtml: MOM_FOOTER_TEMPLATE,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`PDF renderer ${resp.status} ${detail}`.slice(0, 200));
  }
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * เซฟ MoM PDF ลง Google Drive ถ้าเปิด save_mom_to_drive + เชื่อม Drive — best-effort, ไม่ throw.
 * idempotent: existingUrl มีค่า → คืนลิงก์เดิม (ไม่อัปซ้ำ) · อัปสำเร็จ → เก็บ mom_drive_url
 * @returns webViewLink (หรือ existingUrl) · null ถ้าไม่เข้าเงื่อนไข/พลาด
 */
export async function saveMomToDriveIfEnabled(
  admin: SupabaseClient,
  opts: {
    jobId: string;
    profileId: string;
    tj: MomJson;
    dateText: string;
    pdfBytes: Uint8Array;
    existingUrl?: string | null;
  },
): Promise<string | null> {
  const existing = String(opts.existingUrl ?? "");
  if (existing) return existing; // เคยอัปแล้ว → ใช้ลิงก์เดิม (กันไฟล์ซ้ำเมื่อถูกเรียกซ้ำ)

  const { data: gset } = await admin
    .from("meeting_calendar_settings")
    .select("save_mom_to_drive")
    .eq("profile_id", opts.profileId)
    .maybeSingle();
  if (!(gset as { save_mom_to_drive?: boolean } | null)?.save_mom_to_drive) return null;

  const safeTitle = String(opts.tj.meeting_title || "รายงานการประชุม")
    .replace(/[\\/:*?"<>|]/g, " ")
    .trim()
    .slice(0, 80);
  // timeout race — กัน Drive API ค้างทำให้ caller ค้าง (best-effort: เกิน 15 วิ → ข้าม)
  const link = await Promise.race([
    saveToDrive(admin, opts.profileId, {
      categoryKey: "mom",
      categoryName: "รายงานการประชุม",
      fileName: `MoM ${safeTitle} ${opts.dateText}.pdf`,
      mimeType: "application/pdf",
      bytes: opts.pdfBytes,
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
  ]);
  if (link) {
    await admin.from("assistant_jobs").update({ mom_drive_url: link }).eq("id", opts.jobId);
  }
  return link;
}
