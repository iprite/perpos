import { MetadataRoute } from "next";

const BASE_URL = "https://perpos.io";
const VALID_SLUGS = [
  "sales",
  "marketing",
  "procurement",
  "finance",
  "hr",
  "admin",
  "executive",
  "simulator",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const currentDate = new Date();

  // Core static pages
  const staticPages = [
    {
      url: BASE_URL,
      lastModified: currentDate,
      changeFrequency: "daily" as const,
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: currentDate,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: currentDate,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    },
  ];

  // Dynamic agent pages
  const agentPages = VALID_SLUGS.map((slug) => ({
    url: `${BASE_URL}/agents/${slug}`,
    lastModified: currentDate,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...agentPages];
}
