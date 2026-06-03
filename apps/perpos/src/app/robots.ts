import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.APP_BASE_URL || "https://www.perpos.io";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/signin", "/privacy", "/terms"],
      disallow: ["/api/", "/admin/", "/billing/", "/templates/", "/user/", "/assistant/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
