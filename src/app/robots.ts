import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.APP_URL || "https://paisa-pos-26-5-21.vercel.app";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/dashboard", "/billing", "/inventory", "/invoices", "/settings"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
