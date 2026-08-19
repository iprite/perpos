/** เริ่มเชื่อมกล่องเมล — PKCE S256 + state ใน cookie ชั่วคราว (spec §2.2) */

import { NextResponse, type NextRequest } from "next/server";

import { mailNotConfigured } from "../../_lib";
import { mailBasePath } from "@/lib/mail/base-path";
import {
  buildAuthorizeUrl,
  codeChallengeS256,
  createCodeVerifier,
  randomUrlSafe,
  readMailConfig,
  sanitizeReturnTo,
} from "@/lib/mail/oauth";
import { writeMailOAuthState } from "@/lib/mail/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const config = readMailConfig();
  if (!config) return mailNotConfigured();

  const codeVerifier = createCodeVerifier();
  const state = randomUrlSafe(32);
  /**
   * ไม่ได้ระบุปลายทางมา (เช่นเด้งมาจาก middleware) = กลับกล่องขาเข้าของ **host นี้**
   * — `sanitizeReturnTo` คืน `/` ซึ่งถูกเฉพาะบนโดเมนเมล · บน dev/โดเมนอื่น `/` คือหน้าแรกของ Suite
   *   (อาการ: ล็อกอินเสร็จแล้วเด้งออกไปแอปหลักแทนที่จะเข้าเมล)
   */
  const requested = sanitizeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  const returnTo = requested === "/" ? `${mailBasePath(req.headers.get("host"))}/` : requested;

  const res = NextResponse.redirect(
    buildAuthorizeUrl(config, { state, codeChallenge: codeChallengeS256(codeVerifier) }),
    { status: 302 },
  );
  res.headers.set("Cache-Control", "private, no-store");
  writeMailOAuthState(res, { state, codeVerifier, returnTo, issuedAt: Date.now() });
  return res;
}
