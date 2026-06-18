/**
 * Recall.ai REST client (Phase 2.1) — ผู้ช่วย AI: ส่งบอทเข้าประชุม → อัด → ถอดเป็น MoM
 *
 * pure lib (ยังไม่ wiring) — ใช้โดย LINE webhook (สร้าง/ยกเลิกบอท), recall webhook (verify),
 * และ scheduler (สั่งบอทออกเมื่อครบโควต้า)
 *
 * เราถอดเสียงเองด้วย stt-worker (Gemini) → ไม่เปิด Recall transcription (ประหยัด) แค่ดึง recording
 *
 * ⚠️ RECALL_REGION ต้องตรงกับ region ของ workspace/API key (us-east-1 | us-west-2 |
 *    eu-central-1 | ap-northeast-1) — base URL, API key, webhook secret ผูกกับ region เดียวกัน
 * verify จริงจาก Recall dashboard ก่อน deploy
 */

import crypto from 'crypto';

const RECALL_REGION = process.env.RECALL_REGION ?? 'us-east-1';
const RECALL_BASE = `https://${RECALL_REGION}.recall.ai`;
const BOT_NAME_DEFAULT = 'PERPOS Assistant (AI Note-taker)';

/** ส่งบอทกระชั้น (<10 นาที/ไม่ใส่ join_at) ช่วง peak อาจได้ 507 → caller retry */
export class AdhocPoolDepletedError extends Error {
  constructor() {
    super('Recall ad-hoc pool depleted (HTTP 507)');
    this.name = 'AdhocPoolDepletedError';
  }
}

export type CreateBotInput = {
  meetingUrl: string;
  /** ISO8601; >10 นาที = scheduled (การันตีตรงเวลา, ไม่ชน concurrent). undefined = ad-hoc */
  joinAt?: string;
  /** วินาทีที่จองไว้ (bot_quota hold) → ใช้เป็นเพดานเวลาอัด (in_call_recording_timeout) */
  holdSeconds: number;
  /** ผูกกลับมาหา job/profile ของเราตอนรับ webhook */
  metadata: { profile_id: string; job_id: string; org_id: string };
  /** override ชื่อบอท (เช่น prefix ของผู้ใช้ + " (AI Note-taker)") — default = PERPOS Assistant */
  botName?: string;
};

export type CreateBotResult = { id: string; status_changes?: unknown[] };

function authHeaders(): Record<string, string> {
  const key = process.env.RECALL_API_KEY;
  if (!key) throw new Error('ยังไม่ได้ตั้งค่า RECALL_API_KEY');
  return { Authorization: `Token ${key}`, 'Content-Type': 'application/json' };
}

/** payload กลางของ PERPOS — คุม cost + branding + เพดานเวลาอัด */
function buildBotBody(input: CreateBotInput): Record<string, unknown> {
  const logoUrl = process.env.PERPOS_BOT_LOGO_URL;
  return {
    meeting_url: input.meetingUrl,
    ...(input.joinAt ? { join_at: input.joinAt } : {}),
    bot_name: input.botName ?? BOT_NAME_DEFAULT,

    // โลโก้แบรนด์ผ่านกล้องบอท (โปร่งใส — ผู้ร่วมเห็นว่าเป็น AI note-taker)
    ...(logoUrl
      ? { output_media: { camera: { kind: 'jpeg', config: { url: logoUrl } } } }
      : {}),

    // อัดเป็น mixed mp3 (เบากว่าวิดีโอ) → worker ดาวน์โหลดไปถอดด้วย Gemini (ไม่เปิด Recall transcript)
    recording_config: { audio_mixed_mp3: {} },

    // คุม cost บอทค้าง + เพดานเวลาอัด = holdSeconds (กัน bot_quota ทะลุ ดู §3.1.1)
    automatic_leave: {
      waiting_room_timeout: 300,
      noone_joined_timeout: 300,
      in_call_not_recording_timeout: 300,
      recording_permission_denied_timeout: 30,
      in_call_recording_timeout: Math.max(60, Math.floor(input.holdSeconds)),
    },

    metadata: { ...input.metadata, app: 'perpos' },
  };
}

