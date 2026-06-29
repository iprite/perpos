// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

const site = process.env.PUBLIC_SITE_URL || "https://www.perpos.ai";

// SSR on Cloudflare Workers. The landing is content-only (no data fetch), so
// pages render server-side and interactive widgets hydrate as React islands.
export default defineConfig({
  site,
  output: "server",
  adapter: cloudflare({
    imageService: "passthrough", // plain <img>, no Sharp on the edge
  }),
  integrations: [react()],
  // We don't use sessions. A non-KV driver stops the adapter from auto-injecting
  // a Cloudflare KV "SESSION" binding (no namespace id → breaks first deploy).
  session: {
    driver: { entrypoint: "unstorage/drivers/memory" },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
