/**
 * รับ code จาก Stalwart → แลก token → ดึง JMAP session → เขียน cookie (spec §2.2)
 *
 * ลำดับบังคับ: เทียบ state แบบ timing-safe → **ลบ cookie ชั่วคราวก่อนแลก token** (ใช้ครั้งเดียว)
 * ห้าม log code/token · ข้อผิดพลาดทุกกรณีเด้งไป /mail/login พร้อมเหตุผลเป็นคีย์ (ไม่ใช่ error ดิบ)
 */

import { NextResponse, type NextRequest } from "next/server";

import { mailNotConfigured } from "../../_lib";
import { exchangeAuthorizationCode, readMailConfig, sanitizeReturnTo } from "@/lib/mail/oauth";
import {
  buildMailSession,
  clearMailOAuthState,
  readMailOAuthState,
  safeEqual,
  writeMailSession,
} from "@/lib/mail/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function connectRedirect(config: { appBaseUrl: string }, reason: string) {
  const res = NextResponse.redirect(`${config.appBaseUrl}/mail/login?reason=${reason}`, {
    status: 302,
  });
  res.headers.set("Cache-Control", "private, no-store");
  clearMailOAuthState(res);
  return res;
}

export async function GET(req: NextRequest) {
  const config = readMailConfig();
  if (!config) return mailNotConfigured();

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return connectRedirect(config, "denied");

  const code = params.get("code");
  const state = params.get("state");
  const stored = readMailOAuthState(req);
  if (!code || !state || !stored || !safeEqual(state, stored.state)) {
    return connectRedirect(config, "invalid");
  }

  // ใช้ครั้งเดียวเสมอ — ลบก่อนแลก token กัน replay
  const returnTo = sanitizeReturnTo(stored.returnTo);
  try {
    const tokens = await exchangeAuthorizationCode(config, {
      code,
      codeVerifier: stored.codeVerifier,
    });
    if (!tokens.refreshToken) {
      // ไม่มี refresh token = ผู้ใช้จะหลุดทุกชั่วโมง → ถือว่าเชื่อมไม่สำเร็จ
      return connectRedirect(config, "no_refresh");
    }
    const session = await buildMailSession(config, tokens);
    const res = NextResponse.redirect(`${config.appBaseUrl}${returnTo}`, { status: 302 });
    res.headers.set("Cache-Control", "private, no-store");
    clearMailOAuthState(res);
    writeMailSession(res, session);
    return res;
  } catch {
    return connectRedirect(config, "failed");
  }
}
