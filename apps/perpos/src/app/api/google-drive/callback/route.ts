import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "../../_lib/supabase";
import { resolveDriveRedirectUri } from "@/lib/google/oauth-state";

/** base url หลักของแอป (เดียวกับที่ใช้ resolve redirect_uri) — ไม่พึ่ง request origin ตอน callback */
function appBaseUrl(fallbackOrigin: string): string {
  const base = String(process.env.APP_BASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  return base || fallbackOrigin;
}

function verifyState(state: string): { pid: string } {
  const secret = (process.env.GOOGLE_OAUTH_STATE_SECRET ?? "").trim();
  if (!secret) throw new Error("Missing GOOGLE_OAUTH_STATE_SECRET");
  const parts = state.split(".");
  if (parts.length !== 2) throw new Error("Invalid state");
  const [encoded, sig] = parts as [string, string];
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    throw new Error("Invalid state signature");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    pid: string;
    iat: number;
  };
  if (Date.now() - payload.iat > 10 * 60 * 1000) throw new Error("State expired");
  return { pid: payload.pid };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const origin = req.headers.get("origin") ?? req.nextUrl.origin;
  const settingsUrl = `${appBaseUrl(origin)}/assistant/calendar`;

  if (error) return NextResponse.redirect(`${settingsUrl}?gdrive=error`);
  if (!code || !state) return NextResponse.redirect(`${settingsUrl}?gdrive=missing`);

  try {
    const { pid } = verifyState(state);
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "";
    const redirectUri = resolveDriveRedirectUri(origin);

    const tokenBody = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });
    const tokens = (await tokenRes.json()) as Record<string, unknown>;
    if (!tokenRes.ok) {
      console.error("[google-drive/callback] token exchange failed", {
        status: tokenRes.status,
        redirectUri,
        error: tokens.error,
        error_description: tokens.error_description,
      });
      return NextResponse.redirect(`${settingsUrl}?gdrive=token_error`);
    }

    const expiresAt = new Date(
      Date.now() + Math.max(0, Number(tokens.expires_in)) * 1000,
    ).toISOString();
    const admin = createAdminClient();
    await admin.from("google_drive_tokens").upsert(
      {
        profile_id: pid,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: expiresAt,
        scope: tokens.scope ?? null,
        token_type: tokens.token_type ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    );

    // เชื่อม Google = เปิดเตือน/ส่งบอทจากปฏิทินอัตโนมัติทันที + บันทึกความยินยอม PDPA
    //   (บอทจะเข้าบันทึกผู้ร่วมประชุม — ปุ่ม/การ์ดเชื่อมแสดงข้อกำหนดไว้แล้ว) · ผู้ใช้ปิด toggle เองได้ภายหลัง
    await admin
      .from("meeting_calendar_settings")
      .upsert(
        {
          profile_id: pid,
          auto_remind_enabled: true,
          save_mom_to_drive: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" },
      );
    await admin
      .from("profiles")
      .update({ bot_consent_at: new Date().toISOString() })
      .eq("id", pid)
      .is("bot_consent_at", null);

    return NextResponse.redirect(`${settingsUrl}?gdrive=connected`);
  } catch (e) {
    console.error("[google-drive/callback] unexpected error", e);
    return NextResponse.redirect(`${settingsUrl}?gdrive=error`);
  }
}
