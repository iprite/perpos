/**
 * Session cookie ของโมดูลอีเมล — อ่าน/เขียน/รีเฟรชที่เดียว (spec §3)
 *
 * - ไม่มีอะไรของกล่องเมลลง Supabase เลย: token อยู่ใน cookie httpOnly เข้ารหัส AES-256-GCM
 * - รูปแบบ `v1.<iv>.<ciphertext>.<tag>` (base64url ทุกส่วน) · IV สุ่มใหม่ทุกครั้งที่เขียน
 * - `MAIL_SESSION_SECRET` รับหลายคีย์คั่น comma → ตัวแรกใช้เขียน ที่เหลือยังอ่านได้ (key rotation)
 * - absolute expiry 30 วันตรวจฝั่งเรา (maxAge ของ cookie ไม่ใช่ด่าน)
 * - ห้ามมีตัวแปร module-level เก็บ session (§7.6)
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { fetchJmapDiscovery, MailUnauthorizedError } from "./jmap";
import { readMailConfig, refreshAccessToken, type MailConfig } from "./oauth";
import { parseSessionSecrets } from "./secret";
import type { MailOAuthState, MailSession } from "./types";

export const MAIL_SESSION_COOKIE = "perpos_mail_session";
export const MAIL_CONNECTED_COOKIE = "perpos_mail_connected";
export const MAIL_HOST_CONNECTED_COOKIE = "__Host-perpos_mail_connected";
export const MAIL_OAUTH_COOKIE = "perpos_mail_oauth";

export const MAIL_SESSION_PATH = "/api/mail";
export const MAIL_SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;
export const MAIL_SESSION_MAX_AGE_MS = MAIL_SESSION_MAX_AGE_S * 1000;
export const MAIL_OAUTH_MAX_AGE_S = 600;
export const REFRESH_SKEW_MS = 60_000;

const CIPHER = "aes-256-gcm";
const VERSION = "v1";

function isSecureEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

/** ชื่อ cookie "เชื่อมแล้ว" ที่ใช้เขียนในสภาพแวดล้อมปัจจุบัน */
export function connectedCookieName(): string {
  return isSecureEnv() ? MAIL_HOST_CONNECTED_COOKIE : MAIL_CONNECTED_COOKIE;
}

// ─── การเข้ารหัส ─────────────────────────────────────────────────────────────

export { parseSessionSecrets };

export function encryptMailPayload(payload: unknown, keys: Buffer[]): string {
  const key = keys[0];
  if (!key) throw new Error("MAIL_SESSION_SECRET ไม่ถูกต้อง");
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER, key, iv);
  const data = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    data.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptMailPayload<T>(value: string | undefined, keys: Buffer[]): T | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  let iv: Buffer;
  let data: Buffer;
  let tag: Buffer;
  try {
    iv = Buffer.from(parts[1]!, "base64url");
    data = Buffer.from(parts[2]!, "base64url");
    tag = Buffer.from(parts[3]!, "base64url");
  } catch {
    return null;
  }
  if (iv.length !== 12 || tag.length !== 16) return null;

  for (const key of keys) {
    try {
      const decipher = createDecipheriv(CIPHER, key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(data), decipher.final()]);
      return JSON.parse(plain.toString("utf8")) as T;
    } catch {
      // ลองคีย์ถัดไป (key rotation)
    }
  }
  return null;
}

/** เทียบสตริงแบบคงเวลา — ใช้กับ OAuth state */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

// ─── อ่าน/เขียน session ──────────────────────────────────────────────────────

function currentKeys(): Buffer[] {
  return parseSessionSecrets(process.env.MAIL_SESSION_SECRET);
}

export function decodeMailSession(
  value: string | undefined,
  keys: Buffer[],
  now = Date.now(),
): MailSession | null {
  const payload = decryptMailPayload<MailSession>(value, keys);
  if (!payload || payload.v !== 1) return null;
  if (!payload.accessToken || !payload.refreshToken || !payload.apiUrl || !payload.accountId) {
    return null;
  }
  if (typeof payload.issuedAt !== "number") return null;
  // absolute expiry — cookie maxAge เป็นค่าที่ client เชื่อฟังเอง ไม่ใช่ด่าน
  if (now - payload.issuedAt > MAIL_SESSION_MAX_AGE_MS) return null;
  return payload;
}

