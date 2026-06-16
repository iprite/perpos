/**
 * GET /api/assistant/quota?orgId=<orgId>
 *   — โควต้าแกะเสียง (วินาที) ของผู้ใช้ที่ล็อกอิน (default 300 นาที)
 */

import { NextRequest } from 'next/server';
import { requireAssistantUser } from '../../_lib/assistant-auth';
import { createAdminClient } from '../../_lib/supabase';
import { ok } from '../../_lib/response';

const DEFAULT_LIMIT = 18000; // 300 นาที

export async function GET(req: NextRequest) {
  const auth = await requireAssistantUser(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data } = await admin
    .from('stt_quota')
    .select('limit_seconds, used_seconds')
    .eq('profile_id', auth.userId)
    .maybeSingle();

  const limit = (data as { limit_seconds?: number } | null)?.limit_seconds ?? DEFAULT_LIMIT;
  const used = (data as { used_seconds?: number } | null)?.used_seconds ?? 0;
  return ok({ limit_seconds: limit, used_seconds: used, remaining_seconds: Math.max(0, limit - used) });
}
