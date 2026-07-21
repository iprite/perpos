import type { APIRoute } from "astro";

const BASE_URL = "https://www.perpos.ai";

// Stable per-page lastmod. Emitting `new Date()` on every request tells Google
// every page changed on every crawl, which trains it to ignore our lastmod.
// Bump a page's date only when its content actually changes.
const PAGES = [
  { path: "/", changefreq: "daily", priority: "1.0", lastmod: "2026-07-04" },
  { path: "/flow", changefreq: "weekly", priority: "0.9", lastmod: "2026-07-04" },
  { path: "/suite", changefreq: "weekly", priority: "0.9", lastmod: "2026-07-04" },
  { path: "/privacy", changefreq: "monthly", priority: "0.3", lastmod: "2026-07-04" },
  { path: "/terms", changefreq: "monthly", priority: "0.3", lastmod: "2026-07-04" },
];

export const GET: APIRoute = () => {
  const urls = PAGES.map(
    (p) =>
      `  <url>\n    <loc>${BASE_URL}${p.path}</loc>\n    <lastmod>${p.lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
  ).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
