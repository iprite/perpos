import { getAdminClient } from '../lib/supabase';
import { fetch as undiciFetch, Agent } from 'undici';
import { parseBuffer } from 'music-metadata';

// dispatcher สำหรับ Gemini generateContent: ปิด timeout เริ่มต้นของ undici (default
// headersTimeout 300s) เพราะไฟล์ยาวอาจใช้เวลา generate หลายนาที
const geminiDispatcher = new Agent({
  headersTimeout: 600_000, // 10 นาที
  bodyTimeout: 600_000,
  connectTimeout: 60_000,
});

// error ที่ "ผู้ใช้แก้เองได้" (ไฟล์เสีย/ยาวเกิน/ไม่มีเนื้อหา) → ข้อความนี้แสดงให้ผู้ใช้ตรง ๆ
// ได้ทั้งบนเว็บ (error_message) และ LINE. ส่วน error เทคนิค (Gemini 503, network, storage)
// จะถูกแปลงเป็นข้อความ generic แทน ไม่รั่วรายละเอียดเทคนิคไปหาผู้ใช้
class UserFacingError extends Error {}

// ─── Types ───────────────────────────────────────────────────────────────────
export type KeyTopic = {
  topic: string;
  details: string;
};

export type ActionItem = {
  task: string;
  assignee: string;    // "ไม่ระบุ" ถ้าไม่มี
  deadline: string;    // "" ถ้าไม่มี
};

export type TranscriptResult = {
  meeting_title: string;
  executive_summary: string;
  language: string;
  speakers: string[];        // ผู้เข้าร่วม / ผู้พูดที่ตรวจพบ
  key_topics: KeyTopic[];    // ประเด็นที่หารือ
  decisions: string[];       // มติ / ข้อสรุปของที่ประชุม
  action_items: ActionItem[];
  recommendations: string[]; // ข้อเสนอแนะจาก AI ต่อประเด็นในที่ประชุม
};

// token usage จริงจาก Gemini (เก็บลง assistant_jobs → คิดต้นทุนเป๊ะฝั่งอ่าน)
export type GeminiUsage = {
  prompt_tokens: number;            // input รวม (เสียง + ข้อความ prompt)
  audio_input_tokens: number | null; // เฉพาะ modality=AUDIO (null ถ้า Gemini ไม่แยก)
  output_tokens: number;            // candidates + thoughts (คิดที่ราคา output)
  thoughts_tokens: number;          // thinking (subset ของ output)
  raw: unknown;                     // usageMetadata ดิบ
};

// ใช้ flash อย่างเดียวก่อน (pro = paid-tier quota สูง/แพง) — model อื่นจะถูก fallback เป็น flash
const ALLOWED_MODELS = ['gemini-2.5-flash'] as const;
const DEFAULT_MODEL = 'gemini-2.5-flash';

const BUCKET = 'assistant_audio';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