export function readMailSession(req: NextRequest, now = Date.now()): MailSession | null {
  return decodeMailSession(req.cookies.get(MAIL_SESSION_COOKIE)?.value, currentKeys(), now);
}

export function writeMailSession(res: NextResponse, session: MailSession): void {
  const secure = isSecureEnv();
  res.cookies.set({
    name: MAIL_SESSION_COOKIE,
    value: encryptMailPayload(session, currentKeys()),
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: MAIL_SESSION_PATH,
    maxAge: MAIL_SESSION_MAX_AGE_S,
  });
  res.cookies.set({
    name: connectedCookieName(),
    value: "1",
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: MAIL_SESSION_MAX_AGE_S,
  });
}

export function clearMailSession(res: NextResponse): void {
  const secure = isSecureEnv();
  res.cookies.set({
    name: MAIL_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: MAIL_SESSION_PATH,
    maxAge: 0,
  });
  for (const name of [MAIL_CONNECTED_COOKIE, MAIL_HOST_CONNECTED_COOKIE]) {
    res.cookies.set({
      name,
      value: "",
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}

// ─── cookie ชั่วคราวของ OAuth ────────────────────────────────────────────────

export function writeMailOAuthState(res: NextResponse, state: MailOAuthState): void {
  res.cookies.set({
    name: MAIL_OAUTH_COOKIE,
    value: encryptMailPayload(state, currentKeys()),
    httpOnly: true,
    secure: isSecureEnv(),
    // ต้องเป็น lax ไม่งั้น cookie ไม่ติดมาตอนเด้งกลับจาก Stalwart (cross-site GET)
    sameSite: "lax",
    path: MAIL_SESSION_PATH,
    maxAge: MAIL_OAUTH_MAX_AGE_S,
  });
}

export function readMailOAuthState(req: NextRequest, now = Date.now()): MailOAuthState | null {
  const payload = decryptMailPayload<MailOAuthState>(
    req.cookies.get(MAIL_OAUTH_COOKIE)?.value,
    currentKeys(),
  );
  if (!payload || typeof payload.issuedAt !== "number") return null;
  if (now - payload.issuedAt > MAIL_OAUTH_MAX_AGE_S * 1000) return null;
  if (!payload.state || !payload.codeVerifier) return null;
  return payload;
}

export function clearMailOAuthState(res: NextResponse): void {
  res.cookies.set({
    name: MAIL_OAUTH_COOKIE,
    value: "",
    httpOnly: true,
    secure: isSecureEnv(),
    sameSite: "lax",
    path: MAIL_SESSION_PATH,
    maxAge: 0,
  });
}

// ─── refresh ─────────────────────────────────────────────────────────────────

export function needsRefresh(session: MailSession, now = Date.now()): boolean {
  return session.expiresAt - now < REFRESH_SKEW_MS;
}

/**
 * รีเฟรช access token (รองรับ rotation ของ refresh token)
 * ล้มเหลว = โยน MailUnauthorizedError → ผู้เรียกต้องลบ cookie + ตอบ 401 mail_session_expired
 */
export async function refreshMailSession(
  session: MailSession,
  config?: MailConfig | null,
): Promise<MailSession> {
  const cfg = config ?? readMailConfig();
  if (!cfg) throw new MailUnauthorizedError();
  try {
    const tokens = await refreshAccessToken(cfg, session.refreshToken);
    return {
      ...session,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? session.refreshToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
    };
  } catch {
    throw new MailUnauthorizedError();
  }
}

/** ดึงข้อมูล session ของ JMAP (accountId/apiUrl/downloadUrl) หลังได้ token */
export async function buildMailSession(
  config: MailConfig,
  tokens: { accessToken: string; refreshToken: string | null; expiresIn: number },
  now = Date.now(),
): Promise<MailSession> {
  const discovery = await fetchJmapDiscovery(config.issuer, tokens.accessToken);
  return {
    v: 1,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? "",
    expiresAt: now + tokens.expiresIn * 1000,
    issuedAt: now,
    email: discovery.email,
    accountId: discovery.accountId,
    apiUrl: discovery.apiUrl,
    downloadUrl: discovery.downloadUrl,
  };
}
