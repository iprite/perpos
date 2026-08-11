/**
 * GET /f/<code>  — ลิงก์ดาวน์โหลดไฟล์สั้น (MoM PDF / เสียง / PDF ที่บีบแล้ว) ที่ส่งทาง LINE
 *   code → map (file_links) → job + kind → สร้าง signed URL สด → 302 redirect
 *   ไฟล์หมดอายุ/ถูกลบ (เก็บ 48 ชม. ตาม PDPA) → หน้า "ไฟล์หมดอายุ" แทน JSON ดิบของ Supabase
 *
 *   ⚠️ ปุ่มใน LINE Flex มีเพดาน uri 1,000 ตัวอักษร — ห้ามยัด signed URL (+ ?download=ชื่อไฟล์ไทย)
 *      ลงปุ่มตรง ๆ ต้องผ่านลิงก์สั้นนี้เสมอ
 */
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const AUDIO_BUCKET = "assistant_audio";
const PDF_BUCKET = "assistant_pdf";

function htmlPage(title: string, message: string, status: number): Response {
  const body = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · PERPOS</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:'Sarabun','Noto Sans Thai',ui-sans-serif,system-ui,sans-serif;
    background:#F5F7FA;color:#3C3B3D;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border:1px solid #E6E9EE;border-radius:16px;max-width:380px;width:100%;padding:28px;text-align:center;
    box-shadow:0 1px 3px rgba(0,0,0,.06)}
  .icon{font-size:40px;margin-bottom:8px} h1{font-size:18px;font-weight:600;margin:0 0 8px}
  p{font-size:14px;color:#656D78;line-height:1.6;margin:0} .brand{margin-top:18px;font-size:12px;color:#9CA3AF}
</style></head><body>
  <div class="card"><div class="icon">⏳</div><h1>${title}</h1><p>${message}</p>
  <div class="brand">PERPOS Assistant</div></div>
</body></html>`;
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

const EXPIRED = () =>
  htmlPage(
    "ไฟล์หมดอายุแล้ว",
    "ระบบเก็บไฟล์ไว้ 48 ชั่วโมงเพื่อความเป็นส่วนตัว (PDPA) ไฟล์นี้จึงถูกลบแล้ว",
    410,
  );

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!code) return EXPIRED();

  const admin = createSupabaseAdminClient();
  const { data: link } = await admin
    .from("file_links")
    .select("job_id, kind")
    .eq("code", code)
    .maybeSingle();
  const l = link as { job_id?: string; kind?: string } | null;
  if (!l?.job_id || !l.kind) return EXPIRED();

  const { data: job } = await admin
    .from("assistant_jobs")
    .select("org_id, file_name, pdf_meta")
    .eq("id", l.job_id)
    .maybeSingle();
  const j = job as {
    org_id?: string;
    file_name?: string;
    pdf_meta?: { output_path?: string };
  } | null;
  const orgId = j?.org_id;
  if (!orgId) return EXPIRED();

  // kind → bucket / path / ชื่อไฟล์ตอนดาวน์โหลด (ชื่อไทยยาวได้ — ไม่ผ่านปุ่ม LINE แล้ว)
  let bucket = AUDIO_BUCKET;
  let path: string;
  let download: string;
  if (l.kind === "mom") {
    path = `${orgId}/mom/${l.job_id}.pdf`;
    download = `MoM-${l.job_id}.pdf`;
  } else if (l.kind === "pdf") {
    const outputPath = j?.pdf_meta?.output_path;
    if (!outputPath) return EXPIRED();
    bucket = PDF_BUCKET;
    path = outputPath;
    download =
      String(j?.file_name ?? "document.pdf").replace(/\.pdf$/i, "") + "-CompressedbyFlow.pdf";
  } else {
    path = `${orgId}/recall/${l.job_id}.mp3`;
    download = `recording-${l.job_id}.mp3`;
  }

  const { data: signed } = await admin.storage.from(bucket).createSignedUrl(path, 60, { download });
  if (!signed?.signedUrl) return EXPIRED();
  return NextResponse.redirect(signed.signedUrl);
}
