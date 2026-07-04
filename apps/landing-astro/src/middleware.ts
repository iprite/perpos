import { defineMiddleware } from "astro:middleware";

// Legacy paths from older site versions that Google still has indexed. 301 them
// to the closest live page so we retire the 404s (and pass link equity along)
// instead of serving Not Found. Keys are matched by exact path OR prefix.
const LEGACY_REDIRECTS: { test: (path: string) => boolean; to: string }[] = [
  // The old "/agents/*" section (e.g. /agents/finance) is now PERPOS Suite.
  { test: (p) => p === "/agents" || p.startsWith("/agents/"), to: "/suite" },
];

// Canonical host: 301 apex → www, preserving path + query. The worker serves the
// apex custom domain too, so the redirect is handled here (no dashboard rule).
// No edge-cache layer: the landing is tiny, content-only SSR — caching buys
// little and only adds failure modes.
export const onRequest = defineMiddleware((context, next) => {
  const url = new URL(context.request.url);

  // Normalize host first so a legacy apex URL resolves in a single hop.
  if (url.hostname === "perpos.ai") url.hostname = "www.perpos.ai";

  const legacy = LEGACY_REDIRECTS.find((r) => r.test(url.pathname));
  if (legacy) {
    url.pathname = legacy.to;
    url.search = "";
    return context.redirect(url.toString(), 301);
  }

  if (url.hostname !== context.url.hostname) {
    return context.redirect(url.toString(), 301);
  }
  return next();
});
