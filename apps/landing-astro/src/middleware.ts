import { defineMiddleware } from "astro:middleware";

// Canonical host: 301 apex → www, preserving path + query. The worker serves the
// apex custom domain too, so the redirect is handled here (no dashboard rule).
// No edge-cache layer: the landing is tiny, content-only SSR — caching buys
// little and only adds failure modes.
export const onRequest = defineMiddleware((context, next) => {
  const url = new URL(context.request.url);
  if (url.hostname === "perpos.ai") {
    url.hostname = "www.perpos.ai";
    return context.redirect(url.toString(), 301);
  }
  return next();
});
