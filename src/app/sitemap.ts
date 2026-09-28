import type { MetadataRoute } from "next";
import { jobs } from "@/lib/data";
import { articles } from "@/lib/data";

const base = process.env.SITE_URL ?? "https://ezoffer.ru";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes = [
    "",
    "/reviews",
    "/about",
    "/faq",
    "/jobs",
    "/pricing",
    "/blog",
  ];
  const dynamic = [
    ...jobs.map((j) => `/jobs/${j.slug}`),
    ...articles.map((a) => `/blog/${a.slug}`),
  ];

  return [...staticRoutes, ...dynamic].map((route) => ({
    url: `${base}${route}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: route === "" ? 1 : 0.8,
  }));
}