// ─── Prompt: ถอดเสียง + แยกผู้พูด + สรุปแบบมืออาชีพ (สไตล์ Plaud) ───────────────
// Gemini ฟังไฟล์เสียงแบบ native + รู้ timestamp เอง → ไม่ต้องตัดไฟล์/คำนวณ offset
const PROMPT = `คุณคือเลขานุการการประชุมมืออาชีพระดับผู้บริหาร (Executive Secretary) ที่มีประสบการณ์จดรายงานการประชุมองค์กรมายาวนาน หน้าที่ของคุณ: ฟังไฟล์เสียง/วิดีโอการประชุมที่ให้มา "ทั้งไฟล์" อย่างตั้งใจและละเอียด แล้วเรียบเรียงเป็น "รายงานการประชุม (Minutes of Meeting)" ภาษาไทยที่เป็นทางการ เฉียบคม ครบถ้วน อ่านแล้วเข้าใจทั้งการประชุมและนำไปปฏิบัติต่อได้ทันที โดยไม่ต้องฟังเสียงซ้ำ

หลักการทำงานของเลขามืออาชีพ:
- จับ "สาระ" ไม่ใช่ "คำพูด" — กลั่นบทสนทนาที่กระจัดกระจาย ออกนอกเรื่อง พูดซ้ำ หรือพูดไม่จบ ให้เป็นใจความที่เรียบเรียงชัดเจน เป็นระบบ และเรียงตามลำดับตรรกะ
- ครบถ้วน ไม่ตกหล่น — ทุกประเด็นที่มีนัยสำคัญต่อการตัดสินใจหรือการทำงานต่อ ต้องถูกบันทึก ห้ามมองข้ามแม้ประเด็นที่ถูกพูดผ่าน ๆ แต่สำคัญ
- เป็นกลางและตรงข้อเท็จจริง — รายงานสิ่งที่พูดจริง ห้ามแต่งเติม ห้ามสมมติตัวเลข/ชื่อ/ข้อสรุปที่ไม่ได้พูด ถ้าข้อมูลไม่ชัดให้ระบุว่า "ยังไม่ได้ข้อสรุป" แทนการเดา
- เขียนด้วยภาษาเขียนเชิงทางการ กระชับ ใช้คำศัพท์ทางธุรกิจ/วิชาชีพให้ถูกต้อง ไม่ใช้ภาษาพูด ไม่ใช้คำฟุ่มเฟือย

กฎเฉพาะ:
1. ระบุผู้เข้าร่วม (diarization) ใน "speakers" — ตั้งเป็น "ผู้พูด 1", "ผู้พูด 2" ... ถ้ามีการเอ่ยชื่อจริง/ตำแหน่งในเสียง ให้ใช้ชื่อจริงแทนทันที
2. ห้ามใส่เวลา/timestamp และไม่ต้องถอดบทสนทนาคำต่อคำ — เน้นเรียบเรียงสาระ
3. เสียงเป็นภาษาใด ให้สรุปเป็นภาษานั้น (เสียงไทย → รายงานภาษาไทย)
4. โครงรายงาน:
   - meeting_title: ตั้งชื่อการประชุมที่สื่อใจความหลักอย่างมืออาชีพ (ไม่ใช่แค่ "การประชุม")
   - executive_summary: บทสรุปสำหรับผู้บริหาร 3-6 บรรทัด — ครอบคลุมวัตถุประสงค์การประชุม ผลลัพธ์/ข้อสรุปสำคัญที่สุด และทิศทางต่อไป เขียนให้คนที่ไม่ได้เข้าประชุมอ่านแล้วเห็นภาพรวมทันที
   - key_topics: "ทุก" ประเด็นที่หารือ เรียงตามลำดับความสำคัญ/ลำดับการประชุม แต่ละประเด็นมี topic (หัวข้อกระชับ) + details (สาระเชิงลึก: บริบท ข้อมูล/ตัวเลขที่อ้างถึง ข้อโต้แย้ง/มุมมองที่ต่างกัน และข้อสรุปของประเด็นนั้น) เขียนเป็นย่อหน้าสมบูรณ์ ไม่ใช่วลีสั้น ๆ
   - decisions: เฉพาะ "มติ/ข้อสรุปที่ที่ประชุมตกลงร่วมกันแล้ว" ระบุให้ชัดว่าตกลงอะไร เงื่อนไขอะไร (ถ้าประเด็นใดยังไม่สรุป อย่านำมาใส่ที่นี่ — ให้ไปอยู่ใน action_items หรือ recommendations แทน)
   - action_items: สิ่งที่ต้องไปดำเนินการต่อ เขียน task เป็นประโยคที่สั่งงานได้จริง (ขึ้นต้นด้วยกริยา ระบุผลลัพธ์ที่คาดหวัง) + assignee (ผู้รับผิดชอบที่ระบุในที่ประชุม) + deadline (กำหนดส่งถ้ามี) — ดึงให้ครบทุกงานที่ถูกมอบหมายหรือรับปากในที่ประชุม
   - recommendations: ข้อเสนอแนะเชิงวิเคราะห์จากมุมมองเลขา/ที่ปรึกษา — ชี้ความเสี่ยงที่ควรระวัง จุดที่ยังตกหล่น/ควรตัดสินใจเพิ่ม ประเด็นที่ควรติดตาม หรือโอกาสที่ควรพิจารณา ให้เจาะจงกับเนื้อหาจริงที่คุยกัน มีเหตุผลรองรับ ไม่พูดลอย ๆ และไม่ซ้ำกับ decisions — 3-6 ข้อ
5. ตอบกลับเป็น JSON เท่านั้น ห้ามมีคำเกริ่นนำ ห้ามมี markdown

โครงสร้าง JSON ที่ต้องการ:
{
  "meeting_title": "ชื่อหัวข้อการประชุม (วิเคราะห์จากเนื้อหา)",
  "language": "th",
  "speakers": ["ผู้พูด 1", "ผู้พูด 2"],
  "executive_summary": "บทสรุปสำหรับผู้บริหาร 3-6 บรรทัด",
  "key_topics": [
    { "topic": "ชื่อประเด็นที่หารือ", "details": "สาระเชิงลึกของประเด็น: บริบท ตัวเลข/ข้อมูล มุมมองที่ต่างกัน และข้อสรุปของประเด็น" }
  ],
  "decisions": [ "มติ/ข้อสรุปที่ที่ประชุมตกลงร่วมกันแล้ว" ],
  "action_items": [
    { "task": "งานที่ต้องดำเนินการ (ขึ้นต้นด้วยกริยา ระบุผลลัพธ์)", "assignee": "ชื่อผู้รับผิดชอบ หรือ 'ไม่ระบุ'", "deadline": "กำหนดส่ง หรือ ''" }
  ],
  "recommendations": [ "ข้อเสนอแนะเชิงวิเคราะห์ที่เจาะจงกับประเด็นจริง มีเหตุผลรองรับ" ]
}`;

// ── Public entrypoint (never throws — invoked fire-and-forget) ──────────────
export async function processJob(jobId: string, orgId: string): Promise<void> {
  try {
    await runJob(jobId, orgId);
  } catch (e) {
    console.error(
      `[stt-worker] Unhandled error processing job ${jobId}:`,
      e instanceof Error ? e.message : String(e),
    );
  }
}

