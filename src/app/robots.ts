import type { MetadataRoute } from "next";

const base = process.env.SITE_URL ?? "https://ezoffer.ru";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard"],
    },
    host: base,
    sitemap: `${base}/sitemap.xml`,
  };
}