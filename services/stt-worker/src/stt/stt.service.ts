import { getAdminClient } from '../lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────
export type TranscriptSegment = {
  speaker: string;       // เช่น "ผู้พูด 1"
  start: number;         // วินาที
  end: number;           // วินาที
  text: string;
};

export type TranscriptResult = {
  language: string;
  speakers: string[];
  segments: TranscriptSegment[];
};

const ALLOWED_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'] as const;
const DEFAULT_MODEL = 'gemini-2.5-flash';

const BUCKET = 'assistant_audio';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

// ─── Diarization prompt ──────────────────────────────────────────────────────
const PROMPT_TRANSCRIBE = `You are an expert audio transcriber specialised in Thai-language speech with speaker diarization.

Task:
Transcribe the provided audio/video file into a structured transcript that identifies WHO is speaking ("who said what") and WHEN.

Rules:
1. Diarization: Detect distinct speakers and label them consistently as "ผู้พูด 1", "ผู้พูด 2", etc. Keep the same label for the same voice throughout.
2. Timestamps: For every segment provide "start" and "end" in SECONDS (float, measured from the beginning of the file).
3. Segment the transcript by speaker turn and natural pauses — do not merge two different speakers into one segment.
4. Transcribe verbatim in the original spoken language. If the audio is Thai, output Thai text. Preserve numbers and proper nouns.
5. Do NOT invent words. If a span is unintelligible, transcribe what is audible or use "[ฟังไม่ชัด]".
6. "language": the dominant spoken language as an ISO code ("th", "en", ...).
7. Output JSON ONLY (no markdown fences).

Example output:
{
  "language": "th",
  "speakers": ["ผู้พูด 1", "ผู้พูด 2"],
  "segments": [
    { "speaker": "ผู้พูด 1", "start": 0.0, "end": 3.2, "text": "สวัสดีครับ วันนี้เรามาคุยเรื่องยอดขาย" },
    { "speaker": "ผู้พูด 2", "start": 3.4, "end": 6.1, "text": "ได้ครับ ผมเตรียมตัวเลขมาแล้ว" }
  ]
}

Output JSON Schema:
{
  "language": string,
  "speakers": string[],
  "segments": [ { "speaker": string, "start": number, "end": number, "text": string } ]
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
    .from('transcription_jobs')
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

  try {
    // 1. Storage path must belong to this org (defense against cross-tenant reads).
    const storagePath = extractStoragePath(job.audio_url as string);
    if (!storagePath.startsWith(`${orgId}/`)) {
      throw new Error('เส้นทางไฟล์เสียงไม่ตรงกับองค์กร');
    }

    // 2. Download → upload to Gemini Files API → transcribe.
    const model = ALLOWED_MODELS.includes(job.model) ? (job.model as string) : DEFAULT_MODEL;
    const { bytes, mimeType } = await downloadAudio(storagePath);
    const { fileUri, fileName } = await uploadToGeminiFiles(bytes, mimeType, String(job.file_name ?? 'audio'));

    let transcript: TranscriptResult;
    try {
      transcript = await transcribeWithGemini(fileUri, mimeType, model);
    } finally {
      // Cleanup ไฟล์บน Gemini Files API ทันที (ไม่รอ auto-expire 48 ชม.) — best-effort
      await deleteGeminiFile(fileName).catch(() => undefined);
    }
    const transcriptText = buildTranscriptText(transcript);

    // 3. Mark job completed.
    const { error: updateEndError } = await admin
      .from('transcription_jobs')
      .update({
        status: 'completed',
        transcript_json: transcript,
        transcript_text: transcriptText,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    if (updateEndError) throw new Error(updateEndError.message);

    console.log(`[stt-worker] Job ${jobId} completed (${transcript.segments.length} segments).`);

    // 4. Best-effort LINE notification (failure must not fail the job).
    await notifyLine(job).catch((e) =>
      console.warn(`[stt-worker] LINE notify failed for ${jobId}: ${String(e)}`),
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการแกะเสียง';
    console.error(`[stt-worker] Job ${jobId} failed:`, errorMsg);
    await admin
      .from('transcription_jobs')
      .update({ status: 'failed', error_message: errorMsg, updated_at: new Date().toISOString() })
      .eq('id', jobId);
  }
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

// ── Gemini Files API (resumable upload — รองรับไฟล์ใหญ่ถึง 2GB) ────────────────
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
  const deadline = Date.now() + 4 * 60 * 1000; // 4 นาที
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

// ลบไฟล์บน Gemini Files API (best-effort cleanup)
async function deleteGeminiFile(fileName: string): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !fileName) return;
  await fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${apiKey}`, { method: 'DELETE' });
}