// ── Core job runner ───────────────────────────────────────────────────────────
async function runJob(jobId: string, orgId: string): Promise<void> {
  const admin = getAdminClient();

  const { data: job, error: jobError } = await admin
    .from('assistant_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (jobError) {
    console.error(`[stt-worker] Failed to load job ${jobId}:`, jobError.message);
    return;
  }
  if (!job) {
    console.warn(`[stt-worker] Job ${jobId} not found for org ${orgId}`);
    return;
  }
  if (job.status === 'completed') {
    console.log(`[stt-worker] Job ${jobId} already completed; skipping.`);
    return;
  }

  const profileId = String(job.profile_id ?? '');
  let reservedSeconds = 0; // โควต้าที่จองไว้ — ใช้ refund ถ้า STT ล้มหลังจอง

  try {
    const model = ALLOWED_MODELS.includes(job.model) ? (job.model as string) : DEFAULT_MODEL;

    // 1. หาไฟล์เสียง:
    //    - งาน LINE (source='line', ยังไม่มี audio_url) → โหลดจาก LINE content API เองที่นี่
    //      (ย้ายงานหนักมาจาก webhook กัน Vercel timeout/LINE retry) แล้วอัปขึ้น storage
    //    - งานเว็บ → โหลดจาก storage ตามปกติ
    let bytes: Buffer;
    let mimeType: string;
    if (job.source === 'line' && !job.audio_url && job.line_message_id) {
      ({ bytes, mimeType } = await ingestLineAudio(admin, job, orgId));
    } else {
      const storagePath = extractStoragePath(job.audio_url as string);
      if (!storagePath.startsWith(`${orgId}/`)) {
        throw new Error('เส้นทางไฟล์เสียงไม่ตรงกับองค์กร');
      }
      ({ bytes, mimeType } = await downloadAudio(storagePath));
    }

    // 1.5 วัดความยาว → จองโควต้า (atomic) ก่อนเรียก Gemini เพื่อคุมค่าใช้จ่าย
    const durationSec = await measureDuration(bytes, mimeType);
    await admin.from('assistant_jobs').update({ duration_seconds: durationSec }).eq('id', jobId);

    const { data: reserveData } = await admin.rpc('consume_stt_quota', {
      p_profile_id: profileId, p_seconds: durationSec, p_job_id: jobId, p_source: String(job.source ?? 'web'),
    });
    const reserve = reserveData as { ok?: boolean; remaining_seconds?: number } | null;
    if (!reserve?.ok) {
      const remainMin = Math.max(0, Math.floor((reserve?.remaining_seconds ?? 0) / 60));
      const fileMin = Math.max(1, Math.ceil(durationSec / 60));
      console.log(`[stt-worker] Job ${jobId} quota exceeded (file ${durationSec}s, remain ${reserve?.remaining_seconds}s)`);
      await admin.from('assistant_jobs').update({
        status: 'failed',
        error_message: `quota_exceeded: ไฟล์ ~${fileMin} นาที เหลือ ${remainMin} นาที`,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
      if (job.source === 'line') {
        await pushLineToProfile(profileId, [{
          type: 'flex',
          altText: `โควต้าไม่พอ — ไฟล์ ~${fileMin} นาที เหลือ ${remainMin} นาที`,
          contents: {
            type: 'bubble',
            header: {
              type: 'box', layout: 'vertical', backgroundColor: '#dc2626', paddingAll: '14px',
              contents: [{ type: 'text', text: '❌ ประมวลผลไม่ได้', color: '#ffffff', weight: 'bold', size: 'md' }],
            },
            body: {
              type: 'box', layout: 'vertical', spacing: 'sm',
              contents: [
                { type: 'text', text: 'โควต้าถอดเสียงไม่พอ', weight: 'bold', size: 'sm', color: '#111827' },
                { type: 'text', text: `ไฟล์เสียงของคุณยาว ~${fileMin} นาที แต่โควต้าคงเหลือมีเพียง ${remainMin} นาที`, wrap: true, size: 'xs', color: '#6b7280' },
                { type: 'text', text: 'ติดต่อแอดมินเพื่อเพิ่มโควต้าครับ 🙏', wrap: true, size: 'xs', color: '#94a3b8', margin: 'md' },
              ],
            },
          },
        }]).catch(() => undefined);
      }
      return; // ไม่เรียก Gemini เลย
    }
    reservedSeconds = durationSec;

    // 2. upload ไฟล์ทั้งก้อนเข้า Gemini Files API → ถอด+สรุปในครั้งเดียว

    const { fileUri, fileName } = await uploadToGeminiFiles(bytes, mimeType, String(job.file_name ?? 'audio'));
    let transcript: TranscriptResult;
    let usage: GeminiUsage | null;
    try {
      ({ transcript, usage } = await transcribeWithGemini(fileUri, mimeType, model));
    } finally {
      await deleteGeminiFile(fileName).catch(() => undefined); // best-effort cleanup
    }
    const transcriptText = buildTranscriptText(transcript);

    // 3. Mark job completed — guard บน status='processing' กัน race กับ stuck-sweep:
    //    ถ้า scheduler ชิง mark job เป็น 'failed' + refund ไปแล้ว (งานยาวเกิน threshold)
    //    update นี้จะได้ 0 แถว → ห้าม overwrite เป็น completed และห้าม deliver ซ้ำ
    //    (ไม่งั้นผู้ใช้ได้ทั้งข้อความ timeout และ PDF + โควต้าถูก refund ทั้งที่งานสำเร็จ)
    const { data: finalized, error: updateEndError } = await admin
      .from('assistant_jobs')
      .update({
        status: 'completed',
        transcript_json: transcript,
        transcript_text: transcriptText,
        error_message: null,
        // token จริงจาก Gemini → ฝั่งอ่านคิดต้นทุนเป๊ะด้วยราคาปัจจุบัน (best-effort, ไม่มีก็ปล่อย null)
        prompt_tokens: usage?.prompt_tokens ?? null,
        audio_input_tokens: usage?.audio_input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
        thoughts_tokens: usage?.thoughts_tokens ?? null,
        usage_metadata: usage?.raw ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('status', 'processing')
      .select('id');
    if (updateEndError) throw new Error(updateEndError.message);
    if (!finalized || finalized.length === 0) {
      console.warn(`[stt-worker] Job ${jobId} no longer 'processing' (likely stuck-swept) — skipping delivery.`);
      return;
    }

    console.log(`[stt-worker] Job ${jobId} completed (${transcript.key_topics.length} topics, ${transcript.action_items.length} actions).`);

    // 4. Best-effort delivery (failure must not fail the job).
    if (job.source === 'line') {
      // งานจาก LINE → ให้ฝั่ง Next.js สร้าง PDF แล้วส่ง Flex (ปุ่มดาวน์โหลด) กลับ LINE
      await deliverMomToLine(jobId, orgId).catch((e) =>
        console.warn(`[stt-worker] mom-deliver failed for ${jobId}: ${String(e)}`),
      );
    } else {
      await notifyLine(job).catch((e) =>
        console.warn(`[stt-worker] LINE notify failed for ${jobId}: ${String(e)}`),
      );
    }
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    console.error(`[stt-worker] Job ${jobId} failed:`, rawMsg);
    // user-facing → แสดงข้อความ actionable ตรง ๆ · เทคนิค → generic (ไม่รั่วรายละเอียดไปหาผู้ใช้)
    const errorMsg = err instanceof UserFacingError
      ? err.message
      : 'ประมวลผลไม่สำเร็จ กรุณาลองส่งไฟล์ใหม่อีกครั้ง';
    // STT ล้มหลังจองโควต้าแล้ว → คืนโควต้า (idempotent, ผูกกับ job → stuck-sweep เรียกซ้ำได้ปลอดภัย)
    if (reservedSeconds > 0) {
      await admin.rpc('refund_stt_job', { p_job_id: jobId }).then(() => undefined, () => undefined);
    }
    await admin
      .from('assistant_jobs')
      .update({ status: 'failed', error_message: errorMsg, updated_at: new Date().toISOString() })
      .eq('id', jobId);
    // งานจาก LINE ที่ fail → แจ้งผู้ใช้ผ่าน deliver route (push text error)
    if (job.source === 'line') {
      await deliverMomToLine(jobId, orgId).catch(() => undefined);
    }
  }
}

// ส่งงานให้ฝั่ง Next.js สร้าง PDF MoM แล้ว push กลับ LINE (secret-gated)
async function deliverMomToLine(jobId: string, orgId: string): Promise<void> {
  const baseUrl = (process.env.APP_BASE_URL ?? 'https://perpos.io').replace(/\/$/, '');
  const secret = (process.env.WORKER_SECRET ?? '').trim();
  const resp = await fetch(`${baseUrl}/api/assistant/stt/mom-deliver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-worker-secret': secret },
    body: JSON.stringify({ jobId, orgId }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!resp.ok) throw new Error(`mom-deliver responded ${resp.status}`);
}

// ── Storage ──────────────────────────────────────────────────────────────────
function extractStoragePath(audioUrl: string): string {
  if (audioUrl.includes(`/${BUCKET}/`)) {
    return audioUrl.split(`/${BUCKET}/`)[1].split('?')[0];
  }
  return audioUrl.split('?')[0];
}

async function downloadAudio(storagePath: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(storagePath);
  if (error) throw new Error(`ดาวน์โหลดไฟล์เสียงจาก storage ล้มเหลว: ${error.message}`);

  const arrayBuffer = await data.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  const mimeType = data.type || 'audio/mpeg';
  return { bytes, mimeType };
}

// ── LINE: โหลดไฟล์เสียงจาก content API → อัป storage → อัปเดต job (สำหรับงาน source='line') ──
const STT_ALLOWED_MIME = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/aac',
  'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'video/mp4', 'video/webm', 'video/quicktime',
]);
const MIME_TO_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/aac': 'aac', 'audio/flac': 'flac',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov',
};

async function ingestLineAudio(
  admin: ReturnType<typeof getAdminClient>,
  job: Record<string, unknown>,
  orgId: string,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const lineToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? '';
  const messageId = String(job.line_message_id);

  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${lineToken}` },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`ดาวน์โหลดไฟล์เสียงจาก LINE ล้มเหลว (${res.status})`);

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 200 * 1024 * 1024) {
    throw new Error('ไฟล์ใหญ่เกิน 200MB กรุณาส่งไฟล์ที่เล็กลง');
  }

  let mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!STT_ALLOWED_MIME.has(mimeType)) mimeType = 'audio/mp4';
  const ext = MIME_TO_EXT[mimeType] ?? 'm4a';
  const storagePath = `${orgId}/line/${Date.now()}-${messageId}.${ext}`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: true });
  if (upErr) throw new Error(`อัปโหลดไฟล์เสียงไม่สำเร็จ: ${upErr.message}`);

  await admin
    .from('assistant_jobs')
    .update({ audio_url: storagePath, mime_type: mimeType, file_size: bytes.length, updated_at: new Date().toISOString() })
    .eq('id', job.id as string);

  return { bytes, mimeType };
}

