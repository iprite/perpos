/**
 * POST /api/assistant/transcribe/portal — เปิด Stripe Customer Portal ของผู้ใช้ (per-profile)
 *   ให้ลูกค้าจัดการเอง: ยกเลิก/เปลี่ยนบัตร/ดูใบเสร็จ/ประวัติการชำระ
 * คืน { url } ให้ redirect · ต้องมี stripe_customer_id (เคยซื้ออย่างน้อย 1 ครั้ง)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';
import { getAppBaseUrl, getStripe } from '../../../_lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgSlug = String(body.orgSlug ?? '');

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from('stt_subscriptions')
    .select('stripe_customer_id')
    .eq('profile_id', auth.userId)
    .maybeSingle();

  const customerId = sub?.stripe_customer_id ? String(sub.stripe_customer_id) : '';
  if (!customerId) return NextResponse.json({ error: 'no_customer' }, { status: 400 });

  const baseUrl = getAppBaseUrl().replace(/\/$/, '');
  const returnUrl = orgSlug ? `${baseUrl}/${orgSlug}/assistant/transcribe/billing` : `${baseUrl}/`;

  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  return NextResponse.json({ url: portal.url });
}
