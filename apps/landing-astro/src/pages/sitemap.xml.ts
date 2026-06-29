import type { APIRoute } from "astro";

const BASE_URL = "https://www.perpos.ai";

const PAGES = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/flow", changefreq: "weekly", priority: "0.9" },
  { path: "/suite", changefreq: "weekly", priority: "0.9" },
  { path: "/privacy", changefreq: "monthly", priority: "0.3" },
  { path: "/terms", changefreq: "monthly", priority: "0.3" },
];

export const GET: APIRoute = () => {
  const lastmod = new Date().toISOString();
  const urls = PAGES.map(
    (p) =>
      `  <url>\n    <loc>${BASE_URL}${p.path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
  ).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
