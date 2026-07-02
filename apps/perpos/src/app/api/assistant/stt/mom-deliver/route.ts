/**
 * POST /api/assistant/stt/mom-deliver
 *   body: { jobId, orgId }   header: x-worker-secret
 *   — เรียกจาก stt-worker เมื่อ STT (source='line') เสร็จ:
 *     buildMomHtml → pdf-renderer → upload PDF → signed URL → push Flex (ปุ่มดาวน์โหลด) กลับ LINE
 *     (LINE bot แนบไฟล์ PDF ตรง ๆ ไม่ได้ จึงส่งเป็นลิงก์)
 */

import { NextRequest } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { ok, Err } from "../../../_lib/response";
import { type MomJson } from "@/lib/assistant/mom-html";
import { renderMomPdf, saveMomToDriveIfEnabled, momDateText } from "@/lib/assistant/mom-drive";
import { sendLineMessages } from "@/lib/line/send-messages";
import { getServiceRemaining } from "@/lib/assistant/token-balance";
import crypto from "crypto";

const BUCKET = "assistant_audio";

// Flex card แจ้งงานล้มเหลว — แยกข้อความตาม source (บอทประชุม vs อัปไฟล์เอง)
function buildFailFlex(reason: string, isRecall: boolean) {
  const title = isRecall ? "❌ สรุปการประชุมไม่สำเร็จ" : "❌ ถอดเสียงไม่สำเร็จ";
  const detail = isRecall
    ? "ขออภัย ระบบสรุปการประชุมไม่สำเร็จ"
    : reason && !reason.startsWith("quota_exceeded")
      ? reason
      : "ขออภัย ไม่สามารถถอดเสียงไฟล์นี้ได้";
  const hint = isRecall
    ? "เปิดดู/ดาวน์โหลดรายงานได้ที่หน้าผู้ช่วย AI › ประชุม ครับ 🙏"
    : "พิมพ์ /mom แล้วส่งไฟล์ใหม่อีกครั้งได้เลยครับ 🙏";
  return {
    type: "flex" as const,
    altText: `${title.replace("❌ ", "")} — ${detail}`.slice(0, 380),
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#C43448",
        paddingAll: "14px",
        contents: [{ type: "text", text: title, color: "#ffffff", weight: "bold", size: "md" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "18px",
        contents: [
          { type: "text", text: detail, size: "sm", wrap: true, color: "#3C3B3D" },
          { type: "separator", margin: "md" },
          { type: "text", text: hint, size: "xs", wrap: true, color: "#9CA3AF", margin: "md" },
        ],
      },
    },
  };
}

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
    .select(
      "file_name, status, transcript_json, created_at, profile_id, error_message, source, mom_drive_url",
    )
    .eq("id", jobId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) return Err.dbError(error);
  if (!job) return Err.notFound(`Transcription job ${jobId}`);

  // ปลายทาง LINE
  const { data: profile } = await admin
    .from("profiles")
    .select("line_user_id")
    .eq("id", job.profile_id as string)
    .maybeSingle();
  const lineUserId = (profile as { line_user_id?: string } | null)?.line_user_id;
  if (!lineUserId) return ok({ skipped: "no line_user_id" });

  const isRecall = job.source === "recall";

  // งานล้มเหลว → แจ้งด้วย Flex card (ใช้ error_message ที่เป็นมิตรจาก worker ถ้ามี)
  //   recall: ข้ามการ์ดที่นี่ — งานบอทมี scheduler retry หลายรอบ (จะ spam การ์ด fail ทุกรอบ)
  //   ปล่อยให้ scheduler giveup (failed_permanent) แจ้ง + คืนโควต้า ครั้งเดียวพอ
  if (job.status !== "completed" || !job.transcript_json) {
    if (!isRecall) {
      const reason = String(job.error_message ?? "").trim();
      await sendLineMessages({ to: lineUserId, messages: [buildFailFlex(reason, false)] });
    }
    return ok({ delivered: isRecall ? "recall_fail_silent" : "error_notice" });
  }

  // ถ้าสร้าง PDF ไม่สำเร็จด้วยเหตุใด ๆ → แจ้งผู้ใช้ทาง LINE (Flex) แล้วค่อย return error
  const failToLine = async (reason: string) => {
    await sendLineMessages({
      to: lineUserId,
      messages: [
        buildFailFlex("สร้างไฟล์ PDF รายงานการประชุมไม่สำเร็จ กรุณาลองใหม่ภายหลัง", isRecall),
      ],
    }).catch(() => undefined);
    return Err.externalService("mom-pdf", reason);
  };

  const tj = job.transcript_json as MomJson;
  const dateText = momDateText(job.created_at as string);

  // 1. HTML → PDF
  let pdfBytes: Buffer;
  try {
    pdfBytes = await renderMomPdf(tj, dateText);
  } catch (e) {
    return failToLine(e instanceof Error ? e.message : String(e));
  }

  // 2. upload + signed URL (48 ชม. — MoM อาจมีข้อมูลละเอียดอ่อน)
  const path = `${orgId}/mom/${jobId}.pdf`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (upErr) return failToLine(`Storage upload: ${upErr.message}`);

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 48 * 60 * 60, { download: `MoM-${jobId}.pdf` });
  if (signErr || !signed?.signedUrl)
    return failToLine(`signed url: ${signErr?.message ?? "failed"}`);

  // 3. เครดิตคงเหลือ (แสดงใน Flex) — unified pool: นาทีที่เหลือของ service นั้น = token ÷ rate
  const { remainMin } = await getServiceRemaining(
    admin,
    job.profile_id as string,
    isRecall ? "bot" : "stt",
  );
  const quotaLine = `${isRecall ? "🤖 เครดิตบอท" : "⏱️ เครดิต"}คงเหลือ พอใช้ได้อีก ~${remainMin} นาที`;

  // 3.5 (recall) signed URL ของไฟล์เสียง mp3 — เก็บ 48 ชม. ให้ผู้ใช้ดาวน์โหลด (best-effort)
  let audioUrl = "";
  if (isRecall) {
    const { data: aSigned } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(`${orgId}/recall/${jobId}.mp3`, 48 * 60 * 60, {
        download: `recording-${jobId}.mp3`,
      });
    audioUrl = aSigned?.signedUrl ?? "";
  }

  // 3.6 เก็บ MoM ลง Google Drive (ถ้าเปิด save_mom_to_drive + เชื่อม) — best-effort ไม่กระทบการส่ง LINE
  const momDriveUrl =
    (await saveMomToDriveIfEnabled(admin, {
      jobId,
      profileId: job.profile_id as string,
      tj,
      dateText,
      pdfBytes,
      existingUrl: job.mom_drive_url as string | null,
    }).catch(() => null)) ?? "";

  // 4. push Flex (ปุ่มดาวน์โหลด) กลับ LINE
  const privacyAudio = isRecall
    ? "ไฟล์เสียง + รายงาน PDF จะถูกลบอัตโนมัติภายใน 48 ชั่วโมง กรุณาดาวน์โหลดเก็บไว้"
    : "ไฟล์เสียงถูกลบออกจากระบบทันทีหลังประมวลผลเสร็จ · รายงาน PDF นี้จะถูกลบอัตโนมัติภายใน 48 ชั่วโมง กรุณาดาวน์โหลดเก็บไว้";
  // ลิงก์ดาวน์โหลดสั้น perpos domain (app.perpos.ai/f/<code>) → proxy สร้าง signed URL สด · ไฟล์หมดอายุ → หน้า "ไฟล์หมดอายุ"
  const fileBase = (process.env.APP_BASE_URL ?? "https://app.perpos.ai").replace(/\/$/, "");
  const shortLink = async (kind: "mom" | "audio") => {
    const code = crypto.randomBytes(6).toString("base64url"); // 8 ตัวอักษร unguessable
    await admin.from("file_links").insert({ code, job_id: jobId, kind });
    return `${fileBase}/f/${code}`;
  };
  const momFileUrl = await shortLink("mom");
  const audioFileUrl = audioUrl ? await shortLink("audio") : "";

  const footerButtons: Record<string, unknown>[] = [
    {
      type: "button",
      style: "primary",
      color: "#4DB0D3",
      height: "sm",
      action: { type: "uri", label: "ดาวน์โหลด MoM (PDF)", uri: momFileUrl },
    },
  ];
  if (audioUrl) {
    footerButtons.push({
      type: "button",
      style: "secondary",
      height: "sm",
      margin: "sm",
      action: { type: "uri", label: "ดาวน์โหลดไฟล์เสียง (MP3)", uri: audioFileUrl },
    });
  }
  if (momDriveUrl) {
    footerButtons.push({
      type: "button",
      style: "secondary",
      height: "sm",
      margin: "sm",
      action: { type: "uri", label: "📁 เปิดใน Google Drive", uri: momDriveUrl },
    });
  }

  const meetingTitle = String(tj.meeting_title || job.file_name || "รายงานการประชุม");
  const sent = await sendLineMessages({
    to: lineUserId,
    messages: [
      {
        type: "flex",
        altText: `รายงานการประชุมเสร็จแล้ว: ${meetingTitle}`,
        contents: {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "📋 รายงานการประชุม (MoM)",
                weight: "bold",
                size: "md",
                color: "#4DB0D3",
              },
              { type: "text", text: meetingTitle, size: "sm", wrap: true, color: "#1A1A1B" },
              {
                type: "text",
                text: "ถอดเสียงเสร็จแล้ว กดปุ่มด้านล่างเพื่อดาวน์โหลด",
                size: "xs",
                wrap: true,
                color: "#656D78",
              },
              { type: "text", text: quotaLine, size: "xs", color: "#9CA3AF", margin: "sm" },
              { type: "separator", margin: "md" },
              {
                type: "box",
                layout: "vertical",
                spacing: "xs",
                margin: "md",
                contents: [
                  {
                    type: "text",
                    text: "🔒 ความเป็นส่วนตัวของข้อมูล",
                    size: "xs",
                    weight: "bold",
                    color: "#656D78",
                  },
                  { type: "text", text: privacyAudio, size: "xxs", wrap: true, color: "#9CA3AF" },
                  {
                    type: "text",
                    text: "เราไม่นำข้อมูลของคุณไปใช้ฝึกหรือพัฒนาโมเดล AI ใด ๆ ทั้งสิ้น",
                    size: "xxs",
                    wrap: true,
                    color: "#9CA3AF",
                  },
                ],
              },
            ],
          },
          footer: { type: "box", layout: "vertical", contents: footerButtons },
        },
      },
    ],
  });

  if (!sent.ok) return Err.externalService("LINE", sent.error);
  return ok({ delivered: true });
}
