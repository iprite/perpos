import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseJwks } from "@/lib/supabase/jwks";

/**
 * Single project middleware. Does two jobs on every request:
 *
 * 1. **Refresh the Supabase auth session** and propagate the refreshed auth
 *    cookies onto both the request (so server components in the same render
 *    read the fresh session) and the response (so the browser stores them).
 *    Without this, the very first server render right after login has no
 *    session → server queries like getOrganizationsForCurrentUser() return []
 *    and the org switcher shows empty until a manual refresh.
 *
 * 2. **Forward the current pathname** as the `x-pathname` request header so
 *    server-side layouts can read it via `headers().get("x-pathname")` for the
 *    module access guard (without a client component that would flash).
 *
 * NOTE: This MUST live at `src/middleware.ts` (not the project root) because
 * the app uses a `src/` directory — Next.js only loads `src/middleware.ts`
 * when `src/app` exists, and ignores any root-level `middleware.ts`.
 */
/**
 * โดเมนของ **PERPOS Mail** (`mail.perpos.ai`) — โปรเจกต์ Vercel เดียวเสิร์ฟทั้ง Suite/Flow และ Mail
 * ถ้าไม่กันไว้ `https://mail.perpos.ai/` จะตกไปที่หน้าแรกของ PERPOS แล้วเด้งไป LINE login
 * ซึ่งผิดทั้งดีไซน์ (ลูกค้าเมลไม่มีบัญชี PERPOS) และผิดหลัก "แยกขาดกันสนิท"
 *
 * ตั้งชื่อผ่าน env ได้ (`MAIL_APP_BASE_URL`) — ไม่ได้ตั้งก็ใช้ค่า default
 */
function mailHostname(): string {
  const raw = process.env.MAIL_APP_BASE_URL;
  if (!raw) return "mail.perpos.ai";
  try {
    return new URL(raw).hostname;
  } catch {
    return "mail.perpos.ai";
  }
}

/** path ที่โดเมนเมลเสิร์ฟได้เท่านั้น — นอกจากนี้เด้งกลับ `/mail` ทั้งหมด */
function isMailAppPath(pathname: string): boolean {
  return (
    pathname === "/mail" ||
    pathname.startsWith("/mail/") ||
    pathname.startsWith("/api/mail/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/brand/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  );
}

export async function middleware(request: NextRequest) {
  // ── โดเมนเมล: เห็นได้เฉพาะ PERPOS Mail · ไม่แตะ Supabase session ของ PERPOS เลย ──
  const host = (request.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
  if (host === mailHostname()) {
    if (!isMailAppPath(request.nextUrl.pathname)) {
      const dest = new URL("/mail", request.url);
      return NextResponse.redirect(dest, { status: 307 });
    }
    return NextResponse.next();
  }

  // Forward the pathname so RSC layouts can read it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  // If Supabase env is missing we still forward x-pathname.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Write refreshed auth cookies onto the request (for this render)…
        for (const c of cookiesToSet) request.cookies.set(c.name, c.value);
        // …and rebuild the response so the browser receives them too.
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const c of cookiesToSet) response.cookies.set(c.name, c.value, c.options);
      },
    },
  });

  // Touch the session — triggers a token refresh + setAll() when needed.
  //
  // ใช้ getClaims() แทน getUser(): verify ลายเซ็น ES256 ในเครื่องด้วย WebCrypto + JWKS ที่ cache ไว้
  // → ปกติ 0 round-trip ต่อ request (ของเดิมยิงไป Supabase Auth ทุก request รวม RSC navigation
  // ทำให้การสลับ Admin/Suite/Flow หน่วง) · ยังคง refresh token ให้อัตโนมัติเมื่อ token ใกล้หมดอายุ
  // และ fallback ไปถาม Auth server เองถ้า verify ในเครื่องไม่ได้
  const jwks = await getSupabaseJwks();
  const { data: claimsData } = await supabase.auth.getClaims(
    undefined,
    jwks ? { jwks: jwks as never } : undefined,
  );
  const user = claimsData?.claims?.sub ? { id: claimsData.claims.sub } : null;

  // DEV-ONLY auto-login: ยังไม่มี session + เปิด flag → พาไป /dev-login
  // (มินต์ session ของ super_admin อัตโนมัติ — ดู src/app/(auth)/dev-login/route.ts)
  // ปิดสนิทบน production (NODE_ENV) + ต้องตั้ง DEV_AUTOLOGIN=1 อย่างชัดเจน
  if (!user && process.env.NODE_ENV !== "production" && process.env.DEV_AUTOLOGIN === "1") {
    const { pathname } = request.nextUrl;
    const accept = request.headers.get("accept") ?? "";
    const isHtmlNav =
      request.method === "GET" &&
      accept.includes("text/html") &&
      !pathname.startsWith("/api") &&
      !pathname.startsWith("/dev-login") &&
      !pathname.startsWith("/line"); // อย่าขวาง LINE OAuth bridge
    if (isHtmlNav) {
      const dest = new URL("/dev-login", request.url);
      dest.searchParams.set("returnTo", pathname + request.nextUrl.search);
      return NextResponse.redirect(dest);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except Next.js internals and static assets.
     * API routes are included so the session stays fresh there too.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
