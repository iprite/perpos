import { NextRequest, NextResponse } from "next/server";

/**
 * Minimal middleware — forwards the current pathname as a request header
 * so server-side layouts can read it via `headers().get("x-pathname")`.
 * This enables the HydrogenLayout module access guard without needing
 * a client component (which would show a flash before redirecting).
 */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("x-pathname", req.nextUrl.pathname);
  return res;
}

export const config = {
  matcher: [
    /*
     * Match all paths except Next.js internals and static assets.
     * API routes are included so the header is always set (harmless for API).
     */
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
