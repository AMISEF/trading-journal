import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * robots.txt — قواعد خزش گوگل.
 * صفحات عمومی باز، مسیرهای خصوصی و API بسته.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/api/",
          "/settings",
          "/wallet",
          "/analysis",
          "/journals",
          "/dashboard",
          "/referrals",
          "/login",
          "/uploads/",
        ],
      },
      { userAgent: "AhrefsBot", crawlDelay: 10 },
      { userAgent: "SemrushBot", crawlDelay: 10 },
    ],
    sitemap: SITE_URL + "/sitemap.xml",
    host: SITE_URL,
  };
}
