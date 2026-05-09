import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { withBasePath } from "@/utils/base-path";

function sanitizeReturnTo(raw: string | null) {
  if (!raw) return null;
  let v = String(raw).trim();
  if (!v) return null;
  try {
    v = decodeURIComponent(v);
  } catch {
    v = String(raw).trim();
  }
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  if (v.startsWith("/api")) return null;
  return v;
}

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !anonKey) {
    return NextResponse.redirect(new URL(withBasePath("/signin"), request.url));
  }

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const returnTo = sanitizeReturnTo(requestUrl.searchParams.get("returnTo"));

  if (error) {
    const dest = new URL(withBasePath("/signin"), request.url);
    dest.searchParams.set("error", error);
    if (errorDescription) dest.searchParams.set("error_description", errorDescription);
    if (returnTo) dest.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(dest);
  }

  if (!code) {
    return NextResponse.redirect(new URL(withBasePath("/signin"), request.url));
  }

  const redirectUrl = new URL(withBasePath(returnTo ?? "/"), request.url);
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) response.cookies.set(c.name, c.value, c.options);
      },
    },
  });

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    const dest = new URL(withBasePath("/signin"), request.url);
    dest.searchParams.set("error", "auth_callback_error");
    dest.searchParams.set("error_description", exchangeError.message);
    if (returnTo) dest.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(dest);
  }

  return response;
}

