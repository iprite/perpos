import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { exchangeCodeForDriveTokens } from "@/lib/google/drive";
import { verifySignedOAuthState } from "@/lib/google/oauth-state";

export const runtime = "nodejs";

function getCallbackUrl(req: Request) {
  const explicit = String(process.env.GOOGLE_OAUTH_DRIVE_REDIRECT_URI ?? "").trim();
  if (explicit) return explicit;
  const url = new URL(req.url);
  return `${url.origin}/api/google-drive/callback`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = String(url.searchParams.get("code") ?? "").trim();
  const state = String(url.searchParams.get("state") ?? "").trim();
  const error = String(url.searchParams.get("error") ?? "").trim();
  if (error) return NextResponse.redirect(new URL(`/settings?gdrive=error`, url.origin));
  if (!code || !state) return NextResponse.redirect(new URL(`/settings?gdrive=missing`, url.origin));

  try {
    const payload = verifySignedOAuthState(state);
    const redirectUri = getCallbackUrl(req);
    const tokens = await exchangeCodeForDriveTokens(code, redirectUri);

    const refresh = String(tokens.refresh_token ?? "").trim();
    if (!refresh) {
      return NextResponse.redirect(new URL(`/settings?gdrive=refresh_missing`, url.origin));
    }

    const expiresAt = new Date(Date.now() + Math.max(0, tokens.expires_in) * 1000).toISOString();
    const admin = createSupabaseAdminClient();

    const { error: upsertError } = await admin.from("google_drive_tokens").upsert(
      {
        profile_id: payload.pid,
        refresh_token: refresh,
        access_token: tokens.access_token,
        expires_at: expiresAt,
        scope: tokens.scope ?? null,
        token_type: tokens.token_type ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" }
    );
    if (upsertError) throw new Error(upsertError.message);

    return NextResponse.redirect(new URL(`/settings?gdrive=connected`, url.origin));
  } catch (e: any) {
    return NextResponse.redirect(new URL(`/settings?gdrive=error`, url.origin));
  }
}

