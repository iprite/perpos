/**
 * POST /api/assistant/stt/mom-save-drive
 *   body: { jobId, orgId }   header: x-worker-secret
 *   — เรียกจาก stt-worker เมื่องานเว็บ (source='web') เสร็จ:
 *     render MoM PDF → เซฟลง Google Drive ถ้าเปิด save_mom_to_drive (best-effort, idempotent)
 *   คู่ขนานกับ mom-deliver (LINE/บอท) ที่เซฟ Drive อยู่แล้ว — งานเว็บเดิม "ไม่มี" ช่องทางเซฟ MoM ลง Drive
 */
import { NextRequest } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { ok, Err } from "../../../_lib/response";
import { type MomJson } from "@/lib/assistant/mom-html";
import { renderMomPdf, saveMomToDriveIfEnabled, momDateText } from "@/lib/assistant/mom-drive";

export async function POST(req: NextRequest) {
  const required = (process.env.WORKER_SECRET ?? "").trim();
  const got = (req.headers.get("x-worker-secret") ?? "").trim();
  if (!required || got !== required) return Err.unauthorized();

  const body = await req.json().catch(() => null);
  const { jobId, orgId } = body ?? {};
  if (!jobId || !orgId) return Err.missingField("jobId/orgId");

  const admin = createAdminClient();
  const { data: job, error } = await admin
    .from("assistant_jobs")
    .select("status, transcript_json, created_at, profile_id, mom_drive_url")
    .eq("id", jobId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) return Err.dbError(error);
  if (!job) return Err.notFound(`Transcription job ${jobId}`);

  // ยังไม่เสร็จ/ไม่มีผลสรุป → ไม่มีอะไรให้เซฟ (ไม่ใช่ error — worker best-effort)
  if (job.status !== "completed" || !job.transcript_json) {
    return ok({ skipped: "not_completed" });
  }
  // เคยอัปแล้ว → ข้าม (idempotent) โดยไม่ต้อง render PDF ซ้ำ
  if (job.mom_drive_url) return ok({ skipped: "already_saved", url: job.mom_drive_url });

  const tj = job.transcript_json as MomJson;
  const dateText = momDateText(job.created_at as string);

  let pdfBytes: Buffer;
  try {
    pdfBytes = await renderMomPdf(tj, dateText);
  } catch (e) {
    return Err.externalService("mom-pdf", e instanceof Error ? e.message : String(e));
  }

  const link = await saveMomToDriveIfEnabled(admin, {
    jobId,
    profileId: job.profile_id as string,
    tj,
    dateText,
    pdfBytes,
    existingUrl: job.mom_drive_url as string | null,
  }).catch(() => null);

  return ok({ saved: Boolean(link), url: link ?? "" });
}
