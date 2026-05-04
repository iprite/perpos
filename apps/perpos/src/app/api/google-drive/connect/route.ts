import { NextResponse } from "next/server";

import { assertActiveUser } from "@/app/api/google-drive/_utils";
import { createSignedOAuthState } from "@/lib/google/oauth-state";

export const runtime = "nodejs";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

function requiredEnv(name: string) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function getCallbackUrl(req: Request) {
  const explicit = String(process.env.GOOGLE_OAUTH_DRIVE_REDIRECT_URI ?? "").trim();
  if (explicit) return explicit;
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  return `${origin}/api/google-drive/callback`;
}

export async function POST(req: Request) {
  const guard = await assertActiveUser(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const clientId = requiredEnv("GOOGLE_OAUTH_CLIENT_ID");
    const redirectUri = getCallbackUrl(req);
    const state = createSignedOAuthState(guard.profileId);

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", DRIVE_SCOPE);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);

    return NextResponse.json({ ok: true, url: authUrl.toString() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? "connect_failed") }, { status: 500 });
  }
}