// ── Gemini Files API (resumable upload — รองรับไฟล์เสียงใหญ่ถึง 2GB) ────────────
async function uploadToGeminiFiles(
  bytes: Buffer,
  mimeType: string,
  displayName: string,
): Promise<{ fileUri: string; fileName: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  // 1. Start resumable upload session.
  const startRes = await fetch(`${GEMINI_BASE}/upload/v1beta/files?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!startRes.ok) {
    throw new Error(`Gemini Files upload (start) failed: ${startRes.status} - ${await startRes.text()}`);
  }
  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini Files API ไม่ส่ง upload URL กลับมา');

  // 2. Upload bytes + finalize.
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(bytes.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: new Uint8Array(bytes),
  });
  if (!uploadRes.ok) {
    throw new Error(`Gemini Files upload (finalize) failed: ${uploadRes.status} - ${await uploadRes.text()}`);
  }
  const uploaded = (await uploadRes.json()) as {
    file?: { name?: string; uri?: string; state?: string };
  };
  const fileName = uploaded.file?.name;
  let fileUri = uploaded.file?.uri;
  let state = uploaded.file?.state;
  if (!fileName || !fileUri) throw new Error('Gemini Files API ไม่ส่งข้อมูลไฟล์กลับมา');

  // 3. Poll until ACTIVE (audio/video ผ่าน PROCESSING ก่อนใช้งานได้).
  const deadline = Date.now() + 5 * 60 * 1000; // 5 นาที
  while (state === 'PROCESSING') {
    if (Date.now() > deadline) throw new Error('Gemini ประมวลผลไฟล์นานเกินกำหนด (timeout)');
    await sleep(2000);
    const pollRes = await fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${apiKey}`);
    if (!pollRes.ok) throw new Error(`Gemini Files poll failed: ${pollRes.status}`);
    const polled = (await pollRes.json()) as { state?: string; uri?: string };
    state = polled.state;
    if (polled.uri) fileUri = polled.uri;
  }
  if (state !== 'ACTIVE') throw new Error(`ไฟล์บน Gemini ไม่พร้อมใช้งาน (state=${state})`);

  return { fileUri, fileName };
}

