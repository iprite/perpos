/**
 * GET /api/assistant/quota?orgId=<orgId>
 *   — โควต้าแกะเสียง (วินาที) ของผู้ใช้ที่ล็อกอิน (default 300 นาที)
 */

import { NextRequest } from 'next/server';
import { requireAssistantUser } from '../../_lib/assistant-auth';
import { createAdminClient } from '../../_lib/supabase';
import { ok } from '../../_lib/response';

const DEFAULT_LIMIT = 18000;    // 300 นาที (stt — อัปไฟล์เอง)
const DEFAULT_BOT_LIMIT = 7200; // 120 นาที (bot — ประชุมผ่าน Recall)

export async function GET(req: NextRequest) {
  const auth = await requireAssistantUser(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const [{ data: sttData }, { data: botData }] = await Promise.all([
    admin.from('stt_quota').select('limit_seconds, used_seconds').eq('profile_id', auth.userId).maybeSingle(),
    admin.from('bot_quota').select('limit_seconds, used_seconds').eq('profile_id', auth.userId).maybeSingle(),
  ]);

  const sttLimit = (sttData as { limit_seconds?: number } | null)?.limit_seconds ?? DEFAULT_LIMIT;
  const sttUsed = (sttData as { used_seconds?: number } | null)?.used_seconds ?? 0;
  const botLimit = (botData as { limit_seconds?: number } | null)?.limit_seconds ?? DEFAULT_BOT_LIMIT;
  const botUsed = (botData as { used_seconds?: number } | null)?.used_seconds ?? 0;

  return ok({
    // top-level = stt (คง backward-compat กับ consumer เดิม)
    limit_seconds: sttLimit, used_seconds: sttUsed, remaining_seconds: Math.max(0, sttLimit - sttUsed),
    // 2 มิเตอร์แยกช่องทาง
    stt: { limit_seconds: sttLimit, used_seconds: sttUsed, remaining_seconds: Math.max(0, sttLimit - sttUsed) },
    bot: { limit_seconds: botLimit, used_seconds: botUsed, remaining_seconds: Math.max(0, botLimit - botUsed) },
  });
}
