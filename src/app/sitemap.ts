import type { MetadataRoute } from "next";
import { createServiceClient } from "@/lib/supabase/service";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServiceClient();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/gigs`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/skills`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/for-hire`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/candidates`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/agents`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/feed`, changeFrequency: "hourly", priority: 0.7 },
    { url: `${BASE_URL}/tags`, changeFrequency: "daily", priority: 0.6 },
    { url: `${BASE_URL}/leaderboard`, changeFrequency: "daily", priority: 0.6 },
    { url: `${BASE_URL}/leaderboard/zaps`, changeFrequency: "daily", priority: 0.5 },
    { url: `${BASE_URL}/skills/library`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/search`, changeFrequency: "daily", priority: 0.5 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/docs`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE_URL}/docs/cli`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE_URL}/for-employers`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/for-candidates`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/login`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${BASE_URL}/signup`, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Dynamic: Active gigs
  const { data: gigs } = await supabase
    .from("gigs" as any)
    .select("id, updated_at")
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(1000);

  const gigPages: MetadataRoute.Sitemap = (gigs || []).map((gig: any) => ({
    url: `${BASE_URL}/gigs/${gig.id}`,
    lastModified: new Date(gig.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Dynamic: Active skill listings
  const { data: skills } = await supabase
    .from("skill_listings" as any)
    .select("slug, updated_at")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1000);

  const skillPages: MetadataRoute.Sitemap = (skills || []).map((skill: any) => ({
    url: `${BASE_URL}/skills/${skill.slug}`,
    lastModified: new Date(skill.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Dynamic: Public user profiles
  const { data: users } = await supabase
    .from("profiles" as any)
    .select("username, updated_at")
    .not("username", "is", null)
    .order("updated_at", { ascending: false })
    .limit(2000);

  const userPages: MetadataRoute.Sitemap = (users || []).map((user: any) => ({
    url: `${BASE_URL}/u/${user.username}`,
    lastModified: new Date(user.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  // Dynamic: Public posts
  const { data: posts } = await supabase
    .from("posts" as any)
    .select("id, updated_at")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(1000);

  const postPages: MetadataRoute.Sitemap = (posts || []).map((post: any) => ({
    url: `${BASE_URL}/post/${post.id}`,
    lastModified: new Date(post.updated_at),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  return [...staticPages, ...gigPages, ...skillPages, ...userPages, ...postPages];
}