// ลบไฟล์บน Gemini Files API (best-effort cleanup — ไม่รอ auto-expire 48 ชม.)
async function deleteGeminiFile(fileName: string): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !fileName) return;
  await fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${apiKey}`, { method: 'DELETE' });
}

// ── Gemini transcription + summary ─────────────────────────────────────────────
async function transcribeWithGemini(
  fileUri: string,
  mimeType: string,
  model: string,
): Promise<{ transcript: TranscriptResult; usage: GeminiUsage | null }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [
          { text: PROMPT },
          { file_data: { mime_type: mimeType, file_uri: fileUri } },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 65536,
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  });

  // Retry-with-backoff สำหรับ error ชั่วคราว — ทั้ง HTTP status (429/500/503)
  // และ network error ที่ fetch โยน (เช่น "fetch failed" / timeout ของไฟล์ยาว)
  const RETRYABLE = new Set([429, 500, 503]);
  const MAX_ATTEMPTS = 4;
  let response: Awaited<ReturnType<typeof undiciFetch>> | null = null;
  let lastErr = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      response = await undiciFetch(
        `${GEMINI_BASE}/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody, dispatcher: geminiDispatcher },
      );
    } catch (e) {
      // network-level error (fetch failed/timeout) — retry
      lastErr = `network: ${e instanceof Error ? e.message : String(e)}`;
      if (attempt === MAX_ATTEMPTS) throw new Error(`Gemini API request failed: ${lastErr}`);
      await sleep(3000 * 2 ** (attempt - 1));
      continue;
    }
    if (response.ok) break;
    lastErr = `${response.status} - ${await response.text()}`;
    if (!RETRYABLE.has(response.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(`Gemini API request failed: ${lastErr}`);
    }
    await sleep(3000 * 2 ** (attempt - 1)); // backoff: 3s, 6s, 12s
  }
  if (!response) throw new Error(`Gemini API request failed: ${lastErr || 'no response'}`);

  const result = (await response.json()) as {
    candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      totalTokenCount?: number;
      promptTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
    };
  };
  if (!result.candidates || result.candidates.length === 0) {
    const blockReason = result.promptFeedback?.blockReason || 'Blocked by Gemini safety settings or filter';
    console.warn(`[stt-worker] Gemini no candidates: ${blockReason}`);
    throw new UserFacingError('ไม่สามารถประมวลผลไฟล์นี้ได้ (อาจถูกตัวกรองเนื้อหา) กรุณาลองไฟล์อื่น');
  }
  const finishReason = result.candidates[0].finishReason;
  if (finishReason === 'MAX_TOKENS') {
    throw new UserFacingError('เนื้อหายาวมากจนผลลัพธ์เกินขนาดที่รองรับ — ลองใช้ไฟล์สั้นลง');
  }
  if (finishReason && finishReason !== 'STOP') {
    console.warn(`[stt-worker] Gemini incomplete finishReason=${finishReason}`);
    throw new UserFacingError('ประมวลผลไฟล์ไม่สมบูรณ์ กรุณาลองส่งไฟล์ใหม่อีกครั้ง');
  }

  // output อาจถูกแบ่งเป็นหลาย parts — รวมทุก part เป็น JSON เดียว
  const text = (result.candidates[0].content?.parts ?? [])
    .map((p) => p?.text ?? '')
    .join('');
  return { transcript: parseTranscript(text), usage: parseGeminiUsage(result.usageMetadata) };
}

