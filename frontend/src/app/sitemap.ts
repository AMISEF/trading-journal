import type { MetadataRoute } from "next";
import { HUB_URL, SITE_URL } from "@/lib/seo";

/** نقشهٔ سایت — فقط صفحات عمومی و قابل ایندکس. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL + "/", lastModified: now, changeFrequency: "daily", priority: 1 },
    {
      url: SITE_URL + "/register",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: SITE_URL + "/subscription",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: SITE_URL + "/league",
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: SITE_URL + "/trading-plan",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    { url: HUB_URL + "/", lastModified: now, changeFrequency: "daily", priority: 0.9 },
  ];
}
