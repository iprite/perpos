/**
 * OAuth กับ Stalwart (public client + PKCE S256) — spec §2
 *
 * - ไม่มี client_secret (token endpoint auth = none)
 * - `redirect_uri` ประกอบจาก `APP_BASE_URL` เท่านั้น — ห้ามอ่านจาก header (Host-header injection)
 * - ไม่มี revocation endpoint บนเซิร์ฟเวอร์นี้ (ทดสอบแล้ว 404) → ห้ามเขียนโค้ดยิง revoke
 * - ห้าม log token/โค้ด
 */

import { createHash, randomBytes } from "node:crypto";

import { hasUsableSessionSecret } from "./secret";

export const MAIL_OAUTH_SCOPE = "urn:ietf:params:oauth:scope:mail offline_access";

export interface MailConfig {
  /** URL ของ JMAP API (ใช้ตรวจ origin ตอน discovery ด้วย) */
  jmapUrl: string;
  /** issuer เช่น https://mail.perpos.ai */
  issuer: string;
  clientId: string;
  /** base URL ของแอปเรา (ใช้ประกอบ redirect_uri) */
  appBaseUrl: string;
}

/**
 * อ่าน env — ไม่ครบคืน null (หน้า/route ต้องขึ้นข้อความไทย ห้าม throw ให้จอขาว)
 *
 * 🔴 `MAIL_APP_BASE_URL` ต้องเป็น **โดเมนของ PERPOS Mail** (`https://mail.perpos.ai`)
 *    ไม่ใช่ `APP_BASE_URL` ที่เป็นของ Suite/Flow (`https://app.perpos.ai`) — โปรเจกต์ Vercel เดียว
 *    เสิร์ฟสองโดเมน ถ้าใช้ตัวเดียวกัน `redirect_uri` จะพาผู้ใช้ข้ามไปอีกผลิตภัณฑ์แล้ว OAuth พัง
 *    (ไม่ตั้งไว้ = ตกไปใช้ `APP_BASE_URL` เพื่อให้ dev/เครื่องเดี่ยวยังทำงานเหมือนเดิม)
 */
export function readMailConfig(): MailConfig | null {
  const jmapUrl = process.env.MAIL_JMAP_URL;
  const issuer = process.env.MAIL_OAUTH_ISSUER;
  const clientId = process.env.MAIL_OAUTH_CLIENT_ID;
  const appBaseUrl = process.env.MAIL_APP_BASE_URL || process.env.APP_BASE_URL;
  // ⚠️ ต้องเช็ค "ใช้ได้จริง" ไม่ใช่แค่ "มีค่า" — เคยตั้ง secret เป็น hex แทน base64
  //    แล้วหน้าเว็บดูปกติ แต่ /api/mail/oauth/start ตอบ 500 เปล่า ๆ หาสาเหตุยาก
  if (!jmapUrl || !issuer || !clientId || !appBaseUrl) return null;
  if (!hasUsableSessionSecret(process.env.MAIL_SESSION_SECRET)) return null;
  return {
    jmapUrl,
    issuer: issuer.replace(/[/]+$/, ""),
    clientId,
    appBaseUrl: appBaseUrl.replace(/[/]+$/, ""),
  };
}

export function mailRedirectUri(config: MailConfig): string {
  return `${config.appBaseUrl}/api/mail/oauth/callback`;
}

// ─── PKCE ─────────────────────────────────────────────────────────────────────

export function randomUrlSafe(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

/** code_verifier 43-128 ตัวอักษร */
export function createCodeVerifier(): string {
  return randomUrlSafe(48);
}

export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthorizeUrl(
  config: MailConfig,
  args: { state: string; codeChallenge: string },
): string {
  const url = new URL(`${config.issuer}/login`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", mailRedirectUri(config));
  url.searchParams.set("scope", MAIL_OAUTH_SCOPE);
  url.searchParams.set("code_challenge", args.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", args.state);
  return url.toString();
}

// ─── token endpoint ───────────────────────────────────────────────────────────

export interface MailTokenSet {
  accessToken: string;
  /** ถ้าเซิร์ฟเวอร์ไม่ส่งมา (ไม่หมุน) = null → ผู้เรียกใช้ตัวเดิมต่อ */
  refreshToken: string | null;
  expiresIn: number;
}

export class MailOAuthError extends Error {
  constructor(message = "เชื่อมต่อกล่องเมลไม่สำเร็จ") {
    super(message);
    this.name = "MailOAuthError";
  }
}

async function postToken(config: MailConfig, form: Record<string, string>): Promise<MailTokenSet> {
  let res: Response;
  try {
    res = await fetch(`${config.issuer}/auth/token`, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new MailOAuthError("ระบบอีเมลไม่ตอบสนอง ลองใหม่อีกครั้ง");
  }
  if (!res.ok) throw new MailOAuthError();

  let data: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new MailOAuthError();
  }
  if (!data.access_token) throw new MailOAuthError();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : 3600,
  };
}

export function exchangeAuthorizationCode(
  config: MailConfig,
  args: { code: string; codeVerifier: string },
): Promise<MailTokenSet> {
  return postToken(config, {
    grant_type: "authorization_code",
    client_id: config.clientId,
    redirect_uri: mailRedirectUri(config),
    code: args.code,
    code_verifier: args.codeVerifier,
  });
}

export function refreshAccessToken(
  config: MailConfig,
  refreshToken: string,
): Promise<MailTokenSet> {
  return postToken(config, {
    grant_type: "refresh_token",
    client_id: config.clientId,
    refresh_token: refreshToken,
  });
}

// ─── open redirect guard (spec §7.5) ─────────────────────────────────────────

/**
 * ยอมเฉพาะ path ในโซนเมลเท่านั้น: `/` และ `/login…` (โดเมนเมล) · `/mail…` (dev/โดเมนอื่น)
 * **ต้องขึ้นต้นด้วย `/` เดียวและตามด้วยตัวอักษรที่รู้จัก** — `//evil.com` จึงไม่ผ่าน
 */
const RETURN_TO_ALLOWED = /^[/]($|[?]|login([/?]|$)|mail([/?]|$))/;

/**
 * `returnTo` ต้องอยู่ในโซนเมลเท่านั้น — ไม่ผ่าน = `/`
 * ตัด backslash / tab / newline / NUL ทิ้งก่อนตรวจ (กัน `/\evil.com` ที่บางเบราว์เซอร์ตีเป็น host)
 */
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw) return "/";
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    value = raw;
  }
  const backslash = String.fromCharCode(92);
  const cleaned = Array.from(value)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code < 32 || code === 127) return false;
      return ch !== backslash;
    })
    .join("")
    .trim();
  return RETURN_TO_ALLOWED.test(cleaned) ? cleaned : "/";
}