// แปลง usageMetadata ดิบ → GeminiUsage (แยก token เสียงจาก modality breakdown ถ้ามี)
function parseGeminiUsage(meta: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  promptTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
} | undefined): GeminiUsage | null {
  if (!meta) return null;
  const prompt = Number(meta.promptTokenCount ?? 0);
  const candidates = Number(meta.candidatesTokenCount ?? 0);
  const thoughts = Number(meta.thoughtsTokenCount ?? 0);
  let audio: number | null = null;
  if (Array.isArray(meta.promptTokensDetails)) {
    const a = meta.promptTokensDetails.find((d) => String(d?.modality ?? '').toUpperCase() === 'AUDIO');
    if (a) audio = Number(a.tokenCount ?? 0);
  }
  return {
    prompt_tokens: prompt,
    audio_input_tokens: audio,
    output_tokens: candidates + thoughts,
    thoughts_tokens: thoughts,
    raw: meta,
  };
}

function parseTranscript(text: string): TranscriptResult {
  const cleaned = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // fallback: ดึงเฉพาะช่วง { ... } เผื่อมีข้อความปนหน้า/หลัง
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('แปลงผลลัพธ์ JSON จาก Gemini ล้มเหลว');
    try {
      parsed = JSON.parse(cleaned.slice(first, last + 1)) as Record<string, unknown>;
    } catch {
      throw new Error('แปลงผลลัพธ์ JSON จาก Gemini ล้มเหลว');
    }
  }

  const key_topics: KeyTopic[] = Array.isArray(parsed.key_topics)
    ? (parsed.key_topics as unknown[]).map((e) => {
        const o = (e ?? {}) as Record<string, unknown>;
        return { topic: String(o.topic ?? ''), details: String(o.details ?? '') };
      })
    : [];

  const decisions: string[] = Array.isArray(parsed.decisions)
    ? (parsed.decisions as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];

  const recommendations: string[] = Array.isArray(parsed.recommendations)
    ? (parsed.recommendations as unknown[]).map((x) => String(x)).filter((s) => s.trim().length > 0)
    : [];

  const action_items: ActionItem[] = Array.isArray(parsed.action_items)
    ? (parsed.action_items as unknown[]).map((e) => {
        const o = (e ?? {}) as Record<string, unknown>;
        return {
          task: String(o.task ?? ''),
          assignee: String(o.assignee ?? 'ไม่ระบุ'),
          deadline: String(o.deadline ?? ''),
        };
      })
    : [];

  const speakers = Array.isArray(parsed.speakers)
    ? (parsed.speakers as unknown[]).map((x) => String(x))
    : [];

  const result: TranscriptResult = {
    meeting_title: String(parsed.meeting_title ?? ''),
    executive_summary: String(parsed.executive_summary ?? ''),
    language: String(parsed.language ?? 'th'),
    speakers,
    key_topics,
    decisions,
    action_items,
    recommendations,
  };

  // ต้องมีเนื้อหาอย่างน้อยบางส่วน ไม่งั้นถือว่าแกะไม่ได้
  if (!result.executive_summary && key_topics.length === 0 && action_items.length === 0) {
    throw new UserFacingError('ไม่พบเนื้อหาที่สรุปได้จากไฟล์นี้ — ไฟล์อาจเงียบหรือไม่มีบทสนทนา');
  }
  return result;
}

