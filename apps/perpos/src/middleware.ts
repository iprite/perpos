import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseJwks } from "@/lib/supabase/jwks";
import { isMailHost } from "@/lib/mail/base-path";

/**
 * โดเมนของ **PERPOS Mail** — โปรเจกต์ Vercel เดียวเสิร์ฟทั้ง Suite/Flow และ Mail
 * ⇒ ต้องแยกที่ชั้น middleware ไม่งั้น `https://mail.perpos.ai/` ตกไปที่หน้าแรกของ PERPOS
 * แล้วเด้งไป LINE login (ลูกค้าเมลไม่มีบัญชี PERPOS)
 *
 * บนโดเมนเมล:
 *  - `/` → **rewrite** ไป `/mail` · `/login` → `/mail/login` (rewrite ไม่ใช่ redirect
 *    URL ที่ผู้ใช้เห็นจึงไม่มี `/mail` ซ้ำซ้อน — ดู `lib/mail/base-path.ts`)
 *  - `/api/mail/*` + asset ผ่านตรง ๆ
 *  - path อื่นของ PERPOS (`/signin` `/admin` `/[orgSlug]` …) → redirect กลับ `/`
 *  - **ไม่แตะ Supabase session ของ PERPOS เลย**
 */
// หน้าใต้ `app/(mail)/mail/*` — เพิ่มหน้าใหม่ต้องมาเติมที่นี่ ไม่งั้นบนโดเมนเมลจะตกไปหน้า PERPOS
// (บั๊กที่เคยเจอ: เมนู "กฎกรอง" กดแล้วไม่ขึ้น เพราะ `/rules` ไม่ถูก rewrite)
const MAIL_PAGES = new Set(["/login", "/account", "/rules"]);
function mailRewriteTarget(pathname: string): string | null {
  if (pathname === "/") return "/mail";
  if (MAIL_PAGES.has(pathname)) return `/mail${pathname}`;
  return null;
}

/**
 * เข้าหน้าล็อกอินสด ๆ = พาไปฟอร์มกรอกอีเมล/รหัสผ่านของเมลเซิร์ฟเวอร์เลย ไม่ต้องกดปุ่มเกิน
 * (Stalwart ไม่รองรับ password grant — ช่องกรอกอยู่ที่ฝั่งเซิร์ฟเวอร์เมลเท่านั้น
 *  ซึ่งเป็นเรื่องดี: ระบบเราไม่เคยเห็นรหัสผ่านของลูกค้า)
 *
 * 🔴 **ต้องทำที่ middleware ไม่ใช่ในหน้า** — `redirect()` ในหน้าเกิดหลังเริ่ม stream
 *    Next จะแปลงเป็น `<meta http-equiv="refresh" content="1;…">` = จอขาววาบ 1 วินาทีก่อนไป
 * 🔴 **ห้ามเด้งเมื่อมี `reason`** — เพิ่งกลับมาจาก OAuth ที่ล้มเหลว/เพิ่งออกจากระบบ
 *    เด้งซ้ำ = วนลูปและผู้ใช้ไม่ได้อ่านว่าเกิดอะไรขึ้น
 */
function shouldSkipToOauth(url: URL, loginPath: string): boolean {
  return url.pathname === loginPath && !url.searchParams.get("reason");
}

/** path ที่โดเมนเมลเสิร์ฟได้ตรง ๆ (นอกเหนือจากที่ rewrite) */
function isMailPassthrough(pathname: string): boolean {
  return (
    pathname.startsWith("/api/mail/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/brand/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  );
}

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
export async function middleware(request: NextRequest) {
  // ── โดเมนเมล: เห็นได้เฉพาะ PERPOS Mail ──
  if (isMailHost(request.headers.get("host"))) {
    const { pathname } = request.nextUrl;
    if (shouldSkipToOauth(request.nextUrl, "/login")) {
      return NextResponse.redirect(new URL("/api/mail/oauth/start", request.url), { status: 307 });
    }
    const rewriteTo = mailRewriteTarget(pathname);
    if (rewriteTo) {
      const url = request.nextUrl.clone();
      url.pathname = rewriteTo;
      return NextResponse.rewrite(url);
    }
    if (isMailPassthrough(pathname)) return NextResponse.next();
    // `/mail*` ที่ผู้ใช้พิมพ์เอง (หรือลิงก์เก่า) → พากลับ URL ที่ถูกต้องของโดเมนนี้
    return NextResponse.redirect(new URL("/", request.url), { status: 307 });
  }

  // โดเมนอื่น (dev / app.perpos.ai) เมลอยู่ใต้ `/mail` — ใช้กฎเดียวกัน
  if (shouldSkipToOauth(request.nextUrl, "/mail/login")) {
    return NextResponse.redirect(new URL("/api/mail/oauth/start", request.url), { status: 307 });
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
    // `api/mail/*` ไม่ใช้ session ของ PERPOS (invariant โซน mail) — บนโดเมนอื่น (dev) การรัน
    // getClaims ของ Supabase ทุกคำขอเมล = ค่าใช้จ่ายเปล่า ๆ หลายสิบ ms ต่อ request
    "/((?!api/health|api/mail/|_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
