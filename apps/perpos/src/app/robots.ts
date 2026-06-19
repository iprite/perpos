import { MetadataRoute } from "next";

// อ่าน APP_BASE_URL ตอน runtime (ไม่ bake ตอน build) — กัน build cache ทำให้ค่า env ใหม่ไม่ติด
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.APP_BASE_URL || "https://www.perpos.ai";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/signin", "/privacy", "/terms"],
      disallow: ["/api/", "/admin/", "/billing/", "/templates/", "/user/", "/assistant/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