// ── Transcript plaintext (เผื่อ copy/download) ─────────────────────────────────
function buildTranscriptText(t: TranscriptResult): string {
  const parts: string[] = [];
  if (t.meeting_title) parts.push(t.meeting_title, '');
  if (t.executive_summary) parts.push('สรุปภาพรวม', t.executive_summary, '');
  if (t.key_topics.length) {
    parts.push('ประเด็นที่หารือ');
    t.key_topics.forEach((k) => parts.push(`- ${k.topic}: ${k.details}`));
    parts.push('');
  }
  if (t.decisions.length) {
    parts.push('มติ/ข้อสรุป');
    t.decisions.forEach((d) => parts.push(`- ${d}`));
    parts.push('');
  }
  if (t.action_items.length) {
    parts.push('สิ่งที่ต้องทำต่อ');
    t.action_items.forEach((a) =>
      parts.push(`- ${a.task}${a.assignee ? ` (ผู้รับผิดชอบ: ${a.assignee})` : ''}${a.deadline ? ` [กำหนด: ${a.deadline}]` : ''}`),
    );
    parts.push('');
  }
  if (t.recommendations.length) {
    parts.push('ข้อเสนอแนะจาก AI');
    t.recommendations.forEach((r) => parts.push(`- ${r}`));
    parts.push('');
  }
  if (t.speakers.length) parts.push(`ผู้เข้าร่วม: ${t.speakers.join(', ')}`);
  return parts.join('\n').trimEnd();
}

// ── LINE push notification ─────────────────────────────────────────────────────
async function notifyLine(job: Record<string, unknown>): Promise<void> {
  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) return;

  const profileId = (job.profile_id ?? job.triggered_by) as string | null;
  if (!profileId) return;

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('line_user_id')
    .eq('id', profileId)
    .maybeSingle();

  const lineUserId = (profile as { line_user_id?: string } | null)?.line_user_id;
  if (!lineUserId) return;

  // Deep-link ไปหน้า transcribe ขององค์กรนั้น (ใช้ org slug)
  const { data: org } = await admin
    .from('organizations')
    .select('slug')
    .eq('id', job.org_id as string)
    .maybeSingle();
  const slug = (org as { slug?: string } | null)?.slug;
  const baseUrl = (process.env.APP_BASE_URL ?? 'https://perpos.io').replace(/\/$/, '');
  const link = slug ? `\n🔗 ${baseUrl}/${slug}/assistant/transcribe` : '';

  const fileName = String(job.file_name ?? 'ไฟล์เสียง');
  const message = `✅ ถอดเสียงเสร็จแล้ว\n📄 ${fileName}${link}`;

  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text: message }] }),
  });
}

// วัดความยาวไฟล์เสียง/วิดีโอ (วินาที) จาก buffer — ไม่ต้องใช้ ffmpeg
// (music-metadata v7 = CommonJS; auto-detect format จาก magic bytes ไม่ต้องพึ่ง mimeType)
async function measureDuration(bytes: Buffer, _mimeType: string): Promise<number> {
  let parseErr = '';
  try {
    const meta = await parseBuffer(new Uint8Array(bytes));
    const dur = meta.format?.duration;
    if (dur && Number.isFinite(dur) && dur > 0) return Math.ceil(dur);
    parseErr = `no duration in metadata (container=${meta.format?.container ?? '?'})`;
  } catch (e) {
    parseErr = e instanceof Error ? e.message : String(e);
  }
  // fallback: อ่าน moov.mvhd เองสำหรับไฟล์ ISO-BMFF (mp4/mov/m4v) — music-metadata
  // ไม่คืน duration เมื่อไฟล์เป็น "วิดีโอ" (เน้น track เสียง) หรือ throw กับ quicktime
  // ครอบคลุมคลิปประชุมจากมือถือ (mp4/mov) ซึ่งเป็นรูปแบบหลักที่ผู้ใช้ส่งมา
  const iso = isoBmffDurationSeconds(bytes);
  if (iso && iso > 0) return Math.ceil(iso);

  // fallback: Ogg (Opus/Vorbis) — LINE voice message + ไฟล์ .ogg ที่ music-metadata
  // อ่าน duration ไม่ออก คำนวณจาก granule position ของ page สุดท้ายเอง
  const ogg = oggDurationSeconds(bytes);
  if (ogg && ogg > 0) return Math.ceil(ogg);

  console.warn(`[stt-worker] measureDuration failed: ${parseErr}`);
  throw new UserFacingError(
    'อ่านความยาวไฟล์ไม่ได้ — ไฟล์อาจเสียหรือไม่รองรับ กรุณาแปลงเป็นไฟล์เสียง (mp3 หรือ m4a) แล้วส่งใหม่อีกครั้ง',
  );
}