// ── Gemini transcription ─────────────────────────────────────────────────────
async function transcribeWithGemini(
  fileUri: string,
  mimeType: string,
  model: string,
): Promise<TranscriptResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const response = await fetch(
    `${GEMINI_BASE}/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT_TRANSCRIBE },
              { file_data: { mime_type: mimeType, file_uri: fileUri } },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 65536,
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini API request failed: ${response.status} - ${await response.text()}`);
  }

  const result = (await response.json()) as {
    candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  if (!result.candidates || result.candidates.length === 0) {
    const blockReason = result.promptFeedback?.blockReason || 'Blocked by Gemini safety settings or filter';
    throw new Error(`Gemini API returned no candidates. Reason: ${blockReason}`);
  }
  const finishReason = result.candidates[0].finishReason;
  if (finishReason === 'MAX_TOKENS') {
    throw new Error('ไฟล์ยาวเกินกว่าจะแกะได้ในครั้งเดียว กรุณาแบ่งไฟล์ให้สั้นลงแล้วลองใหม่');
  }
  if (finishReason && finishReason !== 'STOP') {
    throw new Error(`Gemini ประมวลผลไม่สมบูรณ์ (finishReason=${finishReason})`);
  }

  const text = result.candidates[0].content?.parts?.[0]?.text || '';
  return parseTranscript(text);
}

function parseTranscript(text: string): TranscriptResult {
  const cleaned = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  let parsed: Partial<TranscriptResult>;
  try {
    parsed = JSON.parse(cleaned) as Partial<TranscriptResult>;
  } catch {
    throw new Error('แปลงผลลัพธ์ JSON จาก Gemini (transcript) ล้มเหลว');
  }

  const segments: TranscriptSegment[] = Array.isArray(parsed.segments)
    ? parsed.segments.map((s) => ({
        speaker: String(s?.speaker ?? 'ผู้พูด'),
        start: Number(s?.start ?? 0),
        end: Number(s?.end ?? 0),
        text: String(s?.text ?? ''),
      }))
    : [];

  if (segments.length === 0) throw new Error('Gemini ไม่พบเนื้อหาเสียงที่แกะได้');

  const speakers = Array.isArray(parsed.speakers) && parsed.speakers.length
    ? parsed.speakers.map((x) => String(x))
    : Array.from(new Set(segments.map((s) => s.speaker)));

  return {
    language: String(parsed.language ?? 'th'),
    speakers,
    segments,
  };
}

// ── Transcript plaintext (เผื่อ copy/download) ─────────────────────────────────
function buildTranscriptText(t: TranscriptResult): string {
  return t.segments
    .map((s) => `[${fmtTimestamp(s.start)}] ${s.speaker}: ${s.text}`)
    .join('\n');
}

function fmtTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

  // Deep-link ไปหน้า transcribe ขององค์กรนั้น (ต้องใช้ org slug ไม่ใช่ org id)
  const { data: org } = await admin
    .from('organizations')
    .select('slug')
    .eq('id', job.org_id as string)
    .maybeSingle();
  const slug = (org as { slug?: string } | null)?.slug;
  const baseUrl = (process.env.APP_BASE_URL ?? 'https://perpos.io').replace(/\/$/, '');
  const link = slug ? `\n🔗 ${baseUrl}/${slug}/assistant/transcribe` : '';

  const fileName = String(job.file_name ?? 'ไฟล์เสียง');
  const message = `✅ แกะเสียงเสร็จแล้ว\n📄 ${fileName}${link}`;

  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text: message }] }),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
