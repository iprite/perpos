/**
 * POST /api/assistant/recall/webhook  (Phase 2.2)
 *   Recall bot status-change webhook (Svix/HMAC). ขั้นตอน:
 *     1. verify ลายเซ็น (whsec_) จาก raw body
 *     2. idempotency: บันทึก webhook_event ด้วย webhook-id; ถ้า processed แล้วข้าม
 *     3. ตอบ 2xx (Recall timeout 15 วิ) — งาน DB/quota/แจ้ง LINE ทำใน processBotEvent
 *
 * idempotency แบบ processed_at: insert ก่อน → ถ้า process fail คืน 500 ให้ Recall retry
 *   (retry ครั้งหน้า processed_at ยัง null จึง reprocess ได้); สำเร็จแล้ว set processed_at → ข้าม
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../_lib/supabase';
import { verifyRecallSignature, type RecallWebhookEvent } from '@/lib/assistant/recall';
import { processBotEvent } from '@/lib/assistant/recall-events';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  if (!verifyRecallSignature(headers, raw)) {
    return new NextResponse('invalid signature', { status: 401 });
  }

  let evt: RecallWebhookEvent;
  try {
    evt = JSON.parse(raw) as RecallWebhookEvent;
  } catch {
    return new NextResponse('bad json', { status: 400 });
  }

  const webhookId = headers['webhook-id'] ?? headers['svix-id'] ?? null;
  const admin = createAdminClient();

  // idempotency: บันทึกก่อน (กันประมวลผลซ้ำ). ถ้าซ้ำ + processed แล้ว → ตอบ 200 ข้าม
  if (webhookId) {
    const { data: existing } = await admin
      .from('webhook_event')
      .select('id, processed_at')
      .eq('svix_id', webhookId)
      .maybeSingle();
    if (existing) {
      if ((existing as { processed_at: string | null }).processed_at) {
        return new NextResponse(null, { status: 200 }); // เคยทำสำเร็จแล้ว
      }
      // เคยรับแต่ยังไม่สำเร็จ (retry) → reprocess ด้านล่าง
    } else {
      await admin.from('webhook_event').insert({
        provider: 'recall',
        svix_id: webhookId,
        event_type: evt.event ?? 'unknown',
        recall_bot_id: evt.data?.bot?.id ?? null,
        payload: evt as unknown as Record<string, unknown>,
      });
    }
  }

  try {
    await processBotEvent(admin, evt);
  } catch (e) {
    // process fail → 500 ให้ Recall retry (processed_at ยัง null → reprocess ได้)
    return new NextResponse(`process error: ${e instanceof Error ? e.message : 'unknown'}`.slice(0, 200), { status: 500 });
  }

  if (webhookId) {
    await admin.from('webhook_event').update({ processed_at: new Date().toISOString() }).eq('svix_id', webhookId);
  }
  return new NextResponse(null, { status: 200 });
}