// ── ISO-BMFF (mp4/mov/m4v/m4a) duration จาก moov.mvhd — pure JS (ไม่ต้อง ffmpeg) ──
// ใช้เป็น fallback ของ measureDuration สำหรับไฟล์วิดีโอที่ music-metadata อ่านไม่ออก
type Box = { start: number; end: number };
function findBox(buf: Buffer, type: string, start: number, end: number): Box | null {
  let off = start;
  while (off + 8 <= end) {
    let size = buf.readUInt32BE(off);
    const boxType = buf.toString('latin1', off + 4, off + 8);
    let headerSize = 8;
    if (size === 1) {
      // 64-bit largesize
      const hi = buf.readUInt32BE(off + 8);
      const lo = buf.readUInt32BE(off + 12);
      size = hi * 2 ** 32 + lo;
      headerSize = 16;
    } else if (size === 0) {
      size = end - off; // ขยายถึงท้ายไฟล์
    }
    if (size < headerSize || off + size > end) break;
    if (boxType === type) return { start: off + headerSize, end: off + size };
    off += size;
  }
  return null;
}
function isoBmffDurationSeconds(buf: Buffer): number | null {
  try {
    const moov = findBox(buf, 'moov', 0, buf.length);
    if (!moov) return null;
    const mvhd = findBox(buf, 'mvhd', moov.start, moov.end);
    if (!mvhd) return null;
    const p = mvhd.start;
    const version = buf.readUInt8(p);
    let timescale: number;
    let duration: number;
    if (version === 1) {
      timescale = buf.readUInt32BE(p + 4 + 8 + 8);
      const hi = buf.readUInt32BE(p + 4 + 8 + 8 + 4);
      const lo = buf.readUInt32BE(p + 4 + 8 + 8 + 8);
      duration = hi * 2 ** 32 + lo;
    } else {
      timescale = buf.readUInt32BE(p + 4 + 4 + 4);
      duration = buf.readUInt32BE(p + 4 + 4 + 4 + 4);
    }
    if (!timescale || !duration || duration === 0xffffffff) return null;
    return duration / timescale;
  } catch {
    return null;
  }
}

// ── Ogg (Opus/Vorbis) duration จาก granule position — pure JS (ไม่ต้อง ffmpeg) ──
// ใช้เป็น fallback เมื่อ music-metadata อ่าน .ogg ไม่ออก (LINE voice message ก็เป็น Ogg/Opus)
// Opus: granule rate = 48000 เสมอ, หัก pre-skip · Vorbis: อ่าน sample rate จาก ID header
function oggDurationSeconds(buf: Buffer): number | null {
  try {
    if (buf.length < 4 || buf.toString('latin1', 0, 4) !== 'OggS') return null;

    // sample rate + pre-skip จาก header page แรก
    let granuleRate = 48000; // default = Opus
    let preSkip = 0;
    const opusIdx = buf.indexOf('OpusHead', 0, 'latin1');
    if (opusIdx >= 0 && opusIdx + 12 <= buf.length) {
      // "OpusHead"(8) + version(1) + channels(1) → pre_skip(2 LE) @+10
      preSkip = buf.readUInt16LE(opusIdx + 10);
      granuleRate = 48000;
    } else {
      const vorbisIdx = buf.indexOf('\x01vorbis', 0, 'latin1');
      if (vorbisIdx >= 0 && vorbisIdx + 16 <= buf.length) {
        // "\x01vorbis"(7) + version(4) + channels(1) → sample_rate(4 LE) @+12
        granuleRate = buf.readUInt32LE(vorbisIdx + 12);
      }
    }
    if (!granuleRate || granuleRate <= 0) return null;

    // granule position ของ page สุดท้ายที่ valid (ไล่จากท้ายไฟล์; page สุดท้ายอยู่ใกล้ EOF)
    const scanStart = Math.max(0, buf.length - 1_000_000);
    let lastGranule = -1;
    for (let off = buf.length - 14; off >= scanStart; off--) {
      if (buf[off] === 0x4f && buf[off + 1] === 0x67 && buf[off + 2] === 0x67 && buf[off + 3] === 0x53) {
        const lo = buf.readUInt32LE(off + 6);
        const hi = buf.readUInt32LE(off + 10);
        if (lo === 0xffffffff && hi === 0xffffffff) continue; // granule -1 (page ไม่จบ packet)
        lastGranule = hi * 2 ** 32 + lo;
        break;
      }
    }
    if (lastGranule < 0) return null;

    const samples = Math.max(0, lastGranule - preSkip);
    const dur = samples / granuleRate;
    return dur > 0 ? dur : null;
  } catch {
    return null;
  }
}

// push LINE message(s) หา user จาก profile_id (text หรือ flex)
async function pushLineToProfile(profileId: string, messages: unknown[]): Promise<void> {
  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!accessToken || !profileId || !messages.length) return;
  const admin = getAdminClient();
  const { data: profile } = await admin.from('profiles').select('line_user_id').eq('id', profileId).maybeSingle();
  const lineUserId = (profile as { line_user_id?: string } | null)?.line_user_id;
  if (!lineUserId) return;
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ to: lineUserId, messages }),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
