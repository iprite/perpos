import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Token balance helpers — unified prepaid pool (1 บาท = 100 token)
 * ทุก service (stt/bot/pdf) หักจากกระเป๋าเดียวกัน → "นาที/หน้าคงเหลือ" ของแต่ละ service
 * = ยอด token คงเหลือ ÷ rate ของ service นั้น (ดู token_rates)
 *
 * ใช้แทนการอ่าน stt_quota/bot_quota/pdf_quota ตรง ๆ (ตารางนั้นเลิกใช้แล้วหลัง T2)
 */

export type TokenService = "stt" | "bot" | "pdf";

/** ยอด token คงเหลือของ profile (0 ถ้ายังไม่มีบัญชี) */
export async function getTokenBalance(admin: SupabaseClient, profileId: string): Promise<number> {
  if (!profileId) return 0;
  const { data } = await admin
    .from("token_accounts")
    .select("balance_tokens")
    .eq("profile_id", profileId)
    .maybeSingle();
  return Number((data as { balance_tokens?: number } | null)?.balance_tokens ?? 0);
}

/** rate (token ต่อหน่วย) ของแต่ละ service จาก token_rates */
export async function getTokenRates(admin: SupabaseClient): Promise<Record<TokenService, number>> {
  const { data } = await admin.from("token_rates").select("service, tokens_per_unit");
  const m: Record<string, number> = {};
  for (const r of (data ?? []) as { service: string; tokens_per_unit: number }[]) {
    m[r.service] = Number(r.tokens_per_unit);
  }
  return { stt: m.stt ?? 0, bot: m.bot ?? 0, pdf: m.pdf ?? 0 };
}

/** สรุปกระเป๋า token: ยอด + มูลค่าบาท + วันหมดอายุใกล้สุด + token ที่จะหมดใน 30 วัน + remaining ต่อ service */
export async function getTokenSummary(admin: SupabaseClient, profileId: string) {
  const [{ data: acc }, rates, { data: lots }] = await Promise.all([
    admin.from("token_accounts").select("balance_tokens").eq("profile_id", profileId).maybeSingle(),
    getTokenRates(admin),
    admin
      .from("token_lots")
      .select("remaining_tokens, expires_at")
      .eq("profile_id", profileId)
      .eq("status", "active")
      .gt("remaining_tokens", 0),
  ]);
  const balance = Number((acc as { balance_tokens?: number } | null)?.balance_tokens ?? 0);
  const in30 = Date.now() + 30 * 86400000;
  let earliest: string | null = null;
  let expiring30 = 0;
  for (const l of (lots ?? []) as { remaining_tokens: number; expires_at: string }[]) {
    if (!earliest || l.expires_at < earliest) earliest = l.expires_at;
    if (new Date(l.expires_at).getTime() <= in30) expiring30 += Number(l.remaining_tokens);
  }
  const rem = (rate: number) => (rate > 0 ? Math.floor(balance / rate) : 0);
  return {
    balance_tokens: balance,
    balance_thb: balance / 100,
    earliest_expiry: earliest,
    expiring_30d_tokens: expiring30,
    rates,
    remaining: {
      stt_seconds: rem(rates.stt),
      stt_minutes: Math.floor(rem(rates.stt) / 60),
      bot_seconds: rem(rates.bot),
      bot_minutes: Math.floor(rem(rates.bot) / 60),
      pdf_pages: rem(rates.pdf),
    },
  };
}

/** หน่วยคงเหลือของ service (วินาทีสำหรับ stt/bot, หน้าสำหรับ pdf) จากยอด token ที่แชร์กัน */
export async function getServiceRemaining(
  admin: SupabaseClient,
  profileId: string,
  service: TokenService,
): Promise<{ balance: number; rate: number; remainUnits: number; remainMin: number }> {
  const [balance, rates] = await Promise.all([
    getTokenBalance(admin, profileId),
    getTokenRates(admin),
  ]);
  const rate = rates[service] || 0;
  const remainUnits = rate > 0 ? Math.floor(balance / rate) : 0;
  // remainMin เฉพาะ service ที่เป็นวินาที (stt/bot); pdf ไม่ใช้
  const remainMin = service === "pdf" ? 0 : Math.floor(remainUnits / 60);
  return { balance, rate, remainUnits, remainMin };
}