/** POST /api/v1/bot/ — 507 = ad-hoc pool หมด (caller retry), อื่น ๆ = throw */
export async function createBot(input: CreateBotInput): Promise<CreateBotResult> {
  const res = await fetch(`${RECALL_BASE}/api/v1/bot/`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(buildBotBody(input)),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 507) throw new AdhocPoolDepletedError();
  if (!res.ok) throw new Error(`Recall create bot failed: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300));
  return (await res.json()) as CreateBotResult;
}

/** ad-hoc 507 → retry (doc แนะนำทุก ~30 วิ) — scheduled bot ไม่เจอ 507 */
export async function createBotWithRetry(input: CreateBotInput, attempts = 3, delayMs = 30_000): Promise<CreateBotResult> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await createBot(input);
    } catch (e) {
      if (e instanceof AdhocPoolDepletedError && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw e;
    }
  }
  throw new AdhocPoolDepletedError();
}

/** POST /api/v1/bot/{id}/leave_call/ — สั่งบอทที่ "อยู่ในห้องแล้ว" ออก (irreversible) */
export async function leaveBot(botId: string): Promise<boolean> {
  const res = await fetch(`${RECALL_BASE}/api/v1/bot/${botId}/leave_call/`, {
    method: 'POST',
    headers: authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok;
}

/** DELETE /api/v1/bot/{id}/ — ยกเลิกบอทที่ "ยัง scheduled" (ยังไม่ join) เท่านั้น */
export async function deleteScheduledBot(botId: string): Promise<boolean> {
  const res = await fetch(`${RECALL_BASE}/api/v1/bot/${botId}/`, {
    method: 'DELETE',
    headers: authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok;
}

/** POST /api/v1/bot/{id}/delete_media/ — ลบ recording media ฝั่ง Recall (PDPA, หลังเราถอดเสร็จ) */
export async function deleteBotMedia(botId: string): Promise<boolean> {
  const res = await fetch(`${RECALL_BASE}/api/v1/bot/${botId}/delete_media/`, {
    method: 'POST',
    headers: authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok;
}

/** GET /api/v1/bot/{id}/ — ดึงสถานะ + recordings (ใช้หา media download URL ใน 2.2/2.4) */
export async function retrieveBot(botId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${RECALL_BASE}/api/v1/bot/${botId}/`, {
    method: 'GET',
    headers: authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Recall retrieve bot failed: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** ตรวจจับลิงก์ประชุม (GMeet/Zoom/Teams) จากข้อความ LINE */
const MEETING_PATTERNS: { platform: string; re: RegExp }[] = [
  { platform: 'google_meet', re: /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i },
  { platform: 'zoom', re: /https:\/\/[\w.-]*zoom\.us\/j\/\d+(?:\?pwd=[\w.%-]+)?/i },
  { platform: 'teams', re: /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s]+/i },
];

export function extractMeetingUrl(text: string): { platform: string; url: string } | null {
  for (const p of MEETING_PATTERNS) {
    const m = text.match(p.re);
    if (m) return { platform: p.platform, url: m[0] };
  }
  return null;
}

/** เดือนไทย (เต็ม + ย่อ) → เลขเดือน */
const TH_MONTHS: [RegExp, number][] = [
  [/มกราคม|ม\.?ค\.?/, 1], [/กุมภาพันธ์|ก\.?พ\.?/, 2], [/มีนาคม|มี\.?ค\.?/, 3],
  [/เมษายน|เม\.?ย\.?/, 4], [/พฤษภาคม|พ\.?ค\.?/, 5], [/มิถุนายน|มิ\.?ย\.?/, 6],
  [/กรกฎาคม|ก\.?ค\.?/, 7], [/สิงหาคม|ส\.?ค\.?/, 8], [/กันยายน|ก\.?ย\.?/, 9],
  [/ตุลาคม|ต\.?ค\.?/, 10], [/พฤศจิกายน|พ\.?ย\.?/, 11], [/ธันวาคม|ธ\.?ค\.?/, 12],
];

/**
 * อ่านวัน-เวลานัดประชุมจากข้อความไทย → Date (Asia/Bangkok) หรือ null ถ้าระบุไม่ชัด
 * รองรับ: "18 มิถุนายน 2569 เวลา 14.30 น." · เดือนย่อ · พ.ศ.(>2400→ค.ศ.) · "14:30"
 * ถ้าไม่มีเวลาชัด ("น." / "เวลา") → null (ไม่เดา กัน schedule ผิด → caller fallback ad-hoc)
 */
export function parseMeetingDateTime(text: string, now: Date = new Date()): Date | null {
  const tm = text.match(/(?:เวลา\s*)?(\d{1,2})[.:](\d{2})\s*น\.?/) ?? text.match(/เวลา\s*(\d{1,2})[.:](\d{2})/);
  if (!tm) return null;
  const hh = Number(tm[1]); const mm = Number(tm[2]);
  if (hh > 23 || mm > 59) return null;

  let month = 0; let monIdx = -1; let monLen = 0;
  for (const [re, n] of TH_MONTHS) {
    const m = text.match(re);
    if (m && m.index !== undefined) { month = n; monIdx = m.index; monLen = m[0].length; break; }
  }
  if (!month) return null;

  const before = text.slice(Math.max(0, monIdx - 12), monIdx);
  const after = text.slice(monIdx + monLen, monIdx + monLen + 16);
  const dayM = before.match(/(\d{1,2})\s*$/);
  if (!dayM) return null;
  const day = Number(dayM[1]);
  const yearM = after.match(/(\d{4})/);
  let year = yearM ? Number(yearM[1]) : now.getFullYear();
  if (year > 2400) year -= 543; // พ.ศ. → ค.ศ.

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+07:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** dedup: 1 บอท ต่อ 1 meeting instance — ปัดเวลาเป็นครึ่งชั่วโมง กันยิงรัว */
export function makeDedupKey(meetingUrl: string, at: Date = new Date()): string {
  const slot = Math.round(at.getTime() / (30 * 60_000));
  return `${meetingUrl}::${slot}`;
}

/**
 * verify request จาก Recall (HMAC whsec_ — headers webhook-id/timestamp/signature)
 * port จาก docs (authenticating-requests-from-recallai) → คืน boolean (ไม่ throw)
 * secret = RECALL_WEBHOOK_SECRET (workspace verification secret, ขึ้นต้น whsec_)
 */
export function verifyRecallSignature(headers: Record<string, string>, rawBody: string): boolean {
  const secret = process.env.RECALL_WEBHOOK_SECRET ?? '';
  if (!secret.startsWith('whsec_')) return false;

  const msgId = headers['webhook-id'] ?? headers['svix-id'];
  const msgTs = headers['webhook-timestamp'] ?? headers['svix-timestamp'];
  const msgSig = headers['webhook-signature'] ?? headers['svix-signature'];
  if (!msgId || !msgTs || !msgSig) return false;

  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${msgId}.${msgTs}.${rawBody}`).digest('base64');
  const expectedBytes = Buffer.from(expected, 'base64');

  for (const versioned of msgSig.split(' ')) {
    const [version, sig] = versioned.split(',');
    if (version !== 'v1' || !sig) continue;
    const sigBytes = Buffer.from(sig, 'base64');
    if (sigBytes.length === expectedBytes.length &&
        crypto.timingSafeEqual(new Uint8Array(sigBytes), new Uint8Array(expectedBytes))) {
      return true;
    }
  }
  return false;
}

/** event ของ Recall: { event:"bot.xxx", data:{ data:{code,sub_code,updated_at}, bot:{id,metadata} } } */
export type RecallWebhookEvent = {
  event: string;
  data: {
    data: { code: string; sub_code: string | null; updated_at: string };
    bot: { id: string; metadata?: Record<string, string> };
  };
};
