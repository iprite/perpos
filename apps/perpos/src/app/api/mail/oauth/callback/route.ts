/**
 * รับ code จาก Stalwart → แลก token → ดึง JMAP session → เขียน cookie (spec §2.2)
 *
 * ลำดับบังคับ: เทียบ state แบบ timing-safe → **ลบ cookie ชั่วคราวก่อนแลก token** (ใช้ครั้งเดียว)
 * ห้าม log code/token · ข้อผิดพลาดทุกกรณีเด้งไป /mail/login พร้อมเหตุผลเป็นคีย์ (ไม่ใช่ error ดิบ)
 */

import { NextResponse, type NextRequest } from "next/server";

import { mailNotConfigured } from "../../_lib";
import { mailBasePath } from "@/lib/mail/base-path";
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

/**
 * หน้าเข้าสู่ระบบของโซนเมล — **ห้ามฮาร์ดโค้ด `/login`** (invariant ข้อ 0 ของ `(mail)`)
 * บนโดเมนเมลคือ `/login` แต่บน dev/โดเมนอื่นคือ `/mail/login` (ไม่งั้นได้ 404 ของ Suite)
 */
function loginUrl(appBaseUrl: string, reason: string): string {
  let host: string | null = null;
  try {
    host = new URL(appBaseUrl).host;
  } catch {
    /* ค่าเพี้ยน = ถือว่าไม่ใช่โดเมนเมล → ได้ `/mail/login` ซึ่งใช้ได้ทุกที่ */
  }
  return `${appBaseUrl}${mailBasePath(host)}/login?reason=${reason}`;
}

function connectRedirect(config: { appBaseUrl: string }, reason: string) {
  const res = NextResponse.redirect(loginUrl(config.appBaseUrl, reason), {
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
