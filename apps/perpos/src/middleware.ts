import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
