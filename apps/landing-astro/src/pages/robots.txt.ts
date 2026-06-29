import type { APIRoute } from "astro";

const BASE_URL = "https://www.perpos.ai";

export const GET: APIRoute = () => {
  const body = ["User-agent: *", "Allow: /", "", `Sitemap: ${BASE_URL}/sitemap.xml`, ""].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
